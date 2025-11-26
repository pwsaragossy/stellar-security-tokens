import { PasskeyKit } from 'passkey-kit';
import { api } from '@/api/client';

// Get configuration from environment variables
const SOROBAN_RPC_URL = import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const FACTORY_CONTRACT_ID = import.meta.env.VITE_FACTORY_CONTRACT_ID;

let passkeyKitInstance: PasskeyKit | null = null;

/**
 * Supported user types for passkey wallet
 */
export type UserType = 'investor' | 'company_user';

/**
 * API endpoints for each user type
 */
const API_ENDPOINTS = {
  investor: {
    createWallet: '/investors/create-wallet',
    walletStatus: (id: number) => `/investors/${id}/wallet-status`,
    passkeyConfig: '/investors/passkey/config',
    loginStart: '/webauthn/investor/login/start',
    loginComplete: '/webauthn/investor/login/complete',
  },
  company_user: {
    createWallet: '/company-users/create-wallet',
    walletStatus: (id: number) => `/company-users/${id}/wallet-status`,
    passkeyConfig: '/company-users/passkey/config',
    loginStart: '/webauthn/company_user/login/start',
    loginComplete: '/webauthn/company_user/login/complete',
  },
};

/**
 * Get or create PasskeyKit instance
 */
export function getPasskeyKit(): PasskeyKit {
  if (!passkeyKitInstance) {
    if (!FACTORY_CONTRACT_ID) {
      throw new Error('VITE_FACTORY_CONTRACT_ID is not configured');
    }

    passkeyKitInstance = new PasskeyKit({
      rpcUrl: SOROBAN_RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      factoryContractId: FACTORY_CONTRACT_ID,
    });
  }
  return passkeyKitInstance;
}

/**
 * Fetch passkey configuration from backend
 */
export async function fetchPasskeyConfig(): Promise<{
  rpcUrl: string;
  networkPassphrase: string;
  factoryContractId: string;
}> {
  const response = await api.get('/investors/passkey/config');
  if (!response.data.success) {
    throw new Error('Failed to fetch passkey configuration');
  }
  return response.data.data;
}

/**
 * Check if browser supports WebAuthn
 */
export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' &&
    'PublicKeyCredential' in window &&
    typeof PublicKeyCredential !== 'undefined';
}

/**
 * Register a new passkey and create smart wallet
 * This is called after email verification
 * 
 * @param userType - Type of user: 'investor' or 'company_user'
 * @param userId - The user's database ID
 * @param email - The user's email (used as username for passkey)
 * @param name - The user's name (display name for passkey)
 * @returns Result with contract address
 */
export async function createPasskeyWallet(
  userType: UserType,
  userId: number,
  email: string,
  name: string
): Promise<{
  contractId: string;
  credentialId: string;
}> {
  if (!isPasskeySupported()) {
    throw new Error('Passkey authentication is not supported in this browser');
  }

  const kit = getPasskeyKit();
  const endpoints = API_ENDPOINTS[userType];

  // Create passkey credential
  // The PasskeyKit handles the WebAuthn registration internally
  const result = await kit.createWallet(name, email);

  if (!result || !result.keyId || !result.contractId) {
    throw new Error('Failed to create passkey wallet');
  }

  // Convert keyId (Uint8Array) to base64
  const credentialIdBase64 = btoa(String.fromCharCode(...result.keyId));

  // Get the public key from the passkey
  // Note: The actual public key extraction depends on the PasskeyKit implementation
  const publicKeyBase64 = result.publicKey 
    ? btoa(String.fromCharCode(...new Uint8Array(result.publicKey)))
    : '';

  // Register the wallet with our backend
  const idField = userType === 'investor' ? 'investorId' : 'userId';
  const backendResponse = await api.post(endpoints.createWallet, {
    [idField]: userId,
    credentialId: credentialIdBase64,
    publicKey: publicKeyBase64,
  });

  if (!backendResponse.data.success) {
    throw new Error(backendResponse.data.error || 'Failed to register wallet with backend');
  }

  return {
    contractId: result.contractId,
    credentialId: credentialIdBase64,
  };
}

/**
 * Create passkey wallet for investor (convenience function)
 */
export async function createInvestorPasskeyWallet(
  investorId: number,
  email: string,
  name: string
): Promise<{ contractId: string; credentialId: string }> {
  return createPasskeyWallet('investor', investorId, email, name);
}

/**
 * Create passkey wallet for company user (convenience function)
 */
export async function createCompanyUserPasskeyWallet(
  userId: number,
  email: string,
  name: string
): Promise<{ contractId: string; credentialId: string }> {
  return createPasskeyWallet('company_user', userId, email, name);
}

/**
 * Authenticate using passkey
 * Used for login after wallet is created
 * 
 * @param userType - Type of user: 'investor' or 'company_user'
 * @param email - The user's email
 * @returns Authentication result with JWT token
 */
export async function authenticateWithPasskeyWallet(
  userType: UserType,
  email: string
): Promise<{
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    stellarContractId: string;
    kycStatus?: string;
    companyId?: number;
    role?: string;
  };
}> {
  if (!isPasskeySupported()) {
    throw new Error('Passkey authentication is not supported in this browser');
  }

  const kit = getPasskeyKit();
  const endpoints = API_ENDPOINTS[userType];

  // First, get the contract ID from our backend
  const statusResponse = await api.post(endpoints.loginStart, { email });
  
  if (!statusResponse.data.success) {
    throw new Error(statusResponse.data.error || 'Failed to start authentication');
  }

  // Authenticate with passkey
  const authResult = await kit.connect();

  if (!authResult || !authResult.keyId) {
    throw new Error('Passkey authentication failed');
  }

  // Convert keyId to base64
  const credentialIdBase64 = btoa(String.fromCharCode(...authResult.keyId));

  // Complete authentication with backend
  const loginResponse = await api.post(endpoints.loginComplete, {
    email,
    credentialId: credentialIdBase64,
    // Include any additional auth data from PasskeyKit if needed
  });

  if (!loginResponse.data.success) {
    throw new Error(loginResponse.data.error || 'Authentication failed');
  }

  return {
    token: loginResponse.data.data.token,
    user: loginResponse.data.data.investor || loginResponse.data.data.user,
  };
}

/**
 * Authenticate investor with passkey (convenience function)
 */
export async function authenticateInvestorWithPasskey(email: string) {
  return authenticateWithPasskeyWallet('investor', email);
}

/**
 * Authenticate company user with passkey (convenience function)
 */
export async function authenticateCompanyUserWithPasskey(email: string) {
  return authenticateWithPasskeyWallet('company_user', email);
}

/**
 * Sign a transaction using the passkey wallet
 * 
 * @param contractId - The smart wallet contract address
 * @param transaction - The transaction XDR to sign
 * @returns Signed transaction
 */
export async function signWithPasskeyWallet(
  contractId: string,
  transaction: string
): Promise<string> {
  if (!isPasskeySupported()) {
    throw new Error('Passkey authentication is not supported in this browser');
  }

  const kit = getPasskeyKit();

  // Sign the transaction
  const signedTx = await kit.sign(transaction, { contractId });

  if (!signedTx) {
    throw new Error('Failed to sign transaction');
  }

  return signedTx;
}

/**
 * Get wallet status for a user
 */
export async function getWalletStatus(
  userType: UserType,
  userId: number
): Promise<{
  userType: UserType;
  hasEmailVerified: boolean;
  hasPasskey: boolean;
  hasWallet: boolean;
  kycStatus?: string;
  isActive?: boolean;
  contractId: string | null;
  nextStep: string;
}> {
  const endpoints = API_ENDPOINTS[userType];
  const response = await api.get(endpoints.walletStatus(userId));
  
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get wallet status');
  }

  return response.data.data;
}

/**
 * Get wallet status for investor (convenience function)
 */
export async function getInvestorWalletStatus(investorId: number) {
  return getWalletStatus('investor', investorId);
}

/**
 * Get wallet status for company user (convenience function)
 */
export async function getCompanyUserWalletStatus(userId: number) {
  return getWalletStatus('company_user', userId);
}

/**
 * Steps in the passkey wallet registration flow
 */
export enum WalletCreationStep {
  REGISTER = 'register',
  VERIFY_EMAIL = 'verify_email',
  CREATE_PASSKEY = 'create_passkey',
  COMPLETE_KYC = 'complete_kyc',
  READY = 'ready',
}

/**
 * Map backend nextStep to enum
 */
export function parseNextStep(step: string): WalletCreationStep {
  switch (step) {
    case 'verify_email':
      return WalletCreationStep.VERIFY_EMAIL;
    case 'create_passkey':
      return WalletCreationStep.CREATE_PASSKEY;
    case 'create_wallet':
      return WalletCreationStep.CREATE_PASSKEY; // Same step
    case 'complete_kyc':
      return WalletCreationStep.COMPLETE_KYC;
    case 'ready':
      return WalletCreationStep.READY;
    default:
      return WalletCreationStep.REGISTER;
  }
}

