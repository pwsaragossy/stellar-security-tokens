/**
 * SorobanSettlementService — Backend wrapper for the MaturitySettlement Soroban contract.
 *
 * Handles: deployment, initialize(), deposit(), settle_batch(), withdraw(),
 * and read-only queries (get_balance, extend_ttl).
 *
 * Contract lifecycle:
 *   1. Admin deploys + initialize() during offer approval (for debt offers with maturity)
 *   2. Company deposits USDC into contract when maturity payment is due
 *   3. Admin calls settle_batch() → contract pays investors + burns ALL tokens
 *   4. Multi-batch for >30 investors
 *   5. Admin withdraws any leftover USDC
 *
 * Contract error codes (mirrors SettleError enum in lib.rs):
 *   1=AlreadyInitialized, 2=NotInitialized, 3=InvalidAmount, 4=Overflow,
 *   5=EmptyBatch, 6=AlreadySettled, 7=BatchTooLarge, 8=NoDeposit,
 *   9=DuplicateInvestor, 10=PhantomInvestor, 11=FeeTooHigh
 */
import {
    Contract,
    Address,
    TransactionBuilder,
    Operation,
    StrKey,
    hash,
    xdr,
    rpc,
    nativeToScVal,
    scValToNative,
    BASE_FEE,
} from '@stellar/stellar-sdk';
import {
    getNetworkPassphrase,
    getSorobanRpcUrl,
} from '../config/stellar.js';
import { StellarService } from './stellar.service.js';
import { keyManager } from './KeyManager.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const log = logger.scope('SorobanSettlement');

const MAX_BATCH_SIZE = 30;

// ─── Contract error codes ───
const SETTLE_ERRORS = {
    1: { code: 'AlreadyInitialized', message: 'Contract already initialized' },
    2: { code: 'NotInitialized', message: 'Contract not initialized' },
    3: { code: 'InvalidAmount', message: 'Invalid amount (negative or zero)' },
    4: { code: 'Overflow', message: 'Arithmetic overflow' },
    5: { code: 'EmptyBatch', message: 'Empty batch — no investors to settle' },
    6: { code: 'AlreadySettled', message: 'Investor already settled' },
    7: { code: 'BatchTooLarge', message: `Batch exceeds ${MAX_BATCH_SIZE} investors` },
    8: { code: 'NoDeposit', message: 'No USDC deposited in contract' },
    9: { code: 'DuplicateInvestor', message: 'Duplicate investor in batch' },
    10: { code: 'PhantomInvestor', message: 'Investor holds 0 tokens — cannot pay' },
    11: { code: 'FeeTooHigh', message: 'Fee exceeds max_fee_bps cap' },
};

/** Convert USDC amount (float) to stroops (i128 ScVal) */
const usdcToStroops = (amount) =>
    nativeToScVal(BigInt(Math.round(amount * 10_000_000)), { type: 'i128' });

/** Convert stroops (bigint) to USDC float */
const stroopsToUsdc = (stroops) => Number(stroops) / 10_000_000;

export class SorobanSettlementService {

    // ═══════════════════════════════════════════════════════════════
    // Deploy & Initialize
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get the WASM hash for the MaturitySettlement contract.
     * @returns {string} WASM hash (hex, 64 chars)
     */
    static getSettlementWasmHash() {
        const h = process.env.SETTLEMENT_WASM_HASH;
        if (!h) throw new Error('SETTLEMENT_WASM_HASH env variable not set');
        return h;
    }

    /**
     * Deploy + initialize a MaturitySettlement contract for a debt offer.
     * Stores the contractId on the offer record.
     *
     * @param {number} offerId - Offer ID (must be debt with maturityDate)
     * @param {number} maxFeeBps - Max platform fee in basis points (default 500 = 5%)
     * @returns {Promise<Object>} { contractId, deployXdr, initializeXdr }
     */
    static async deployForOffer(offerId, maxFeeBps = 500) {
        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: { tokens: true },
        });

        if (!offer) throw new Error(`Offer ${offerId} not found`);
        if (offer.offerType !== 'collateral') {
            throw new Error('MaturitySettlement only available for debt (collateral) offers');
        }
        if (!offer.maturityDate) {
            throw new Error('Offer has no maturityDate — cannot deploy settlement contract');
        }
        if (offer.sorobanSettlementContractId) {
            log.warn(`Offer ${offerId} already has settlement contract: ${offer.sorobanSettlementContractId}`);
            return { contractId: offer.sorobanSettlementContractId, alreadyDeployed: true };
        }

        const token = offer.tokens?.[0];
        if (!token?.sacContractId) {
            throw new Error('Token SAC not deployed — deploy SAC before settlement contract');
        }

        const issuerPublicKey = keyManager.getIssuerPublicKey();
        const wasmHash = this.getSettlementWasmHash();
        const salt = Buffer.from(hash(Buffer.from(`settlement-${offerId}-${Date.now()}`)));

        // 1. Build deploy TX
        const deployOp = Operation.createCustomContract({
            wasmHash: Buffer.from(wasmHash, 'hex'),
            address: Address.fromString(issuerPublicKey),
            salt,
        });

        let deployTx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(deployOp)
            .setTimeout(300)
            .build();

        deployTx = await StellarService.prepareSorobanTransaction(deployTx);

        // Precompute contract ID
        const contractId = this._precomputeContractId(issuerPublicKey, salt);

        // 2. Build initialize TX
        const usdcSacId = process.env.USDC_SAC_CONTRACT_ID;
        if (!usdcSacId) throw new Error('USDC_SAC_CONTRACT_ID not configured');
        const treasuryPublicKey = keyManager.getTreasuryPublicKey();

        const contract = new Contract(contractId);
        const initCall = contract.call(
            'initialize',
            new Address(issuerPublicKey).toScVal(),            // admin
            new Address(usdcSacId).toScVal(),                  // usdc_sac
            new Address(token.sacContractId).toScVal(),         // token_sac
            new Address(treasuryPublicKey).toScVal(),           // treasury
            nativeToScVal(maxFeeBps, { type: 'u32' }),          // max_fee_bps
        );

        let initTx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(initCall)
            .setTimeout(300)
            .build();

        initTx = await StellarService.prepareSorobanTransaction(initTx);

        // Store contractId on offer
        await prisma.offer.update({
            where: { id: offerId },
            data: { sorobanSettlementContractId: contractId },
        });

        log.info(`[deployForOffer] Offer ${offerId}: contractId=${contractId}, maxFeeBps=${maxFeeBps}`);

        return {
            contractId,
            deployXdr: deployTx.toXDR('base64'),
            initializeXdr: initTx.toXDR('base64'),
            networkPassphrase: getNetworkPassphrase(),
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // Deposit (Company → Contract)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Build a deposit TX: company USDC → settlement contract.
     *
     * @param {number} offerId - Offer ID
     * @param {number} amount - USDC amount to deposit (float, e.g. 1000.00)
     * @returns {Promise<Object>} { xdr, contractId, amount, networkPassphrase }
     */
    static async buildDepositXdr(offerId, amount) {
        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: { company: true },
        });
        if (!offer?.sorobanSettlementContractId) {
            throw new Error('No settlement contract deployed for this offer');
        }

        const companyWallet = offer.company?.stellarPublicKey || offer.company?.stellarContractId;
        if (!companyWallet) {
            throw new Error('Company does not have a Stellar wallet configured');
        }
        const contract = new Contract(offer.sorobanSettlementContractId);

        const depositCall = contract.call(
            'deposit',
            new Address(companyWallet).toScVal(),   // depositor
            usdcToStroops(amount),                  // amount
        );

        const opsKeypair = keyManager.getOperationsKeypair();
        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(opsKeypair.publicKey()),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(depositCall)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        log.info(`[buildDepositXdr] Offer ${offerId}: deposit ${amount} USDC → ${offer.sorobanSettlementContractId.slice(0, 12)}…`);
        return {
            xdr: tx.toXDR('base64'),
            contractId: offer.sorobanSettlementContractId,
            amount,
            networkPassphrase: getNetworkPassphrase(),
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // Settle (Admin → Contract → Investors)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Build settle_batch XDR for a batch of investors.
     * Contract reads on-chain token balances and burns ALL tokens automatically.
     *
     * @param {number} offerId - Offer ID
     * @param {Array<{investor: string, payout: number}>} investors - Investor addresses + payout amounts (USDC float)
     * @param {number} totalFee - Platform fee for this batch (USDC float)
     * @returns {Promise<Object>} { xdr, contractId, batchSize, networkPassphrase }
     */
    static async buildSettleBatchXdr(offerId, investors, totalFee) {
        const offer = await prisma.offer.findUnique({ where: { id: offerId } });
        if (!offer?.sorobanSettlementContractId) {
            throw new Error('No settlement contract deployed for this offer');
        }
        if (investors.length === 0) {
            throw new Error('Empty investor list');
        }
        if (investors.length > MAX_BATCH_SIZE) {
            throw new Error(`Batch too large: ${investors.length} > ${MAX_BATCH_SIZE}`);
        }

        const contract = new Contract(offer.sorobanSettlementContractId);

        // Build Vec<SettleItem> — only investor + payout, no clawback (contract reads chain)
        const items = investors.map(inv => {
            return nativeToScVal({
                investor: new Address(inv.investor),
                payout: BigInt(Math.round(inv.payout * 10_000_000)),
            }, {
                type: {
                    investor: ['symbol', 'address'],
                    payout: ['symbol', 'i128'],
                }
            });
        });

        const settleCall = contract.call(
            'settle_batch',
            nativeToScVal(items, { type: 'vec' }),
            usdcToStroops(totalFee),
        );

        const issuerPublicKey = keyManager.getIssuerPublicKey();
        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(settleCall)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        log.info(`[buildSettleBatchXdr] Offer ${offerId}: settle ${investors.length} investors, fee=${totalFee} USDC`);
        return {
            xdr: tx.toXDR('base64'),
            contractId: offer.sorobanSettlementContractId,
            batchSize: investors.length,
            totalFee,
            networkPassphrase: getNetworkPassphrase(),
        };
    }

    /**
     * Execute full settlement for an offer (all investors, multi-batch).
     * Calculates payouts, splits into batches of 30, builds+signs+submits each.
     *
     * @param {number} offerId - Offer ID
     * @returns {Promise<Object>} { batches, totalPaid, totalFee, investorCount }
     */
    static async executeFullSettlement(offerId) {
        const offer = await prisma.offer.findUnique({
            where: { id: offerId },
            include: {
                investments: {
                    where: { status: 'distributed' },
                    include: { investor: true },
                },
                tokens: true,
            },
        });

        if (!offer?.sorobanSettlementContractId) {
            throw new Error('No settlement contract deployed for this offer');
        }
        if (offer.offerType !== 'collateral') {
            throw new Error('Settlement only available for debt offers');
        }

        // Import dynamically to avoid circular dependency
        const { CompanyPaymentService } = await import('./companyPayment.service.js');
        const bulletDetails = await CompanyPaymentService.calculateBulletPayment(offerId);

        // Build investor list from bullet calculation
        const allInvestors = bulletDetails.breakdown
            .filter(b => b.investorWallet && b.totalPayout > 0)
            .map(b => ({
                investor: b.investorWallet,
                payout: b.totalPayout,
            }));

        // Calculate platform fee (yield spread)
        const totalPlatformFee = Math.max(0,
            (bulletDetails.companyTotalInterest || bulletDetails.totalInterest) - bulletDetails.totalInterest
        );

        // Split into batches of MAX_BATCH_SIZE
        const batches = [];
        for (let i = 0; i < allInvestors.length; i += MAX_BATCH_SIZE) {
            batches.push(allInvestors.slice(i, i + MAX_BATCH_SIZE));
        }

        // Distribute fee across batches proportionally
        const totalPayout = allInvestors.reduce((s, inv) => s + inv.payout, 0);

        log.info(`[executeFullSettlement] Offer ${offerId}: ${allInvestors.length} investors in ${batches.length} batches`);

        const issuerKeypair = keyManager.getIssuerKeypair();
        const results = [];

        for (let bIdx = 0; bIdx < batches.length; bIdx++) {
            const batch = batches[bIdx];
            const batchPayout = batch.reduce((s, inv) => s + inv.payout, 0);
            const batchFee = bIdx === batches.length - 1
                ? totalPlatformFee - results.reduce((s, r) => s + r.fee, 0)  // last batch gets remainder
                : Math.round(totalPlatformFee * (batchPayout / totalPayout) * 10_000_000) / 10_000_000;

            const { xdr: batchXdr } = await this.buildSettleBatchXdr(offerId, batch, batchFee);

            // Sign with issuer key (contract admin) and submit
            const { TransactionBuilder: TxBuilder } = await import('@stellar/stellar-sdk');
            const tx = TxBuilder.fromXDR(batchXdr, getNetworkPassphrase());
            tx.sign(issuerKeypair);
            const signedXdr = tx.toXDR('base64');

            const submitResult = await StellarService.submitTransaction(signedXdr);
            if (!submitResult.success) {
                throw new Error(`Batch ${bIdx + 1} submission failed: ${submitResult.error || 'Unknown error'}`);
            }

            results.push({
                batchIndex: bIdx,
                investorCount: batch.length,
                payout: batchPayout,
                fee: batchFee,
                txHash: submitResult.hash || submitResult.transactionHash,
            });

            log.info(`[executeFullSettlement] Batch ${bIdx + 1}/${batches.length}: ${batch.length} investors, payout=${batchPayout}, fee=${batchFee}, hash=${results[bIdx].txHash}`);
        }

        // All batches settled → record payments + close
        const annualRate = parseFloat(offer.annualInterestRate || 0);
        const effectiveInvestorRate = parseFloat(offer.investorRate ?? offer.annualInterestRate ?? 0);
        const spreadPct = Math.max(0, annualRate - effectiveInvestorRate);

        const { CompanyPaymentService: CPS } = await import('./companyPayment.service.js');
        const allTxHashes = results.map(r => r.txHash).join(',');

        await CPS._recordPayments(
            offer,
            bulletDetails.breakdown,
            allTxHashes,
            spreadPct,
            true  // isBullet
        );

        await prisma.offer.update({
            where: { id: offerId },
            data: {
                status: 'closed',
                lastPaymentDate: new Date(),
                paymentDueStatus: 'current',
            },
        });

        log.info(`[executeFullSettlement] Offer ${offerId} → closed. ${allInvestors.length} investors settled, payments recorded.`);

        return {
            offerId,
            contractId: offer.sorobanSettlementContractId,
            batches: results,
            totalPaid: totalPayout,
            totalFee: totalPlatformFee,
            investorCount: allInvestors.length,
            batchCount: batches.length,
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // Withdraw & Read-only
    // ═══════════════════════════════════════════════════════════════

    /**
     * Build withdraw XDR: pull leftover USDC from contract.
     *
     * @param {number} offerId - Offer ID
     * @param {string} tokenAddress - SAC address of token to withdraw (usually USDC)
     * @param {number} amount - Amount to withdraw (USDC float)
     * @param {string} destination - Destination address (G... or C...)
     * @returns {Promise<Object>} { xdr, networkPassphrase }
     */
    static async buildWithdrawXdr(offerId, tokenAddress, amount, destination) {
        const offer = await prisma.offer.findUnique({ where: { id: offerId } });
        if (!offer?.sorobanSettlementContractId) {
            throw new Error('No settlement contract');
        }

        const contract = new Contract(offer.sorobanSettlementContractId);
        const withdrawCall = contract.call(
            'withdraw',
            new Address(tokenAddress).toScVal(),
            usdcToStroops(amount),
            new Address(destination).toScVal(),
        );

        const issuerPublicKey = keyManager.getIssuerPublicKey();
        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(withdrawCall)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        return { xdr: tx.toXDR('base64'), networkPassphrase: getNetworkPassphrase() };
    }

    /**
     * Query contract USDC balance.
     *
     * @param {number} offerId - Offer ID
     * @returns {Promise<number>} USDC balance (float)
     */
    static async getContractBalance(offerId) {
        const offer = await prisma.offer.findUnique({ where: { id: offerId } });
        if (!offer?.sorobanSettlementContractId) return 0;

        const contract = new Contract(offer.sorobanSettlementContractId);
        const rpcServer = new rpc.Server(getSorobanRpcUrl());

        const tx = new TransactionBuilder(
            await StellarService.getAccountRPC(keyManager.getOperationsKeypair().publicKey()),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(contract.call('get_balance'))
            .setTimeout(30)
            .build();

        const simResult = await rpcServer.simulateTransaction(tx);
        if (simResult.result) {
            const val = scValToNative(simResult.result.retval);
            return stroopsToUsdc(val);
        }
        return 0;
    }

    // ═══════════════════════════════════════════════════════════════
    // Internals
    // ═══════════════════════════════════════════════════════════════

    /**
     * Parse a contract invocation error into a human-readable SettleError.
     */
    static parseContractError(error) {
        const match = error?.message?.match(/Error\(Contract, #(\d+)\)/);
        if (match) {
            const code = parseInt(match[1]);
            return SETTLE_ERRORS[code] || { code: `Unknown(${code})`, message: error.message };
        }
        return { code: 'Unknown', message: error?.message || 'Unknown error' };
    }

    /**
     * Precompute contract ID from deployer + salt.
     * Same algorithm as Stellar network: sha256(networkId || deployer || salt).
     */
    static _precomputeContractId(issuerPublicKey, salt) {
        const networkId = hash(Buffer.from(getNetworkPassphrase()));
        const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
            new xdr.HashIdPreimageContractId({
                networkId,
                contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
                    new xdr.ContractIdPreimageFromAddress({
                        address: xdr.ScAddress.scAddressTypeAccount(
                            xdr.PublicKey.publicKeyTypeEd25519(
                                StrKey.decodeEd25519PublicKey(issuerPublicKey)
                            )
                        ),
                        salt,
                    })
                ),
            })
        );
        return StrKey.encodeContract(hash(preimage.toXDR()));
    }
}
