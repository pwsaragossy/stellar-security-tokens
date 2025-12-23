
import { useParams, useNavigate } from 'react-router-dom';
import { useOffers } from '@/hooks/useOffers';
import { InvestmentDialog } from '@/components/invest/InvestmentDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Calendar, FileText, TrendingUp } from 'lucide-react';

export function OfferDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { offers, loading, error } = useOffers();

    const offer = offers.find(o => o.id === Number(id));

    if (loading) return <div className="p-8 text-white">Loading offer details...</div>;
    if (error || !offer) return <div className="p-8 text-white">Offer not found.</div>;


    return (
        <div className="space-y-6">
            <Button
                variant="ghost"
                className="text-slate-400 hover:text-white pl-0"
                onClick={() => navigate('/market')}
            >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Marketplace
            </Button>

            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{offer.offer_name}</h1>
                    <div className="flex gap-2">
                        <Badge variant="outline" className="border-blue-500/50 text-blue-400">
                            {offer.offer_type === 'sale' ? 'Equity Sale' : 'Debt / Collateral'}
                        </Badge>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                            {offer.status.replace('_', ' ')}
                        </Badge>
                    </div>
                </div>
                <InvestmentDialog offer={offer} />
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 border-slate-800 bg-black/40">
                    <CardHeader>
                        <CardTitle className="text-white">Investment Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 text-slate-300">
                        <p className="text-lg leading-relaxed">{offer.description}</p>

                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
                                <div className="flex items-center gap-2 text-slate-400 mb-2">
                                    <TrendingUp className="h-4 w-4" /> Annual Return
                                </div>
                                <div className="text-2xl font-bold text-green-400">
                                    {offer.annual_interest_rate ? `${parseFloat(offer.annual_interest_rate.toString())}%` : 'N/A'}
                                </div>
                            </div>
                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
                                <div className="flex items-center gap-2 text-slate-400 mb-2">
                                    <Calendar className="h-4 w-4" /> Maturity
                                </div>
                                <div className="text-2xl font-bold text-white">
                                    {offer.maturity_date ? new Date(offer.maturity_date).toLocaleDateString() : 'Perpetual'}
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-900/20 border border-blue-900/50 p-4 rounded-lg">
                            <h3 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
                                <FileText className="h-4 w-4" /> Collateral & Security
                            </h3>
                            <p className="text-sm text-slate-300">
                                {offer.collateral_description || "This offer is secured by the issuer's general obligation."}
                                {offer.collateral_value && ` Valued at $${parseFloat(offer.collateral_value.toString()).toLocaleString()}.`}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-800 bg-black/40 h-fit">
                    <CardHeader>
                        <CardTitle className="text-white">Asset Details</CardTitle>
                        <CardDescription>Token Information</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between py-2 border-b border-slate-800">
                            <span className="text-slate-400">Asset Code</span>
                            <span className="text-white font-mono">{offer.asset_code}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-800">
                            <span className="text-slate-400">Total Supply</span>
                            <span className="text-white">{parseFloat(offer.total_supply.toString()).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-800">
                            <span className="text-slate-400">Payment Freq.</span>
                            <span className="text-white capitalize">{offer.payment_type}</span>
                        </div>
                        <div className="pt-4">
                            <InvestmentDialog
                                offer={offer}
                                trigger={<Button className="w-full bg-green-600 hover:bg-green-500 text-white font-bold">Invest Now</Button>}
                            />
                            <p className="text-xs text-center text-slate-500 mt-2">
                                Settlement via USDC on Stellar
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
