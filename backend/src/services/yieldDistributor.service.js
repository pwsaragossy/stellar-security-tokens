/**
 * YieldDistributorService — Backend wrapper for the YieldDistributor Soroban contract (v2).
 *
 * Handles: building multi-batch distribute() XDRs, submitting with retry,
 * error classification, Redis job tracking, and concurrency locking.
 *
 * Contract is STATEFUL-MINIMAL — stores admin + paused flag only.
 * Entry points: initialize, distribute, upgrade, pause, resume, set_admin, extend_ttl
 *
 * Contract error codes (mirrors DistributeError enum in lib.rs):
 *   1=EmptyBatch, 2=BatchTooLarge, 3=InvalidAmount, 4=Overflow,
 *   5=MismatchedArrays, 6=FeeTooHigh, 7=AlreadyInitialized,
 *   8=NotInitialized, 9=ContractPaused, 10=DuplicateRecipient, 11=SelfTransfer
 */
import {
    Contract,
    Address,
    TransactionBuilder,
    Operation,
    nativeToScVal,
    scValToNative,
    xdr,
    rpc,
    BASE_FEE,
} from '@stellar/stellar-sdk';
import {
    getNetworkPassphrase,
    getSorobanRpcUrl,
} from '../config/stellar.js';
import { StellarService } from './stellar.service.js';
import { keyManager } from './KeyManager.js';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

const log = logger.scope('YieldDistributor');

// ─── Constants ──────────────────────────────────────────
const MAX_BATCH_SIZE = 30;
const LOCK_TTL_SECONDS = 1800; // 30 minutes
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 3000;

// Contract error codes
const DISTRIBUTE_ERRORS = {
    1: { code: 'EmptyBatch', message: 'Empty batch — no investors to pay' },
    2: { code: 'BatchTooLarge', message: `Batch exceeds ${MAX_BATCH_SIZE} investors` },
    3: { code: 'InvalidAmount', message: 'Invalid amount (negative or zero)' },
    4: { code: 'Overflow', message: 'Arithmetic overflow' },
    5: { code: 'MismatchedArrays', message: 'Recipients/amounts array length mismatch' },
    6: { code: 'FeeTooHigh', message: 'Fee exceeds 70% safety cap' },
    7: { code: 'AlreadyInitialized', message: 'Contract already initialized' },
    8: { code: 'NotInitialized', message: 'Contract not initialized' },
    9: { code: 'ContractPaused', message: 'Yield distributor is paused — distribute blocked' },
    10: { code: 'DuplicateRecipient', message: 'Duplicate recipient in batch' },
    11: { code: 'SelfTransfer', message: 'Payer cannot be a recipient' },
    // v3
    12: { code: 'NoPendingAdmin', message: 'No pending admin proposal — call propose_admin first' },
};

/** Convert USDC amount (float) to stroops (i128 ScVal) */
const _usdcToStroops = (amount) =>
    nativeToScVal(BigInt(Math.round(amount * 10_000_000)), { type: 'i128' });

/** Round to Stellar USDC precision (7 decimal places) */
const round7 = (v) => Math.round(v * 10_000_000) / 10_000_000;

export class YieldDistributorService {

    // ═══════════════════════════════════════════════════════════════
    // Build XDRs
    // ═══════════════════════════════════════════════════════════════

    /**
     * Build a single distribute() invocation XDR for one batch.
     *
     * @param {string} payerAddress - Company C... or G... address
     * @param {Array<{investorWallet: string, interestOwed: number}>} investors - Batch slice
     * @param {number} feeAmount - Platform fee for this batch (USDC float)
     * @returns {Promise<string>} Prepared Soroban TX XDR (base64)
     */
    static async buildDistributeXdr(payerAddress, investors, feeAmount) {
        const contractId = this.getContractId();
        const usdcSacId = this.getUsdcSacId();
        const treasuryAddress = keyManager.getTreasuryPublicKey();

        const contract = new Contract(contractId);

        // Build Soroban Vec<Address> for recipients
        const recipientScVals = investors.map(inv =>
            new Address(inv.investorWallet).toScVal()
        );
        const recipientsVec = xdr.ScVal.scvVec(recipientScVals);

        // Build Soroban Vec<i128> for amounts
        const amountScVals = investors.map(inv => {
            const stroops = BigInt(Math.round(Math.max(inv.interestOwed, 0.0000001) * 10_000_000));
            return nativeToScVal(stroops, { type: 'i128' });
        });
        const amountsVec = xdr.ScVal.scvVec(amountScVals);

        // Fee in stroops
        const feeStroops = BigInt(Math.round(feeAmount * 10_000_000));

        const distributeCall = contract.call(
            'distribute',
            new Address(payerAddress).toScVal(),           // payer
            new Address(usdcSacId).toScVal(),              // token (USDC SAC)
            recipientsVec,                                  // recipients
            amountsVec,                                     // amounts
            new Address(treasuryAddress).toScVal(),         // fee_recipient
            nativeToScVal(feeStroops, { type: 'i128' }),   // fee_amount
        );

        // Use operations keypair as TX source (pays gas)
        const opsKeypair = keyManager.getOperationsKeypair();
        const networkPassphrase = getNetworkPassphrase();
        const rpcServer = new rpc.Server(getSorobanRpcUrl());
        const sourceAccount = await rpcServer.getAccount(opsKeypair.publicKey());

        let tx = new TransactionBuilder(sourceAccount, {
            fee: BASE_FEE,
            networkPassphrase,
        })
            .addOperation(distributeCall)
            .setTimeout(300)
            .build();

        // Simulate & prepare (adds resource footprint, auth entries)
        tx = await StellarService.prepareSorobanTransaction(tx);

        return tx.toXDR('base64');
    }

    /**
     * Build multi-batch XDRs for all investors.
     * Splits breakdown into batches of MAX_BATCH_SIZE, builds one XDR per batch.
     *
     * @param {string} payerAddress - Company wallet address
     * @param {Array} breakdown - Full investor breakdown from calculateOwedAmount
     * @param {number} spreadRatio - Fee ratio (spreadPct / investorRate)
     * @returns {Promise<{batchXDRs: string[], batchDetails: Array}>}
     */
    static async buildMultiBatchXdrs(payerAddress, breakdown, spreadRatio) {
        // Filter to valid investors only
        const validInvestors = breakdown.filter(b =>
            b.investorWallet && b.interestOwed > 0
        );

        if (validInvestors.length === 0) {
            throw new Error('No valid investor wallets to pay');
        }

        // Split into batches
        const batches = [];
        for (let i = 0; i < validInvestors.length; i += MAX_BATCH_SIZE) {
            batches.push(validInvestors.slice(i, i + MAX_BATCH_SIZE));
        }

        log.info(`Building ${batches.length} batch XDRs for ${validInvestors.length} investors`);

        const batchXDRs = [];
        const batchDetails = [];

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            // Fee per batch = sum of per-investor fees for this batch
            const batchGross = batch.reduce((s, inv) => s + inv.interestOwed, 0);
            const batchFee = round7(batchGross * spreadRatio);

            const xdrStr = await this.buildDistributeXdr(payerAddress, batch, batchFee);

            batchXDRs.push(xdrStr);
            batchDetails.push({
                batchIndex: i,
                investorCount: batch.length,
                totalAmount: round7(batchGross),
                fee: batchFee,
                investorIds: batch.map(b => b.investorId),
                status: 'pending',
            });
        }

        return { batchXDRs, batchDetails };
    }

    // ═══════════════════════════════════════════════════════════════
    // Submit with Retry
    // ═══════════════════════════════════════════════════════════════

    /**
     * Submit a single batch using the relay pattern.
     *
     * The frontend sends an XDR with passkey-signed auth entries but stale
     * Soroban resource estimates (simulation happened before auth signing).
     *
     * Relay pattern:
     *   1. Extract func + signedAuth from the frontend XDR
     *   2. Build a FRESH TX with OPS as source
     *   3. Simulate with signed auth → accurate resource estimate
     *   4. Manually apply simulation resources, preserving signed auth
     *   5. Sign envelope with OPS key
     *   6. Submit to Horizon
     */
    static async submitSingleBatch(signedXdr) {
        // ── Step 1: Extract func + signed auth from the frontend XDR ──
        const networkPassphrase = getNetworkPassphrase();
        const frontendTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
        const op = frontendTx.operations[0];
        const signedFunc = op.func;
        const signedAuth = op.auth || [];

        let lastError;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const opsKeypair = keyManager.getOperationsKeypair();
                const rpcServer = new rpc.Server(getSorobanRpcUrl());

                // ── Step 2: Build fresh TX with signed auth ──
                const sourceAccount = await rpcServer.getAccount(opsKeypair.publicKey());
                const freshTx = new TransactionBuilder(sourceAccount, {
                    fee: BASE_FEE,
                    networkPassphrase,
                })
                    .addOperation(Operation.invokeHostFunction({
                        func: signedFunc,
                        auth: signedAuth,
                    }))
                    .setTimeout(300)
                    .build();

                // ── Step 3: Simulate with signed auth → correct resources ──
                const simulation = await rpcServer.simulateTransaction(freshTx);

                if (rpc.Api.isSimulationError(simulation)) {
                    throw new Error(`Soroban simulation failed: ${simulation.error}`);
                }

                // ── Step 4: Apply simulation resources, preserve signed auth ──
                // assembleTransaction replaces auth entries with simulation's unsigned ones.
                // We manually apply only the resource footprint (sorobanData) and fee,
                // then rebuild with our signed auth preserved.
                //
                // IMPORTANT: freshTx.build() already incremented sourceAccount.sequence.
                // We must rewind to the original sequence for the final TX so Horizon
                // sees the correct (original + 1) sequence number.
                const { Account } = await import('@stellar/stellar-sdk');
                const resourceFee = parseInt(simulation.minResourceFee || '0');
                const totalFee = (parseInt(BASE_FEE) + resourceFee).toString();
                const sorobanData = simulation.transactionData.build();
                const rewoundSource = new Account(
                    opsKeypair.publicKey(),
                    (BigInt(freshTx.sequence) - 1n).toString()
                );

                const finalTx = new TransactionBuilder(rewoundSource, {
                    fee: totalFee,
                    networkPassphrase,
                })
                    .addOperation(Operation.invokeHostFunction({
                        func: signedFunc,
                        auth: signedAuth, // Preserved — NOT from simulation
                    }))
                    .setSorobanData(sorobanData)
                    .setTimeout(300)
                    .build();

                // ── Step 5: Sign envelope with OPS ──
                finalTx.sign(opsKeypair);

                // ── Step 6: Submit ──
                log.info('Submitting relay-assembled TX', {
                    fee: finalTx.fee,
                    source: opsKeypair.publicKey().slice(0, 8) + '...',
                    authEntries: signedAuth.length,
                });
                const result = await StellarService.submitTransaction(finalTx.toXDR());

                if (result.success) {
                    return { status: 'confirmed', txHash: result.transactionHash };
                }

                throw new Error(result.error || 'Transaction failed');
            } catch (err) {
                const classified = this.classifyError(err);

                // tx_already_applied = idempotent success
                if (classified.type === 'ALREADY_APPLIED') {
                    log.info('tx_already_applied — marking as confirmed (idempotent)');
                    return { status: 'confirmed', txHash: 'already_applied' };
                }

                // Fatal error — no point retrying
                if (!classified.retryable) {
                    return { status: 'failed', error: `${classified.type}: ${err.message}` };
                }

                // Retryable — wait and retry (fresh sequence on next iteration)
                lastError = err;
                if (attempt < MAX_RETRIES) {
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                    log.warn(`Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms: ${classified.type}`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        return { status: 'failed', error: `MAX_RETRIES_EXCEEDED: ${lastError?.message}` };
    }

    /**
     * Submit all signed batch XDRs sequentially.
     * Continues through failures (each batch is independent).
     *
     * @param {string[]} signedXDRs - Signed batch XDRs
     * @param {Array} batchDetails - Batch metadata from buildMultiBatchXdrs
     * @returns {Promise<Object>} Submission results with partial failure tracking
     */
    static async submitBatches(signedXDRs, batchDetails) {
        const results = [];

        for (let i = 0; i < signedXDRs.length; i++) {
            log.info(`Submitting batch ${i + 1}/${signedXDRs.length}`);

            const result = await this.submitSingleBatch(signedXDRs[i]);

            results.push({
                batch: i,
                status: result.status,
                txHash: result.txHash || null,
                error: result.error || null,
                investorsPaid: result.status === 'confirmed' ? batchDetails[i].investorCount : 0,
                batchAmount: result.status === 'confirmed' ? batchDetails[i].totalAmount : 0,
                investorIds: batchDetails[i].investorIds,
            });
        }

        const confirmedBatches = results.filter(r => r.status === 'confirmed');
        const failedBatches = results.filter(r => r.status === 'failed');
        const anyConfirmed = confirmedBatches.length > 0;
        const anyFailed = failedBatches.length > 0;

        return {
            success: anyConfirmed && !anyFailed,
            partial: anyConfirmed && anyFailed,
            completedBatches: confirmedBatches.length,
            failedBatches: failedBatches.length,
            totalBatches: results.length,
            results,
            investorsPaid: confirmedBatches.reduce((s, r) => s + r.investorsPaid, 0),
            totalPaid: round7(confirmedBatches.reduce((s, r) => s + r.batchAmount, 0)),
            txHashes: confirmedBatches.map(r => r.txHash).filter(Boolean),
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // Error Classification
    // ═══════════════════════════════════════════════════════════════

    /**
     * Classify a Soroban/Stellar error as retryable or fatal.
     * @param {Error} error
     * @returns {{retryable: boolean, type: string, success?: boolean}}
     */
    static classifyError(error) {
        const msg = error?.message || '';

        // RETRYABLE — same signed XDR can be re-submitted safely
        if (msg.includes('timeout') || msg.includes('ETIMEDOUT'))
            return { retryable: true, type: 'NETWORK_TIMEOUT' };
        if (msg.includes('503') || msg.includes('429'))
            return { retryable: true, type: 'RPC_OVERLOADED' };
        if (msg.includes('PENDING'))
            return { retryable: true, type: 'TX_PENDING' };

        // IDEMPOTENT — TX already succeeded (safe to mark as success)
        if (msg.includes('tx_already_applied'))
            return { retryable: false, type: 'ALREADY_APPLIED', success: true };

        // FATAL — do NOT retry (would fail again or double-pay)
        if (msg.includes('tx_bad_auth'))
            return { retryable: false, type: 'AUTH_EXPIRED' };
        if (msg.includes('tx_bad_seq'))
            return { retryable: false, type: 'SEQ_STALE' };
        if (msg.includes('tx_insufficient_balance'))
            return { retryable: false, type: 'INSUFFICIENT_BALANCE' };
        if (msg.includes('Error(Contract'))
            return { retryable: false, type: 'CONTRACT_ERROR' };

        // UNKNOWN — don't retry (fail safe)
        return { retryable: false, type: 'UNKNOWN' };
    }

    // ═══════════════════════════════════════════════════════════════
    // Concurrency Lock (Redis)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Acquire a Redis lock for an offer. Prevents concurrent prepare() calls.
     * @param {number} offerId
     * @param {string} jobId
     * @returns {Promise<boolean>} true if lock acquired, false if already locked
     */
    static async acquireLock(offerId, jobId) {
        try {
            const client = await getRedisClient();
            if (!client) return true; // No Redis → skip locking (graceful degradation)

            const lockKey = `yield_lock:${offerId}`;
            // Atomic SETNX — prevents TOCTOU race where two requests
            // both read null and both acquire the lock
            const result = await client.set(lockKey, jobId, { NX: true, EX: LOCK_TTL_SECONDS });
            if (!result) return false; // Already locked
            return true;
        } catch (err) {
            log.warnFromException('Redis lock acquisition failed (proceeding without lock)', err, { offerId });
            return true; // Fail open — better to double-prepare than to block payments
        }
    }

    /**
     * Release the Redis lock for an offer.
     * @param {number} offerId
     */
    static async releaseLock(offerId) {
        try {
            const client = await getRedisClient();
            if (!client) return;

            await client.del(`yield_lock:${offerId}`);
        } catch (err) {
            log.warnFromException('Redis lock release failed (TTL will auto-expire)', err, { offerId });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Config helpers
    // ═══════════════════════════════════════════════════════════════

    static getContractId() {
        const id = process.env.YIELD_DISTRIBUTOR_CONTRACT_ID;
        if (!id) throw new Error('YIELD_DISTRIBUTOR_CONTRACT_ID not configured');
        return id;
    }

    static getUsdcSacId() {
        const id = process.env.USDC_SAC_CONTRACT_ID;
        if (!id) throw new Error('USDC_SAC_CONTRACT_ID not configured');
        return id;
    }

    // ═══════════════════════════════════════════════════════════════
    // TTL Management
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // v3 admin actions — pause / resume / 2-step admin rotation
    // ═══════════════════════════════════════════════════════════════

    /**
     * Generic admin-op XDR builder for the singleton YieldDistributor.
     * Issuer is the default TX source; caller can override for accept_admin
     * (the pending admin signs, not the issuer).
     * @private
     */
    static async _buildAdminOpXdr(method, args = [], sourceAccount = null) {
        const contractId = this.getContractId();
        const source = sourceAccount || keyManager.getIssuerPublicKey();
        const contract = new Contract(contractId);
        const op = contract.call(method, ...args);

        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(source),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(op)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        log.info(`[distributor.${method}] contract=${contractId} source=${source.slice(0, 8)}…`);
        return {
            xdr: tx.toXDR('base64'),
            networkPassphrase: getNetworkPassphrase(),
            contractId,
            method,
        };
    }

    /**
     * Generic read-only simulation helper. Uses operations keypair as source
     * (zero-cost simulation only). Returns null on simulation failure or v2
     * contracts that don't expose the method.
     * @private
     */
    static async _simulateReadOnly(method, args = []) {
        const contractId = this.getContractId();
        try {
            const contract = new Contract(contractId);
            const rpcServer = new rpc.Server(getSorobanRpcUrl());

            const tx = new TransactionBuilder(
                await StellarService.getAccountRPC(keyManager.getOperationsKeypair().publicKey()),
                { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
            )
                .addOperation(contract.call(method, ...args))
                .setTimeout(30)
                .build();

            const simResult = await rpcServer.simulateTransaction(tx);
            if (simResult.result) {
                return scValToNative(simResult.result.retval);
            }
            return null;
        } catch (err) {
            log.warn(`[distributor.simulateReadOnly] ${method} failed (likely v2 contract or unset env): ${err?.message}`);
            return null;
        }
    }

    /** Build pause() XDR. Admin signs. */
    static async buildPauseXdr() {
        return this._buildAdminOpXdr('pause');
    }

    /** Build resume() XDR. Admin signs. */
    static async buildResumeXdr() {
        return this._buildAdminOpXdr('resume');
    }

    /**
     * Build propose_admin(new_admin) XDR. Current admin signs.
     * Caller is responsible for validating the address format.
     */
    static async buildProposeAdminXdr(newAdmin) {
        if (!/^G[A-Z2-7]{55}$/.test(newAdmin)) {
            const err = new Error('newAdmin must be a 56-char Stellar address starting with G');
            err.status = 400;
            throw err;
        }
        return this._buildAdminOpXdr('propose_admin', [new Address(newAdmin).toScVal()]);
    }

    /**
     * Build accept_admin() XDR. The PENDING admin signs.
     * @param sourceAccount Required — the pending admin's G... address.
     */
    static async buildAcceptAdminXdr(sourceAccount) {
        if (!sourceAccount) {
            const err = new Error('sourceAccount (pending admin G...) is required for accept_admin');
            err.status = 400;
            throw err;
        }
        return this._buildAdminOpXdr('accept_admin', [], sourceAccount);
    }

    /** Get the paused flag. Returns false on v2 contracts or unreachable. */
    static async getPaused() {
        const v = await this._simulateReadOnly('get_paused');
        return v === true;
    }

    /** Get the currently active admin address. */
    static async getActiveAdmin() {
        return this._simulateReadOnly('get_admin');
    }

    /** Get the pending admin (v3-only; returns null on v2). */
    static async getPendingAdmin() {
        return this._simulateReadOnly('get_pending_admin');
    }

    /**
     * Get the contract's reported version. Returns 2 on simulation failure
     * (heuristic for v2 contracts — the version() call may exist but the
     * v3-only readers won't). v2 contracts also have version() returning 2.
     */
    static async getVersion() {
        const v = await this._simulateReadOnly('version');
        if (typeof v === 'number') return v;
        if (typeof v === 'bigint') return Number(v);
        return 2;
    }

    /** Parse contract-error string into a structured code. */
    static parseContractError(error) {
        const match = error?.message?.match(/Error\(Contract, #(\d+)\)/);
        if (match) {
            const code = parseInt(match[1]);
            return DISTRIBUTE_ERRORS[code] || { code: `Unknown(${code})`, message: error.message };
        }
        return { code: 'Unknown', message: error?.message || 'Unknown error' };
    }

    /**
     * Extend the contract instance TTL to prevent expiry.
     * Anyone can call extend_ttl() — no admin auth required.
     * Should be called on a 24-hour cron.
     */
    static async extendContractTtl() {
        try {
            const contractId = this.getContractId();
            const contract = new Contract(contractId);

            const opsKeypair = keyManager.getOperationsKeypair();
            const networkPassphrase = getNetworkPassphrase();
            const rpcServer = new rpc.Server(getSorobanRpcUrl());
            const sourceAccount = await rpcServer.getAccount(opsKeypair.publicKey());

            let tx = new TransactionBuilder(sourceAccount, {
                fee: BASE_FEE,
                networkPassphrase,
            })
                .addOperation(contract.call('extend_ttl'))
                .setTimeout(300)
                .build();

            tx = await StellarService.prepareSorobanTransaction(tx);
            tx.sign(opsKeypair);

            const result = await StellarService.submitTransaction(tx.toXDR('base64'));
            log.info('Contract TTL extended', { contractId, success: result.success });
            return result;
        } catch (err) {
            log.errorFromException('Failed to extend contract TTL', err);
            throw err;
        }
    }
}

export default YieldDistributorService;
