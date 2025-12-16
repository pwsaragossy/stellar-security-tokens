
import { useState } from 'react';
import { api } from '@/lib/api';

interface PurchaseResponse {
    success: boolean;
    message: string;
    data: {
        investment: {
            id: number;
            status: string;
            usdcAmount: number;
            tokenAmount: number;
        };
        paymentInstructions?: {
            treasuryAddress: string;
            message: string;
        };
    };
}

export function useInvestment() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const purchase = async (offerId: number, usdcAmount: number, assetCode: string) => {
        setLoading(true);
        setError(null);
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) throw new Error("User not found");
            const user = JSON.parse(userStr);

            const response = await api.post<PurchaseResponse>('/investments/purchase', {
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
