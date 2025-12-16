import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, Activity, Loader2, Clock } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";

export function InvestorDashboard() {
    const { data, activity, loading, error } = usePortfolio();

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
                Failed to load dashboard data: {error}. Is the backend running?
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Invested</CardTitle>
                        <DollarSign className="h-4 w-4 text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data?.totalBalance || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">Lifetime Investment</p>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                        <Activity className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data?.activeInvestmentsCount || 0}</div>
                        <p className="text-xs text-muted-foreground">Real Estate & Debt</p>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                        <TrendingUp className="h-4 w-4 text-purple-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data?.totalIncome || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">Dividends Received</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Area */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>Portfolio Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[200px] flex items-center justify-center text-muted-foreground border border-dashed border-white/10 rounded">
                            Chart Coming Soon (Recharts Integration)
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3 glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {activity && activity.length > 0 ? (
                                activity.map((item) => (
                                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                            <Clock className="w-4 h-4 text-emerald-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-white">{item.type}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(item.date).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-emerald-400">
                                                +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.amount)}
                                            </p>
                                            <p className="text-xs text-muted-foreground capitalize">{item.status}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">No recent activity found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

