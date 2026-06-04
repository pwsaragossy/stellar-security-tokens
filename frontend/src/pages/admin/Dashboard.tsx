import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Users, TrendingUp, Loader2, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { platformAdminsApi, type Investor } from '@/api/platformAdmins';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { HELP_CONTENT } from '@/constants/help-content';

const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#6366F1'];

export function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState({
        metrics: {} as any,
        stats: [] as any[],
        pendingInvestments: [] as any[],
        fundraising: [] as any[],
        revenueBreakdown: { breakdown: [], total: 0 } as any,
        cohorts: { active: 0, dormant: 0, total: 0 } as any,
        // Legacy
        totalRevenue: 0,
        pendingUsers: 0,
        activeUsers: 0,
    });

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        setLoading(true);
        try {
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Last 30 days


            const [
                metricsRes,
                statsRes,
                pendingInvRes,
                feeRes,
                investorsRes,
                fundraisingRes,
                revenueRes,
                cohortsRes
            ] = await Promise.all([
                platformAdminsApi.getMetrics({ start_date: startDate, end_date: endDate }),
                platformAdminsApi.getStatistics({ start_date: startDate, end_date: endDate }),
                platformAdminsApi.getPendingInvestments(5),
                platformAdminsApi.getFeeLogs(5, 0),
                platformAdminsApi.getInvestors(),
                platformAdminsApi.getFundraisingProgress(),
                platformAdminsApi.getRevenueBreakdown(),
                platformAdminsApi.getInvestorCohorts(),
            ]);

            const investors = investorsRes.data || [];

            setData({
                metrics: metricsRes.data,
                stats: statsRes.data || [],
                pendingInvestments: pendingInvRes.data || [],
                fundraising: fundraisingRes.data || [],
                revenueBreakdown: revenueRes.data || { breakdown: [], total: 0 },
                cohorts: cohortsRes.data || { active: 0, dormant: 0, total: 0 },
                totalRevenue: feeRes.revenueSummary?.total || 0,
                pendingUsers: investors.filter((i: Investor) => i.status === 'pending').length,
                activeUsers: investors.filter((i: Investor) => i.status === 'approved').length,
            });
        } catch {
            setError('Failed to load dashboard data. Ensure backend services are running.');
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

    const pieData = data.metrics.byStatus ? [
        { name: 'Distributed', value: data.metrics.byStatus.distributed },
        { name: 'Pending', value: data.metrics.byStatus.pending_payment + data.metrics.byStatus.payment_received },
        { name: 'Failed', value: data.metrics.byStatus.failed + data.metrics.byStatus.cancelled },
    ].filter(d => d.value > 0) : [];

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-white">Dashboard Overview</h2>

            {/* Top Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                            Total Revenue
                            <InfoTooltip content={HELP_CONTENT.dashboard.totalRevenue.content} side="top" />
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-400">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.totalRevenue)}
                        </div>
                        <p className="text-xs text-muted-foreground">Collected Fees</p>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                            Total Invested
                            <InfoTooltip content={HELP_CONTENT.dashboard.totalInvested.content} side="top" />
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-400">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.metrics.totals?.usdcInvested || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">Last 30 Days Vol.</p>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                            Success Rate
                            <InfoTooltip content={HELP_CONTENT.dashboard.successRate.content} side="top" />
                        </CardTitle>
                        <CheckCircle className="h-4 w-4 text-purple-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-400">
                            {data.metrics.performance?.successRate || 0}%
                        </div>
                        <p className="text-xs text-muted-foreground">Completed Investments</p>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                            Avg Processing
                            <InfoTooltip content={HELP_CONTENT.dashboard.avgProcessingTime.content} side="top" />
                        </CardTitle>
                        <Clock className="h-4 w-4 text-yellow-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-400">
                            {data.metrics.performance?.avgProcessingTimeSeconds || 0}s
                        </div>
                        <p className="text-xs text-muted-foreground">Time to Distribute</p>
                    </CardContent>
                </Card>
            </div>

            {/* Fundraising Progress Row */}
            <div className="grid gap-4 md:grid-cols-1">
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>Live Fundraising Progress</CardTitle>
                        <CardDescription>Real-time campaign status for active offers</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {data.fundraising && data.fundraising.length > 0 ? (
                            <div className="space-y-6">
                                {data.fundraising.map((offer: any) => (
                                    <div key={offer.id} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <div className="font-medium text-white">{offer.name} <span className="text-muted-foreground">({offer.assetCode})</span></div>
                                            <div className="text-muted-foreground">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(offer.raisedUSDC)} raised
                                                <span className="mx-2">•</span>
                                                {offer.percentage}%
                                            </div>
                                        </div>
                                        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 transition-all duration-500"
                                                style={{ width: `${Math.min(offer.percentage, 100)}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>{offer.soldTokens.toLocaleString()} tokens sold</span>
                                            <span>Target: {offer.targetTokens.toLocaleString()} tokens</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[100px] text-muted-foreground">
                                <TrendingUp className="w-8 h-8 mb-2 opacity-50" />
                                <p>No active fundraising campaigns</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Breakdown Row */}
            <div className="grid gap-4 md:grid-cols-1">
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>Revenue Source Breakdown</CardTitle>
                        <CardDescription>Fees by category</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.revenueBreakdown.breakdown}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="totalAmount"
                                        nameKey="category"
                                    >
                                        {data.revenueBreakdown.breakdown.map((_: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1b1e', border: '1px solid #333' }}
                                        formatter={(value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)}
                                    />
                                    <Legend formatter={(value) => value.replace('_', ' ')} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>Investment Volume</CardTitle>
                        <CardDescription>Daily USDC investment volume over the last 30 days</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.stats}>
                                    <defs>
                                        <linearGradient id="colorUsdc" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#888888"
                                        tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                                        fontSize={12}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        fontSize={12}
                                        tickFormatter={(value) => `$${value}`}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1b1e', border: '1px solid #333' }}
                                        formatter={(value) => [`$${value}`, 'Volume']}
                                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="totalUSDC"
                                        stroke="#10B981"
                                        fillOpacity={1}
                                        fill="url(#colorUsdc)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3 glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>Status Distribution</CardTitle>
                        <CardDescription>Overview of investment outcomes</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1b1e', border: '1px solid #333' }}
                                    />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Pending & User Stats Row */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>Pending Investments</CardTitle>
                        <CardDescription>Investments waiting for payment or distribution</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {data.pendingInvestments.length > 0 ? (
                            <div className="space-y-4">
                                {data.pendingInvestments.map((inv: any) => (
                                    <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                                        <div>
                                            <p className="text-sm font-medium text-white">Investor: {inv.investor?.name || inv.investorId}</p>
                                            <p className="text-xs text-muted-foreground">{inv.status.replace('_', ' ')} • {new Date(inv.createdAt).toLocaleTimeString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-white">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(inv.usdcAmount)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[100px] text-muted-foreground">
                                <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
                                <p>No pending investments</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>User Overview</CardTitle>
                        <CardDescription>Quick stats on investor base</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-yellow-500/20 rounded-full">
                                    <Users className="w-5 h-5 text-yellow-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">Pending KYC</p>
                                    <p className="text-xs text-muted-foreground">Requires attention</p>
                                </div>
                            </div>
                            <span className="text-2xl font-bold text-yellow-400">{data.pendingUsers}</span>
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/20 rounded-full">
                                    <Users className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">Active Users</p>
                                    <p className="text-xs text-muted-foreground">Can invest</p>
                                </div>
                            </div>
                            <span className="text-2xl font-bold text-blue-400">{data.activeUsers}</span>
                        </div>

                        {/* Retention Chart */}
                        <div className="pt-4 border-t border-white/5">
                            <h4 className="text-sm font-medium text-white mb-2">Retention (Active vs Dormant)</h4>
                            <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Active (30d)', value: data.cohorts.active },
                                                { name: 'Dormant', value: data.cohorts.dormant }
                                            ]}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={40}
                                            outerRadius={60}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            <Cell fill="#10B981" />
                                            <Cell fill="#64748B" />
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1a1b1e', border: '1px solid #333' }}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
