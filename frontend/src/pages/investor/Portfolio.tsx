
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Wallet, TrendingUp, PieChart, Briefcase } from 'lucide-react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';

interface Investment {
    assetCode: string;
    tokenName: string;
    amount: number;
    currentValue: number;
    interestEarned: number;
    maturityDate: string;
}

export function Portfolio() {
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchPortfolio() {
            try {
                const user = authStorage.getUser<{ id: number }>('investor');
                if (!user?.id) throw new Error('User not found');
                const response = await api.get(`/investors/${user.id}/portfolio`);

                const data = response.data || response;
                const investmentsList = Array.isArray(data) ? data : (data.investments || []);

                setInvestments(investmentsList.map((inv: any) => ({
                    assetCode: inv.assetCode || inv.asset_code || 'N/A',
                    tokenName: inv.tokenName || inv.token_name || inv.assetCode || 'Security Token',
                    amount: Number(inv.amount) || 0,
                    currentValue: Number(inv.currentValue || inv.amount) || 0,
                    interestEarned: Number(inv.interestEarned || inv.interest_earned) || 0,
                    maturityDate: inv.maturityDate || inv.maturity_date || 'N/A',
                })));
            } catch (err: any) {
                console.error('Failed to fetch portfolio:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchPortfolio();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading your portfolio...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 animate-fade-in">
                Failed to load portfolio: {error}
            </div>
        );
    }

    const totalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0);
    const totalInterest = investments.reduce((sum, inv) => sum + inv.interestEarned, 0);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">My Portfolio</h2>
                <p className="text-muted-foreground">Track your security token investments</p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-5 md:grid-cols-3">
                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-1">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Portfolio Value</CardTitle>
                        <div className="icon-bg icon-bg-accent">
                            <Wallet className="h-5 w-5 text-[hsl(43_45%_55%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold value-accent">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalValue)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Interest Earned</CardTitle>
                        <div className="icon-bg icon-bg-success">
                            <TrendingUp className="h-5 w-5 text-[hsl(160_60%_40%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold value-success">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalInterest)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Investments</CardTitle>
                        <div className="icon-bg icon-bg-primary">
                            <PieChart className="h-5 w-5 text-[hsl(217_91%_60%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{investments.length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Investment List */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-4">
                <CardHeader>
                    <CardTitle className="text-xl">My Investments</CardTitle>
                    <CardDescription>Your security token holdings</CardDescription>
                </CardHeader>
                <CardContent>
                    {investments.length > 0 ? (
                        <div className="space-y-3">
                            {investments.map((inv, index) => (
                                <div
                                    key={`${inv.assetCode}-${index}`}
                                    className="activity-item flex items-center justify-between p-4 rounded-xl"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(43_45%_55%)] to-[hsl(43_45%_35%)] flex items-center justify-center text-white font-bold text-sm">
                                            {inv.assetCode.slice(0, 2)}
                                        </div>
                                        <div>
                                            <p className="font-medium">{inv.tokenName}</p>
                                            <p className="text-sm text-muted-foreground font-mono">{inv.assetCode}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(inv.currentValue)}
                                        </p>
                                        <p className="text-sm value-success">
                                            +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(inv.interestEarned)} earned
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="p-5 rounded-2xl bg-muted/30 mb-4">
                                <Briefcase className="w-10 h-10 text-muted-foreground/50" />
                            </div>
                            <p className="text-lg font-medium mb-1">No investments yet</p>
                            <p className="text-sm text-muted-foreground">Visit the Marketplace to invest in security tokens.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
