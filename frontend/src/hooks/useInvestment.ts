
import { useState } from 'react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';

export function useInvestment() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const purchase = async (offerId: number, usdcAmount: number, assetCode: string) => {
        setLoading(true);
        setError(null);
        try {
            const user = authStorage.getUser<{ id: number }>('investor');
            if (!user?.id) throw new Error('User not found');

            const response = await api.post('/investments/purchase', {
                investorId: user.id,
                usdcAmount,
                offerId,
                assetCode,
            });

            if (!response.success) {
                throw new Error(response.error || 'Investment failed');
            }

            return response.data;
        } catch (err: any) {
            setError(err.message || 'Failed to purchase investment');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const submitSignedTx = async (signedXdr: string, investmentContext: {
        investorId: number;
        offerId: number;
        usdcAmount: number;
        feeAmount?: number;
        totalDeduction: number;
        tokenAmount: number;
        assetCode: string;
        hmac: string;
    }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.post('/investments/submit-tx', {
                signedXdr,
                investmentContext,
            });

            if (!response.success) {
                throw new Error(response.error || 'Transaction submission failed');
            }

            return response.data;
        } catch (err: any) {
            setError(err.message || 'Failed to submit investment transaction');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return { purchase, submitSignedTx, loading, error };
}
