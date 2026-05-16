import { ChannelsClient } from '@openzeppelin/relayer-plugin-channels';
import { Client as SmartAccountClient } from 'smart-account-kit-bindings';
import { getNetworkPassphrase, getOperationsKeypair, getSorobanRpcUrl, isTestnet, getTreasuryKeypair, getUsdcIssuer } from '../config/stellar.js';
import prisma from '../config/prisma.js';
import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  StrKey,
  hash,
  Address,
  Account,
  Asset,
  Keypair,
  Memo,
  Operation,
  Transaction,
  FeeBumpTransaction,
  nativeToScVal,
  rpc,
  StrKey as StellarStrKey,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service.js';
import logger from '../utils/logger.js';

// Scoped logger for this service
const log = logger.scope('PasskeyWallet');

/**
 * Supported user types for passkey wallet
 */
export const UserType = {
  INVESTOR: 'investor',
  COMPANY_USER: 'company_user',
};

/**
 * Build the key_data buffer expected by OZ smart-account contracts.
 * Format: pubkey (65 bytes, uncompressed secp256r1) + credentialId (variable)
 * 
 * @param {Buffer|Uint8Array} publicKey - 65-byte uncompressed secp256r1 public key
 * @param {string|Buffer} credentialId - Credential ID (base64 string or Buffer)
 * @returns {Buffer} Concatenated key_data
 */
function buildKeyData(publicKey, credentialId) {
  const credentialIdBuffer = typeof credentialId === 'string'
    ? Buffer.from(credentialId, 'base64')
    : credentialId;
  return Buffer.concat([Buffer.from(publicKey), credentialIdBuffer]);
}

/**
 * Derive a deterministic contract address from credential ID and deployer.
 * Mirrors smart-account-kit's deriveContractAddress utility.
 * 
 * @param {Buffer} credentialId - The credential ID buffer
 * @param {string} deployerPublicKey - The deployer's G-address
 * @param {string} networkPassphrase - The network passphrase
 * @returns {string} The derived contract address (C...)
 */
function deriveContractAddress(credentialId, deployerPublicKey, networkPassphrase) {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(networkPassphrase)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(deployerPublicKey).toScAddress(),
          salt: hash(credentialId),
        })
      ),
    })
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

/**
 * Service for managing Stellar smart wallets using OpenZeppelin Smart Account Kit.
 * Replaces the deprecated passkey-kit with smart-account-kit + Stellar Channels.
 * 
 * Transaction submission uses OpenZeppelin Stellar Channels for fee sponsorship,
 * with a self-sponsorship (fee-bump) fallback.
 * 
 * Supports both investors and company users.
 */
export class PasskeyWalletService {
  /** @type {rpc.Server|null} */
  static #rpcServer = null;

  /** @type {ChannelsClient|null} */
  static #channelsClient = null;

  // =========================================================================
  // TIER B: INIT + CONFIG
  // =========================================================================

  /**
   * Get or create Soroban RPC Server instance
   * @returns {rpc.Server}
   */
  static getRpcServer() {
    if (!this.#rpcServer) {
      this.#rpcServer = new rpc.Server(getSorobanRpcUrl());
    }
    return this.#rpcServer;
  }

  /**
   * Get or create OpenZeppelin Channels Client for fee-sponsored transactions.
   * @returns {ChannelsClient}
   */
  static getChannelsClient() {
    if (!this.#channelsClient) {
      const apiKey = process.env.CHANNELS_API_KEY;
      if (!apiKey) {
        throw new Error('CHANNELS_API_KEY is required for fee-sponsored transactions');
      }
      this.#channelsClient = new ChannelsClient({
        baseUrl: isTestnet()
          ? 'https://channels.openzeppelin.com/testnet'
          : 'https://channels.openzeppelin.com',
        apiKey,
      });
    }
    return this.#channelsClient;
  }

  /**
   * Get configuration for client-side SmartAccountKit initialization.
   * @returns {Object} Configuration object for frontend
   */
  static getClientConfig() {
    return {
      rpcUrl: getSorobanRpcUrl(),
      networkPassphrase: getNetworkPassphrase(),
      accountWasmHash: process.env.ACCOUNT_WASM_HASH,
      webauthnVerifierAddress: process.env.WEBAUTHN_VERIFIER_ADDRESS,
      // rpId must match WEBAUTHN_RP_ID — tells the browser exactly which domain
      // scope to use for the passkey. Without it, rp.id is undefined and the
      // browser guesses from hostname, which can trigger the cross-device QR modal
      // instead of Face ID / Touch ID on some devices.
      rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
      // relayerUrl is constructed by the frontend from the API base URL
    };
  }

  // =========================================================================
  // TIER A: DB-ONLY HELPERS (unchanged)
  // =========================================================================

  /**
   * Get the Prisma model name for a user type
   * @private
   */
  static #getPrismaModel(userType) {
    const models = {
      [UserType.INVESTOR]: 'investor',
      [UserType.COMPANY_USER]: 'companyUser',
    };
    return models[userType];
  }

  /**
   * Get the WebAuthn credential table for a user type
   * @private
   */
  static #getCredentialModel(userType) {
    const models = {
      [UserType.INVESTOR]: 'investorWebauthnCredential',
      [UserType.COMPANY_USER]: 'companyUserWebauthnCredential',
    };
    return models[userType];
  }

  /**
   * Get the FK field name for the credential table
   * @private
   */
  static #getCredentialFkField(userType) {
    const fields = {
      [UserType.INVESTOR]: 'investorId',
      [UserType.COMPANY_USER]: 'companyUserId',
    };
    return fields[userType];
  }

  /**
   * Get the Ed25519 signer model for a user type
   * @private
   */
  static #getEd25519SignerModel(userType) {
    const models = {
      [UserType.INVESTOR]: 'investorEd25519Signer',
      [UserType.COMPANY_USER]: 'companyUserEd25519Signer',
    };
    return models[userType];
  }

  // =========================================================================
  // TIER C: TRANSACTION SUBMISSION
  // =========================================================================

  /**
   * Send a signed transaction via Stellar Channels (fee sponsorship).
   * Falls back to self-sponsorship if Channels is unavailable.
   * 
   * @param {string|Transaction} transaction - The signed transaction (XDR string or Transaction object)
   * @returns {Promise<Object>} Transaction result { success, hash, status }
   */
  static async sendTransaction(transaction) {
    try {
      const channels = this.getChannelsClient();
      const xdrStr = typeof transaction === 'string' ? transaction : transaction.toXDR();

      const result = await channels.submitTransaction({ xdr: xdrStr });

      return {
        success: true,
        hash: result.hash,
        status: result.status,
      };
    } catch (error) {
      log.warn(`Channels failed: ${error.message}, trying self-sponsorship fallback...`);
      return this.submitWithSponsorship(transaction);
    }
  }

  /**
   * Send a Soroban transaction via Channels using func + auth entries.
   * This is the recommended path — Channels handles simulation, footprint 
   * discovery, and resource calculation automatically.
   * 
   * @param {string} funcXdr - The Soroban host function XDR (base64)
   * @param {string[]} authXdrs - Array of authorization entry XDRs (base64)
   * @returns {Promise<Object>} Transaction result { success, hash, status }
   */
  static async sendSorobanTransaction(funcXdr, authXdrs = []) {
    try {
      const channels = this.getChannelsClient();
      const result = await channels.submitSorobanTransaction({
        func: funcXdr,
        auth: authXdrs,
      });

      return {
        success: true,
        hash: result.hash,
        status: result.status,
        transactionId: result.transactionId,
      };
    } catch (error) {
      log.error(`Channels Soroban submission failed: ${error.message}`);
      throw new Error(`Fee-sponsored submission failed: ${error.message}`);
    }
  }

  /**
   * Submit a transaction with backend sponsorship (Fee Bump).
   * Used as a fallback when Channels is unavailable.
   * 
   * Uses the KeyManager channel account pool for parallel submissions,
   * preventing tx_bad_seq errors under concurrent load.
   * Configure pool via CHANNEL_1_SECRET_KEY..CHANNEL_10_SECRET_KEY env vars.
   * Falls back to Operations wallet if no channels are defined.
   * 
   * @param {string|Transaction} txOrXdr - The signed transaction (XDR string or Transaction object)
   * @returns {Promise<Object>} Transaction result
   */
  static async submitWithSponsorship(txOrXdr) {
    try {
      const { stellarServer, getNetworkPassphrase } = await import('../config/stellar.js');
      const { keyManager } = await import('./KeyManager.js');
      const networkPassphrase = getNetworkPassphrase();

      // Pick a channel account from the round-robin pool (prevents tx_bad_seq)
      const channelKeypair = keyManager.getNextChannelKeypair();

      // 1. Parse the inner transaction (handle both XDR string and Transaction object)
      let innerTx;
      if (typeof txOrXdr === 'string') {
        innerTx = TransactionBuilder.fromXDR(txOrXdr, networkPassphrase);
      } else if (txOrXdr && typeof txOrXdr.toXDR === 'function') {
        innerTx = txOrXdr;
      } else {
        throw new Error('Invalid transaction format: expected XDR string or Transaction object');
      }

      // 2. Wrap in Fee Bump Transaction using channel account
      log.debug(`Inner TX source: ${innerTx.source}`);
      log.debug(`Inner TX operations count: ${innerTx.operations?.length}`);
      log.debug(`Channel account: ${channelKeypair.publicKey()}`);


      const innerFee = parseInt(innerTx.fee);

      // SECURITY: Cap sponsored fees to prevent XLM drain via inflated resource fees.
      // Enforcing Mode trade() TXs typically cost ~1-2 XLM. 5 XLM cap gives
      // headroom for network fee spikes without blocking legitimate purchases.
      const MAX_SPONSORED_FEE_STROOPS = 50_000_000; // 5 XLM
      if (innerFee > MAX_SPONSORED_FEE_STROOPS) {
        log.warn(`[E-4091] REJECTED sponsorship: inner fee ${innerFee} stroops (${(innerFee / 10_000_000).toFixed(4)} XLM) exceeds cap of ${MAX_SPONSORED_FEE_STROOPS} (${MAX_SPONSORED_FEE_STROOPS / 10_000_000} XLM)`);
        throw new Error('The network is experiencing high demand right now. Please wait a moment and try again. (E-4091)');
      }

      // RUNTIME FIX: Ensure URL doesn't have /transactions (SDK appends it)
      let targetServer = stellarServer;
      try {
        if (targetServer.serverURL) {
          const urlStr = targetServer.serverURL.toString();
          if (urlStr.includes('/transactions')) {
            log.warn(`DETECTED MALFORMED URL: ${urlStr}`);
            const { createFreshServer } = await import('../config/stellar.js');
            targetServer = createFreshServer();
            log.info('Using fresh server');
          }
        }
      } catch (urlErr) {
        log.error('Error checking URL:', urlErr);
      }

      // Retry with escalating fees and backoff to handle concurrent TX contention.
      // With channel account rotation in investmentController, a retry after a brief
      // wait should land on a free channel. Keep retrying — it will eventually go through.
      const MAX_RETRIES = 6;
      let lastError;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const feeMultiplier = Math.pow(2, Math.min(attempt + 1, 4)); // 2, 4, 8, 16, 16, 16, 16
        const feeBumpFee = Math.max(
          parseInt(BASE_FEE) * feeMultiplier,
          innerFee + parseInt(BASE_FEE) * feeMultiplier
        );

        // Safety: never exceed our cap even with retries
        if (feeBumpFee > MAX_SPONSORED_FEE_STROOPS) {
          log.warn(`[Sponsorship] Fee escalation hit cap at attempt ${attempt}: ${feeBumpFee} > ${MAX_SPONSORED_FEE_STROOPS}`);
          break;
        }

        const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
          channelKeypair.publicKey(),
          feeBumpFee.toString(),
          innerTx,
          networkPassphrase
        );

        feeBumpTx.sign(channelKeypair);

        if (attempt > 0) {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped)
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 16_000);
          log.info(`[Sponsorship] Retry ${attempt}/${MAX_RETRIES} in ${backoffMs}ms with fee ${feeBumpFee} stroops (${(feeBumpFee / 10_000_000).toFixed(4)} XLM)`);
          await new Promise(r => setTimeout(r, backoffMs));
        } else {
          log.info(`Submitting self-sponsored fee bump to Horizon (fee: ${feeBumpFee} stroops)...`);
        }
        log.debug(`Fee bump source: ${feeBumpTx.feeSource}`);

        try {
          const result = await targetServer.submitTransaction(feeBumpTx);

          if (attempt > 0) {
            log.info(`[Sponsorship] Succeeded on retry ${attempt}/${MAX_RETRIES}`);
          }

          return {
            success: true,
            hash: result.hash,
            ledger: result.ledger,
            sponsored: true,
          };
        } catch (submitErr) {
          lastError = submitErr;
          // Check if this is tx_insufficient_fee — retryable
          const resultCodes = submitErr.response?.data?.extras?.result_codes
            || submitErr.response?.extras?.result_codes;
          const isFeeError = resultCodes?.transaction === 'tx_insufficient_fee';

          if (isFeeError && attempt < MAX_RETRIES) {
            log.warn(`[Sponsorship] tx_insufficient_fee at attempt ${attempt}, will retry with backoff...`);
            continue;
          }
          // Not a fee error or out of retries — break to error handling
          break;
        }
      }

      // All retries exhausted or non-fee error — fall through to detailed error logging
      const error = lastError;
      log.error('Self-sponsorship failed:');

      // Extract detailed error info from Horizon/SDK response
      const respData = error.response?.data || error.response?.detail;
      const extras = respData?.extras || error.response?.extras;
      if (respData) {
        log.error('[Sponsorship] Full response data:', JSON.stringify(respData, null, 2));
      }

      // Log result_xdr if available (contains detailed Soroban diagnostic events)
      if (extras?.result_xdr) {
        log.error(`[Sponsorship] result_xdr: ${extras.result_xdr}`);
        try {
          const resultXdr = xdr.TransactionResult.fromXDR(extras.result_xdr, 'base64');
          log.error(`[Sponsorship] TX result code: ${resultXdr.result().switch().name}`);
          // Try to extract inner results for fee-bump
          const innerResults = resultXdr.result().innerResultPair?.()?.result?.()?.result?.()?.results?.();
          if (innerResults?.length) {
            log.error(`[Sponsorship] Inner op result: ${innerResults[0].tr().switch().name}`);
          }
        } catch (xdrErr) {
          log.warn(`[Sponsorship] Could not parse result_xdr: ${xdrErr.message}`);
        }
      }

      // Also check SDK error structure (submitTransaction throws with these fields)
      if (error.message?.includes('function_trapped') || error.message?.includes('tx_failed')) {
        log.error(`[Sponsorship] Contract execution trapped. Error details: ${error.message}`);
      }

      if (respData) {
        const resultCodes = extras?.result_codes || respData?.extras?.result_codes;
        const detail = respData.detail || JSON.stringify(resultCodes);
        throw new Error(`Sponsorship failed: ${detail} Codes: ${JSON.stringify(resultCodes)}`);
      }
      throw new Error(`Sponsorship failed: ${error.message}`);
    } catch (error) {
      log.error('Self-sponsorship error:', error);
      throw error;
    }
  }

  // =========================================================================
  // TIER D PHASE 1: DEPLOY METHODS
  // =========================================================================

  /**
   * Deploy a new smart wallet using OZ Smart Account Kit.
   * Used during registration when user doesn't exist yet.
   * 
   * Uses SmartAccountClient.deploy() with the pre-deployed WASM hash,
   * then sends the assembled transaction via Channels for fee sponsorship.
   * 
   * @param {string} credentialId - The WebAuthn credential ID (base64)
   * @param {Buffer|Uint8Array} publicKey - The passkey public key (65-byte uncompressed secp256r1)
   * @returns {Promise<Object>} Result with contractId and transactionHash
   */
  static async deploySmartWallet(credentialId, publicKey) {
    try {
      const networkPassphrase = getNetworkPassphrase();
      const opsKeypair = getOperationsKeypair();
      const accountWasmHash = process.env.ACCOUNT_WASM_HASH;
      const webauthnVerifierAddress = process.env.WEBAUTHN_VERIFIER_ADDRESS;

      if (!accountWasmHash) throw new Error('ACCOUNT_WASM_HASH is required for wallet deployment');
      if (!webauthnVerifierAddress) throw new Error('WEBAUTHN_VERIFIER_ADDRESS is required');
      if (!credentialId) throw new Error('Credential ID is required for deployment');
      if (!publicKey) throw new Error('Public key is required for deployment');

      const credentialIdBuffer = Buffer.from(credentialId, 'base64');
      const publicKeyBuffer = Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey, 'base64');

      // Build the External signer (passkey) for the OZ contract
      const keyData = buildKeyData(publicKeyBuffer, credentialIdBuffer);
      const signer = {
        tag: 'External',
        values: [webauthnVerifierAddress, keyData],
      };

      // Build the deploy transaction using smart-account-kit-bindings
      log.info('Building Smart Account deployment transaction...');
      const deployTx = await SmartAccountClient.deploy(
        {
          signers: [signer],
          policies: new Map(),
        },
        {
          networkPassphrase,
          rpcUrl: getSorobanRpcUrl(),
          wasmHash: accountWasmHash,
          publicKey: opsKeypair.publicKey(),
          salt: hash(credentialIdBuffer),
          timeoutInSeconds: 30,
        }
      );

      // Sign with ops keypair
      deployTx.sign(opsKeypair);

      // Submit via Channels with self-sponsorship fallback
      let result;
      try {
        result = await this.sendTransaction(deployTx.built);
      } catch (channelsError) {
        log.warn(`Channels failed during deploy: ${channelsError.message}`);
        result = await this.submitWithSponsorship(deployTx.built.toXDR());
      }

      // Derive the contract address deterministically
      const contractId = deriveContractAddress(credentialIdBuffer, opsKeypair.publicKey(), networkPassphrase);

      return {
        success: true,
        contractId,
        transactionHash: result.hash,
      };

    } catch (error) {
      log.error('Error deploying smart wallet:', error);
      throw new Error(`Smart wallet deployment failed: ${error.message}`);
    }
  }

  /**
   * Create a new smart wallet for a user (investor or company user).
   * Called after passkey registration on the client side.
   * 
   * @param {string} userType - Type of user: 'investor' or 'company_user'
   * @param {number} userId - The user's database ID
   * @param {string} credentialId - The WebAuthn credential ID (base64)
   * @param {Buffer|Uint8Array} publicKey - The passkey public key
   * @returns {Promise<Object>} Result with contract address and transaction details
   */
  static async createSmartWallet(userType, userId, credentialId, publicKey) {
    try {
      const model = this.#getPrismaModel(userType);

      if (!model) {
        throw new Error(`Invalid user type: ${userType}`);
      }

      // Get user to verify they exist and don't already have a wallet
      const user = await prisma[model].findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error(`${userType === UserType.INVESTOR ? 'Investor' : 'Company user'} not found`);
      }

      if (user.stellarContractId) {
        throw new Error('User already has a smart wallet');
      }

      if (!user.emailVerified) {
        throw new Error('Email must be verified before creating wallet');
      }

      // Deploy the smart wallet
      const deployResult = await this.deploySmartWallet(credentialId, publicKey);

      // Store the contract address in our database
      const publicKeyBuffer = Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey, 'base64');
      const updatedUser = await prisma[model].update({
        where: { id: userId },
        data: {
          stellarContractId: deployResult.contractId,
          passkeyCredentialId: credentialId,
          passkeyPublicKey: publicKeyBuffer,
          // Only CompanyUser still has stellarPublicKey; Investor model removed it
          ...(userType !== UserType.INVESTOR && { stellarPublicKey: deployResult.contractId }),
        },
      });

      return {
        success: true,
        contractId: deployResult.contractId,
        transactionHash: deployResult.transactionHash,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          stellarContractId: updatedUser.stellarContractId,
          userType,
        },
      };

    } catch (error) {
      log.error('Error creating smart wallet:', error);
      throw new Error(`Smart wallet creation failed: ${error.message}`);
    }
  }

  // =========================================================================
  // TIER A: STATUS + BALANCE QUERIES (unchanged)
  // =========================================================================

  /**
   * Check if a user has a smart wallet
   */
  static async hasSmartWallet(userType, userId) {
    const model = this.#getPrismaModel(userType);

    if (!model) {
      throw new Error(`Invalid user type: ${userType}`);
    }

    const user = await prisma[model].findUnique({
      where: { id: userId },
      select: { stellarContractId: true },
    });

    return !!user?.stellarContractId;
  }

  /**
   * Get wallet status for a user
   */
  static async getWalletStatus(userType, userId) {
    const model = this.#getPrismaModel(userType);

    if (!model) {
      throw new Error(`Invalid user type: ${userType}`);
    }

    const baseSelect = {
      id: true,
      emailVerified: true,
      stellarContractId: true,
      passkeyCredentialId: true,
    };

    const select = userType === UserType.INVESTOR
      ? { ...baseSelect, kycStatus: true }
      : { ...baseSelect, isActive: true };

    const user = await prisma[model].findUnique({
      where: { id: userId },
      select,
    });

    if (!user) {
      throw new Error(`${userType === UserType.INVESTOR ? 'Investor' : 'Company user'} not found`);
    }

    const hasEmailVerified = user.emailVerified;
    const hasPasskey = !!user.passkeyCredentialId;
    const hasWallet = !!user.stellarContractId;

    let nextStep;
    if (!hasEmailVerified) {
      nextStep = 'verify_email';
    } else if (!hasPasskey || !hasWallet) {
      nextStep = 'create_passkey';
    } else if (userType === UserType.INVESTOR && user.kycStatus === 'pending') {
      nextStep = 'complete_kyc';
    } else {
      nextStep = 'ready';
    }

    const result = {
      userType,
      hasEmailVerified,
      hasPasskey,
      hasWallet,
      contractId: user.stellarContractId,
      nextStep,
    };

    if (userType === UserType.INVESTOR) {
      result.kycStatus = user.kycStatus;
    } else {
      result.isActive = user.isActive;
    }

    // Fetch balances if wallet exists
    if (hasWallet && user.stellarContractId) {
      try {
        const isContractAddress = user.stellarContractId.startsWith('C');

        if (isContractAddress) {
          const [balances, tesouroMarket] = await Promise.all([
            this.getSorobanWalletBalances(user.stellarContractId),
            this.getTesouroMarketData(),
          ]);
          result.balances = balances;
          result.tesouroMarket = tesouroMarket; // { priceBrl, yieldPctYear, asOf } | null
          result.explorer = `https://stellar.expert/explorer/${isTestnet() ? 'testnet' : 'public'}/contract/${user.stellarContractId}`;
        } else {
          const { StellarService } = await import('./stellar.service.js');
          const accountInfo = await StellarService.getAccountInfo(user.stellarContractId);

          const xlmBalance = accountInfo.balances.find(b => b.asset_type === 'native')?.balance || '0';
          const usdcBalance = accountInfo.balances.find(b => b.asset_code === 'USDC')?.balance || '0';

          result.balances = {
            xlm: xlmBalance,
            usdc: usdcBalance
          };

          result.explorer = `https://stellar.expert/explorer/${isTestnet() ? 'testnet' : 'public'}/account/${user.stellarContractId}`;
        }
      } catch (error) {
        log.error('Failed to fetch wallet balances:', error);
        result.balances = {
          xlm: '0',
          usdc: '0'
        };
        result.balancesNote = 'Balance query pending';
      }
    }

    return result;
  }

  /**
   * Query Soroban token balances for a smart wallet contract.
   * Uses Soroban RPC to simulate balance() calls on SAC token contracts.
   */
  /**
   * Fetch the TESOURO "market" data: current BRL-per-token price (from
   * EtherFuse's public stablebonds lookup) and a yield rate proxy (Selic
   * meta target, from Banco Central do Brasil).
   *
   * Both calls are public, no auth. Cached for 1h in-process to avoid hitting
   * either endpoint on every wallet-status call. Returns `null` shape-fields
   * gracefully if either upstream fails — UI just hides the chip.
   */
  static async getTesouroMarketData() {
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
    const now = Date.now();
    if (this._tesouroCache && (now - this._tesouroCache.at) < CACHE_TTL_MS) {
      return this._tesouroCache.value;
    }

    const value = { priceBrl: null, yieldPctYear: null, asOf: new Date().toISOString() };

    // EtherFuse stablebonds → TESOURO tokenPriceDecimal
    try {
      const sbBase = process.env.ETHERFUSE_API_BASE_URL || 'https://api.sand.etherfuse.com';
      const res = await fetch(`${sbBase}/lookup/stablebonds`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body.stablebonds ?? []);
        const tesouro = list.find((b) => (b.symbol ?? '').toUpperCase() === 'TESOURO' && (b.bondCurrency ?? '').toUpperCase() === 'BRL');
        if (tesouro?.tokenPriceDecimal) {
          value.priceBrl = String(tesouro.tokenPriceDecimal);
        }
      }
    } catch (err) {
      log.debug(`Skipping TESOURO price (EtherFuse upstream): ${err.message}`);
    }

    // BCB Selic meta (series 432) — proxy for treasury yield
    try {
      const res = await fetch(
        'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json',
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const body = await res.json();
        const last = Array.isArray(body) ? body[0] : null;
        if (last?.valor) {
          value.yieldPctYear = Number(last.valor);
        }
      }
    } catch (err) {
      log.debug(`Skipping Selic fetch (BCB upstream): ${err.message}`);
    }

    this._tesouroCache = { at: now, value };
    return value;
  }

  static async getSorobanWalletBalances(walletContractId) {
    const { scValToNative } = await import('@stellar/stellar-sdk');
    const server = this.getRpcServer();

    const balances = {
      xlm: '0',
      usdc: '0',
      tesouro: '0',
    };

    const xlmSacContractId = process.env.XLM_SAC_CONTRACT_ID;
    const usdcSacContractId = process.env.USDC_SAC_CONTRACT_ID;

    // TESOURO (EtherFuse BR/PIX on-ramp delivery asset). The SAC contract ID
    // is deterministic from CODE:ISSUER, so we compute it on the fly from
    // ETHERFUSE_TESOURO_ASSET_IDENTIFIER ("TESOURO:G...") if the env var
    // is set. Falls through to '0' if not configured or asset doesn't exist.
    let tesouroSacContractId = null;
    const tesouroAssetId = process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER;
    if (tesouroAssetId && tesouroAssetId.includes(':')) {
      try {
        const [code, issuer] = tesouroAssetId.split(':');
        tesouroSacContractId = new Asset(code, issuer).contractId(getNetworkPassphrase());
      } catch (err) {
        log.debug(`Failed to compute TESOURO SAC: ${err.message}`);
      }
    }

    const querySacBalance = async (sacContractId, walletAddress) => {
      log.debug(`Querying SAC: ${sacContractId} for wallet ${walletAddress}`);
      if (!sacContractId) {
        log.debug('Missing SAC Contract ID');
        return '0';
      }

      try {
        const contract = new Contract(sacContractId);
        const walletScVal = nativeToScVal(walletAddress, { type: 'address' });

        const balanceOp = contract.call('balance', walletScVal);

        const sourceAccount = new Account(getOperationsKeypair().publicKey(), '0');

        const simResult = await server.simulateTransaction(
          new TransactionBuilder(
            sourceAccount,
            { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
          )
            .addOperation(balanceOp)
            .setTimeout(30)
            .build()
        );

        if (simResult.result) {
          const balanceScVal = simResult.result.retval;
          const balanceRaw = scValToNative(balanceScVal);
          const balance = (Number(balanceRaw) / 10_000_000).toFixed(7);
          log.debug(`Success. Raw: ${balanceRaw}, Formatted: ${balance}`);
          return balance;
        } else {
          log.debug(`Simulation returned no result: ${JSON.stringify(simResult)}`);
        }
      } catch (err) {
        log.debug(`SAC balance query failed for ${sacContractId}: ${err.message}`);
      }
      return '0';
    };

    const [xlmBalance, usdcBalance, tesouroBalance] = await Promise.all([
      querySacBalance(xlmSacContractId, walletContractId),
      querySacBalance(usdcSacContractId, walletContractId),
      querySacBalance(tesouroSacContractId, walletContractId),
    ]);

    balances.xlm = xlmBalance;
    balances.usdc = usdcBalance;
    balances.tesouro = tesouroBalance;

    return balances;
  }

  // =========================================================================
  // TIER D PHASE 2: BUILD TX METHODS
  // =========================================================================

  /**
   * Build a withdrawal transaction to be signed by the user's Passkey.
   * 
   * The footprint and resource calculation is now handled by Channels'
   * func+auth submission method, so we no longer need the 170-line manual
   * footprint hack from passkey-kit.
   */
  static async buildWithdrawalTx(userId, destinationAddress, amount, assetCode = 'USDC', userType = UserType.INVESTOR, options = {}) {
    const server = this.getRpcServer();
    const model = this.#getPrismaModel(userType);

    if (!model) {
      throw new Error(`Invalid user type: ${userType}`);
    }

    // Validate inputs
    if (!destinationAddress || typeof destinationAddress !== 'string') {
      throw new Error('Destination address is required');
    }

    if (!destinationAddress.match(/^[GC][A-Z0-9]{55}$/)) {
      throw new Error('Invalid destination address format. Must be a valid Stellar address (G...) or contract (C...)');
    }

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (parsedAmount > 1000000000) {
      throw new Error('Amount exceeds maximum allowed');
    }

    const user = await prisma[model].findUnique({
      where: { id: userId },
    });

    if (!user || !user.stellarContractId) {
      throw new Error(`${userType === UserType.INVESTOR ? 'Investor' : 'Company user'} wallet not found`);
    }

    const tokenContractId = this.#resolveAssetSacContractId(assetCode);

    const networkPassphrase = getNetworkPassphrase();
    const opsKeypair = getOperationsKeypair();

    const walletAddress = Address.fromString(user.stellarContractId);
    const destination = Address.fromString(destinationAddress);
    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 10_000_000));

    const contract = new Contract(tokenContractId);
    const transferOp = contract.call(
      'transfer',
      xdr.ScVal.scvAddress(walletAddress.toScAddress()),
      xdr.ScVal.scvAddress(destination.toScAddress()),
      nativeToScVal(amountBigInt, { type: 'i128' })
    );

    const builder = new TransactionBuilder(
      await server.getAccount(opsKeypair.publicKey()),
      { fee: BASE_FEE, networkPassphrase }
    )
      .addOperation(transferOp)
      .setTimeout(180);

    // Off-ramp anchor mode: attach the EtherFuse-issued memo so the anchor's
    // monitor can correlate this incoming credit to the order it issued.
    // EtherFuse delivers the memo as base64 — callers decode to hex before
    // passing here. Without the memo, the anchor will auto-refund.
    if (options.memoHashHex) {
      if (!/^[0-9a-f]{64}$/i.test(options.memoHashHex)) {
        throw new Error('memoHashHex must be a 32-byte hex string (64 hex chars)');
      }
      builder.addMemo(Memo.hash(options.memoHashHex));
    }

    let tx = builder.build();

    // Simulate & prepare
    log.info('Simulating withdrawal transaction...');
    tx = await StellarService.prepareSorobanTransaction(tx);

    // Sign with ops keypair (sponsor)
    tx.sign(opsKeypair);

    return {
      xdr: tx.toXDR(),
      networkPassphrase,
      walletId: user.stellarContractId
    };
  }

  /**
   * Resolve a Radox asset code to its Stellar Asset Contract (SAC) contract ID.
   *
   * USDC SAC is configured via `USDC_SAC_CONTRACT_ID` (preferred) or
   * `USDC_CONTRACT_ID` (legacy alias). XLM uses `XLM_CONTRACT_ID`.
   * TESOURO is computed deterministically from `ETHERFUSE_TESOURO_ASSET_IDENTIFIER`
   * via the SAC derivation (Asset.contractId), so no separate env var is needed.
   *
   * @private
   * @param {string} assetCode  - 'USDC' | 'XLM' | 'TESOURO'
   * @returns {string} The SAC contract ID (C…)
   */
  static #resolveAssetSacContractId(assetCode) {
    if (assetCode === 'USDC') {
      const id = process.env.USDC_SAC_CONTRACT_ID || process.env.USDC_CONTRACT_ID;
      if (!id) throw new Error('USDC SAC contract not configured (set USDC_SAC_CONTRACT_ID)');
      return id;
    }
    if (assetCode === 'XLM') {
      const id = process.env.XLM_CONTRACT_ID;
      if (!id) throw new Error('XLM_CONTRACT_ID not configured');
      return id;
    }
    if (assetCode === 'TESOURO') {
      const assetId = process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER;
      if (!assetId || !assetId.includes(':')) {
        throw new Error('ETHERFUSE_TESOURO_ASSET_IDENTIFIER not configured (expected CODE:ISSUER)');
      }
      const [code, issuer] = assetId.split(':');
      return new Asset(code, issuer).contractId(getNetworkPassphrase());
    }
    throw new Error(`Unsupported asset for withdrawal: ${assetCode}`);
  }

  /**
   * Resolve a Radox asset code to its classic Stellar Asset (CODE:ISSUER).
   *
   * Used by the off-ramp relayer bridge — the relayer-to-anchor payment is a
   * CLASSIC `payment` op (not a SAC invocation), so it needs the classic
   * Asset shape with a known issuer. USDC's mainnet issuer is the canonical
   * Circle account; override via `USDC_ISSUER` for testnet.
   *
   * @param {string} assetCode  - 'USDC' | 'TESOURO'
   * @returns {Asset} A @stellar/stellar-sdk Asset instance
   */
  static resolveClassicAsset(assetCode) {
    if (assetCode === 'TESOURO') {
      const assetId = process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER;
      if (!assetId || !assetId.includes(':')) {
        throw new Error('ETHERFUSE_TESOURO_ASSET_IDENTIFIER not configured (expected CODE:ISSUER)');
      }
      const [code, issuer] = assetId.split(':');
      return new Asset(code, issuer);
    }
    if (assetCode === 'USDC') {
      // getUsdcIssuer() auto-detects testnet vs mainnet from STELLAR_NETWORK,
      // honoring the USDC_ISSUER override if explicitly set. Centralized in
      // config/stellar.js so all consumers stay consistent.
      return new Asset('USDC', getUsdcIssuer());
    }
    throw new Error(`No classic Asset configured for code: ${assetCode}`);
  }

  /**
   * Build + submit the second half of the off-ramp relayer bridge: a CLASSIC
   * Stellar `payment` op from a **per-investor relayer G-account** to the
   * EtherFuse anchor, with `Memo.hash` so the anchor monitor correlates this
   * credit to the order it issued.
   *
   * Custody model — each investor has their own classic G-account (sidecar to
   * their Soroban smart wallet). The keypair is platform-held but per-user,
   * managed by `InvestorRelayerWalletService`. The investor's signing keypair
   * is loaded by the caller (after passkey-authenticated decryption) and
   * passed in here. This service is keypair-agnostic.
   *
   * Fee model — the inner TX is signed by the investor's relayer keypair
   * and handed to `sendTransaction`, which routes through OZ Channels (or
   * the self-sponsorship fallback). Channels wraps the TX in its own fee
   * bump signed by a channel keypair — so we do NOT pre-bump here. Pre-
   * bumping causes Channels to attempt to fee-bump a fee-bump TX, which
   * the Stellar SDK rejects with "v1 not set". Per-investor relayer Gs
   * never need to hold XLM; Channels covers all classic TX fees.
   *
   * Preconditions:
   *   - `signingKeypair` is the investor's per-investor relayer G (matching
   *     the row in `investor_relayer_wallets`).
   *   - That G has classic trustlines for `assetCode` (established at
   *     `InvestorRelayerWalletService.ensureProvisioned()` time).
   *   - That G has just received `amount` of the asset from the investor's
   *     SAC `transfer()` (TX 1 of the bridge).
   *
   * @param {object} args
   * @param {string} args.anchorAccountId  - EtherFuse anchor G-address
   * @param {string} args.assetCode        - 'TESOURO' | 'USDC'
   * @param {string|number} args.amount    - decimal string, 7-decimal SAC precision
   * @param {string} args.memoHashHex      - 32-byte hex string for Memo.hash
   * @param {Keypair} args.signingKeypair  - the per-investor relayer G keypair
   * @returns {Promise<{hash: string, status: string}>}
   */
  static async submitRelayerAnchorPayment({ anchorAccountId, assetCode, amount, memoHashHex, signingKeypair }) {
    if (!anchorAccountId || !anchorAccountId.match(/^G[A-Z0-9]{55}$/)) {
      throw new Error(`Invalid anchor account: ${anchorAccountId}`);
    }
    if (!memoHashHex || !/^[0-9a-f]{64}$/i.test(memoHashHex)) {
      throw new Error('memoHashHex must be a 32-byte hex string (64 hex chars)');
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }
    if (!signingKeypair || typeof signingKeypair.publicKey !== 'function') {
      throw new Error('signingKeypair (Keypair instance) is required');
    }

    const asset = this.resolveClassicAsset(assetCode);
    const networkPassphrase = getNetworkPassphrase();
    const opsKeypair = getOperationsKeypair();
    const server = this.getRpcServer();

    // Classic payments use a decimal-string amount with up to 7 fractional
    // digits — matches the SAC precision we used in TX 1 exactly. The trailing
    // `|| '0.0000001'` is a defensive floor; never trips for real amounts.
    const stellarAmount = parsedAmount.toFixed(7).replace(/\.?0+$/, '') || '0.0000001';

    // Inner TX: per-investor relayer G → anchor, signed by the investor's
    // relayer keypair. The investor's G is the source-of-funds. We hand
    // the SIGNED INNER TX directly to sendTransaction — Channels (or the
    // self-sponsorship fallback inside sendTransaction) will wrap it in
    // its own fee bump signed by a channel/ops keypair. DO NOT pre-bump
    // here; Channels rejects already-bumped TXs with "v1 not set".
    const sourceAccount = await server.getAccount(signingKeypair.publicKey());
    const innerTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(Operation.payment({
        destination: anchorAccountId,
        asset,
        amount: stellarAmount,
      }))
      .addMemo(Memo.hash(memoHashHex))
      .setTimeout(180)
      .build();
    innerTx.sign(signingKeypair);

    log.info(`Relayer→anchor payment: ${stellarAmount} ${assetCode} from ${signingKeypair.publicKey().slice(0, 6)}… → ${anchorAccountId.slice(0, 6)}… memo=${memoHashHex.slice(0, 8)}…`);
    const result = await this.sendTransaction(innerTx);
    if (!result || !result.hash) {
      throw new Error('Failed to submit relayer→anchor payment');
    }
    return { hash: result.hash, status: result.status };
  }

  /**
   * Build an investment SAC transfer transaction to be signed by investor's Passkey.
   * Transfers USDC from investor smart wallet → company wallet.
   * 
   * NOTE: The 170-line manual footprint hack from passkey-kit has been removed.
   * Channels' func+auth submission handles footprint discovery and resource
   * calculation automatically, including the __check_auth entries.
   */
  static async buildInvestmentTx(investorContractId, companyWallet, amount) {
    const server = this.getRpcServer();

    // Validate inputs
    if (!investorContractId || !investorContractId.match(/^C[A-Z0-9]{55}$/)) {
      throw new Error('Invalid investor wallet address');
    }
    const isValidDest = companyWallet && (
      companyWallet.match(/^[GC][A-Z0-9]{55}$/) ||
      StellarStrKey.isValidMed25519PublicKey(companyWallet)
    );
    if (!isValidDest) {
      throw new Error('Invalid destination wallet address');
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const tokenContractId = process.env.USDC_SAC_CONTRACT_ID || process.env.USDC_CONTRACT_ID;
    if (!tokenContractId) {
      throw new Error('USDC_SAC_CONTRACT_ID not configured');
    }

    const networkPassphrase = getNetworkPassphrase();
    const opsKeypair = getOperationsKeypair();

    // Build SAC transfer: investor → company
    const investorAddress = Address.fromString(investorContractId);
    const companyAddress = Address.fromString(companyWallet);
    const amountBigInt = BigInt(Math.floor(parsedAmount * 10_000_000));

    const contract = new Contract(tokenContractId);
    const transferOp = contract.call(
      'transfer',
      xdr.ScVal.scvAddress(investorAddress.toScAddress()),
      xdr.ScVal.scvAddress(companyAddress.toScAddress()),
      nativeToScVal(amountBigInt, { type: 'i128' })
    );

    let tx = new TransactionBuilder(
      await server.getAccount(opsKeypair.publicKey()),
      { fee: BASE_FEE, networkPassphrase }
    )
      .addOperation(transferOp)
      .setTimeout(180)
      .build();

    // Simulate & prepare
    log.info(`Simulating investment transfer: ${parsedAmount} USDC from ${investorContractId} → ${companyWallet}`);
    tx = await StellarService.prepareSorobanTransaction(tx);

    // NOTE: The passkey-kit footprint hack (170 lines of manual SignerKey::Secp256r1 
    // footprint entries, 5x resource boosting, and auth expiration extension) has been
    // removed. The OZ Channels service handles footprint discovery + resource calculation
    // for func+auth submissions. For XDR submissions, the simulation already includes
    // correct footprint for OZ smart-account contracts.

    return {
      xdr: tx.toXDR(),
      networkPassphrase,
      walletId: investorContractId
    };
  }

  // forwardInvestmentToCompany removed — funds now go directly to treasury muxed address.
  // Company claims funds via admin-approved settlement (Phase 2).

  /**
   * Submit a signed withdrawal transaction.
   * 
   * SECURITY: Validates the XDR before sponsoring to prevent arbitrary
   * transaction injection. Only allows single invokeHostFunction ops
   * targeting known token contracts (USDC/XLM SAC).
   */
  static async submitWithdrawalTx(signedXdr) {
    const tx = TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase());

    // --- SECURITY: Validate withdrawal XDR before sponsoring ---
    this.#validateWithdrawalTx(tx);

    const result = await this.sendTransaction(tx);

    if (!result || !result.hash) {
      throw new Error('Failed to submit withdrawal transaction');
    }

    return {
      hash: result.hash,
      status: result.status
    };
  }

  /**
   * Validate that a withdrawal transaction only contains expected operations.
   * @private
   */
  static #validateWithdrawalTx(tx) {
    const ops = tx.operations;

    if (!ops || ops.length !== 1) {
      throw new Error(`Invalid withdrawal: expected 1 operation, got ${ops?.length || 0}`);
    }

    const op = ops[0];

    if (op.type !== 'invokeHostFunction') {
      throw new Error(`Invalid withdrawal: unexpected operation type '${op.type}'`);
    }

    try {
      const invokeArgs = op.func?.value?.();
      if (invokeArgs && typeof invokeArgs.contractAddress === 'function') {
        const contractId = Address.fromScAddress(invokeArgs.contractAddress()).toString();

        // TESOURO SAC is derived deterministically from CODE:ISSUER so we compute
        // it on the fly and add to the allowlist. Falls through silently when the
        // env var is unset (off-ramp routes will 404 in that case anyway).
        let tesouroSacContractId = null;
        const tesouroAssetId = process.env.ETHERFUSE_TESOURO_ASSET_IDENTIFIER;
        if (tesouroAssetId && tesouroAssetId.includes(':')) {
          try {
            const [code, issuer] = tesouroAssetId.split(':');
            tesouroSacContractId = new Asset(code, issuer).contractId(getNetworkPassphrase());
          } catch { /* derivation failed — leave null */ }
        }

        const allowedContracts = [
          process.env.USDC_SAC_CONTRACT_ID,
          process.env.USDC_CONTRACT_ID,
          process.env.XLM_SAC_CONTRACT_ID,
          process.env.XLM_CONTRACT_ID,
          tesouroSacContractId,
        ].filter(Boolean);

        if (allowedContracts.length > 0 && !allowedContracts.includes(contractId)) {
          log.warn(`REJECTED withdrawal: contract ${contractId} not in allowlist`);
          throw new Error('Invalid withdrawal: contract not authorized for withdrawals');
        }

        const funcName = invokeArgs.functionName?.()?.toString();
        if (funcName && funcName !== 'transfer') {
          log.warn(`REJECTED withdrawal: unexpected function '${funcName}'`);
          throw new Error(`Invalid withdrawal: unexpected contract function '${funcName}'`);
        }
      }
    } catch (parseErr) {
      if (parseErr.message.startsWith('Invalid withdrawal')) throw parseErr;
      log.debug(`Could not deep-inspect withdrawal XDR: ${parseErr.message}`);
    }
  }

  /**
   * Build a withdrawal transaction for a Company entity.
   */
  static async buildWithdrawalTxForCompany(companyId, destinationAddress, amount, assetCode = 'USDC') {
    const server = this.getRpcServer();

    if (!destinationAddress || typeof destinationAddress !== 'string') {
      throw new Error('Destination address is required');
    }

    if (!destinationAddress.match(/^[GC][A-Z0-9]{55}$/)) {
      throw new Error('Invalid destination address format. Must be a valid Stellar address (G...) or contract (C...)');
    }

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (parsedAmount > 1000000000) {
      throw new Error('Amount exceeds maximum allowed');
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company || !company.stellarContractId) {
      throw new Error('Company wallet not found');
    }

    let tokenContractId;
    if (assetCode === 'USDC') {
      tokenContractId = process.env.USDC_CONTRACT_ID;
      if (!tokenContractId) throw new Error('USDC_CONTRACT_ID not configured');
    } else if (assetCode === 'XLM') {
      tokenContractId = process.env.XLM_CONTRACT_ID;
      if (!tokenContractId) throw new Error('XLM_CONTRACT_ID not configured');
    } else {
      throw new Error('Unsupported asset for withdrawal');
    }

    const networkPassphrase = getNetworkPassphrase();
    const opsKeypair = getOperationsKeypair();

    const walletAddress = Address.fromString(company.stellarContractId);
    const destination = Address.fromString(destinationAddress);
    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 10_000_000));

    const contract = new Contract(tokenContractId);
    const transferOp = contract.call(
      'transfer',
      xdr.ScVal.scvAddress(walletAddress.toScAddress()),
      xdr.ScVal.scvAddress(destination.toScAddress()),
      nativeToScVal(amountBigInt, { type: 'i128' })
    );

    const tx = new TransactionBuilder(
      await server.getAccount(opsKeypair.publicKey()),
      { fee: BASE_FEE, networkPassphrase }
    )
      .addOperation(transferOp)
      .setTimeout(180)
      .build();

    tx.sign(opsKeypair);

    return {
      xdr: tx.toXDR(),
      networkPassphrase,
      walletId: company.stellarContractId
    };
  }

  // =========================================================================
  // TIER A: PASSKEY LIST + LAST USED (unchanged)
  // =========================================================================

  /**
   * List all passkeys registered for a user
   */
  static async listUserPasskeys(userType, userId) {
    const credentialModel = this.#getCredentialModel(userType);
    const userModel = this.#getPrismaModel(userType);
    const fkField = this.#getCredentialFkField(userType);

    if (!credentialModel || !userModel) {
      throw new Error(`Invalid user type: ${userType}`);
    }

    const user = await prisma[userModel].findUnique({
      where: { id: userId },
      select: {
        passkeyCredentialId: true,
        createdAt: true,
      },
    });

    const additionalCredentials = await prisma[credentialModel].findMany({
      where: { [fkField]: userId },
      select: {
        id: true,
        credentialId: true,
        deviceName: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const allPasskeys = [];

    if (user?.passkeyCredentialId) {
      allPasskeys.push({
        id: 0,
        credentialId: user.passkeyCredentialId,
        deviceName: 'Primary Device',
        createdAt: user.createdAt,
        lastUsedAt: null,
        isPrimary: true,
      });
    }

    additionalCredentials.forEach(cred => {
      allPasskeys.push({
        id: cred.id,
        credentialId: cred.credentialId,
        deviceName: cred.deviceName || 'Unknown Device',
        createdAt: cred.createdAt,
        lastUsedAt: cred.lastUsedAt,
        isPrimary: false,
      });
    });

    return allPasskeys;
  }

  // =========================================================================
  // ED25519 SIGNER MANAGEMENT (Read-only — on-chain management requires
  // frontend-initiated flow with passkey authorization)
  // =========================================================================

  /**
   * List all Ed25519 recovery signers for a user
   */
  static async listEd25519Signers(userType, userId) {
    try {
      const model = this.#getPrismaModel(userType);
      if (!model) throw new Error(`Invalid user type: ${userType}`);

      const user = await prisma[model].findUnique({
        where: { id: userId },
        select: { id: true, stellarContractId: true },
      });

      if (!user) throw new Error('User not found');

      const signerModel = this.#getEd25519SignerModel(userType);
      const fkField = userType === UserType.INVESTOR ? 'investorId' : 'companyUserId';

      const signers = await prisma[signerModel].findMany({
        where: { [fkField]: userId },
        orderBy: { createdAt: 'asc' },
      });

      return signers.map(s => ({
        id: s.id,
        publicKey: s.publicKey,
        name: s.name,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
      }));
    } catch (error) {
      // If table doesn't exist yet, return empty
      if (error.code === 'P2021') {
        return [];
      }
      log.error('Error listing Ed25519 signers:', error);
      throw new Error(`Failed to list Ed25519 signers: ${error.message}`);
    }
  }
}
