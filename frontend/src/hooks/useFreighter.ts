import { useState, useCallback, useEffect } from 'react';
import {
    isFreighterInstalled,
    connectFreighter,
    signTransactionWithFreighter,
    getFreighterPublicKey,
} from '../lib/freighter';
import type { FreighterDevice, SignatureResult } from '../lib/freighter';

interface UseFreighterReturn {
    // State
    device: FreighterDevice | null;
    isConnecting: boolean;
    isSigning: boolean;
    error: string | null;
    isInstalled: boolean;

    // Actions
    connect: () => Promise<FreighterDevice | null>;
    disconnect: () => void;
    signTransaction: (xdr: string, networkPassphrase: string) => Promise<SignatureResult | null>;
    clearError: () => void;
}

/**
 * React hook for Freighter browser extension integration
 * 
 * @example
 * ```tsx
 * const { device, connect, signTransaction, isConnecting, error } = useFreighter();
 * 
 * const handleConnect = async () => {
 *   const dev = await connect();
 *   if (dev) {
 *     console.log('Connected:', dev.publicKey);
 *   }
 * };
 * 
 * const handleSign = async () => {
 *   const result = await signTransaction(xdr, networkPassphrase);
 *   if (result) {
 *     console.log('Signed:', result.signedXdr);
 *   }
 * };
 * ```
 */
export function useFreighter(): UseFreighterReturn {
    const [device, setDevice] = useState<FreighterDevice | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSigning, setIsSigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    // Check if Freighter is installed on mount
    useEffect(() => {
        const checkInstalled = async () => {
            const installed = await isFreighterInstalled();
            setIsInstalled(installed);
        };
        // Small delay to ensure extension has injected
        const timer = setTimeout(() => {
            checkInstalled();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // Check for existing connection on mount + poll for account changes
    useEffect(() => {
        if (!isInstalled) return;

        const checkConnection = async () => {
            try {
                const publicKey = await getFreighterPublicKey();
                if (publicKey) {
                    setDevice(prev => {
                        if (prev?.publicKey === publicKey) return prev; // No change
                        if (prev?.publicKey && prev.publicKey !== publicKey) {
                            console.log('[Freighter] Account changed:', publicKey.slice(0, 8) + '...');
                        }
                        return { publicKey, connected: true };
                    });
                } else {
                    setDevice(prev => {
                        if (!prev) return prev; // Already disconnected
                        console.log('[Freighter] Disconnected (no key returned)');
                        return null;
                    });
                }
            } catch {
                // Not connected, that's fine
            }
        };

        checkConnection();

        // Poll every 2s for account changes (Freighter has no change event API)
        const interval = setInterval(checkConnection, 2000);
        return () => clearInterval(interval);
    }, [isInstalled]);

    const connect = useCallback(async (): Promise<FreighterDevice | null> => {
        if (isConnecting) return null;

        setIsConnecting(true);
        setError(null);

        try {
            const deviceInfo = await connectFreighter();
            setDevice(deviceInfo);
            return deviceInfo;
        } catch (err: any) {
            setError(err.message);
            setDevice(null);
            return null;
        } finally {
            setIsConnecting(false);
        }
    }, [isConnecting]);

    const disconnect = useCallback((): void => {
        setDevice(null);
        setError(null);
        console.log('[Freighter] Disconnected from app (extension still has keys)');
    }, []);

    const signTransaction = useCallback(async (
        xdr: string,
        networkPassphrase: string
    ): Promise<SignatureResult | null> => {
        if (!device || isSigning) return null;

        setIsSigning(true);
        setError(null);

        try {
            const result = await signTransactionWithFreighter(xdr, networkPassphrase);
            return result;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setIsSigning(false);
        }
    }, [device, isSigning]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        device,
        isConnecting,
        isSigning,
        error,
        isInstalled,
        connect,
        disconnect,
        signTransaction,
        clearError,
    };
}

export default useFreighter;
