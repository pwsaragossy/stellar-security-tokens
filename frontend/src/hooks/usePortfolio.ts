
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';

export interface PortfolioData {
    totalBalance: number;
    activeInvestmentsCount: number;
    pendingPayouts: number;
    totalIncome: number;
    currency: string;
}

export interface ActivityItem {
    id: number;
    type: string;
    amount: number;
    date: string;
    status: string;
}

export function usePortfolio() {
    const [data, setData] = useState<PortfolioData | null>(null);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchPortfolio() {
            try {
                const user = authStorage.getUser<{ id: number }>('investor');
                if (!user?.id) throw new Error('User not found');

                // Fetch metrics
                const metricsResponse = await api.get(`/investors/${user.id}/metrics`);
                const metrics = metricsResponse.data?.metrics || metricsResponse.metrics || {};

                // Transform backend response to UI format
                setData({
                    totalBalance: metrics.totalInvested || 0,
                    activeInvestmentsCount: metrics.totalOffers || 0,
                    pendingPayouts: 0,
                    totalIncome: metrics.totalInterestReceived || 0,
                    currency: 'USD'
                });

                // Fetch recent activity (payments)
                try {
                    const paymentsResponse = await api.get(`/investors/${user.id}/payments?limit=5`);
                    const payments = paymentsResponse.data || paymentsResponse || [];

                    setActivity(payments.slice(0, 5).map((p: any) => ({
                        id: p.id,
                        type: 'Interest Payment',
                        amount: p.usdcAmount || p.amount || 0,
                        date: p.paymentDate || p.created_at || new Date().toISOString(),
                        status: p.status || 'completed'
                    })));
                } catch {
                    // Activity fetch is optional, don't fail the whole dashboard
                    setActivity([]);
                }

            } catch (err: any) {
                console.error('Failed to fetch portfolio:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchPortfolio();
    }, []);

    return { data, activity, loading, error };
}

