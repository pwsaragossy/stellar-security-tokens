import { ChannelsClient } from '@openzeppelin/relayer-plugin-channels';
import { Client as SmartAccountClient } from 'smart-account-kit-bindings';
import { getNetworkPassphrase, getOperationsKeypair, getSorobanRpcUrl, isTestnet, getTreasuryKeypair } from '../config/stellar.js';
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
  Keypair,
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
      // Enforcing Mode trade() TXs cost ~0.97 XLM. 1 XLM cap with ~3% headroom.
      // If this triggers, check that investmentController rebuilds the TX with
      // BASE_FEE (not signedTx.fee) so boostResources' 5× estimate doesn't leak.
      const MAX_SPONSORED_FEE_STROOPS = 10_000_000; // 1 XLM
      if (innerFee > MAX_SPONSORED_FEE_STROOPS) {
        log.warn(`[E-4091] REJECTED sponsorship: inner fee ${innerFee} stroops (${(innerFee / 10_000_000).toFixed(4)} XLM) exceeds cap of ${MAX_SPONSORED_FEE_STROOPS} (${MAX_SPONSORED_FEE_STROOPS / 10_000_000} XLM)`);
        throw new Error('The network is experiencing high demand right now. Please wait a moment and try again. (E-4091)');
      }

      const feeBumpFee = Math.max(parseInt(BASE_FEE) * 2, innerFee + parseInt(BASE_FEE));

      const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
        channelKeypair.publicKey(),
        feeBumpFee.toString(),
        innerTx,
        networkPassphrase
      );

      // 3. Sign the outer Fee Bump Transaction with channel account
      feeBumpTx.sign(channelKeypair);

      // 4. Submit directly to Horizon
      log.info('Submitting self-sponsored fee bump to Horizon...');
      log.debug(`Fee bump source: ${feeBumpTx.feeSource}`);

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

      const result = await targetServer.submitTransaction(feeBumpTx);

      return {
        success: true,
        hash: result.hash,
        ledger: result.ledger,
        sponsored: true
      };
    } catch (error) {
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
          stellarPublicKey: deployResult.contractId,
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
          const balances = await this.getSorobanWalletBalances(user.stellarContractId);
          result.balances = balances;
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
  static async getSorobanWalletBalances(walletContractId) {
    const { scValToNative } = await import('@stellar/stellar-sdk');
    const server = this.getRpcServer();

    const balances = {
      xlm: '0',
      usdc: '0'
    };

    const xlmSacContractId = process.env.XLM_SAC_CONTRACT_ID;
    const usdcSacContractId = process.env.USDC_SAC_CONTRACT_ID;

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

    const [xlmBalance, usdcBalance] = await Promise.all([
      querySacBalance(xlmSacContractId, walletContractId),
      querySacBalance(usdcSacContractId, walletContractId)
    ]);

    balances.xlm = xlmBalance;
    balances.usdc = usdcBalance;

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
  static async buildWithdrawalTx(userId, destinationAddress, amount, assetCode = 'USDC', userType = UserType.INVESTOR) {
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

    const walletAddress = Address.fromString(user.stellarContractId);
    const destination = Address.fromString(destinationAddress);
    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 10_000_000));

    const contract = new Contract(tokenContractId);
    const transferOp = contract.call(
      'transfer',
      xdr.ScVal.scvAddress(walletAddress.toScAddress()),
      xdr.ScVal.scvAddress(destination.toScAddress()),
      xdr.ScVal.scvI128(xdr.Int128Parts.fromBigInt(amountBigInt))
    );

    let tx = new TransactionBuilder(
      await server.getAccount(opsKeypair.publicKey()),
      { fee: BASE_FEE, networkPassphrase }
    )
      .addOperation(transferOp)
      .setTimeout(180)
      .build();

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
        const allowedContracts = [
          process.env.USDC_SAC_CONTRACT_ID,
          process.env.USDC_CONTRACT_ID,
          process.env.XLM_SAC_CONTRACT_ID,
          process.env.XLM_CONTRACT_ID,
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
      xdr.ScVal.scvI128(xdr.Int128Parts.fromBigInt(amountBigInt))
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

  static async updatePasskeyLastUsed(userType, credentialId) {
    const credentialModel = this.#getCredentialModel(userType);
    if (!credentialModel) return;

    try {
      await prisma[credentialModel].updateMany({
        where: { credentialId },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      log.error('Error updating passkey last used:', error);
    }
  }

  // =========================================================================
  // TIER D PHASE 3: SIGNER MANAGEMENT
  // =========================================================================

  /**
   * Add a new passkey signer to user's smart wallet.
   * 
   * OZ smart-account uses context rules with External signers:
   *   wallet.add_signer({ context_rule_id, signer: { tag: 'External', values: [verifierAddr, keyData] } })
   * 
   * @param {string} userType - Type of user: 'investor' or 'company_user'
   * @param {number} userId - User database ID
   * @param {string} credentialId - The new WebAuthn credential ID (base64)
   * @param {Buffer} publicKey - The new passkey public key (65-byte uncompressed secp256r1)
   * @param {string} deviceName - Optional device name
   * @returns {Promise<Object>} Result with new passkey info
   */
  static async addPasskeySigner(userType, userId, credentialId, publicKey, deviceName = null) {
    try {
      const model = this.#getPrismaModel(userType);
      const credentialModel = this.#getCredentialModel(userType);
      const fkField = this.#getCredentialFkField(userType);

      if (!model || !credentialModel) {
        throw new Error(`Invalid user type: ${userType}`);
      }

      // 1. Verify user exists and has a wallet
      const user = await prisma[model].findUnique({
        where: { id: userId },
        select: { id: true, stellarContractId: true, email: true },
      });

      if (!user) throw new Error('User not found');
      if (!user.stellarContractId) throw new Error('User does not have a smart wallet yet');

      // 2. Check if credential already registered
      const existingCred = await prisma[credentialModel].findFirst({
        where: { credentialId },
      });
      if (existingCred) throw new Error('This passkey is already registered');

      // 3. Prepare key data
      const credentialIdBuffer = Buffer.from(credentialId, 'base64');
      const publicKeyBuffer = Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey, 'base64');

      const webauthnVerifierAddress = process.env.WEBAUTHN_VERIFIER_ADDRESS;
      if (!webauthnVerifierAddress) throw new Error('WEBAUTHN_VERIFIER_ADDRESS is required');

      const keyData = buildKeyData(publicKeyBuffer, credentialIdBuffer);
      const signer = {
        tag: 'External',
        values: [webauthnVerifierAddress, keyData],
      };

      // 4. Build add_signer transaction using OZ bindings
      const walletClient = new SmartAccountClient({
        contractId: user.stellarContractId,
        networkPassphrase: getNetworkPassphrase(),
        rpcUrl: getSorobanRpcUrl(),
        publicKey: getOperationsKeypair().publicKey(),
      });

      const addTx = await walletClient.add_signer({
        context_rule_id: 0, // Default context rule
        signer,
      });

      // 5. Sign and send
      const opsKeypair = getOperationsKeypair();
      addTx.sign(opsKeypair);

      let result;
      try {
        result = await this.sendTransaction(addTx.built);
      } catch (err) {
        result = await this.submitWithSponsorship(addTx.built.toXDR());
      }

      // 6. Store in database
      const newCredential = await prisma[credentialModel].create({
        data: {
          [fkField]: userId,
          credentialId,
          publicKey: publicKeyBuffer,
          deviceName: deviceName || 'New Device',
          counter: 0,
        },
      });

      return {
        success: true,
        credentialId: newCredential.id,
        deviceName: newCredential.deviceName,
        transactionHash: result.hash,
      };
    } catch (error) {
      log.error('Error adding passkey signer:', error);
      throw new Error(`Failed to add passkey: ${error.message}`);
    }
  }

  /**
   * Remove a passkey signer from user's smart wallet.
   * Enforces minimum of 1 passkey.
   */
  static async removePasskeySigner(userType, userId, passkeyId) {
    try {
      const model = this.#getPrismaModel(userType);
      const credentialModel = this.#getCredentialModel(userType);
      const fkField = this.#getCredentialFkField(userType);

      if (!model || !credentialModel) throw new Error(`Invalid user type: ${userType}`);

      const user = await prisma[model].findUnique({
        where: { id: userId },
        select: { id: true, stellarContractId: true },
      });

      if (!user) throw new Error('User not found');
      if (!user.stellarContractId) throw new Error('User does not have a smart wallet');

      const allPasskeys = await prisma[credentialModel].findMany({
        where: { [fkField]: userId },
      });

      if (allPasskeys.length <= 1) {
        throw new Error('Cannot remove the last passkey. You must have at least one.');
      }

      const passkeyToRemove = allPasskeys.find(p => p.id === passkeyId);
      if (!passkeyToRemove) throw new Error('Passkey not found');

      // Build the External signer to remove
      const credentialIdBuffer = Buffer.from(passkeyToRemove.credentialId, 'base64');
      const webauthnVerifierAddress = process.env.WEBAUTHN_VERIFIER_ADDRESS;
      const keyData = buildKeyData(passkeyToRemove.publicKey, credentialIdBuffer);
      const signer = {
        tag: 'External',
        values: [webauthnVerifierAddress, keyData],
      };

      const walletClient = new SmartAccountClient({
        contractId: user.stellarContractId,
        networkPassphrase: getNetworkPassphrase(),
        rpcUrl: getSorobanRpcUrl(),
        publicKey: getOperationsKeypair().publicKey(),
      });

      const removeTx = await walletClient.remove_signer({
        context_rule_id: 0,
        signer,
      });

      const opsKeypair = getOperationsKeypair();
      removeTx.sign(opsKeypair);

      let result;
      try {
        result = await this.sendTransaction(removeTx.built);
      } catch (err) {
        result = await this.submitWithSponsorship(removeTx.built.toXDR());
      }

      await prisma[credentialModel].delete({ where: { id: passkeyId } });

      return {
        success: true,
        removedId: passkeyId,
        transactionHash: result.hash,
        remainingPasskeys: allPasskeys.length - 1,
      };
    } catch (error) {
      log.error('Error removing passkey:', error);
      throw new Error(`Failed to remove passkey: ${error.message}`);
    }
  }

  // =========================================================================
  // ED25519 SIGNER MANAGEMENT (Ledger Recovery)
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

  /**
   * Add an Ed25519 signer (e.g., Ledger) to user's smart wallet.
   * Uses Delegated signer type in OZ contracts.
   */
  static async addEd25519Signer(userType, userId, publicKey, name = 'Ledger') {
    try {
      const model = this.#getPrismaModel(userType);
      const signerModel = this.#getEd25519SignerModel(userType);
      const fkField = userType === UserType.INVESTOR ? 'investorId' : 'companyUserId';

      if (!model) throw new Error(`Invalid user type: ${userType}`);

      if (!publicKey || !publicKey.startsWith('G') || publicKey.length !== 56) {
        throw new Error('Invalid Stellar public key format');
      }

      const user = await prisma[model].findUnique({
        where: { id: userId },
        select: { id: true, stellarContractId: true },
      });

      if (!user) throw new Error('User not found');
      if (!user.stellarContractId) throw new Error('User does not have a smart wallet');

      const existingSigners = await prisma[signerModel].findMany({
        where: { [fkField]: userId },
      });

      if (existingSigners.some(s => s.publicKey === publicKey)) {
        throw new Error('This signer is already registered');
      }

      // OZ Delegated signer — G-address
      const signer = {
        tag: 'Delegated',
        values: [publicKey],
      };

      const walletClient = new SmartAccountClient({
        contractId: user.stellarContractId,
        networkPassphrase: getNetworkPassphrase(),
        rpcUrl: getSorobanRpcUrl(),
        publicKey: getOperationsKeypair().publicKey(),
      });

      const addTx = await walletClient.add_signer({
        context_rule_id: 0,
        signer,
      });

      const opsKeypair = getOperationsKeypair();
      addTx.sign(opsKeypair);

      let result;
      try {
        result = await this.sendTransaction(addTx.built);
      } catch (sendError) {
        log.warn(`Direct send failed, trying sponsorship: ${sendError.message}`);
        result = await this.submitWithSponsorship(addTx.built.toXDR());
      }

      const newSigner = await prisma[signerModel].create({
        data: {
          [fkField]: userId,
          publicKey,
          name,
        },
      });

      log.info(`Added signer ${publicKey} for user ${userId}. TX: ${result.hash}`);

      return {
        success: true,
        signerId: newSigner.id,
        publicKey,
        name,
        transactionHash: result.hash,
      };
    } catch (error) {
      log.error('Error adding Ed25519 signer:', error);
      throw new Error(`Failed to add Ed25519 signer: ${error.message}`);
    }
  }

  /**
   * Remove an Ed25519 signer from user's smart wallet.
   */
  static async removeEd25519Signer(userType, userId, signerId) {
    try {
      const model = this.#getPrismaModel(userType);
      const signerModel = this.#getEd25519SignerModel(userType);
      const fkField = userType === UserType.INVESTOR ? 'investorId' : 'companyUserId';

      if (!model) throw new Error(`Invalid user type: ${userType}`);

      const user = await prisma[model].findUnique({
        where: { id: userId },
        select: { id: true, stellarContractId: true },
      });

      if (!user) throw new Error('User not found');
      if (!user.stellarContractId) throw new Error('User does not have a smart wallet');

      const signerToRemove = await prisma[signerModel].findFirst({
        where: { id: signerId, [fkField]: userId },
      });

      if (!signerToRemove) throw new Error('Signer not found');

      const signer = {
        tag: 'Delegated',
        values: [signerToRemove.publicKey],
      };

      const walletClient = new SmartAccountClient({
        contractId: user.stellarContractId,
        networkPassphrase: getNetworkPassphrase(),
        rpcUrl: getSorobanRpcUrl(),
        publicKey: getOperationsKeypair().publicKey(),
      });

      const removeTx = await walletClient.remove_signer({
        context_rule_id: 0,
        signer,
      });

      const opsKeypair = getOperationsKeypair();
      removeTx.sign(opsKeypair);

      let result;
      try {
        result = await this.sendTransaction(removeTx.built);
      } catch (err) {
        result = await this.submitWithSponsorship(removeTx.built.toXDR());
      }

      await prisma[signerModel].delete({ where: { id: signerId } });

      log.info(`Removed signer ${signerToRemove.publicKey} for user ${userId}. TX: ${result.hash}`);

      return {
        success: true,
        removedId: signerId,
        transactionHash: result.hash,
      };
    } catch (error) {
      log.error('Error removing Ed25519 signer:', error);
      throw new Error(`Failed to remove Ed25519 signer: ${error.message}`);
    }
  }
}
