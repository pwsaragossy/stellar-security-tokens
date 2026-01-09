/**
 * usePasskey Hook
 * Provides passkey functionality for signing transactions
 */
import { passkeyClient } from '@/lib/passkey';

export function usePasskey() {
    const signTransaction = async (xdr: string): Promise<string> => {
        return passkeyClient.signTransaction(xdr);
    };

    return {
        signTransaction,
    };
}

export default usePasskey;
