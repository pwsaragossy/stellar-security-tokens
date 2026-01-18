
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
                throw new Error(response.message || 'Investment failed');
            }

            return response.data;
        } catch (err: any) {
            setError(err.message || 'Failed to purchase investment');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return { purchase, loading, error };
}
