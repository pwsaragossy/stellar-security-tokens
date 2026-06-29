import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Clock, Loader2, Plus, Users, DollarSign, PieChart as PieChartIcon, BarChart3, ArrowUpRight, AlertTriangle, Calendar } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { offersApi } from "@/api/offers";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { companyPaymentsApi, type PaymentDetails, type BulletPaymentDetails } from '@/api/companyPayments';

export function CompanyDashboard() {
    const { company, offers, stats, dashboardData, loading, error } = useCompany();
    const navigate = useNavigate();
    const [activeOfferStats, setActiveOfferStats] = useState<Record<number, { sold: number, investors: number }>>({});
    const [upcomingPayments, setUpcomingPayments] = useState<(PaymentDetails | BulletPaymentDetails)[]>([]);

    // Fetch granular data for active offers
    useEffect(() => {
        const fetchDeepStats = async () => {
            const active = offers.filter(o => o.status === 'active');
            const newStats: Record<number, { sold: number, investors: number }> = {};

            for (const offer of active) {
                try {
                    const response = await offersApi.getInvestors(offer.id);
                    if (response.success && Array.isArray(response.data)) {
                        // Calculate sold amount from investments
                        // Note: Investment type has 'token_amount' as string
                        const sold = response.data.reduce((sum: number, inv: any) => {
                            return sum + parseFloat(inv.total_tokens || '0');
                        }, 0);

                        newStats[offer.id] = {
                            sold,
                            investors: response.data.length
                        };
                    }
                } catch (err) {
                    console.error(`Failed to fetch stats for offer ${offer.id}`, err);
                }
            }
            setActiveOfferStats(newStats);
        };

        if (offers.length > 0) {
            fetchDeepStats();
        }
    }, [offers]);

    // Fetch upcoming payments
    useEffect(() => {
        companyPaymentsApi.getUpcomingPayments()
            .then((res) => setUpcomingPayments(res.data || []))
            .catch(() => setUpcomingPayments([]));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-muted-foreground text-sm">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 animate-fade-in">
                Failed to load dashboard data: {error}. Is the backend running?
            </div>
        );
    }

    const activeOffers = offers.filter(o => o.status === 'active');

    // Calculate Total Capital Raised so far (Sold amount of active + closed offers)
    // We use the stats from useCompany for totalRaised which handles closed offers, 
    // but for active ones we might want the live 'sold' data we just fetched.
    // For now, let's trust useCompany's stats.totalRaised or improve it if needed.
    // Actually, let's use the main metric requested: "Value in USD" likely means Total Volume available + Total Volume Sold.
    // Let's stick to "Financial Performance" cards.

    return (
        <div className="space-y-8">
            {/* Header / Actions - Premium Layout */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-fade-in relative z-10">
                <div className="space-y-1">
                    <h2 className="text-4xl font-bold tracking-tight font-heading text-foreground">Dashboard</h2>
                    <p className="text-muted-foreground text-lg max-w-xl">Overview of your securities and financial performance.</p>
                </div>
                <Button
                    onClick={() => navigate('/company/offers/new')}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-full px-6 py-6 text-base btn-glow btn-interactive"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    New Token Offering
                </Button>
            </div>

            {/* KYC/Status Alerts */}
            {company?.kyc_status === 'pending' && (
                <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl flex items-center gap-4 animate-fade-in">
                    <div className="p-2 rounded-lg bg-warning/15">
                        <Clock className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-warning">KYC Pending</h4>
                        <p className="text-sm text-warning/80">
                            Your KYC is under review. You can create offers, but they won't be approved until your KYC is verified.
                        </p>
                    </div>
                </div>
            )}

            {/* Payment Alerts - Matured/Due Offers */}
            {offers.filter(o => o.status === 'matured').length > 0 && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl animate-fade-in animate-pulse-subtle">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-lg bg-rose-500/20">
                                <AlertTriangle className="w-5 h-5 text-rose-400" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-rose-400">Payment Due</h4>
                                <p className="text-sm text-rose-400/80">
                                    {offers.filter(o => o.status === 'matured').length} offer(s) have matured and require payment to investors.
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={() => navigate('/company/offers?status=matured')}
                            className="bg-rose-500 hover:bg-rose-600 text-white"
                        >
                            <DollarSign className="w-4 h-4 mr-2" />
                            Pay Now
                        </Button>
                    </div>
                </div>
            )}

            {/* Default Alert - Defaulted Offers (most severe) */}
            {offers.filter(o => o.status === 'defaulted').length > 0 && (
                <div className="p-4 bg-red-600/15 border border-red-600/40 rounded-xl animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-lg bg-red-600/25">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-red-400">⚠ Offer(s) in Default</h4>
                                <p className="text-sm text-red-400/80">
                                    {offers.filter(o => o.status === 'defaulted').length} offer(s) declared in default by the platform. Collateral distribution to investors is now in admin's hands.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Upcoming Payments Widget */}
            {upcomingPayments.length > 0 && (
                <Card className="glass-panel p-0 border-white/5 bg-white/5 animate-fade-in-up overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-sky-400" />
                            <h3 className="font-heading text-base font-semibold">Upcoming Payments</h3>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {upcomingPayments.length} offer{upcomingPayments.length > 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="divide-y divide-white/5">
                        {upcomingPayments.map((payment: any) => {
                            const isBullet = 'maturityDate' in payment;
                            const dueDate = isBullet
                                ? payment.maturityDate
                                : payment.nextPaymentDue;
                            const totalOwed = isBullet
                                ? payment.totalPayout
                                : payment.totalOwed;
                            const isOverdue = payment.paymentDueStatus === 'overdue';

                            return (
                                <div
                                    key={payment.offerId}
                                    className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white truncate">
                                            {payment.offerName || payment.assetCode}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-muted-foreground">
                                                {dueDate ? new Date(dueDate).toLocaleDateString() : 'No date'}
                                            </span>
                                            {isOverdue && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">
                                                    OVERDUE
                                                </span>
                                            )}
                                            {isBullet && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
                                                    MATURITY
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-mono text-emerald-400 font-semibold">
                                            ${Number(totalOwed || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                        <Button
                                            size="sm"
                                            onClick={() => navigate(`/company/payments/${payment.offerId}`)}
                                            className={isOverdue
                                                ? 'bg-red-500 hover:bg-red-600 text-white text-xs'
                                                : 'bg-primary hover:bg-primary/90 text-primary-foreground text-xs'
                                            }
                                        >
                                            <DollarSign className="w-3 h-3 mr-1" />
                                            Pay
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Financial Performance Section */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 pb-8 animate-fade-in-up animate-delay-1">
                <Card className="glass-panel p-6 border-primary/10 bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden group hover:border-primary/30 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <DollarSign className="w-16 h-16 -mr-4 -mt-4 text-primary" />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Raised</p>
                    <div className="mt-2 text-3xl font-bold font-heading text-foreground">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(stats.totalRaised)}
                    </div>
                </Card>

                <Card className="glass-panel p-6 border-success/10 bg-gradient-to-br from-success/5 to-transparent relative overflow-hidden group hover:border-success/30 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp className="w-16 h-16 -mr-4 -mt-4 text-success" />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Distributions</p>
                    <div className="mt-2 text-3xl font-bold font-heading text-foreground">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dashboardData?.financials.totalDistributions || 0)}
                    </div>
                </Card>

                <Card className="glass-panel p-6 border-accent/10 bg-gradient-to-br from-accent/5 to-transparent relative overflow-hidden group hover:border-accent/30 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Users className="w-16 h-16 -mr-4 -mt-4 text-accent" />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unique Investors</p>
                    <div className="mt-2 text-3xl font-bold font-heading text-foreground">
                        {dashboardData?.financials.uniqueInvestors || 0}
                    </div>
                </Card>

                <Card className="glass-panel p-6 border-purple-500/10 bg-gradient-to-br from-purple-500/5 to-transparent relative overflow-hidden group hover:border-purple-500/30 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <PieChartIcon className="w-16 h-16 -mr-4 -mt-4 text-purple-500" />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Check Size</p>
                    <div className="mt-2 text-3xl font-bold font-heading text-foreground">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dashboardData?.financials.averageCheckSize || 0)}
                    </div>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid gap-6 md:grid-cols-3 pb-8 animate-fade-in-up animate-delay-2">
                <Card className="glass-panel md:col-span-2 p-6 h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold font-heading">Capital Formation</h3>
                            <p className="text-sm text-muted-foreground">Cumulative capital raised over time</p>
                        </div>
                        <BarChart3 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dashboardData?.capitalFormation || []}>
                                <defs>
                                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#C6F24E" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#C6F24E" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    stroke="rgba(255,255,255,0.2)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(str) => {
                                        const d = new Date(str);
                                        return `${d.getMonth() + 1}/${d.getFullYear().toString().substr(2)}`;
                                    }}
                                />
                                <YAxis
                                    stroke="rgba(255,255,255,0.2)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => `$${val / 1000}k`}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                    formatter={(val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)}
                                />
                                <Area type="monotone" dataKey="amount" stroke="#C6F24E" fillOpacity={1} fill="url(#colorAmount)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="glass-panel md:col-span-1 p-6 h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold font-heading">Investor Composition</h3>
                            <p className="text-sm text-muted-foreground">Distribution by KYC Status</p>
                        </div>
                        <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="h-[300px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={dashboardData?.investorComposition || []}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="count"
                                >
                                    {(dashboardData?.investorComposition || []).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.status === 'Approved' ? '#10b981' : entry.status === 'Pending' ? '#f59e0b' : '#ef4444'} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                                <span className="text-3xl font-bold font-heading block">{stats.totalRaised > 0 ? dashboardData?.financials.uniqueInvestors : 0}</span>
                                <span className="text-xs text-muted-foreground uppercase tracking-widest">Investors</span>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Active Offers Section - Editorial/Magazine Style Layout */}
            <div className="space-y-6 animate-fade-in-up animate-delay-3 pb-12">
                <div className="flex items-end justify-between border-b border-border/40 pb-4">
                    <h3 className="text-3xl font-bold font-heading tracking-tight">
                        Active Portfolios
                    </h3>
                    <span className="text-sm text-muted-foreground font-mono mb-1">
                        {activeOffers.length} {activeOffers.length === 1 ? 'OFFER' : 'OFFERS'} LIVE
                    </span>
                </div>

                {
                    activeOffers.length > 0 ? (
                        <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-2">
                            {activeOffers.map((offer, idx) => {
                                const stats = activeOfferStats[offer.id] || { sold: 0, investors: 0 };
                                const totalSupply = parseFloat(offer.total_supply || '0');
                                const progress = totalSupply > 0 ? (stats.sold / totalSupply) * 100 : 0;

                                return (
                                    <Card
                                        key={offer.id}
                                        className="group glass-panel rounded-3xl overflow-hidden hover:border-accent/40 transition-all duration-500"
                                        style={{ animationDelay: `${0.2 + idx * 0.1}s` }}
                                    >
                                        <div className="p-8 space-y-8">
                                            <div className="flex justify-between items-start">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                                                            Series A
                                                        </span>
                                                        <StatusBadge status={offer.status} />
                                                    </div>
                                                    <h4 className="text-2xl font-bold font-heading group-hover:text-accent transition-colors duration-300">
                                                        {offer.offer_name}
                                                    </h4>
                                                    <p className="text-sm text-muted-foreground font-mono tracking-wide opacity-70">
                                                        {offer.asset_code}
                                                    </p>
                                                </div>
                                                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-accent group-hover:text-black transition-all duration-300 transform group-hover:rotate-45">
                                                    <ArrowUpRight className="w-5 h-5" />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-8 py-6 border-y border-white/5 relative">
                                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
                                                <div>
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Capital Raised</p>
                                                    <p className="text-2xl font-bold font-heading text-success">
                                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: "compact" }).format(stats.sold)}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Target</p>
                                                    <p className="text-2xl font-bold font-heading text-muted-foreground/80">
                                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: "compact" }).format(totalSupply)}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex justify-between text-sm items-end">
                                                    <span className="text-muted-foreground font-medium">{stats.investors} Investors</span>
                                                    <span className="font-bold text-2xl font-heading tabular-nums">{progress.toFixed(1)}%</span>
                                                </div>
                                                <div className="h-2 w-full bg-secondary/30 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-accent to-primary relative overflow-hidden"
                                                        style={{ width: `${progress}%` }}
                                                    >
                                                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-2 flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">
                                                    Started {new Date(offer.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    className="hover:bg-accent hover:text-accent-foreground rounded-full px-6 transition-all duration-300"
                                                    onClick={() => navigate(`/company/offers/${offer.id}`)}
                                                >
                                                    Manage Asset
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center py-24 glass-panel rounded-3xl border-dashed border-2 border-white/10 hover:border-accent/30 transition-colors group cursor-pointer" onClick={() => navigate('/company/offers/new')}>
                            <div className="text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto group-hover:bg-accent group-hover:text-black transition-all duration-500">
                                    <Plus className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold font-heading mb-2">Initialize New Offering</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto">
                                        Begin the process of creating a new token offering.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const getStatusStyles = () => {
        switch (status) {
            case 'active':
                return 'bg-success/15 text-success border border-success/30';
            case 'approved':
                return 'bg-primary/15 text-primary border border-primary/30';
            case 'pending_review':
            case 'under_review':
                return 'bg-warning/15 text-warning border border-warning/30';
            case 'rejected':
                return 'bg-red-500/15 text-red-400 border border-red-500/30';
            case 'closed':
                return 'bg-muted text-muted-foreground border border-white/10';
            case 'matured':
                return 'bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse';
            case 'defaulted':
                return 'bg-red-600/20 text-red-300 border border-red-600/40';
            default:
                return 'bg-muted text-muted-foreground border border-white/10';
        }
    };

    const getStatusLabel = () => {
        switch (status) {
            case 'pending_review': return 'Pending Review';
            case 'under_review': return 'Under Review';
            case 'defaulted': return 'Defaulted';
            default: return status.charAt(0).toUpperCase() + status.slice(1);
        }
    };

    return (
        <span className={`text-xs px-2 py-1 rounded-full ${getStatusStyles()}`}>
            {getStatusLabel()}
        </span>
    );
}
