
import { useParams, useNavigate } from 'react-router-dom';
import { useOffers } from '@/hooks/useOffers';
import { InvestmentDialog } from '@/components/invest/InvestmentDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Calendar, FileText, TrendingUp, Loader2, AlertCircle } from 'lucide-react';

export function OfferDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { offers, loading, error } = useOffers();

    const offer = offers.find(o => o.id === Number(id));

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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="stat-card p-5 rounded-xl">
                                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                                    <TrendingUp className="h-4 w-4 text-[hsl(160_60%_40%)]" />
                                    <span className="text-sm">Annual Return</span>
                                </div>
                                <div className="text-3xl font-bold value-success">
                                    {offer.annual_interest_rate ? `${parseFloat(offer.annual_interest_rate.toString())}%` : 'N/A'}
                                </div>
                            </div>
                            <div className="stat-card p-5 rounded-xl">
                                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                                    <Calendar className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                                    <span className="text-sm">Maturity</span>
                                </div>
                                <div className="text-3xl font-bold">
                                    {offer.maturity_date ? new Date(offer.maturity_date).toLocaleDateString() : 'Perpetual'}
                                </div>
                            </div>
                        </div>

                        <div className="bg-[hsl(43_45%_55%/0.08)] border border-[hsl(43_45%_55%/0.2)] p-5 rounded-xl">
                            <h3 className="font-semibold text-[hsl(43_45%_55%)] mb-2 flex items-center gap-2">
                                <FileText className="h-4 w-4" /> Collateral & Security
                            </h3>
                            <p className="text-sm">
                                {offer.collateral_description || "This offer is secured by the issuer's general obligation."}
                                {offer.collateral_value && ` Valued at $${parseFloat(offer.collateral_value.toString()).toLocaleString()}.`}
                            </p>
                        </div>
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
                            <span className="text-muted-foreground">Total Supply</span>
                            <span>{parseFloat(offer.total_supply.toString()).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-white/10">
                            <span className="text-muted-foreground">Payment Freq.</span>
                            <span className="capitalize">{offer.payment_type}</span>
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
