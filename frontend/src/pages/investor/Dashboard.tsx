import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, Activity, Loader2, Clock, Briefcase } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";

export function InvestorDashboard() {
    const { data, activity, loading, error } = usePortfolio();

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
                Failed to load dashboard data: {error}. Is the backend running?
            </div>
        );
    }

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div className="space-y-8">
            {/* KYC Pending Alert */}
            {user.kycStatus === 'pending' && (
                <div className="p-4 bg-[hsl(35_90%_50%/0.1)] border border-[hsl(35_90%_50%/0.2)] rounded-xl flex items-center gap-4 animate-fade-in">
                    <div className="p-2 rounded-lg bg-[hsl(35_90%_50%/0.15)]">
                        <Clock className="w-5 h-5 text-[hsl(35_90%_50%)]" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-[hsl(35_90%_50%)]">Account Under Review</h4>
                        <p className="text-sm text-[hsl(35_90%_50%/0.8)]">
                            Your account is currently pending approval. You can browse offers but cannot invest until an admin approves your KYC.
                        </p>
                    </div>
                </div>
            )}

            {/* Stats Row */}
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-1">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Invested</CardTitle>
                        <div className="icon-bg icon-bg-accent">
                            <DollarSign className="h-5 w-5 text-[hsl(43_45%_55%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold value-accent">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data?.totalBalance || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Lifetime Investment</p>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
                        <div className="icon-bg icon-bg-primary">
                            <Activity className="h-5 w-5 text-[hsl(217_91%_60%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{data?.activeInvestmentsCount || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">Real Estate & Debt</p>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
                        <div className="icon-bg icon-bg-success">
                            <TrendingUp className="h-5 w-5 text-[hsl(160_60%_40%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold value-success">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data?.totalIncome || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Dividends Received</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Area */}
            <div className="grid gap-5 lg:grid-cols-7">
                <Card className="lg:col-span-4 glass-panel rounded-2xl animate-fade-in-up animate-delay-4">
                    <CardHeader>
                        <CardTitle className="text-xl">Portfolio Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[220px] flex items-center justify-center text-muted-foreground border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                            <div className="flex flex-col items-center gap-3">
                                <Briefcase className="w-10 h-10 opacity-30" />
                                <span>Chart Coming Soon</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3 glass-panel rounded-2xl animate-fade-in-up animate-delay-5">
                    <CardHeader>
                        <CardTitle className="text-xl">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {activity && activity.length > 0 ? (
                                activity.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        className="activity-item flex items-center gap-4 p-4 rounded-xl"
                                        style={{ animationDelay: `${0.35 + idx * 0.05}s` }}
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[hsl(160_60%_40%/0.15)] flex items-center justify-center">
                                            <Clock className="w-4 h-4 text-[hsl(160_60%_40%)]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{item.type}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(item.date).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold value-success">
                                                +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.amount)}
                                            </p>
                                            <p className="text-xs text-muted-foreground capitalize">{item.status}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <div className="p-4 rounded-full bg-muted/30 mb-4">
                                        <Clock className="w-8 h-8 text-muted-foreground/50" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">No recent activity found.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
