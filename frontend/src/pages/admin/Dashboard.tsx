import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Users, TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import { platformAdminsApi, type Investor, type FeeLog } from '@/api/platformAdmins';

export function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [stats, setStats] = useState({
        totalRevenue: 0,
        pendingUsers: 0,
        activeUsers: 0,
        recentFees: [] as FeeLog[],
    });

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        setLoading(true);
        setError('');
        try {
            const [feeResponse, investorsResponse] = await Promise.all([
                platformAdminsApi.getFeeLogs(10, 0),
                platformAdminsApi.getInvestors(),
            ]);

            const investors = investorsResponse.data || [];
            const pending = investors.filter((i: Investor) => i.status === 'pending').length;
            const active = investors.filter((i: Investor) => i.status === 'active').length;

            setStats({
                totalRevenue: feeResponse.revenueSummary?.total || 0,
                pendingUsers: pending,
                activeUsers: active,
                recentFees: feeResponse.data || [],
            });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-400">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats.totalRevenue)}
                        </div>
                        <p className="text-xs text-muted-foreground">Collected Fees</p>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending KYC</CardTitle>
                        <Users className="h-4 w-4 text-yellow-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-400">{stats.pendingUsers}</div>
                        <p className="text-xs text-muted-foreground">Awaiting Approval</p>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-400">{stats.activeUsers}</div>
                        <p className="text-xs text-muted-foreground">Approved Investors</p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Fees */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle>Recent Fee Logs</CardTitle>
                </CardHeader>
                <CardContent>
                    {stats.recentFees.length > 0 ? (
                        <div className="space-y-3">
                            {stats.recentFees.map((fee) => (
                                <div key={fee.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                                    <div>
                                        <p className="text-sm font-medium text-white">{fee.type}</p>
                                        <p className="text-xs text-muted-foreground">{fee.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-emerald-400">
                                            +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(fee.amount)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(fee.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No fee logs yet.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
