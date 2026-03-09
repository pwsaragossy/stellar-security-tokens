/**
 * SorobanSaleService — Backend wrapper for the token_sale Soroban contract.
 *
 * Handles: deployment, create(), trade() XDR building, read-only queries,
 * admin ops, and SaleError parsing.
 *
 * The contract uses two-role access control:
 *   - admin: upgrade, withdraw, drain, freeze, admin transfer (multisig/cold)
 *   - seller: pause, price updates (operational hot key)
 *
 * Integration pattern:
 *   1. Admin deploys contract + calls create() during offer approval
 *   2. Seller deposits sell_tokens + calls set_active(true)
 *   3. Investor's passkey signs trade() XDR → backend submits via fee-bump
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
    buildTransactionWithAccount,
} from '../config/stellar.js';
import { StellarService } from './stellar.service.js';
import logger from '../utils/logger.js';

const log = logger.scope('SorobanSaleService');

// ─── Contract error codes (mirrors SaleError enum in lib.rs) ───
const SALE_ERRORS = {
    1: { code: 'AlreadyCreated', httpStatus: 409, message: 'Oferta já configurada' },
    2: { code: 'ZeroPrice', httpStatus: 400, message: 'Preço inválido' },
    3: { code: 'NotActive', httpStatus: 400, message: 'Oferta pausada — tente novamente mais tarde' },
    4: { code: 'InvalidAmount', httpStatus: 400, message: 'Valor inválido' },
    5: { code: 'TradeTooSmall', httpStatus: 400, message: 'Valor muito pequeno para gerar tokens' },
    6: { code: 'Overflow', httpStatus: 500, message: 'Erro interno — contate suporte' },
    7: { code: 'Expired', httpStatus: 410, message: 'Oferta expirada' },
    8: { code: 'BelowMinimum', httpStatus: 400, message: 'Investimento abaixo do mínimo' },
    9: { code: 'BuyerCapExceeded', httpStatus: 400, message: 'Limite por investidor atingido' },
    10: { code: 'BuyerBlocked', httpStatus: 403, message: 'Conta bloqueada — contate suporte' },
    11: { code: 'NoPendingAdmin', httpStatus: 400, message: 'Nenhuma transferência de admin pendente' },
    12: { code: 'NotPendingAdmin', httpStatus: 403, message: 'Não autorizado' },
};

export class SorobanSaleService {

    // ═══════════════════════════════════════════════════════════════
    // Deploy & Initialize
    // ═══════════════════════════════════════════════════════════════

    /**
     * Build an unsigned deploy TX for the token_sale contract.
     * The issuerPublicKey is both the deployer and the TX source account.
     *
     * @param {string} issuerPublicKey - Issuer public key (G...) — deployer + TX source
     * @param {string} wasmHash - WASM hash (hex, 64 chars)
     * @param {Buffer} salt - 32-byte salt for deterministic contract ID
     * @returns {Promise<Object>} { xdr, contractId, networkPassphrase }
     */
    static async buildDeployXdr(issuerPublicKey, wasmHash, salt) {
        const deployOp = Operation.createCustomContract({
            wasmHash: Buffer.from(wasmHash, 'hex'),
            address: Address.fromString(issuerPublicKey),
            salt,
        });

        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(deployOp)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        // Precompute contractId for DB persistence before on-chain confirmation
        const contractId = this.precomputeContractId(issuerPublicKey, salt);

        log.info(`[buildDeployXdr] Built deploy XDR. Precomputed contractId=${contractId}`);
        return {
            xdr: tx.toXDR('base64'),
            contractId,
            networkPassphrase: getNetworkPassphrase(),
        };
    }

    /**
     * Deterministically compute a contract ID from deployer + salt + network.
     * Uses the same algorithm as the Stellar network: sha256(networkId || deployer || salt).
     *
     * @param {string} issuerPublicKey - Deployer address (G...)
     * @param {Buffer} salt - 32-byte salt
     * @returns {string} Contract ID (C...)
     */
    static precomputeContractId(issuerPublicKey, salt) {
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

        const contractHash = hash(preimage.toXDR());
        return StrKey.encodeContract(contractHash);
    }

    /**
     * Check if a contract exists on-chain via getLedgerEntries.
     * Used for crash-safe resumption of the deploy pipeline.
     *
     * @param {string} contractId - Contract address (C...)
     * @returns {Promise<boolean>} True if the contract instance exists on-chain
     */
    static async contractExistsOnChain(contractId) {
        try {
            const rpcServer = new rpc.Server(getSorobanRpcUrl());
            const contract = new Contract(contractId);
            const instanceKey = contract.getFootprint();
            const result = await rpcServer.getLedgerEntries(instanceKey);
            return result.entries && result.entries.length > 0;
        } catch (err) {
            log.warn(`[contractExistsOnChain] Check failed for ${contractId}: ${err.message}`);
            return false;
        }
    }

    /**
     * Initialize a sale on an already-deployed contract via create().
     * This is a Soroban invocation that needs admin auth.
     * Uses issuerPublicKey as source account — Freighter signs the envelope.
     *
     * @param {string} contractId - Deployed contract address (C...)
     * @param {string} issuerPublicKey - Issuer public key (G...) — TX source
     * @param {Object} params - Sale parameters
     * @returns {Promise<Object>} { xdr, networkPassphrase, contractId }
     */
    static async buildCreateSaleXdr(contractId, issuerPublicKey, {
        admin,
        seller,
        sellToken,
        buyToken,
        treasury,
        sellPrice,
        buyPrice,
        deadlineLedger = 0,
        minBuyAmount = 0n,
        maxBuyPerBuyer = 0n,
    }) {
        const contract = new Contract(contractId);

        const createOp = contract.call(
            'create',
            new Address(admin).toScVal(),
            new Address(seller).toScVal(),
            new Address(sellToken).toScVal(),
            new Address(buyToken).toScVal(),
            new Address(treasury).toScVal(),
            nativeToScVal(sellPrice, { type: 'u32' }),
            nativeToScVal(buyPrice, { type: 'u32' }),
            nativeToScVal(deadlineLedger, { type: 'u32' }),
            nativeToScVal(minBuyAmount, { type: 'i128' }),
            nativeToScVal(maxBuyPerBuyer, { type: 'i128' }),
        );

        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(createOp)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        log.info(`[buildCreateSaleXdr] Built create() XDR for contract ${contractId}`);
        return {
            xdr: tx.toXDR('base64'),
            networkPassphrase: getNetworkPassphrase(),
            contractId,
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // Trade (Investment)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Build a trade() invocation XDR for passkey signing.
     *
     * The contract atomically:
     *   1. Transfers buy_token (USDC) from buyer → contract → treasury
     *   2. Transfers sell_token from contract → buyer
     *   3. Enforces deadline, min, cap, freeze checks
     *
     * @param {string} contractId - Token sale contract address (C...)
     * @param {string} buyerAddress - Investor's smart wallet contract (C...)
     * @param {number} usdcAmount - USDC amount (human-readable, e.g. 100.50)
     * @returns {Promise<Object>} { xdr, networkPassphrase, contractId }
     */
    static async buildTradeXdr(contractId, buyerAddress, usdcAmount) {
        if (!contractId?.match(/^C[A-Z0-9]{55}$/)) {
            throw new Error('Invalid contract ID');
        }
        if (!buyerAddress?.match(/^C[A-Z0-9]{55}$/)) {
            throw new Error('Invalid buyer address — must be a smart wallet (C...)');
        }

        const parsedAmount = parseFloat(usdcAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new Error('Amount must be a positive number');
        }

        const { keyManager: km } = await import('./KeyManager.js');
        const opsPublicKey = km.getOperationsPublicKey();
        const networkPassphrase = getNetworkPassphrase();
        const amountStroops = BigInt(Math.floor(parsedAmount * 10_000_000));

        const contract = new Contract(contractId);
        const tradeOp = contract.call(
            'trade',
            new Address(buyerAddress).toScVal(),
            nativeToScVal(amountStroops, { type: 'i128' }),
        );

        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(opsPublicKey),
            { fee: BASE_FEE, networkPassphrase }
        )
            .addOperation(tradeOp)
            .setTimeout(180)
            .build();

        // Simulate and prepare
        log.info(`[buildTradeXdr] Simulating trade: ${parsedAmount} USDC via contract ${contractId}`);
        tx = await StellarService.prepareSorobanTransaction(tx);

        // Boost resources for smart wallet passkey auth (safety margin)
        tx = this.#boostResourcesForPasskey(tx);

        return {
            xdr: tx.toXDR('base64'),
            networkPassphrase,
            contractId,
            buyerAddress,
            amount: parsedAmount,
        };
    }

    /**
     * Boost Soroban resource budget for smart wallet passkey auth.
     * Simulation doesn't account for WebAuthn secp256r1 signature verification,
     * so we need significant buffers for CPU, read bytes, and write bytes.
     * @private
     */
    static #boostResourcesForPasskey(tx) {
        try {
            const envelope = xdr.TransactionEnvelope.fromXDR(tx.toXDR('base64'), 'base64');
            const txBody = envelope.value().tx();
            const sorobanExt = txBody.ext();

            if (sorobanExt?.switch() === 1) {
                const sorobanData = sorobanExt.sorobanData();
                const resources = sorobanData.resources();

                const simInstructions = resources.instructions();
                const boostedInstructions = Math.max(Math.ceil(simInstructions * 5), 100_000_000);
                resources.instructions(boostedInstructions);

                const simReadBytes = resources.diskReadBytes();
                const boostedReadBytes = Math.max(Math.ceil(simReadBytes * 5) + 40000, 200_000);
                resources.diskReadBytes(boostedReadBytes);

                const simWriteBytes = resources.writeBytes();
                const boostedWriteBytes = Math.max(simWriteBytes * 3, simWriteBytes + 5000);
                resources.writeBytes(boostedWriteBytes);

                log.info(`[boostResources] instructions ${simInstructions}→${boostedInstructions}, readBytes ${simReadBytes}→${boostedReadBytes}, writeBytes ${simWriteBytes}→${boostedWriteBytes}`);

                const boostedFee = Math.max(Math.ceil(parseInt(tx.fee) * 10), 1_000_000).toString();
                tx = TransactionBuilder.cloneFrom(tx, {
                    fee: boostedFee,
                    sorobanData,
                }).build();
            }
        } catch (err) {
            log.warn(`[boostResources] Non-fatal: ${err.message}`);
        }
        return tx;
    }

    // ═══════════════════════════════════════════════════════════════
    // Read-Only Queries
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get the current offer state from the contract.
     * @param {string} contractId
     * @returns {Promise<Object>} Deserialized Offer struct
     */
    static async getOffer(contractId) {
        return this.#simulateReadOnly(contractId, 'get_offer');
    }

    /**
     * Get the contract's balance of the sell token.
     * @param {string} contractId
     * @returns {Promise<bigint>} Balance in stroops
     */
    static async getBalance(contractId) {
        return this.#simulateReadOnly(contractId, 'get_balance');
    }

    /**
     * Get cumulative buy_token spent by a buyer.
     * @param {string} contractId
     * @param {string} buyerAddress
     * @returns {Promise<bigint>}
     */
    static async getBuyerSpent(contractId, buyerAddress) {
        return this.#simulateReadOnly(contractId, 'get_buyer_spent', [
            new Address(buyerAddress).toScVal(),
        ]);
    }

    /**
     * Check if a buyer is frozen/blocked.
     * @param {string} contractId
     * @param {string} buyerAddress
     * @returns {Promise<boolean>}
     */
    static async isFrozen(contractId, buyerAddress) {
        return this.#simulateReadOnly(contractId, 'is_frozen', [
            new Address(buyerAddress).toScVal(),
        ]);
    }

    /**
     * Get contract version.
     * @param {string} contractId
     * @returns {Promise<number>}
     */
    static async getVersion(contractId) {
        return this.#simulateReadOnly(contractId, 'version');
    }

    /**
     * Simulate a read-only contract call (no TX submission).
     * @private
     */
    static async #simulateReadOnly(contractId, method, args = []) {
        const rpcServer = new rpc.Server(getSorobanRpcUrl());
        const { keyManager: km } = await import('./KeyManager.js');
        const opsPublicKey = km.getOperationsPublicKey();
        const contract = new Contract(contractId);

        const callOp = contract.call(method, ...args);

        const tx = new TransactionBuilder(
            await rpcServer.getAccount(opsPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(callOp)
            .setTimeout(30)
            .build();

        const sim = await rpcServer.simulateTransaction(tx);

        if (rpc.Api.isSimulationError(sim)) {
            throw new Error(`Simulation failed for ${method}: ${sim.error}`);
        }

        // Extract return value from simulation
        const result = sim.result?.retval;
        if (!result) {
            log.warn(`[simulateReadOnly] No return value for ${method}`);
            return null;
        }

        return scValToNative(result);
    }

    // ═══════════════════════════════════════════════════════════════
    // Admin Operations (return unsigned XDR)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Build emergency_drain() XDR. Admin signs with multisig.
     */
    static async buildEmergencyDrainXdr(contractId) {
        return this.#buildAdminOpXdr(contractId, 'emergency_drain');
    }

    /**
     * Build set_active() XDR. Seller signs.
     */
    static async buildSetActiveXdr(contractId, active) {
        return this.#buildAdminOpXdr(contractId, 'set_active', [
            nativeToScVal(active, { type: 'bool' }),
        ]);
    }

    /**
     * Build freeze_buyer() XDR. Admin signs with multisig.
     */
    static async buildFreezeBuyerXdr(contractId, buyerAddress, frozen) {
        return this.#buildAdminOpXdr(contractId, 'freeze_buyer', [
            new Address(buyerAddress).toScVal(),
            nativeToScVal(frozen, { type: 'bool' }),
        ]);
    }

    /**
     * Build withdraw() XDR. Admin signs with multisig.
     */
    static async buildWithdrawXdr(contractId, tokenAddress, amount) {
        return this.#buildAdminOpXdr(contractId, 'withdraw', [
            new Address(tokenAddress).toScVal(),
            nativeToScVal(amount, { type: 'i128' }),
        ]);
    }

    /**
     * Build propose_admin() XDR.
     */
    static async buildProposeAdminXdr(contractId, newAdmin) {
        return this.#buildAdminOpXdr(contractId, 'propose_admin', [
            new Address(newAdmin).toScVal(),
        ]);
    }

    /**
     * Build accept_admin() XDR.
     */
    static async buildAcceptAdminXdr(contractId) {
        return this.#buildAdminOpXdr(contractId, 'accept_admin');
    }

    /**
     * Build updt_price() XDR. Seller signs.
     */
    static async buildUpdatePriceXdr(contractId, sellPrice, buyPrice) {
        return this.#buildAdminOpXdr(contractId, 'updt_price', [
            nativeToScVal(sellPrice, { type: 'u32' }),
            nativeToScVal(buyPrice, { type: 'u32' }),
        ]);
    }

    /**
     * Generic admin/seller operation builder.
     * Uses issuerPublicKey as TX source — contract requires admin.require_auth()
     * or seller.require_auth(), both set to issuerPub at create() time.
     * @private
     */
    static async #buildAdminOpXdr(contractId, method, args = []) {
        const { keyManager } = await import('./KeyManager.js');
        const issuerPublicKey = keyManager.getIssuerPublicKey();
        const contract = new Contract(contractId);

        const op = contract.call(method, ...args);

        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(op)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        log.info(`[buildAdminOpXdr] Built ${method}() XDR for contract ${contractId} (source: ${issuerPublicKey.slice(0, 8)}…)`);
        return {
            xdr: tx.toXDR('base64'),
            networkPassphrase: getNetworkPassphrase(),
            contractId,
            method,
        };
    }

    /**
     * Build upgrade() XDR — replaces contract WASM. Admin only (high-privilege).
     * @param {string} contractId - Sale contract ID (C...)
     * @param {string} newWasmHash - New WASM hash (64-char hex)
     */
    static async buildUpgradeXdr(contractId, newWasmHash) {
        const hashBytes = Buffer.from(newWasmHash, 'hex');
        return this.#buildAdminOpXdr(contractId, 'upgrade', [
            nativeToScVal(hashBytes, { type: 'bytes' }),
        ]);
    }

    /**
     * Build SAC set_authorized() XDR — authorize/deauthorize an address on a SAC.
     * Required for contracts (C...) with AUTH_REQUIRED sell tokens before deposit.
     *
     * @param {string} sacContractId - Stellar Asset Contract ID for the sell token
     * @param {string} targetAddress - Address to authorize (C... contract or G... account)
     * @param {boolean} authorize - true = authorize, false = deauthorize
     */
    static async buildSacAuthorizeXdr(sacContractId, targetAddress, authorize) {
        const { keyManager: km } = await import('./KeyManager.js');
        const issuerPublicKey = km.getIssuerPublicKey();

        const sacContract = new Contract(sacContractId);
        const op = sacContract.call(
            'set_authorized',
            new Address(targetAddress).toScVal(),
            nativeToScVal(authorize, { type: 'bool' }),
        );

        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(op)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        log.info(`[buildSacAuthorizeXdr] Built set_authorized(${authorize}) for ${targetAddress.slice(0, 8)}… on SAC ${sacContractId.slice(0, 8)}…`);
        return {
            xdr: tx.toXDR('base64'),
            networkPassphrase: getNetworkPassphrase(),
            sacContractId,
            method: 'set_authorized',
        };
    }

    /**
     * Build SAC transfer() XDR — transfer tokens via SAC (Soroban invocation).
     * Used for depositing sell tokens from issuer to sale contract.
     *
     * @param {string} sacContractId - Stellar Asset Contract ID
     * @param {string} from - Source address (G... or C...)
     * @param {string} to - Destination address (G... or C...)
     * @param {bigint|number} amount - Amount in stroops (i128)
     */
    static async buildSacTransferXdr(sacContractId, from, to, amount) {
        const { keyManager: km } = await import('./KeyManager.js');
        const issuerPublicKey = km.getIssuerPublicKey();

        const sacContract = new Contract(sacContractId);
        const op = sacContract.call(
            'transfer',
            new Address(from).toScVal(),
            new Address(to).toScVal(),
            nativeToScVal(BigInt(amount), { type: 'i128' }),
        );

        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
        )
            .addOperation(op)
            .setTimeout(300)
            .build();

        tx = await StellarService.prepareSorobanTransaction(tx);

        log.info(`[buildSacTransferXdr] Built transfer(${from.slice(0, 8)}… → ${to.slice(0, 8)}…, ${amount}) on SAC ${sacContractId.slice(0, 8)}…`);
        return {
            xdr: tx.toXDR('base64'),
            networkPassphrase: getNetworkPassphrase(),
            sacContractId,
            method: 'transfer',
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // Error Parsing
    // ═══════════════════════════════════════════════════════════════

    /**
     * Parse a failed Soroban transaction result to extract the SaleError code.
     *
     * @param {Object} txResult - Result from rpc.getTransaction()
     * @returns {Object} { code, name, httpStatus, message } or null if not a SaleError
     */
    static parseContractError(txResult) {
        try {
            if (!txResult?.resultMetaXdr) return null;

            const meta = txResult.resultMetaXdr;
            const v3 = meta.value?.()?.sorobanMeta?.();
            if (!v3) return null;

            const diagEvents = v3.diagnosticEvents?.() || [];
            for (const evt of diagEvents) {
                try {
                    const body = evt.event?.()?.body?.();
                    if (!body) continue;

                    const data = body.value?.()?.data?.();
                    if (!data) continue;

                    // SaleError codes come as scvU32 in diagnostic events
                    if (data.switch?.()?.name === 'scvU32') {
                        const errorCode = data.u32?.();
                        if (SALE_ERRORS[errorCode]) {
                            return {
                                code: errorCode,
                                ...SALE_ERRORS[errorCode],
                            };
                        }
                    }

                    // Some errors surface as scvError with contract error type
                    if (data.switch?.()?.name === 'scvError') {
                        const errVal = data.error?.()?.value?.();
                        if (typeof errVal === 'number' && SALE_ERRORS[errVal]) {
                            return {
                                code: errVal,
                                ...SALE_ERRORS[errVal],
                            };
                        }
                    }
                } catch {
                    // Skip unparseable events
                }
            }

            // Fallback: try to extract from resultXdr
            if (txResult.resultXdr) {
                const resultStr = txResult.resultXdr.toXDR?.('base64') || '';
                log.warn(`[parseContractError] Could not extract SaleError. ResultXDR: ${resultStr.substring(0, 100)}`);
            }

            return null;
        } catch (err) {
            log.error('[parseContractError] Failed to parse:', err.message);
            return null;
        }
    }

    /**
     * Convert a SaleError code to an HTTP-ready error response.
     * @param {number} code - SaleError code (1-12)
     * @returns {Object} { httpStatus, error, code }
     */
    static toHttpError(code) {
        const err = SALE_ERRORS[code];
        if (!err) {
            return { httpStatus: 500, error: 'Erro desconhecido no contrato', code: 'Unknown' };
        }
        return {
            httpStatus: err.httpStatus,
            error: err.message,
            code: err.code,
        };
    }
}
