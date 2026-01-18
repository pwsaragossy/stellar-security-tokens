/**
 * Freighter Browser Extension Integration
 * 
 * Freighter is a secure Stellar wallet browser extension that keeps private keys
 * encrypted and never exposes them to web pages. Users approve transactions
 * within the extension UI.
 * 
 * Security: 
 * - Keys never leave the extension
 * - User sees transaction details in extension before signing
 * - Extension is sandboxed from the webpage
 * 
 * Requirements:
 * - User must have Freighter extension installed (Chrome/Firefox/Brave)
 * - Extension must be connected to the same network (testnet/mainnet)
 * 
 * Install from: https://freighter.app
 */

// Type declarations for Freighter API (injected into window)
declare global {
    interface Window {
        freighter?: {
            isConnected: () => Promise<boolean>;
            getPublicKey: () => Promise<string>;
            getNetwork: () => Promise<string>;
            signTransaction: (xdr: string, opts?: { networkPassphrase?: string }) => Promise<string>;
        };
    }
}

export interface FreighterDevice {
    publicKey: string;
    connected: boolean;
    network?: string;
}

export interface SignatureResult {
    publicKey: string;
    signature: string; // Base64 encoded
    signedXdr: string;
}

/**
 * Check if Freighter extension is installed
 */
export function isFreighterInstalled(): boolean {
    return typeof window !== 'undefined' && window.freighter !== undefined;
}

/**
 * Check if Freighter is connected to any account
 */
export async function isFreighterConnected(): Promise<boolean> {
    if (!isFreighterInstalled()) {
        return false;
    }
    try {
        return await window.freighter!.isConnected();
    } catch {
        return false;
    }
}

/**
 * Get the public key from connected Freighter wallet
 */
export async function getFreighterPublicKey(): Promise<string | null> {
    if (!isFreighterInstalled()) {
        return null;
    }
    try {
        const publicKey = await window.freighter!.getPublicKey();
        return publicKey;
    } catch {
        return null;
    }
}

/**
 * Get the network Freighter is connected to
 */
export async function getFreighterNetwork(): Promise<string | null> {
    if (!isFreighterInstalled()) {
        return null;
    }
    try {
        return await window.freighter!.getNetwork();
    } catch {
        return null;
    }
}

/**
 * Connect to Freighter and get wallet info
 */
export async function connectFreighter(): Promise<FreighterDevice> {
    if (!isFreighterInstalled()) {
        throw new Error('Freighter extension is not installed. Please install it from https://freighter.app');
    }

    try {
        const publicKey = await window.freighter!.getPublicKey();
        const network = await window.freighter!.getNetwork();

        console.log('[Freighter] Connected. Public key:', publicKey.slice(0, 8) + '...');

        return {
            publicKey,
            connected: true,
            network,
        };
    } catch (error: unknown) {
        const err = error as { message?: string };

        if (err.message?.includes('User declined')) {
            throw new Error('Connection was declined. Please allow access in Freighter.');
        }

        throw new Error(`Failed to connect to Freighter: ${err.message}`);
    }
}

/**
 * Sign a transaction with Freighter
 * The user will see transaction details in Freighter's popup and must approve
 */
export async function signTransactionWithFreighter(
    xdr: string,
    networkPassphrase: string
): Promise<SignatureResult> {
    if (!isFreighterInstalled()) {
        throw new Error('Freighter extension is not installed');
    }

    try {
        const publicKey = await window.freighter!.getPublicKey();

        console.log('[Freighter] Please approve the transaction in the Freighter popup...');

        // Freighter returns the signed XDR
        const signedXdr = await window.freighter!.signTransaction(xdr, {
            networkPassphrase,
        });

        // Extract signature from signed XDR for backend submission
        // The signed XDR contains the signature, we need to extract it
        const { TransactionBuilder } = await import('@stellar/stellar-sdk');
        const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

        // Get the signature that was added (last one in the signatures array)
        const lastSig = signedTx.signatures[signedTx.signatures.length - 1];
        const signatureBase64 = btoa(
            String.fromCharCode(...new Uint8Array(lastSig.signature()))
        );

        console.log('[Freighter] Transaction signed successfully');

        return {
            publicKey,
            signature: signatureBase64,
            signedXdr,
        };
    } catch (error: unknown) {
        const err = error as { message?: string };

        if (err.message?.includes('User declined')) {
            throw new Error('Transaction was rejected in Freighter.');
        }
        if (err.message?.includes('network')) {
            throw new Error('Network mismatch. Please switch Freighter to the correct network.');
        }

        throw new Error(`Failed to sign transaction: ${err.message}`);
    }
}

export default {
    isFreighterInstalled,
    isFreighterConnected,
    getFreighterPublicKey,
    getFreighterNetwork,
    connectFreighter,
    signTransactionWithFreighter,
};
