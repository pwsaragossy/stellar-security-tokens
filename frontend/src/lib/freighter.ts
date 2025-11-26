import {
  isConnected as freighterIsConnected,
  isAllowed as freighterIsAllowed,
  setAllowed as freighterSetAllowed,
  getPublicKey as freighterGetPublicKey,
  signTransaction as freighterSignTransaction,
  getNetwork as freighterGetNetwork,
  getNetworkDetails as freighterGetNetworkDetails,
} from '@stellar/freighter-api';
import { Networks } from '@stellar/stellar-sdk';

export interface FreighterStatus {
  isInstalled: boolean;
  isConnected: boolean;
  isAllowed: boolean;
  publicKey: string | null;
  network: string | null;
}

export interface NetworkDetails {
  network: string;
  networkUrl: string;
  networkPassphrase: string;
}

/**
 * Check if Freighter extension is installed in the browser
 */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const connected = await freighterIsConnected();
    return connected.isConnected;
  } catch {
    return false;
  }
}

/**
 * Check if the current app is allowed to access Freighter
 */
export async function isFreighterAllowed(): Promise<boolean> {
  try {
    const allowed = await freighterIsAllowed();
    return allowed.isAllowed;
  } catch {
    return false;
  }
}

/**
 * Request permission to access Freighter
 */
export async function requestFreighterAccess(): Promise<string> {
  try {
    const accessResult = await freighterSetAllowed();
    if (accessResult.isAllowed) {
      const publicKeyResult = await freighterGetPublicKey();
      if (publicKeyResult.publicKey) {
        return publicKeyResult.publicKey;
      }
      throw new Error('Failed to get public key after granting access');
    }
    throw new Error('User denied access to Freighter');
  } catch (error: any) {
    if (error.message?.includes('denied') || error.message?.includes('rejected')) {
      throw new Error('User rejected the connection request');
    }
    throw new Error(`Failed to connect to Freighter: ${error.message}`);
  }
}

/**
 * Get the connected wallet's public key
 */
export async function getFreighterPublicKey(): Promise<string | null> {
  try {
    const result = await freighterGetPublicKey();
    return result.publicKey || null;
  } catch {
    return null;
  }
}

/**
 * Get the current network from Freighter
 */
export async function getFreighterNetwork(): Promise<string | null> {
  try {
    const result = await freighterGetNetwork();
    return result.network || null;
  } catch {
    return null;
  }
}

/**
 * Get detailed network information from Freighter
 */
export async function getFreighterNetworkDetails(): Promise<NetworkDetails | null> {
  try {
    const result = await freighterGetNetworkDetails();
    if (result.networkPassphrase) {
      return {
        network: result.network || 'unknown',
        networkUrl: result.networkUrl || '',
        networkPassphrase: result.networkPassphrase,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get complete Freighter status
 */
export async function getFreighterStatus(): Promise<FreighterStatus> {
  const isInstalled = await isFreighterInstalled();
  
  if (!isInstalled) {
    return {
      isInstalled: false,
      isConnected: false,
      isAllowed: false,
      publicKey: null,
      network: null,
    };
  }

  const isAllowed = await isFreighterAllowed();
  const publicKey = isAllowed ? await getFreighterPublicKey() : null;
  const network = isAllowed ? await getFreighterNetwork() : null;

  return {
    isInstalled: true,
    isConnected: isAllowed && !!publicKey,
    isAllowed,
    publicKey,
    network,
  };
}

/**
 * Sign a transaction XDR with Freighter
 */
export async function signTransactionWithFreighter(
  transactionXdr: string,
  networkPassphrase?: string
): Promise<string> {
  try {
    // Get network passphrase if not provided
    let passphrase = networkPassphrase;
    if (!passphrase) {
      const networkDetails = await getFreighterNetworkDetails();
      passphrase = networkDetails?.networkPassphrase || Networks.TESTNET;
    }

    const result = await freighterSignTransaction(transactionXdr, {
      networkPassphrase: passphrase,
    });

    if (result.signedTxXdr) {
      return result.signedTxXdr;
    }
    
    throw new Error('Failed to sign transaction');
  } catch (error: any) {
    if (error.message?.includes('rejected') || error.message?.includes('denied')) {
      throw new Error('User rejected the transaction signature');
    }
    throw new Error(`Failed to sign transaction: ${error.message}`);
  }
}

/**
 * Connect to Freighter and return the public key
 * This is the main function to use for "Connect Wallet" button
 */
export async function connectFreighter(): Promise<string> {
  const isInstalled = await isFreighterInstalled();
  
  if (!isInstalled) {
    throw new Error('Freighter wallet is not installed. Please install it from freighter.app');
  }

  // Check if already allowed
  const isAllowed = await isFreighterAllowed();
  if (isAllowed) {
    const publicKey = await getFreighterPublicKey();
    if (publicKey) {
      return publicKey;
    }
  }

  // Request access
  return requestFreighterAccess();
}

/**
 * Disconnect from Freighter (clear local state only, Freighter doesn't have disconnect)
 * Note: Freighter doesn't have a disconnect method, so this is just for clearing app state
 */
export function disconnectFreighter(): void {
  // Freighter doesn't support programmatic disconnect
  // The user must disconnect from within the extension
  // This function is here for app-level state management
}

/**
 * Open Freighter download page
 */
export function openFreighterDownload(): void {
  window.open('https://freighter.app', '_blank');
}

/**
 * Check if the network matches expected network
 */
export async function isCorrectNetwork(expectedNetwork: 'testnet' | 'public'): Promise<boolean> {
  const networkDetails = await getFreighterNetworkDetails();
  if (!networkDetails) return false;

  const expectedPassphrase = expectedNetwork === 'testnet' 
    ? Networks.TESTNET 
    : Networks.PUBLIC;
  
  return networkDetails.networkPassphrase === expectedPassphrase;
}

/**
 * Get network display name
 */
export function getNetworkDisplayName(networkPassphrase: string): string {
  switch (networkPassphrase) {
    case Networks.TESTNET:
      return 'Testnet';
    case Networks.PUBLIC:
      return 'Mainnet';
    default:
      return 'Unknown Network';
  }
}
