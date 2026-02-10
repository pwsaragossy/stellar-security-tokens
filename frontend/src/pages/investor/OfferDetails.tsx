
import { useParams, useNavigate } from 'react-router-dom';
import { useOffer } from '@/hooks/useOffer';
import { InvestmentDialog } from '@/components/invest/InvestmentDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Calendar, FileText, TrendingUp, Loader2, AlertCircle, DollarSign, ExternalLink, ShieldCheck, Clock, Building2, Scale } from 'lucide-react';

const PAYMENT_LABELS: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Semi-Annual',
    annual: 'Annual',
    bullet: 'Bullet',
};

export function OfferDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { offer, loading, error } = useOffer(id);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading offer details...</p>
                </div>
            </div>
        );
    }

    if (error || !offer) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4 animate-fade-in">
                    <div className="p-4 rounded-2xl bg-red-500/10">
                        <AlertCircle className="w-10 h-10 text-red-400" />
                    </div>
                    <p className="text-lg font-medium">Offer not found</p>
                    <Button variant="outline" onClick={() => navigate('/market')} className="rounded-xl">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Marketplace
                    </Button>
                </div>
            </div>
        );
    }

    const unitPrice = offer.unit_price || 1;
    const totalRaise = (offer.total_supply || 0) * unitPrice;
    const paymentLabel = PAYMENT_LABELS[offer.payment_type || ''] || offer.payment_type || '—';
    const legalDocs = offer.legal_documents
        ? Object.entries(offer.legal_documents).filter(([, v]) => v && (typeof v === 'object'))
        : [];
    const offerRules = offer.offer_rules || {};

    return (
        <div className="space-y-8 animate-fade-in">
            <Button
                variant="ghost"
                className="text-muted-foreground hover:text-white pl-0"
                onClick={() => navigate('/market')}
            >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Marketplace
            </Button>

            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 animate-fade-in-up">
                <div className="space-y-3">
                    <h1 className="text-4xl font-bold">{offer.offer_name}</h1>
                    {/* Company name */}
                    {offer.company?.name && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building2 className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                            <span>{offer.company.name}</span>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <Badge className="bg-[hsl(43_45%_55%/0.15)] text-[hsl(43_45%_55%)] border border-[hsl(43_45%_55%/0.3)] hover:bg-[hsl(43_45%_55%/0.2)]">
                            {offer.offer_type === 'sale' ? 'Equity Sale' : 'Debt / Collateral'}
                        </Badge>
                        <Badge className="bg-muted text-muted-foreground border border-white/10 capitalize">
                            {offer.status.replace('_', ' ')}
                        </Badge>
                    </div>
                </div>
                <InvestmentDialog offer={offer} />
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 glass-panel rounded-2xl animate-fade-in-up animate-delay-1">
                    <CardHeader>
                        <CardTitle className="text-xl">Investment Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 text-muted-foreground">
                        <p className="text-lg leading-relaxed">{offer.description}</p>

                        {/* Stats grid — 4 metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="stat-card p-5 rounded-xl">
                                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                                    <TrendingUp className="h-4 w-4 text-[hsl(160_60%_40%)]" />
                                    <span className="text-sm">APY</span>
                                </div>
                                <div className="text-2xl font-bold value-success">
                                    {offer.annual_interest_rate ? `${parseFloat(offer.annual_interest_rate.toString())}%` : 'N/A'}
                                </div>
                            </div>
                            <div className="stat-card p-5 rounded-xl">
                                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                                    <DollarSign className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                                    <span className="text-sm">Unit Price</span>
                                </div>
                                <div className="text-2xl font-bold">
                                    ${unitPrice}
                                </div>
                            </div>
                            <div className="stat-card p-5 rounded-xl">
                                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                                    <Calendar className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                                    <span className="text-sm">Maturity</span>
                                </div>
                                <div className="text-2xl font-bold">
                                    {offer.maturity_date ? new Date(offer.maturity_date).toLocaleDateString() : 'Perpetual'}
                                </div>
                            </div>
                            <div className="stat-card p-5 rounded-xl">
                                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                                    <Clock className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                                    <span className="text-sm">Payout</span>
                                </div>
                                <div className="text-2xl font-bold capitalize">
                                    {paymentLabel}
                                </div>
                            </div>
                        </div>

                        {/* Collateral */}
                        <div className="bg-[hsl(43_45%_55%/0.08)] border border-[hsl(43_45%_55%/0.2)] p-5 rounded-xl">
                            <h3 className="font-semibold text-[hsl(43_45%_55%)] mb-2 flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" /> Collateral & Security
                            </h3>
                            <p className="text-sm">
                                {offer.collateral_description || "This offer is secured by the issuer's general obligation."}
                                {offer.collateral_value && ` Valued at $${parseFloat(offer.collateral_value.toString()).toLocaleString()}.`}
                            </p>
                        </div>

                        {/* Offer Rules */}
                        {Object.keys(offerRules).length > 0 && (
                            <div className="bg-white/[0.03] border border-white/10 p-5 rounded-xl">
                                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                                    <Scale className="h-4 w-4 text-[hsl(43_45%_55%)]" /> Investment Rules
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {offerRules.min_investment && (
                                        <div className="text-sm">
                                            <span className="text-muted-foreground">Minimum</span>
                                            <p className="font-medium text-white">${Number(offerRules.min_investment).toLocaleString()} USDC</p>
                                        </div>
                                    )}
                                    {offerRules.max_investment && (
                                        <div className="text-sm">
                                            <span className="text-muted-foreground">Maximum</span>
                                            <p className="font-medium text-white">${Number(offerRules.max_investment).toLocaleString()} USDC</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Legal Documents */}
                        {legalDocs.length > 0 && (
                            <div className="bg-white/[0.03] border border-white/10 p-5 rounded-xl">
                                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-[hsl(43_45%_55%)]" /> Legal Documents
                                </h3>
                                <div className="space-y-2">
                                    {legalDocs.map(([key, doc]) => {
                                        const docObj = doc as { hash?: string; url?: string; fileName?: string };
                                        const docUrl = docObj.url || (docObj.hash ? `https://ipfs.io/ipfs/${docObj.hash}` : null);
                                        const docName = docObj.fileName || key.replace(/_/g, ' ');
                                        return (
                                            <a
                                                key={key}
                                                href={docUrl || '#'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors group/doc"
                                            >
                                                <span className="text-sm font-medium capitalize">{docName}</span>
                                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover/doc:text-[hsl(43_45%_55%)] transition-colors" />
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="glass-panel rounded-2xl h-fit animate-fade-in-up animate-delay-2">
                    <CardHeader>
                        <CardTitle className="text-xl">Asset Details</CardTitle>
                        <CardDescription>Token Information</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between py-3 border-b border-white/10">
                            <span className="text-muted-foreground">Asset Code</span>
                            <span className="font-mono value-accent">{offer.asset_code}</span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-white/10">
                            <span className="text-muted-foreground">Unit Price</span>
                            <span className="font-semibold">${unitPrice} USDC</span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-white/10">
                            <span className="text-muted-foreground">Total Supply</span>
                            <span>{parseFloat(offer.total_supply.toString()).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-white/10">
                            <span className="text-muted-foreground">Total Raise</span>
                            <span className="font-semibold">${totalRaise.toLocaleString()} USDC</span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-white/10">
                            <span className="text-muted-foreground">Payment</span>
                            <span className="capitalize">{paymentLabel}</span>
                        </div>
                        <div className="pt-4">
                            <InvestmentDialog
                                offer={offer}
                                trigger={
                                    <Button className="w-full h-12 text-base font-semibold bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white rounded-xl shadow-lg shadow-[hsl(160_60%_40%/0.2)]">
                                        Invest Now
                                    </Button>
                                }
                            />
                            <p className="text-xs text-center text-muted-foreground mt-3">
                                Settlement via USDC on Stellar
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
