import { PasskeyServer } from 'passkey-kit';
import { getNetworkPassphrase, getIssuerKeypair, getSorobanRpcUrl, isTestnet, getTreasuryKeypair } from '../config/stellar.js';
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
  Networks,
  Transaction,
  FeeBumpTransaction
} from '@stellar/stellar-sdk';

/**
 * Supported user types for passkey wallet
 */
export const UserType = {
  INVESTOR: 'investor',
  COMPANY_USER: 'company_user',
};

/**
 * Service for managing Stellar smart wallets using Passkey Kit
 * This service handles wallet creation and management without Mercury dependency
 * by storing contract addresses directly in our database
 * 
 * Supports both investors and company users
 */
export class PasskeyWalletService {
  static #server = null;

  /**
   * Get or create PasskeyServer instance
   * @returns {PasskeyServer}
   */
  static getServer() {
    if (!this.#server) {
      const rpcUrl = getSorobanRpcUrl();
      const launchtubeUrl = process.env.LAUNCHTUBE_URL || 'https://launchtube.xyz';
      const launchtubeJwt = process.env.LAUNCHTUBE_JWT;
      const factoryContractId = process.env.FACTORY_CONTRACT_ID;

      if (!launchtubeJwt) {
        throw new Error('LAUNCHTUBE_JWT is required for Passkey Wallet operations');
      }

      if (!factoryContractId) {
        throw new Error('FACTORY_CONTRACT_ID is required for Passkey Wallet operations');
      }

      this.#server = new PasskeyServer({
        rpcUrl,
        launchtubeUrl,
        launchtubeJwt,
        // networkPassphrase is not used by PasskeyServer constructor in the version checking source, but harmless
      });
    }
    return this.#server;
  }

  /**
   * Get configuration for client-side PasskeyKit initialization
   * @returns {Object} Configuration object for frontend
   */
  static getClientConfig() {
    // Default walletWasmHash from passkey-kit testnet demo
    const defaultWasmHash = 'ecd990f0b45ca6817149b6175f79b32efb442f35731985a084131e8265c4cd90';

    return {
      rpcUrl: getSorobanRpcUrl(),
      networkPassphrase: getNetworkPassphrase(),
      walletWasmHash: process.env.WALLET_WASM_HASH || defaultWasmHash,
    };
  }

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
   * Deploy a new smart wallet using the Factory logic
   * Used during registration when user doesn't exist yet
   * 
   * @param {string} credentialId - The WebAuthn credential ID (base64)
   * @param {Buffer} publicKey - The passkey public key
   * @returns {Promise<Object>} Result with contractId and transactionHash
   */
  static async deploySmartWallet(credentialId, publicKey) {
    try {
      const server = this.getServer();
      const factoryContractId = process.env.FACTORY_CONTRACT_ID;
      const networkPassphrase = getNetworkPassphrase();
      const issuerKeypair = getIssuerKeypair();

      // 1. Prepare Arguments
      if (!credentialId) throw new Error('Credential ID is required for deployment');
      if (!publicKey) throw new Error('Public key is required for deployment');

      const credentialIdBuffer = Buffer.from(credentialId, 'base64');
      const publicKeyBuffer = Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey, 'base64');

      // 2. Build Transaction calling Factory 'deploy'
      const factory = new Contract(factoryContractId);
      const deployOp = factory.call(
        'deploy',
        xdr.ScVal.scvBytes(credentialIdBuffer),
        xdr.ScVal.scvBytes(publicKeyBuffer)
      );

      const tx = new TransactionBuilder(
        await server.rpc.getAccount(issuerKeypair.publicKey()),
        { fee: BASE_FEE, networkPassphrase }
      )
        .addOperation(deployOp)
        .setTimeout(30)
        .build();

      tx.sign(issuerKeypair);

      // 3. Send via Launchtube (Sponsoring) with fallback
      let result;
      try {
        result = await server.send(tx);
        if (!result || !result.hash) {
          throw new Error('No hash returned from Launchtube');
        }
      } catch (launchtubeError) {
        console.log('[PasskeyWalletService] Launchtube failed during deploySmartWallet:', launchtubeError.message);
        console.log('[PasskeyWalletService] Attempting self-sponsorship fallback for deployment...');
        result = await this.submitWithSponsorship(tx.toXDR());
      }

      // 4. Calculate Contract ID
      const salt = hash(credentialIdBuffer);
      const contractIdPreimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(factoryContractId).toScAddress(),
          salt: salt,
        })
      );

      const contractIdHash = hash(
        xdr.HashIdPreimage.envelopeTypeContractId(new xdr.HashIdPreimageContractId({
          networkId: hash(Buffer.from(networkPassphrase)),
          contractIdPreimage,
        })).toXDR()
      );

      const contractId = StrKey.encodeContract(contractIdHash);

      return {
        success: true,
        contractId,
        transactionHash: result.hash,
      };

    } catch (error) {
      console.error('Error deploying smart wallet:', error);
      throw new Error(`Smart wallet deployment failed: ${error.message}`);
    }
  }

  /**
   * Create a new smart wallet for a user (investor or company user)
   * This method is called after passkey registration on the client side
   * 
   * @param {string} userType - Type of user: 'investor' or 'company_user'
   * @param {number} userId - The user's database ID
   * @param {string} credentialId - The WebAuthn credential ID (base64)
   * @param {Buffer} publicKey - The passkey public key
   * @returns {Promise<Object>} Result with contract address and transaction details
   */
  static async createSmartWallet(userType, userId, credentialId, publicKey) {
    try {
      const server = this.getServer();
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

      const factoryContractId = process.env.FACTORY_CONTRACT_ID;
      const networkPassphrase = getNetworkPassphrase();
      const issuerKeypair = getIssuerKeypair(); // Use issuer as source/signer for deployment tx

      // 1. Prepare Arguments
      // credentialId is base64 string -> Buffer
      const credentialIdBuffer = Buffer.from(credentialId, 'base64');

      // publicKey is already Buffer or base64
      const publicKeyBuffer = Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey, 'base64');

      // 2. Build Transaction calling Factory 'deploy'
      // Assuming Factory interface: deploy(credential_id: Bytes, public_key: Bytes) -> Address
      const factory = new Contract(factoryContractId);
      const deployOp = factory.call(
        'deploy',
        xdr.ScVal.scvBytes(credentialIdBuffer),
        xdr.ScVal.scvBytes(publicKeyBuffer)
      );

      const tx = new TransactionBuilder(
        await server.rpc.getAccount(issuerKeypair.publicKey()), // Fetch sequence from RPC using Server's connection (server extends Base which works with rpc)
        // Wait, PasskeyServer extends PasskeyBase which has 'rpc'.
        // But getAccount needs Horizon or RPC? PasskeyBase takes rpcUrl. 
        // PasskeyBase from 'passkey-kit' usually wraps rpc. 
        // Let's use standard TransactionBuilder pattern with fetch:
        { fee: BASE_FEE, networkPassphrase }
      )
        .addOperation(deployOp)
        .setTimeout(30)
        .build();

      tx.sign(issuerKeypair);

      // 3. Send via Launchtube (Sponsoring) with fallback
      let result;
      try {
        result = await server.send(tx);
        if (!result || !result.hash) {
          throw new Error('No hash returned from Launchtube');
        }
      } catch (launchtubeError) {
        console.log('[PasskeyWalletService] Launchtube failed during createSmartWallet:', launchtubeError.message);
        console.log('[PasskeyWalletService] Attempting self-sponsorship fallback for creation...');
        result = await this.submitWithSponsorship(tx.toXDR());
      }

      // 4. Calculate Contract ID
      // Contract ID = specific algorithm using salt.
      // Factory uses salt = hash(credentialIdBuffer)
      // We need to replicate how Factory derives the address or fetch it.
      // Since we can't easily fetch the return value from the tx result without parsing events/simulation,
      // and checking 'result' format from Launchtube might not give us the return value directly.

      // PREDICT the address:
      // Address = Contract(FactoryID).derived(salt=hash(credentialId))
      // Stellar SDK has helpers for this?
      // StrKey.encodeContract(hash(xdr.HashIdPreimage.envelopeTypeContractId(...)))

      const salt = hash(credentialIdBuffer);
      const contractIdPreimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(factoryContractId).toScAddress(),
          salt: salt,
        })
      );

      const contractIdHash = hash(
        xdr.HashIdPreimage.envelopeTypeContractId(new xdr.HashIdPreimageContractId({
          networkId: hash(Buffer.from(networkPassphrase)),
          contractIdPreimage,
        })).toXDR()
      );

      const contractId = StrKey.encodeContract(contractIdHash);

      // Store the contract address in our database
      const updatedUser = await prisma[model].update({
        where: { id: userId },
        data: {
          stellarContractId: contractId,
          passkeyCredentialId: credentialId,
          passkeyPublicKey: publicKeyBuffer,
          // Also store as stellarPublicKey for compatibility with existing code
          stellarPublicKey: contractId,
        },
      });

      return {
        success: true,
        contractId: contractId,
        transactionHash: result.hash,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          stellarContractId: updatedUser.stellarContractId,
          userType,
        },
      };

    } catch (error) {
      console.error('Error creating smart wallet:', error);
      throw new Error(`Smart wallet creation failed: ${error.message}`);
    }
  }

  /**
   * Get the contract address for a user from our database
   * This replaces the Mercury reverse lookup functionality
   * 
   * @param {string} userType - Type of user: 'investor' or 'company_user'
   * @param {string} email - User's email
   * @returns {Promise<string|null>} Contract address or null if not found
   */
  static async getContractIdByEmail(userType, email) {
    const model = this.#getPrismaModel(userType);

    if (!model) {
      throw new Error(`Invalid user type: ${userType}`);
    }

    const user = await prisma[model].findUnique({
      where: { email },
      select: {
        stellarContractId: true,
        passkeyCredentialId: true,
      },
    });

    return user?.stellarContractId || null;
  }

  /**
   * Get user by passkey credential ID
   * 
   * @param {string} userType - Type of user: 'investor' or 'company_user'
   * @param {string} credentialId - The WebAuthn credential ID
   * @returns {Promise<Object|null>} User data or null
   */
  static async getUserByCredentialId(userType, credentialId) {
    const model = this.#getPrismaModel(userType);

    if (!model) {
      throw new Error(`Invalid user type: ${userType}`);
    }

    const baseSelect = {
      id: true,
      name: true,
      email: true,
      stellarContractId: true,
      stellarPublicKey: true,
      emailVerified: true,
    };

    // Add type-specific fields
    const select = userType === UserType.INVESTOR
      ? { ...baseSelect, kycStatus: true }
      : { ...baseSelect, companyId: true, role: true, isActive: true };

    const user = await prisma[model].findFirst({
      where: { passkeyCredentialId: credentialId },
      select,
    });

    return user;
  }

  /**
   * Sign a transaction using the smart wallet
   * This creates an authorization entry for Soroban contract calls
   * 
   * @param {string} contractId - The smart wallet contract address
   * @param {Object} authEntry - The authorization entry to sign
   * @param {Object} credentials - WebAuthn assertion credentials
   * @returns {Promise<Object>} Signed authorization entry
   */
  static async signTransaction(contractId, authEntry, credentials) {
    try {
      const server = this.getServer();

      // Use PasskeyServer to create the signed auth entry
      const signedAuth = await server.sign(
        contractId,
        authEntry,
        credentials
      );

      return {
        success: true,
        signedAuth,
      };
    } catch (error) {
      console.error('Error signing transaction:', error);
      throw new Error(`Transaction signing failed: ${error.message}`);
    }
  }

  /**
   * Send a signed transaction via Launchtube
   * This sponsors the transaction fees
   * 
   * @param {Object} transaction - The signed transaction XDR
   * @returns {Promise<Object>} Transaction result
   */
  static async sendTransaction(transaction) {
    try {
      const server = this.getServer();

      const result = await server.send(transaction);

      return {
        success: true,
        hash: result.hash,
        ledger: result.ledger,
      };
    } catch (error) {
      console.error('Error sending transaction via Launchtube:', error.message);
      // Fallback to self-sponsorship if Launchtube fails
      console.log('[PasskeyWalletService] Launchtube failed or unreachable, attempting self-sponsorship fallback...');
      return this.submitWithSponsorship(transaction);
    }
  }

  /**
   * Submit a transaction with backend sponsorship (Fee Bump)
   * This is used as a fallback for Launchtube
   * 
   * @param {string|Transaction} txOrXdr - The signed transaction (XDR string or Transaction object)
   * @returns {Promise<Object>} Transaction result
   */
  static async submitWithSponsorship(txOrXdr) {
    try {
      const { stellarServer, getNetworkPassphrase, getOperationsKeypair } = await import('../config/stellar.js');
      const networkPassphrase = getNetworkPassphrase();
      const operationsKeypair = getOperationsKeypair();

      // 1. Parse the inner transaction (handle both XDR string and Transaction object)
      let innerTx;
      if (typeof txOrXdr === 'string') {
        innerTx = TransactionBuilder.fromXDR(txOrXdr, networkPassphrase);
      } else if (txOrXdr && typeof txOrXdr.toXDR === 'function') {
        // It's already a Transaction object
        innerTx = txOrXdr;
      } else {
        throw new Error('Invalid transaction format: expected XDR string or Transaction object');
      }

      // 2. Wrap in Fee Bump Transaction
      // Note: We use a slightly higher fee or double the base fee to ensure priority
      console.log('[PasskeyWalletService] Inner TX source:', innerTx.source);
      console.log('[PasskeyWalletService] Inner TX operations count:', innerTx.operations?.length);
      console.log('[PasskeyWalletService] Operations keypair:', operationsKeypair.publicKey());

      const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
        operationsKeypair.publicKey(),
        (parseInt(BASE_FEE) * 2).toString(),
        innerTx,
        networkPassphrase
      );

      // 3. Sign the outer Fee Bump Transaction
      feeBumpTx.sign(operationsKeypair);

      // 4. Submit directly to Horizon
      console.log('[PasskeyWalletService] Submitting self-sponsored fee bump to Horizon...');
      console.log('[PasskeyWalletService] Fee bump source:', feeBumpTx.feeSource);
      const result = await stellarServer.submitTransaction(feeBumpTx);

      return {
        success: true,
        hash: result.hash,
        ledger: result.ledger,
        sponsored: true
      };
    } catch (error) {
      console.error('Self-sponsorship failed:', error);
      if (error.response && error.response.data) {
        const resultCodes = error.response.data.extras?.result_codes;
        const detail = error.response.data.detail || JSON.stringify(resultCodes);
        throw new Error(`Sponsorship failed: ${detail} Codes: ${JSON.stringify(resultCodes)}`);
      }
      throw new Error(`Sponsorship failed: ${error.message}`);

    }
  }

  /**
   * Check if a user has a smart wallet
   * 
   * @param {string} userType - Type of user: 'investor' or 'company_user'
   * @param {number} userId - User database ID
   * @returns {Promise<boolean>}
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
   * 
   * @param {string} userType - Type of user: 'investor' or 'company_user'
   * @param {number} userId - User database ID
   * @returns {Promise<Object>} Wallet status information
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

    // Add type-specific fields
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

    // Determine next step based on user type
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

    // Add type-specific status
    if (userType === UserType.INVESTOR) {
      result.kycStatus = user.kycStatus;
    } else {
      result.isActive = user.isActive;
    }

    // Fetch balances if wallet exists
    if (hasWallet && user.stellarContractId) {
      try {
        // Detect if this is a Soroban contract (starts with C) vs classic account (starts with G)
        const isContractAddress = user.stellarContractId.startsWith('C');

        if (isContractAddress) {
          // Use Soroban RPC to query SAC token balances
          const balances = await this.getSorobanWalletBalances(user.stellarContractId);
          result.balances = balances;

          // Explorer link for contracts
          result.explorer = `https://stellar.expert/explorer/${isTestnet() ? 'testnet' : 'public'}/contract/${user.stellarContractId}`;
        } else {
          // Classic account - use Horizon API
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
        console.error('Failed to fetch wallet balances:', error);
        // Don't fail the whole request, return zeros instead of error
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
   * Query Soroban token balances for a smart wallet contract
   * Uses Soroban RPC to simulate balance() calls on SAC token contracts
   * 
   * @param {string} walletContractId - The smart wallet contract address (C...)
   * @returns {Promise<Object>} Object with xlm and usdc balance strings
   */
  static async getSorobanWalletBalances(walletContractId) {
    const { rpc, scValToNative, nativeToScVal } = await import('@stellar/stellar-sdk');
    const rpcUrl = getSorobanRpcUrl();
    const server = new rpc.Server(rpcUrl, { allowHttp: true });

    const balances = {
      xlm: '0',
      usdc: '0'
    };

    // SAC contract IDs for testnet
    // Native XLM SAC: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC (testnet)
    // These are deterministic based on asset + network
    const xlmSacContractId = process.env.XLM_SAC_CONTRACT_ID;
    const usdcSacContractId = process.env.USDC_SAC_CONTRACT_ID;

    // Helper to query SAC balance
    const querySacBalance = async (sacContractId, walletAddress) => {
      console.log(`[Balance Debug] Querying SAC: ${sacContractId} for wallet ${walletAddress}`);
      if (!sacContractId) {
        console.log('[Balance Debug] Missing SAC Contract ID');
        return '0';
      }

      try {
        const contract = new Contract(sacContractId);
        const walletScVal = nativeToScVal(walletAddress, { type: 'address' });

        // Build the balance call
        const balanceOp = contract.call('balance', walletScVal);

        // Simulate the transaction to get the result
        // Use Treasury as source account (must be a valid G-address for simulation context)
        const sourceAccount = new Account(getTreasuryKeypair().publicKey(), '0');

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
          // Parse the i128 result to a string
          const balanceScVal = simResult.result.retval;
          const balanceRaw = scValToNative(balanceScVal);
          // Convert from stroops (7 decimals) to display value
          const balance = (Number(balanceRaw) / 10_000_000).toFixed(7);
          console.log(`[Balance Debug] Success. Raw: ${balanceRaw}, Formatted: ${balance}`);
          return balance;
        } else {
          console.log('[Balance Debug] Simulation returned no result:', JSON.stringify(simResult));
        }
      } catch (err) {
        console.log(`SAC balance query failed for ${sacContractId}:`, err.message);
      }
      return '0';
    };

    // Query both balances in parallel
    const [xlmBalance, usdcBalance] = await Promise.all([
      querySacBalance(xlmSacContractId, walletContractId),
      querySacBalance(usdcSacContractId, walletContractId)
    ]);

    balances.xlm = xlmBalance;
    balances.usdc = usdcBalance;

    return balances;
  }

  /**
   * Build a withdrawal transaction to be signed by the user's Passkey
   * 
   * @param {number} userId - The user ID (investor or company user)
   * @param {string} destinationAddress - Destination Stellar address (G...)
   * @param {string} amount - Amount to withdraw
   * @param {string} assetCode - Asset code (USDC, XLM)
   * @param {string} userType - Type of user: 'investor' or 'company_user' (default: 'investor')
   * @returns {Promise<Object>} Transaction XDR and network info
   */
  static async buildWithdrawalTx(userId, destinationAddress, amount, assetCode = 'USDC', userType = UserType.INVESTOR) {
    const server = this.getServer();
    const model = this.#getPrismaModel(userType);

    if (!model) {
      throw new Error(`Invalid user type: ${userType}`);
    }

    // Issue 9 Fix: Validate inputs
    if (!destinationAddress || typeof destinationAddress !== 'string') {
      throw new Error('Destination address is required');
    }

    // Validate address format (G... for classic, C... for contract)
    if (!destinationAddress.match(/^[GC][A-Z0-9]{55}$/)) {
      throw new Error('Invalid destination address format. Must be a valid Stellar address (G...) or contract (C...)');
    }

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (parsedAmount > 1000000000) { // 1 billion max
      throw new Error('Amount exceeds maximum allowed');
    }

    // Get user wallet (works for both investors and company users)
    const user = await prisma[model].findUnique({
      where: { id: userId },
    });

    if (!user || !user.stellarContractId) {
      throw new Error(`${userType === UserType.INVESTOR ? 'Investor' : 'Company user'} wallet not found`);
    }

    // Determine asset contract ID based on code (simplified map for MVP)
    // In production, fetch this from DB or config
    let tokenContractId;
    if (assetCode === 'USDC') {
      tokenContractId = process.env.USDC_CONTRACT_ID;
      if (!tokenContractId) {
        throw new Error('USDC_CONTRACT_ID not configured');
      }
    } else if (assetCode === 'XLM') {
      tokenContractId = process.env.XLM_CONTRACT_ID;
      if (!tokenContractId) {
        throw new Error('XLM_CONTRACT_ID not configured');
      }
    } else {
      throw new Error('Unsupported asset for withdrawal');
    }

    // Build the transaction
    const networkPassphrase = getNetworkPassphrase();
    const issuerKeypair = getIssuerKeypair(); // Sponsor/Source

    // Function: transfer(from, to, amount)
    const walletAddress = Address.fromString(user.stellarContractId);
    const destination = Address.fromString(destinationAddress);

    // Convert amount to Stroops (7 decimals)
    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 10_000_000));

    const contract = new Contract(tokenContractId);
    const transferOp = contract.call(
      'transfer',
      xdr.ScVal.scvAddress(walletAddress.toScAddress()),
      xdr.ScVal.scvAddress(destination.toScAddress()),
      xdr.ScVal.scvI128(xdr.Int128Parts.fromBigInt(amountBigInt))
    );

    const tx = new TransactionBuilder(
      await server.rpc.getAccount(issuerKeypair.publicKey()),
      { fee: BASE_FEE, networkPassphrase }
    )
      .addOperation(transferOp)
      .setTimeout(180)
      .build();

    // Sign with issuer (sponsor)
    tx.sign(issuerKeypair);

    return {
      xdr: tx.toXDR(),
      networkPassphrase,
      walletId: user.stellarContractId
    };
  }

  /**
   * Submit a signed withdrawal transaction
   * 
   * @param {string} xdr - The signed transaction XDR
   * @returns {Promise<Object>} Transaction hash
   */
  static async submitWithdrawalTx(signedXdr) {
    const server = this.getServer();

    const tx = TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase());

    const result = await server.send(tx);

    if (!result || !result.hash) {
      throw new Error('Failed to submit withdrawal transaction');
    }

    return {
      hash: result.hash,
      status: result.status
    };
  }

  /**
   * Build a withdrawal transaction for a Company entity  
   * (Companies are stored differently than investors/companyUsers)
   * 
   * @param {number} companyId - The company ID
   * @param {string} destinationAddress - Destination Stellar address (G...)
   * @param {string} amount - Amount to withdraw
   * @param {string} assetCode - Asset code (USDC, XLM)
   * @returns {Promise<Object>} Transaction XDR and network info
   */
  static async buildWithdrawalTxForCompany(companyId, destinationAddress, amount, assetCode = 'USDC') {
    const server = this.getServer();

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

    // Get company wallet from company table
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company || !company.stellarContractId) {
      throw new Error('Company wallet not found');
    }

    // Determine asset contract ID
    let tokenContractId;
    if (assetCode === 'USDC') {
      tokenContractId = process.env.USDC_CONTRACT_ID;
      if (!tokenContractId) {
        throw new Error('USDC_CONTRACT_ID not configured');
      }
    } else if (assetCode === 'XLM') {
      tokenContractId = process.env.XLM_CONTRACT_ID;
      if (!tokenContractId) {
        throw new Error('XLM_CONTRACT_ID not configured');
      }
    } else {
      throw new Error('Unsupported asset for withdrawal');
    }

    // Build the transaction
    const networkPassphrase = getNetworkPassphrase();
    const issuerKeypair = getIssuerKeypair();

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
      await server.rpc.getAccount(issuerKeypair.publicKey()),
      { fee: BASE_FEE, networkPassphrase }
    )
      .addOperation(transferOp)
      .setTimeout(180)
      .build();

    tx.sign(issuerKeypair);

    return {
      xdr: tx.toXDR(),
      networkPassphrase,
      walletId: company.stellarContractId
    };
  }
}
