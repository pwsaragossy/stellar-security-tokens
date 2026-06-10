
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface Offer {
    id: number;
    offer_name: string;
    description: string;
    total_supply: number;
    unit_price?: number;
    annual_interest_rate?: number;
    investor_rate?: number;
    offer_type: 'collateral' | 'sale';
    status: string;
    asset_code: string;

    // Collateral
    collateral_type?: string;
    collateral_ltv?: number;
    collateral_description?: string;
    collateral_value?: number;

    // Payment
    payment_type?: string;
    maturity_date?: string;
    payment_frequency?: number;
    payment_day?: number;
    bullet_payment_amount?: number;

    // Legal & Rules
    legal_documents?: Record<string, { hash?: string; url?: string; fileName?: string }>;
    offer_rules?: Record<string, any>;

    // Collateral photos (ordered; first = cover)
    collateral_photos?: { hash: string; url: string; fileName?: string; caption?: string | null; order?: number }[];

    // Timestamps
    created_at?: string;
    reviewed_at?: string;

    // Company (full profile from backend)
    company?: {
        id?: number;
        name: string;
        cnpj?: string;
        email?: string;
        address?: string;
        phone?: string;
        legalRepresentative?: string;
        status?: string;
        kycStatus?: string;
        createdAt?: string;
    };

    // Token (on-chain)
    token?: {
        id?: number;
        assetCode?: string;
        issuerPublicKey?: string;
        totalSupply?: number;
        sacContractId?: string;
        issuanceTransactionHash?: string;
        description?: string;
    };

    // Supply tracking (computed by backend)
    tokens_sold?: number;

    // Maturity cutoff (computed by backend: maturity_date - 90 days)
    investment_cutoff_date?: string;

    // Phase 2: Asset Intelligence
    rental_yield_rate?: number;
    value_growth_rate?: number;
    latitude?: number;
    longitude?: number;
    location_address?: string;
    asset_metadata?: Record<string, any>;

    // Phase 3: Institutional Grade
    asset_stage?: 'under_development' | 'completed' | 'income_producing';
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
