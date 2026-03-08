import { useState, useEffect, useCallback, useRef } from 'react';
import { investmentsApi } from '@/api/investments';
import { authStorage } from '@/utils/authStorage';

export type PendingInvestment = {
    id: number;
    offerId: number | null;
    offerName: string | null;
    assetCode: string;
    usdcAmount: number;
    tokenAmount: number;
    status: 'pending_payment' | 'trade_submitted' | 'payment_received' | 'pending_distribution' | 'distributed' | 'failed' | 'cancelled';
    memo: string | null;
    createdAt: string;
    updatedAt: string;

    usdcPaymentHash?: string;
    distributionTxHash?: string;
    errorMessage?: string;
};

interface UsePendingInvestmentsOptions {
    pollInterval?: number; // in milliseconds, default 10000 (10s)
    autoStart?: boolean;
}

export function usePendingInvestments(options: UsePendingInvestmentsOptions = {}) {
    const { pollInterval = 10000, autoStart = true } = options;

    const [pendingInvestments, setPendingInvestments] = useState<PendingInvestment[]>([]);
    const [processingInvestments, setProcessingInvestments] = useState<PendingInvestment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMountedRef = useRef(true);

    const fetchInvestments = useCallback(async (silent = false) => {
        try {
            const user = authStorage.getUser<{ id: number }>('investor');
            if (!user?.id) {
                setError('User not found');
                setLoading(false);
                return;
            }

            if (!silent) setLoading(true);
            setError(null);

            // Fetch pending, trade_submitted, and processing investments
            const response = await investmentsApi.getMyInvestments(user.id, {
                status: 'pending_payment,trade_submitted,payment_received,pending_distribution',
            });

            if (!isMountedRef.current) return;

            if (response.success && response.data) {
                const investments = response.data.investments;
                setPendingInvestments(investments.filter(i => i.status === 'pending_payment'));
                setProcessingInvestments(investments.filter(i => ['trade_submitted', 'payment_received', 'pending_distribution'].includes(i.status)));
                setLastUpdated(new Date());
            }
        } catch (err: unknown) {
            if (!isMountedRef.current) return;
            const errorMessage = err instanceof Error ? err.message : 'Failed to fetch investments';
            console.error('[usePendingInvestments]', errorMessage);
            setError(errorMessage);
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, []);

    // Start/stop polling
    const startPolling = useCallback(() => {
        if (intervalRef.current) return; // Already polling

        // Fetch immediately
        fetchInvestments(true);

        // Then poll
        intervalRef.current = setInterval(() => {
            fetchInvestments(true); // silent refresh
        }, pollInterval);
    }, [fetchInvestments, pollInterval]);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    // Auto-start polling on mount
    useEffect(() => {
        isMountedRef.current = true;

        if (autoStart) {
            fetchInvestments(false); // Initial fetch with loading state

            // Start polling after initial fetch
            intervalRef.current = setInterval(() => {
                fetchInvestments(true);
            }, pollInterval);
        }

        return () => {
            isMountedRef.current = false;
            stopPolling();
        };
    }, [autoStart, fetchInvestments, pollInterval, stopPolling]);

    // Stop polling when no pending investments
    useEffect(() => {
        if (pendingInvestments.length === 0 && processingInvestments.length === 0 && !loading) {
            // Keep polling for a bit in case a new investment is created
            // but reduce frequency
        }
    }, [pendingInvestments.length, processingInvestments.length, loading]);

    return {
        pendingInvestments,
        processingInvestments,
        hasPending: pendingInvestments.length > 0 || processingInvestments.length > 0,
        loading,
        error,
        lastUpdated,
        refresh: () => fetchInvestments(false),
        startPolling,
        stopPolling,
    };
}
