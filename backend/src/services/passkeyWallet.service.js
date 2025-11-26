// Temporarily disabled due to TypeScript module issues
// import { PasskeyServer } from 'passkey-kit';
const PasskeyServer = null; // Placeholder
import { getNetworkPassphrase } from '../config/stellar.js';
import prisma from '../config/prisma.js';

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
      const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
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
        networkPassphrase: getNetworkPassphrase(),
      });
    }
    return this.#server;
  }

  /**
   * Get configuration for client-side PasskeyKit initialization
   * @returns {Object} Configuration object for frontend
   */
  static getClientConfig() {
    return {
      rpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
      networkPassphrase: getNetworkPassphrase(),
      factoryContractId: process.env.FACTORY_CONTRACT_ID,
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
   * Create a new smart wallet for a user (investor or company user)
   * This method is called after passkey registration on the client side
   * 
   * @param {string} userType - Type of user: 'investor' or 'company_user'
   * @param {number} userId - The user's database ID
   * @param {string} credentialId - The WebAuthn credential ID (base64url encoded)
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

      // Deploy the smart wallet contract using Launchtube
      // The PasskeyServer.createWallet method handles the deployment
      const result = await server.createWallet(
        credentialId,
        publicKey
      );

      if (!result || !result.contractId) {
        throw new Error('Failed to deploy smart wallet contract');
      }

      // Store the contract address in our database
      const updatedUser = await prisma[model].update({
        where: { id: userId },
        data: {
          stellarContractId: result.contractId,
          passkeyCredentialId: credentialId,
          passkeyPublicKey: publicKey,
          // Also store as stellarPublicKey for compatibility with existing code
          stellarPublicKey: result.contractId,
        },
      });

      return {
        success: true,
        contractId: result.contractId,
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
      console.error('Error sending transaction:', error);
      throw new Error(`Transaction submission failed: ${error.message}`);
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

    return result;
  }

  // ============================================================================
  // INVESTOR-SPECIFIC METHODS (for backwards compatibility)
  // ============================================================================

  /**
   * Create a new smart wallet for an investor
   * @deprecated Use createSmartWallet(UserType.INVESTOR, ...) instead
   */
  static async createInvestorWallet(investorId, credentialId, publicKey) {
    return this.createSmartWallet(UserType.INVESTOR, investorId, credentialId, publicKey);
  }

  /**
   * Get investor by passkey credential ID
   * @deprecated Use getUserByCredentialId(UserType.INVESTOR, ...) instead
   */
  static async getInvestorByCredentialId(credentialId) {
    return this.getUserByCredentialId(UserType.INVESTOR, credentialId);
  }

  /**
   * Get wallet status for an investor
   * @deprecated Use getWalletStatus(UserType.INVESTOR, ...) instead
   */
  static async getInvestorWalletStatus(investorId) {
    return this.getWalletStatus(UserType.INVESTOR, investorId);
  }

  // ============================================================================
  // COMPANY USER-SPECIFIC METHODS
  // ============================================================================

  /**
   * Create a new smart wallet for a company user
   */
  static async createCompanyUserWallet(companyUserId, credentialId, publicKey) {
    return this.createSmartWallet(UserType.COMPANY_USER, companyUserId, credentialId, publicKey);
  }

  /**
   * Get company user by passkey credential ID
   */
  static async getCompanyUserByCredentialId(credentialId) {
    return this.getUserByCredentialId(UserType.COMPANY_USER, credentialId);
  }

  /**
   * Get wallet status for a company user
   */
  static async getCompanyUserWalletStatus(companyUserId) {
    return this.getWalletStatus(UserType.COMPANY_USER, companyUserId);
  }
}

export default PasskeyWalletService;

