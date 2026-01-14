import { useState, useEffect } from 'react';
import { companiesApi } from '@/api/companies';
import { offersApi } from '@/api/offers';

import type { Company, Offer } from '@/types';

interface CompanyStats {
    totalRaised: number;
    activeOffers: number;
    totalInvestors: number;
    pendingPayments: number;
}



// Dashboard Metrics Types
export interface DashboardData {
    capitalFormation: { date: string; amount: number }[];
    investorComposition: { status: string; count: number }[];
    financials: {
        totalDistributions: number;
        averageCheckSize: number;
        uniqueInvestors: number;
    };
}

export interface UseCompanyReturn {
    company: Company | null;
    offers: Offer[];
    stats: CompanyStats;
    dashboardData: DashboardData | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function useCompany(): UseCompanyReturn {
    const [company, setCompany] = useState<Company | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [stats, setStats] = useState<CompanyStats>({
        totalRaised: 0,
        activeOffers: 0,
        totalInvestors: 0,
        pendingPayments: 0,
    });

    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const calculateDashboardMetrics = async (offers: Offer[]) => {
        const activeOffers = offers.filter(o => o.status === 'active' || o.status === 'closed');
        const allInvestors: any[] = [];
        let totalDistributions = 0; // Placeholder for now

        // Fetch investors for relevant offers to build metrics
        for (const offer of activeOffers) {
            try {
                const investors = await offersApi.getInvestors(offer.id);
                if (Array.isArray(investors)) {
                    allInvestors.push(...investors);
                }
            } catch (e) {
                console.warn(`Failed to fetch investors for offer ${offer.id}`, e);
            }
        }

        // 1. Capital Formation (Area Chart)
        // Group investments by date and calculate cumulative sum
        const investments = allInvestors
            .filter(inv => inv.invested_at)
            .map(inv => ({
                date: new Date(inv.invested_at).toISOString().split('T')[0],
                amount: parseFloat(inv.total_invested || 0)
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const capitalFormationMap = new Map<string, number>();
        let cumulative = 0;
        investments.forEach(inv => {
            cumulative += inv.amount;
            capitalFormationMap.set(inv.date, cumulative);
        });

        const capitalFormation = Array.from(capitalFormationMap.entries()).map(([date, amount]) => ({
            date,
            amount
        }));

        // 2. Investor Composition (Donut Chart)
        const uniqueInvestors = new Map();
        allInvestors.forEach(inv => {
            if (!uniqueInvestors.has(inv.investor_id)) {
                uniqueInvestors.set(inv.investor_id, inv);
            }
        });

        const kycStats = { approved: 0, pending: 0, rejected: 0 };
        uniqueInvestors.forEach(inv => {
            const status = (inv.kyc_status || 'pending').toLowerCase();
            if (status === 'approved') kycStats.approved++;
            else if (status === 'rejected') kycStats.rejected++;
            else kycStats.pending++;
        });

        const investorComposition = [
            { status: 'Approved', count: kycStats.approved },
            { status: 'Pending', count: kycStats.pending },
            { status: 'Rejected', count: kycStats.rejected },
        ].filter(item => item.count > 0);

        // 3. Financials
        const totalCapital = Array.from(uniqueInvestors.values()).reduce((sum, inv) => sum + (inv.total_invested || 0), 0);
        const uniqueCount = uniqueInvestors.size;
        const averageCheckSize = uniqueCount > 0 ? totalCapital / uniqueCount : 0;

        setDashboardData({
            capitalFormation,
            investorComposition,
            financials: {
                totalDistributions, // To be implemented with real distribution data
                averageCheckSize,
                uniqueInvestors: uniqueCount
            }
        });
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch company profile
            const profileResponse = await companiesApi.getProfile();
            if (profileResponse.success && profileResponse.data) {
                const companyData = profileResponse.data;
                setCompany(companyData);

                // Parallel data fetching for efficiency
                const [offersResponse] = await Promise.all([
                    offersApi.getCompanyOffers()
                ]);

                if (offersResponse.success && offersResponse.data) {
                    const offersList = offersResponse.data;
                    setOffers(offersList);

                    // Calculate basic stats
                    const activeOffers = offersList.filter(o => o.status === 'active').length;
                    const totalRaised = offersList
                        .filter(o => o.status === 'active' || o.status === 'closed')
                        .reduce((sum, o) => sum + parseFloat(o.total_supply || '0'), 0);

                    stats.totalRaised = totalRaised;
                    stats.activeOffers = activeOffers;
                    setStats({ ...stats });

                    // Trigger async calculation of deeper metrics without blocking UI
                    calculateDashboardMetrics(offersList);
                }

            }
        } catch (err: any) {
            console.error('Failed to fetch company data:', err);
            setError(err.message || 'Failed to load company data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    return {
        company,
        offers,
        stats,
        dashboardData,
        loading,
        error,
        refetch: fetchData,
    };
}
