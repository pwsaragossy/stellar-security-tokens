/**
 * useRecoverySigners Hook
 * 
 * Manages Ed25519 recovery signers (e.g., Ledger) via API.
 * Works with existing useLedger hook for device connection.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

// Types
interface RecoverySigner {
    id: number;
    publicKey: string;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
}

interface UseRecoverySignersReturn {
    signers: RecoverySigner[];
    isLoading: boolean;
    error: string | null;
    addSigner: (publicKey: string, name?: string) => Promise<boolean>;
    removeSigner: (signerId: number) => Promise<boolean>;
    refetch: () => Promise<void>;
    isAdding: boolean;
    isRemoving: boolean;
}

export function useRecoverySigners(): UseRecoverySignersReturn {
    const [signers, setSigners] = useState<RecoverySigner[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    const fetchSigners = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await api.get('/security/recovery-signers');
            setSigners(response.data?.data || []);
        } catch (err: unknown) {
            // If table doesn't exist yet, return empty (not an error)
            setSigners([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSigners();
    }, [fetchSigners]);

    const addSigner = useCallback(async (publicKey: string, name?: string): Promise<boolean> => {
        try {
            setIsAdding(true);
            setError(null);
            await api.post('/security/recovery-signers/add', {
                publicKey,
                name: name || 'Ledger',
            });
            await fetchSigners();
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to add recovery signer';
            setError(message);
            return false;
        } finally {
            setIsAdding(false);
        }
    }, [fetchSigners]);

    const removeSigner = useCallback(async (signerId: number): Promise<boolean> => {
        try {
            setIsRemoving(true);
            setError(null);
            await api.delete(`/security/recovery-signers/${signerId}`);
            await fetchSigners();
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to remove signer';
            setError(message);
            return false;
        } finally {
            setIsRemoving(false);
        }
    }, [fetchSigners]);

    return {
        signers,
        isLoading,
        error,
        addSigner,
        removeSigner,
        refetch: fetchSigners,
        isAdding,
        isRemoving,
    };
}
