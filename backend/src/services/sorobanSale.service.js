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
    getSorobanServer,
} from '../config/stellar.js';
import { StellarService } from './stellar.service.js';
import logger from '../utils/logger.js';
import { usdcToStroops } from '../utils/stellarAmount.js';

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
     * Deterministic 32-byte salt for an offer's sale contract.
     *
     * WASM-version-aware: the salt folds in the deploy WASM hash so a contract built
     * from a different WASM version lands on a *fresh* address. This prevents the
     * deploy pipeline from reusing a stale-WASM instance left at the old salt-derived
     * address — e.g. a pre-upgrade contract (or one from a prior DB run that reused the
     * same offer ID) whose create() arity no longer matches, which would fail with
     * `Func(MismatchingParameterLen)`. Self-heals on every future WASM upgrade.
     *
     * @param {number|string} offerId
     * @param {string} wasmHash - deploy WASM hash (hex, 64 chars)
     * @returns {Buffer} 32-byte salt (sha256)
     */
    static saleSalt(offerId, wasmHash) {
        return hash(Buffer.from(`radox:sale:${offerId}:${wasmHash}`));
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
            const rpcServer = getSorobanServer();
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
     * Read the on-chain executable WASM hash of a deployed contract instance.
     * Returns null when the contract is absent or its executable is not a WASM
     * (e.g. a Stellar Asset Contract). Used to confirm an existing on-chain
     * instance runs the WASM we expect before resuming the deploy pipeline.
     *
     * @param {string} contractId - Contract address (C...)
     * @returns {Promise<string|null>} WASM hash (hex) or null
     */
    static async getDeployedWasmHash(contractId) {
        try {
            const rpcServer = getSorobanServer();
            const instanceKey = new Contract(contractId).getFootprint();
            const result = await rpcServer.getLedgerEntries(instanceKey);
            for (const entry of (result.entries || [])) {
                try {
                    const wasmHashRaw = entry.val.contractData().val().instance().executable().wasmHash();
                    if (wasmHashRaw) return Buffer.from(wasmHashRaw).toString('hex');
                } catch (_) {
                    // executable is not a WASM (e.g. SAC token) — skip
                }
            }
            return null;
        } catch (err) {
            log.warn(`[getDeployedWasmHash] Failed for ${contractId}: ${err.message}`);
            return null;
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
        company,
        fixedFee = 50_000_000n,  // $5 USDC in stroops (default processing fee)
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
            new Address(company).toScVal(),
            nativeToScVal(fixedFee, { type: 'i128' }),
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
        const amountStroops = usdcToStroops(parsedAmount);

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

        // Simulate and prepare (Recording Mode — no __check_auth execution)
        log.info(`[buildTradeXdr] Simulating trade: ${parsedAmount} USDC via contract ${contractId}`);
        tx = await StellarService.prepareSorobanTransaction(tx);

        // Boost resources for smart wallet passkey auth.
        // Recording Mode doesn't run __check_auth (WebAuthn secp256r1 verify),
        // so CPU/read/write estimates are far too low — especially for v4's
        // 4 cross-contract SAC transfers. Without this boost, the TX traps.
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
     * This provides rough fee estimates for the frontend UI only.
     * The backend re-simulates in Enforcing Mode to get accurate resources.
     *
     * @private
     * @param {Transaction} tx - Prepared transaction from Recording Mode sim
     * @returns {Transaction} Transaction with boosted resources
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
                const boostedInstructions = Math.max(Math.ceil(simInstructions * 3), 10_000_000);
                resources.instructions(boostedInstructions);

                log.info(`[boostResources] instructions ${simInstructions}→${boostedInstructions} (rough estimate for frontend)`);

                const boostedFee = Math.max(Math.ceil(parseInt(tx.fee) * 5), 1_000_000).toString();
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
        const rpcServer = getSorobanServer();
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
     * Auto-authorize an address's balance on a SAC using the operations key.
     *
     * In multisig mode, the issuer secret key is NOT available (cold storage).
     * The operations key is a signer on the issuer account with weight >= medium
     * threshold, allowing it to satisfy admin.require_auth() for set_authorized.
     *
     * TX source = issuer public key (SAC admin).
     * When source = issuer, Soroban uses SorobanCredentials::SourceAccount for
     * admin.require_auth(). Signing the TX envelope with ops key (as signer on
     * issuer with sufficient weight) satisfies the medium threshold.
     *
     * Prerequisites:
     *   - Operations key must be a signer on the issuer account (weight >= med threshold)
     *   - Run /api/admin/transactions/setup-thresholds once to configure this
     *
     * Pre-flight: calls authorized(address) read-only first. If already
     * authorized, returns immediately (zero TX cost, bulletproof idempotency).
     *
     * @param {string} sacContractId - Stellar Asset Contract ID for the token
     * @param {string} targetAddress - Address to authorize (G... or C...)
     * @returns {Promise<{success: boolean, alreadyAuthorized?: boolean, txHash?: string}>}
     */
    static async authorizeBuyerOnSac(sacContractId, targetAddress) {
        const { keyManager: km } = await import('./KeyManager.js');
        const opsKeypair = km.getOperationsKeypair();
        const issuerPublicKey = km.getIssuerPublicKey();
        const networkPassphrase = getNetworkPassphrase();
        const sacContract = new Contract(sacContractId);

        // ── Pre-flight: check if already authorized (read-only, no TX cost) ──
        try {
            const checkOp = sacContract.call(
                'authorized',
                new Address(targetAddress).toScVal(),
            );
            const checkTx = new TransactionBuilder(
                await StellarService.getAccountRPC(issuerPublicKey),
                { fee: BASE_FEE, networkPassphrase }
            )
                .addOperation(checkOp)
                .setTimeout(30)
                .build();

            const rpcServer = getSorobanServer();
            const sim = await rpcServer.simulateTransaction(checkTx);

            if (sim.result?.retval) {
                const isAuthorized = sim.result.retval.value();
                if (isAuthorized === true) {
                    log.info(`[authorizeBuyerOnSac] ${targetAddress.slice(0, 8)}… already authorized on SAC ${sacContractId.slice(0, 8)}…`);
                    return { success: true, alreadyAuthorized: true };
                }
            }
        } catch (checkErr) {
            // Pre-flight check failed — proceed to authorize anyway
            log.warn(`[authorizeBuyerOnSac] Pre-flight check failed for ${targetAddress.slice(0, 8)}…: ${checkErr.message}. Proceeding with authorization.`);
        }

        // ── Build set_authorized(targetAddress, true) ──
        const op = sacContract.call(
            'set_authorized',
            new Address(targetAddress).toScVal(),
            nativeToScVal(true, { type: 'bool' }),
        );

        // TX source = issuer (SAC admin). This is critical:
        // Soroban uses SorobanCredentials::SourceAccount for admin.require_auth()
        // when the invoking TX source IS the admin account.
        // The operations key (as signer on issuer with weight >= medium threshold)
        // can sign the TX envelope and satisfy the threshold check.
        let tx = new TransactionBuilder(
            await StellarService.getAccountRPC(issuerPublicKey),
            { fee: BASE_FEE, networkPassphrase }
        )
            .addOperation(op)
            .setTimeout(120)
            .build();

        // Simulate and assemble
        try {
            tx = await StellarService.prepareSorobanTransaction(tx);
        } catch (simErr) {
            // Catch-all idempotency: if simulation fails on already-authorized
            const msg = simErr.message || '';
            if (msg.includes('already') || msg.includes('AlreadyInitialized')) {
                log.info(`[authorizeBuyerOnSac] ${targetAddress.slice(0, 8)}… already authorized (sim fallback)`);
                return { success: true, alreadyAuthorized: true };
            }
            throw simErr;
        }

        // Sign with operations key — satisfies issuer's medium threshold
        // because ops is a signer on the issuer account with sufficient weight
        tx.sign(opsKeypair);

        // ── Pre-flight: Operations wallet balance guard ──────────────────────────
        // Prevents opaque "Failed to authorize on SAC" errors when the Operations
        // wallet lacks XLM to pay fees for the set_authorized TX.
        //
        // Uses stellarServer.loadAccount() (Horizon) — returns balances[].
        // NOT getAccountRPC() (Soroban RPC) — that returns sequence number only.
        //
        // opsKeypair is already defined above (line 580) — .publicKey() is direct.
        {
            const { stellarServer: horizonSrv } = await import('../config/stellar.js');
            try {
                const opsAccount = await horizonSrv.loadAccount(opsKeypair.publicKey());
                const native = opsAccount.balances.find(b => b.asset_type === 'native');
                const xlm = parseFloat(native?.balance || '0');
                const critThreshold = parseFloat(process.env.OPERATIONS_WALLET_CRITICAL_XLM || '5');

                if (xlm < critThreshold) {
                    log.error(
                        `[authorizeBuyerOnSac] Ops wallet critically low: ${xlm.toFixed(2)} XLM — bloqueando purchase`
                    );
                    const walletErr = new Error(
                        'Operations wallet sem saldo suficiente — purchase temporariamente indisponível'
                    );
                    walletErr.code = 'OPERATIONS_WALLET_EMPTY';
                    throw walletErr;
                }
            } catch (balanceErr) {
                // Re-throw our own typed error so the controller can return 503
                if (balanceErr.code === 'OPERATIONS_WALLET_EMPTY') throw balanceErr;
                // Any other error (Horizon down, timeout) — proceed optimistically.
                // If wallet truly has no XLM, the TX will fail with a native Stellar error.
                log.warn(
                    `[authorizeBuyerOnSac] Balance pre-check falhou (prosseguindo): ${balanceErr.message}`
                );
            }
        }

        // Submit and poll (with retry for testnet flakiness)
        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const rpcServer = getSorobanServer();

                // Re-prepare TX on retry (fresh sequence number)
                let submittable = tx;
                if (attempt > 1) {
                    log.info(`[authorizeBuyerOnSac] Retry ${attempt}/${maxAttempts} — rebuilding TX...`);
                    const freshAccount = await rpcServer.getAccount(issuerPublicKey);
                    let freshTx = new TransactionBuilder(freshAccount, {
                        fee: '1000000',
                        networkPassphrase: getNetworkPassphrase(),
                    })
                        .addOperation(op)
                        .setTimeout(300)
                        .build();
                    freshTx = await StellarService.prepareSorobanTransaction(freshTx);
                    freshTx.sign(opsKeypair);
                    submittable = freshTx;
                }

                const result = await rpcServer.sendTransaction(submittable);

                let status = result.status;
                let txResult = result;
                if (status === 'PENDING') {
                    const maxWait = 60_000;
                    const interval = 3_000;
                    let waited = 0;
                    while (waited < maxWait) {
                        await new Promise(r => setTimeout(r, interval));
                        waited += interval;
                        txResult = await rpcServer.getTransaction(result.hash);
                        if (txResult.status !== 'NOT_FOUND') {
                            status = txResult.status;
                            break;
                        }
                    }
                }

                if (status === 'SUCCESS') {
                    log.info(`[authorizeBuyerOnSac] ✅ Authorized ${targetAddress.slice(0, 8)}… on SAC ${sacContractId.slice(0, 8)}… (tx: ${result.hash})`);
                    return { success: true, txHash: result.hash };
                } else {
                    log.error(`[authorizeBuyerOnSac] TX status: ${status} for ${targetAddress.slice(0, 8)}…`);
                    if (attempt < maxAttempts) {
                        log.info(`[authorizeBuyerOnSac] Will retry...`);
                        await new Promise(r => setTimeout(r, 5000));
                        continue;
                    }
                    throw new Error(`SAC authorization TX failed with status: ${status}`);
                }
            } catch (submitErr) {
                if (attempt < maxAttempts && !submitErr.message.includes('SAC authorization TX failed')) {
                    log.warn(`[authorizeBuyerOnSac] Attempt ${attempt} error: ${submitErr.message}. Retrying...`);
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }
                log.error(`[authorizeBuyerOnSac] Submit failed: ${submitErr.message}`);
                throw new Error(`Failed to authorize on SAC: ${submitErr.message}`);
            }
        }
    }

    /**
     * Build a setOptions TX that adds the operations key as a signer on the issuer
     * account with weight sufficient to satisfy medium threshold for Soroban auth.
     *
     * One-time setup per issuer account. After this:
     *   - Operations key (weight=2) can sign set_authorized (medium threshold=2)
     *   - Issuer master key (weight=10) required for mint/clawback/set_admin (high=10)
     *
     * Soroban require_auth() for G... accounts uses MEDIUM threshold.
     * Classic setOptions/setTrustlineFlags use their respective threshold levels.
     *
     * @returns {Promise<{xdr: string, networkPassphrase: string}>}
     */
    static async buildIssuerThresholdSetupXdr() {
        const { keyManager: km } = await import('./KeyManager.js');
        const issuerPublicKey = km.getIssuerPublicKey();
        const opsPublicKey = km.getOperationsPublicKey();
        const networkPassphrase = getNetworkPassphrase();

        const issuerAccount = await StellarService.getAccountRPC(issuerPublicKey);

        const tx = new TransactionBuilder(issuerAccount, {
            fee: BASE_FEE,
            networkPassphrase,
        })
            .addOperation(Operation.setOptions({
                signer: {
                    ed25519PublicKey: opsPublicKey,
                    weight: 2,
                },
                masterWeight: 10,
                lowThreshold: 1,
                medThreshold: 2,
                highThreshold: 10,
            }))
            .setTimeout(300)
            .build();

        log.info(`[buildIssuerThresholdSetupXdr] Built setOptions TX: ops ${opsPublicKey.slice(0, 8)}… → weight=2 on issuer ${issuerPublicKey.slice(0, 8)}… (low=1, med=2, high=10)`);
        return {
            xdr: tx.toXDR('base64'),
            networkPassphrase,
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
