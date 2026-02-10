import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    FileText,
    Edit,
    ExternalLink,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    Users,
    DollarSign,
    TrendingUp,
    Calendar,
    AlertCircle,
    Building2,
    Briefcase,
    Rocket
} from "lucide-react";
import { offersApi } from "@/api/offers";
import type { Offer } from '@/types';
import { cn } from "@/lib/utils";

export function OfferDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [offer, setOffer] = useState<Offer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Stats state
    const [stats, setStats] = useState({
        raised: 0,
        investorsCount: 0,
        progress: 0
    });

    useEffect(() => {
        const fetchData = async () => {
            if (!id) return;

            try {
                // Fetch Offer Data
                const offerResponse = await offersApi.getById(parseInt(id));

                if (offerResponse.success && offerResponse.data) {
                    setOffer(offerResponse.data);

                    // Fetch Investors Data for Stats
                    // Only fetch if offer exists
                    try {
                        const investorsResponse = await offersApi.getInvestors(parseInt(id));
                        if (investorsResponse.success && Array.isArray(investorsResponse.data)) {
                            const raised = investorsResponse.data.reduce((sum: number, inv: any) => {
                                return sum + parseFloat(inv.token_amount || '0');
                            }, 0);

                            const totalSupply = parseFloat(offerResponse.data.total_supply || '0');
                            const progress = totalSupply > 0 ? (raised / totalSupply) * 100 : 0;

                            setStats({
                                raised,
                                investorsCount: investorsResponse.data.length,
                                progress
                            });
                        }
                    } catch (statsErr) {
                        console.error('Failed to fetch investors stats:', statsErr);
                        // Don't block main UI if stats fail, just show 0
                    }
                } else {
                    setError('Offer not found');
                }
            } catch (err: any) {
                console.error('Failed to fetch offer:', err);
                setError(err.message || 'Failed to load offer');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !offer) {
        return (
            <div className="space-y-4">
                <Button
                    variant="ghost"
                    onClick={() => navigate('/company/offers')}
                    className="text-muted-foreground hover:text-white"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Offers
                </Button>
                <div className="p-6 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 flex items-center gap-4">
                    <AlertCircle className="w-6 h-6" />
                    <p className="font-medium">{error || 'Offer not found'}</p>
                </div>
            </div>
        );
    }

    const handleLaunch = async () => {
        if (!offer) return;
        setLoading(true); // Re-use loading state or add specific one
        try {
            const response = await offersApi.activateCompany(offer.id);
            if (response.success) {
                // Refresh data
                const updatedOffer = await offersApi.getById(offer.id);
                if (updatedOffer.success && updatedOffer.data) {
                    setOffer(updatedOffer.data);
                }
            } else {
                setError(response.error || 'Failed to launch offer');
            }
        } catch (err: any) {
            console.error('Launch error:', err);
            setError(err.message || 'Failed to launch offer');
        } finally {
            setLoading(false);
        }
    };

    const canEdit = ['pending_review', 'rejected'].includes(offer.status);
    const canLaunch = offer.status === 'approved' && !!offer.token && (offer.offer_rules as any)?.admin_verified;

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Header Navigation */}
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost"
                    onClick={() => navigate('/company/offers')}
                    className="text-muted-foreground hover:text-white pl-0 hover:bg-transparent transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Back to Offers
                </Button>

                <div className="flex gap-3">
                    {canLaunch && (
                        <Button
                            onClick={handleLaunch}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 btn-glow rounded-full px-6"
                        >
                            <Rocket className="w-4 h-4 mr-2" />
                            Launch to Market
                        </Button>
                    )}
                    {(offer.status === 'active' || offer.status === 'matured') && offer.offer_type === 'collateral' && (
                        <Button
                            onClick={() => navigate(`/company/payments/${offer.id}`)}
                            className={cn(
                                "shadow-lg btn-glow rounded-full",
                                offer.status === 'matured'
                                    ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20 animate-pulse"
                                    : "bg-success hover:bg-success/90 text-success-foreground shadow-success/10"
                            )}
                        >
                            <DollarSign className="w-4 h-4 mr-2" />
                            {offer.status === 'matured' ? 'Pay Now - Matured!' : 'Pay Investors'}
                        </Button>
                    )}
                    {canEdit && (
                        <Button
                            onClick={() => navigate(`/company/offers/edit/${offer.id}`)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 btn-glow rounded-full"
                        >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Offer
                        </Button>
                    )}
                </div>
            </div>

            {/* Title Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3 mb-1">
                        <StatusBadge status={offer.status} />
                        <span className="text-sm font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded border border-white/10">
                            {offer.asset_code}
                        </span>
                    </div>
                    <h1 className="text-4xl font-bold font-heading text-foreground tracking-tight">
                        {offer.offer_name}
                    </h1>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground pt-1">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            <span>{offer.offer_type === 'collateral' ? 'Debt Offering (Collateral)' : 'Equity Offering'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>Created {new Date(offer.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Funding Progress Section - Featured */}
            <Card className="glass-panel border-white/10 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />

                <CardHeader className="pb-2">
                    <div className="flex justify-between items-center mb-2">
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            Funding Progress
                        </CardTitle>
                        <span className="text-2xl font-bold font-heading text-primary">
                            {stats.progress.toFixed(1)}%
                        </span>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Progress Bar */}
                    <div className="h-4 w-full bg-secondary/30 rounded-full overflow-hidden p-[2px]">
                        <div
                            className="h-full bg-gradient-to-r from-accent to-primary rounded-full relative overflow-hidden shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-all duration-1000 ease-out"
                            style={{ width: `${stats.progress}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Raised Capital</p>
                            <p className="text-3xl font-bold font-heading text-foreground">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats.raised)}
                            </p>
                        </div>
                        <div className="space-y-1 relative">
                            <div className="hidden md:block absolute left-0 top-2 bottom-2 w-px bg-white/10" />
                            <div className="md:pl-6">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Target Goal</p>
                                <p className="text-3xl font-bold font-heading text-muted-foreground/50">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(offer.total_supply))}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-1 relative">
                            <div className="hidden md:block absolute left-0 top-2 bottom-2 w-px bg-white/10" />
                            <div className="md:pl-6">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Investors</p>
                                <p className="text-3xl font-bold font-heading text-foreground flex items-center gap-2">
                                    {stats.investorsCount}
                                    <Users className="w-5 h-5 text-muted-foreground" />
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-8 lg:grid-cols-3">
                {/* Left Column: Details & Timeline */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Status Timeline */}
                    <Card className="glass-panel border-white/5 bg-white/5">
                        <CardHeader>
                            <CardTitle className="text-base font-heading flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                Application Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="py-6">
                                <div className="flex items-center justify-between w-full">
                                    <TimelineSpot
                                        label="Created"
                                        date={offer.created_at}
                                        status="completed"
                                    />
                                    <TimelineConnector
                                        isActive={['pending_review', 'under_review', 'approved', 'active', 'closed'].includes(offer.status)}
                                    />
                                    <TimelineSpot
                                        label="Review"
                                        date={offer.status === 'pending_review' || offer.status === 'under_review' || offer.status === 'approved' || offer.status === 'active' || offer.status === 'closed' ? offer.updated_at : undefined}
                                        status={
                                            ['approved', 'active', 'closed'].includes(offer.status) ? 'completed' :
                                                ['pending_review', 'under_review'].includes(offer.status) ? 'current' : 'pending'
                                        }
                                    />
                                    <TimelineConnector
                                        isActive={['approved', 'active', 'closed'].includes(offer.status) || (offer.status === 'approved' && !!offer.token)}
                                    />
                                    <TimelineSpot
                                        label="Approved"
                                        date={offer.reviewed_at}
                                        status={
                                            ['active', 'closed'].includes(offer.status) || (offer.status === 'approved' && !!offer.token) ? 'completed' :
                                                offer.status === 'approved' ? 'current' :
                                                    offer.status === 'rejected' ? 'error' : 'pending'
                                        }
                                    />
                                    <TimelineConnector
                                        isActive={['active', 'closed'].includes(offer.status) || (offer.status === 'approved' && !!offer.token)}
                                    />
                                    <TimelineSpot
                                        label="Issued"
                                        date={offer.token?.createdAt}
                                        status={
                                            ['active', 'closed'].includes(offer.status) || (offer.status === 'approved' && !!offer.token) ? 'completed' :
                                                offer.status === 'approved' ? 'current' : 'pending'
                                        }
                                    />
                                    <TimelineConnector
                                        isActive={['active', 'closed'].includes(offer.status)}
                                    />
                                    <TimelineSpot
                                        label={
                                            offer.status === 'approved' && !!offer.token
                                                ? (offer.offer_rules as any)?.admin_verified ? "Ready to Launch" : "In Final Verification"
                                                : "Live"
                                        }
                                        status={
                                            ['active', 'closed'].includes(offer.status) ? 'completed' :
                                                (offer.status === 'approved' && !!offer.token) ? 'current' : 'pending'
                                        }
                                    />
                                </div>
                            </div>

                            {canLaunch && (
                                <div className="mt-6 p-4 bg-primary/10 border border-primary/30 rounded-xl animate-fade-in flex items-center justify-between gap-4">
                                    <div className="space-y-0.5">
                                        <h4 className="font-semibold text-primary flex items-center gap-2">
                                            <Rocket className="w-4 h-4" />
                                            Your token is ready!
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            Launch it to the marketplace so investors can start purchasing.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={handleLaunch}
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 btn-glow rounded-full px-6 whitespace-nowrap"
                                    >
                                        <Rocket className="w-4 h-4 mr-2" />
                                        Launch to Market
                                    </Button>
                                </div>
                            )}

                            {offer.status === 'rejected' && offer.rejection_reason && (
                                <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg animate-fade-in">
                                    <h4 className="font-semibold text-destructive mb-1 flex items-center gap-2">
                                        <XCircle className="w-4 h-4" />
                                        Application Rejected
                                    </h4>
                                    <p className="text-sm text-destructive/90">
                                        {offer.rejection_reason}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Offer Details */}
                    <Card className="glass-panel border-white/5 bg-white/5">
                        <CardHeader>
                            <CardTitle className="font-heading flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-muted-foreground" />
                                Offer Particulars
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-3">Executive Summary</h4>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-sm leading-relaxed text-slate-300">
                                    {offer.description || 'No description provided.'}
                                </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">APRC / Annual Rate</h4>
                                        <div className="flex items-baseline gap-2">
                                            <p className="text-2xl font-mono text-white">
                                                {offer.annual_interest_rate ? `${offer.annual_interest_rate}%` : 'N/A'}
                                            </p>
                                            {offer.annual_interest_rate && <span className="text-xs text-success bg-success/10 px-1.5 py-0.5 rounded">APY</span>}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Maturity Date</h4>
                                        <p className="text-lg text-white">
                                            {offer.maturity_date ? new Date(offer.maturity_date).toLocaleDateString() : 'Perpetual / Undefined'}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Payment Frequency</h4>
                                        <p className="text-lg text-white capitalize">
                                            {offer.payment_type?.replace('_', ' ') || 'Not specified'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Investment Rules */}
                            {offer.offer_rules && Object.keys(offer.offer_rules).length > 0 && (
                                <div className="pt-4 border-t border-white/5">
                                    <h4 className="text-sm font-medium text-muted-foreground mb-4">Investment Constraints</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        {offer.offer_rules.min_investment && (
                                            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Min. Ticket</p>
                                                <p className="text-white font-mono">${offer.offer_rules.min_investment}</p>
                                            </div>
                                        )}
                                        {offer.offer_rules.max_investment && (
                                            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Max. Ticket</p>
                                                <p className="text-white font-mono">${offer.offer_rules.max_investment}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Documents & Stats */}
                <div className="space-y-6">
                    {/* Legal Documents */}
                    <Card className="glass-panel border-white/5 bg-white/5 sticky top-6">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                Legal Documents
                            </CardTitle>
                            <CardDescription>
                                Contractual agreements and prospectuses associated with this offering.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {offer.legal_documents && Object.keys(offer.legal_documents).length > 0 ? (
                                Object.entries(offer.legal_documents).map(([key, doc]) => (
                                    doc && (
                                        <a
                                            key={key}
                                            href={doc.url || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 hover:border-primary/20 transition-all duration-300"
                                        >
                                            <div className="p-2 bg-primary/10 rounded group-hover:bg-primary/20 transition-colors">
                                                <FileText className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <p className="text-sm font-medium text-white capitalize truncate group-hover:text-primary transition-colors">
                                                    {key.replace('_', ' ')}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {doc.fileName || 'View Document'}
                                                </p>
                                            </div>
                                            <ExternalLink className="w-3 h-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                                        </a>
                                    )
                                ))
                            ) : (
                                <div className="text-center py-8 px-4 bg-muted/5 rounded-lg border border-dashed border-white/10">
                                    <p className="text-sm text-muted-foreground">No documents uploaded</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
    const getStatusStyles = () => {
        switch (status) {
            case 'active':
                return 'bg-success/15 text-success border-success/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]';
            case 'approved':
                return 'bg-primary/15 text-primary border-primary/30 shadow-[0_0_10px_rgba(198,168,124,0.15)]';
            case 'pending_review':
            case 'under_review':
                return 'bg-warning/15 text-warning border-warning/30';
            case 'rejected':
                return 'bg-destructive/15 text-destructive border-destructive/30';
            case 'closed':
                return 'bg-muted/50 text-muted-foreground border-white/10';
            case 'matured':
                return 'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse';
            default:
                return 'bg-muted/50 text-muted-foreground border-white/10';
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
        <span className={cn(
            "px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border",
            getStatusStyles()
        )}>
            {getStatusLabel()}
        </span>
    );
}

function TimelineConnector({ isActive }: { isActive: boolean }) {
    return (
        <div className="flex-1 h-0.5 mx-2 relative">
            {/* Background line (always visible) */}
            <div className="absolute inset-x-0 h-full bg-white/10 rounded-full" />

            {/* Active filled line */}
            <div className={cn(
                "absolute inset-0 h-full bg-white rounded-full transition-all duration-700 ease-in-out origin-left",
                isActive ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"
            )} />
        </div>
    );
}

function TimelineSpot({
    label,
    date,
    status // 'completed' | 'current' | 'pending' | 'error'
}: {
    label: string,
    date?: string,
    status: 'completed' | 'current' | 'pending' | 'error'
}) {
    return (
        <div className="flex flex-col items-center gap-2 group cursor-default relative z-10 w-24">
            <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                status === 'completed' ? "bg-white border-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-110" :
                    status === 'current' ? "bg-white border-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-110" :
                        status === 'error' ? "bg-destructive border-destructive text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]" :
                            "bg-black/40 border-white/20 text-muted-foreground backdrop-blur-sm"
            )}>
                {status === 'completed' && <CheckCircle2 className="w-5 h-5" />}
                {status === 'current' && <Loader2 className="w-5 h-5 animate-spin" />}
                {status === 'error' && <XCircle className="w-5 h-5" />}
                {status === 'pending' && <div className="w-2 h-2 rounded-full bg-white/30" />}
            </div>

            <div className="text-center mt-2">
                <p className={cn(
                    "text-xs font-bold uppercase tracking-wider transition-colors",
                    status === 'completed' ? "text-white" :
                        status === 'current' ? "text-white" :
                            status === 'error' ? "text-destructive" :
                                "text-muted-foreground"
                )}>
                    {label}
                </p>
                {date && (
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                        {new Date(date).toLocaleDateString()}
                    </p>
                )}
            </div>
        </div>
    );
}
