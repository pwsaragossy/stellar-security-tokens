import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Offer } from './useOffers';

/**
 * Fetch a single offer by ID via GET /offers/:id
 * Avoids loading all active offers just to filter one.
 */
export function useOffer(id: string | undefined) {
    const [offer, setOffer] = useState<Offer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            setError('No offer ID provided');
            return;
        }

        let cancelled = false;

        const fetchOffer = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await api.get(`/offers/${id}`);
                if (!cancelled) {
                    setOffer(res.data.data);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.response?.data?.error || 'Failed to fetch offer');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchOffer();
        return () => { cancelled = true; };
    }, [id]);

    return { offer, loading, error };
}
