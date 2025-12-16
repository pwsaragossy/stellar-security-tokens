
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface Offer {
    id: number;
    offer_name: string;
    description: string;
    total_supply: number;
    annual_interest_rate?: number;
    offer_type: 'collateral' | 'sale';
    status: string;
    asset_code: string;

    // Collateral
    collateral_ltv?: number;
    collateral_description?: string;
    collateral_value?: number;

    // Payment
    payment_type?: string;
    maturity_date?: string;
    payment_frequency?: number;
}

export function useOffers() {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchOffers() {
            try {
                const response = await api.get('/offers/active');
                if (response.success && Array.isArray(response.data)) {
                    setOffers(response.data);
                }
            } catch (err: any) {
                console.error('Failed to fetch offers:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchOffers();
    }, []);

    return { offers, loading, error };
}
