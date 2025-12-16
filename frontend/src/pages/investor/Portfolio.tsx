
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Wallet, TrendingUp, PieChart } from 'lucide-react';
import { api } from '@/lib/api';

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
                const userStr = localStorage.getItem('user');
                if (!userStr) throw new Error('User not found');

                const user = JSON.parse(userStr);
                const response = await api.get(`/investors/${user.id}/portfolio`);

                // Extract investments from response
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
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20">
                Failed to load portfolio: {error}
            </div>
        );
    }

    const totalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0);
    const totalInterest = investments.reduce((sum, inv) => sum + inv.interestEarned, 0);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
                        <Wallet className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalValue)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Interest Earned</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-400">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalInterest)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Investments</CardTitle>
                        <PieChart className="h-4 w-4 text-purple-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{investments.length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Investment List */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle>My Investments</CardTitle>
                    <CardDescription>Your security token holdings</CardDescription>
                </CardHeader>
                <CardContent>
                    {investments.length > 0 ? (
                        <div className="space-y-4">
                            {investments.map((inv, index) => (
                                <div
                                    key={`${inv.assetCode}-${index}`}
                                    className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                            {inv.assetCode.slice(0, 2)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">{inv.tokenName}</p>
                                            <p className="text-sm text-muted-foreground">{inv.assetCode}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-white">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(inv.currentValue)}
                                        </p>
                                        <p className="text-sm text-emerald-400">
                                            +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(inv.interestEarned)} earned
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Wallet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-muted-foreground">No investments yet.</p>
                            <p className="text-sm text-muted-foreground mt-1">Visit the Marketplace to invest in security tokens.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
