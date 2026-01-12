import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, FileText, Users, Clock, Loader2, Plus, BarChart3, AlertCircle, Building2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useNavigate } from "react-router-dom";

export function CompanyDashboard() {
    const { company, offers, stats, loading, error } = useCompany();
    const navigate = useNavigate();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(160_60%_40%)]" />
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

    const recentOffers = offers.slice(0, 5);

    return (
        <div className="space-y-8">
            {/* KYC/Status Alerts */}
            {company?.kyc_status === 'pending' && (
                <div className="p-4 bg-[hsl(35_90%_50%/0.1)] border border-[hsl(35_90%_50%/0.2)] rounded-xl flex items-center gap-4 animate-fade-in">
                    <div className="p-2 rounded-lg bg-[hsl(35_90%_50%/0.15)]">
                        <Clock className="w-5 h-5 text-[hsl(35_90%_50%)]" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-[hsl(35_90%_50%)]">KYC Pending</h4>
                        <p className="text-sm text-[hsl(35_90%_50%/0.8)]">
                            Your KYC is under review. You can create offers, but they won't be approved until your KYC is verified.
                        </p>
                    </div>
                </div>
            )}

            {company?.status === 'pending' && (
                <div className="p-4 bg-[hsl(35_90%_50%/0.1)] border border-[hsl(35_90%_50%/0.2)] rounded-xl flex items-center gap-4 animate-fade-in">
                    <div className="p-2 rounded-lg bg-[hsl(35_90%_50%/0.15)]">
                        <AlertCircle className="w-5 h-5 text-[hsl(35_90%_50%)]" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-[hsl(35_90%_50%)]">Account Pending Approval</h4>
                        <p className="text-sm text-[hsl(35_90%_50%/0.8)]">
                            Your company account is pending approval from the platform administrators.
                        </p>
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-4 animate-fade-in">
                <Button
                    onClick={() => navigate('/company/offers/new')}
                    className="bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white shadow-lg shadow-[hsl(160_60%_40%/0.2)] rounded-xl"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Offer
                </Button>
                <Button
                    variant="outline"
                    onClick={() => navigate('/company/reports')}
                    className="rounded-xl"
                >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    View Reports
                </Button>
            </div>

            {/* Stats Row */}
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-1">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Supply</CardTitle>
                        <div className="icon-bg icon-bg-success">
                            <TrendingUp className="h-5 w-5 text-[hsl(160_60%_40%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold value-success">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats.totalRaised)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">From all offers</p>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Offers</CardTitle>
                        <div className="icon-bg icon-bg-success">
                            <FileText className="h-5 w-5 text-[hsl(160_60%_40%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.activeOffers}</div>
                        <p className="text-xs text-muted-foreground mt-1">Currently accepting investments</p>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Offers</CardTitle>
                        <div className="icon-bg icon-bg-primary">
                            <FileText className="h-5 w-5 text-[hsl(217_91%_60%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{offers.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">All time</p>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-4">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Investors</CardTitle>
                        <div className="icon-bg icon-bg-accent">
                            <Users className="h-5 w-5 text-[hsl(43_45%_55%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.totalInvestors}</div>
                        <p className="text-xs text-muted-foreground mt-1">Unique investors</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Area */}
            <div className="grid gap-5 lg:grid-cols-7">
                {/* Recent Offers */}
                <Card className="lg:col-span-4 glass-panel rounded-2xl animate-fade-in-up animate-delay-5">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xl">Recent Offers</CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/company/offers')}
                            className="text-muted-foreground hover:text-white"
                        >
                            View All
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {recentOffers.length > 0 ? (
                                recentOffers.map((offer, idx) => (
                                    <div
                                        key={offer.id}
                                        className="activity-item flex items-center gap-4 p-4 rounded-xl cursor-pointer"
                                        onClick={() => navigate(`/company/offers/${offer.id}`)}
                                        style={{ animationDelay: `${0.35 + idx * 0.05}s` }}
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[hsl(160_60%_40%/0.15)] flex items-center justify-center">
                                            <FileText className="w-5 h-5 text-[hsl(160_60%_40%)]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{offer.offer_name}</p>
                                            <p className="text-xs text-muted-foreground font-mono">{offer.asset_code}</p>
                                        </div>
                                        <div className="text-right">
                                            <StatusBadge status={offer.status} />
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {new Date(offer.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="p-5 rounded-2xl bg-muted/30 mb-4">
                                        <FileText className="w-10 h-10 text-muted-foreground/50" />
                                    </div>
                                    <p className="text-lg font-medium mb-1">No offers yet</p>
                                    <Button
                                        variant="link"
                                        className="text-[hsl(160_60%_40%)]"
                                        onClick={() => navigate('/company/offers/new')}
                                    >
                                        Create your first offer
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Company Info */}
                <Card className="lg:col-span-3 glass-panel rounded-2xl animate-fade-in-up animate-delay-5">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-[hsl(160_60%_40%)]" />
                            Company Profile
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-muted-foreground">Company Name</p>
                                <p className="text-sm font-medium">{company?.name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">CNPJ</p>
                                <p className="text-sm font-medium font-mono">{company?.cnpj}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Legal Representative</p>
                                <p className="text-sm font-medium">{company?.legal_representative}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Email</p>
                                <p className="text-sm font-medium">{company?.email}</p>
                            </div>
                            <div className="pt-3 border-t border-white/10">
                                <Button
                                    variant="outline"
                                    className="w-full rounded-xl"
                                    onClick={() => navigate('/company/settings')}
                                >
                                    Edit Profile
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const getStatusStyles = () => {
        switch (status) {
            case 'active':
                return 'bg-[hsl(160_60%_40%/0.15)] text-[hsl(160_60%_40%)] border border-[hsl(160_60%_40%/0.3)]';
            case 'approved':
                return 'bg-[hsl(217_91%_60%/0.15)] text-[hsl(217_91%_60%)] border border-[hsl(217_91%_60%/0.3)]';
            case 'pending_review':
            case 'under_review':
                return 'bg-[hsl(35_90%_50%/0.15)] text-[hsl(35_90%_50%)] border border-[hsl(35_90%_50%/0.3)]';
            case 'rejected':
                return 'bg-red-500/15 text-red-400 border border-red-500/30';
            case 'closed':
                return 'bg-muted text-muted-foreground border border-white/10';
            default:
                return 'bg-muted text-muted-foreground border border-white/10';
        }
    };

    const getStatusLabel = () => {
        switch (status) {
            case 'pending_review': return 'Pending Review';
            case 'under_review': return 'Under Review';
            default: return status.charAt(0).toUpperCase() + status.slice(1);
        }
    };

    return (
        <span className={`text-xs px-2 py-1 rounded-full ${getStatusStyles()}`}>
            {getStatusLabel()}
        </span>
    );
}
