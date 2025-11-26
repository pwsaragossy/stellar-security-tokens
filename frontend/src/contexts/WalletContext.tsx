import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  connectFreighter,
  getFreighterStatus,
  getFreighterNetworkDetails,
  signTransactionWithFreighter,
  isFreighterInstalled,
  openFreighterDownload,
  type FreighterStatus,
  type NetworkDetails,
} from '@/lib/freighter';

type WalletState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WalletContextType {
  // State
  state: WalletState;
  publicKey: string | null;
  network: NetworkDetails | null;
  isInstalled: boolean;
  error: string | null;

  // Actions
  connect: () => Promise<string | null>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
  refreshStatus: () => Promise<void>;
  openDownload: () => void;

  // Computed
  isConnected: boolean;
  shortAddress: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const WALLET_STORAGE_KEY = 'stellar_wallet_connected';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>('disconnected');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkDetails | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Check initial status on mount
  useEffect(() => {
    const checkInitialStatus = async () => {
      const installed = await isFreighterInstalled();
      setIsInstalled(installed);

      // If previously connected, try to reconnect
      const wasConnected = localStorage.getItem(WALLET_STORAGE_KEY) === 'true';
      if (installed && wasConnected) {
        try {
          const status = await getFreighterStatus();
          if (status.isConnected && status.publicKey) {
            setPublicKey(status.publicKey);
            const networkDetails = await getFreighterNetworkDetails();
            setNetwork(networkDetails);
            setState('connected');
          }
        } catch {
          // Silently fail on initial reconnect
          localStorage.removeItem(WALLET_STORAGE_KEY);
        }
      }
    };

    checkInitialStatus();
  }, []);

  // Listen for Freighter events (account/network changes)
  useEffect(() => {
    if (!isInstalled) return;

    const handleAccountChange = async () => {
      if (state === 'connected') {
        await refreshStatus();
      }
    };

    // Freighter emits events on window
    window.addEventListener('freighter:accountChanged', handleAccountChange);
    window.addEventListener('freighter:networkChanged', handleAccountChange);

    return () => {
      window.removeEventListener('freighter:accountChanged', handleAccountChange);
      window.removeEventListener('freighter:networkChanged', handleAccountChange);
    };
  }, [isInstalled, state]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getFreighterStatus();
      setIsInstalled(status.isInstalled);

      if (status.isConnected && status.publicKey) {
        setPublicKey(status.publicKey);
        const networkDetails = await getFreighterNetworkDetails();
        setNetwork(networkDetails);
        setState('connected');
        setError(null);
      } else {
        setPublicKey(null);
        setNetwork(null);
        setState('disconnected');
        localStorage.removeItem(WALLET_STORAGE_KEY);
      }
    } catch (err: any) {
      setError(err.message);
      setState('error');
    }
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    try {
      setState('connecting');
      setError(null);

      const installed = await isFreighterInstalled();
      if (!installed) {
        setError('Freighter wallet is not installed');
        setState('error');
        return null;
      }

      const pk = await connectFreighter();
      setPublicKey(pk);

      const networkDetails = await getFreighterNetworkDetails();
      setNetwork(networkDetails);

      setState('connected');
      localStorage.setItem(WALLET_STORAGE_KEY, 'true');

      return pk;
    } catch (err: any) {
      setError(err.message);
      setState('error');
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setNetwork(null);
    setState('disconnected');
    setError(null);
    localStorage.removeItem(WALLET_STORAGE_KEY);
  }, []);

  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    return signTransactionWithFreighter(xdr, network?.networkPassphrase);
  }, [publicKey, network]);

  const openDownload = useCallback(() => {
    openFreighterDownload();
  }, []);

  const isConnected = state === 'connected' && !!publicKey;

  const shortAddress = publicKey
    ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
    : null;

  return (
    <WalletContext.Provider
      value={{
        state,
        publicKey,
        network,
        isInstalled,
        error,
        connect,
        disconnect,
        signTransaction,
        refreshStatus,
        openDownload,
        isConnected,
        shortAddress,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

