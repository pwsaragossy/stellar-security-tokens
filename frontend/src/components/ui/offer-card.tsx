
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Percent, ShieldCheck, DollarSign, Clock } from "lucide-react";
import type { Offer } from "@/hooks/useOffers";

interface OfferCardProps {
    offer: Offer;
    onInvest: (id: number) => void;
}

const PAYMENT_LABELS: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Semi-Annual',
    annual: 'Annual',
    bullet: 'Bullet',
};

export function OfferCard({ offer, onInvest }: OfferCardProps) {
    const unitPrice = offer.unit_price || 1;
    const totalRaise = (offer.total_supply || 0) * unitPrice;
    const paymentLabel = PAYMENT_LABELS[offer.payment_type || ''] || offer.payment_type || '—';

    return (
        <Card className="glass-panel border-white/5 bg-white/[0.04] hover:bg-white/[0.08] transition-all duration-300 group hover:scale-[1.02] hover:border-[hsl(43_45%_55%/0.25)] hover:shadow-lg hover:shadow-[hsl(43_45%_55%/0.05)]">
            <CardHeader className="pb-3">
                {/* HIG Visual Hierarchy: type badge + hero metric at top */}
                <div className="flex justify-between items-start">
                    <Badge variant={offer.offer_type === 'collateral' ? 'default' : 'secondary'}>
                        {offer.offer_type === 'collateral' ? 'Debt (CR)' : 'Equity'}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                        {offer.collateral_ltv && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                LTV {Number(offer.collateral_ltv).toFixed(0)}%
                            </span>
                        )}
                    </div>
                </div>

                {/* Offer name — semibold, large (HIG Typography hierarchy) */}
                <CardTitle className="text-xl mt-2">{offer.offer_name}</CardTitle>

                {/* Company name — muted, regular weight */}
                <div className="flex items-center gap-1.5 text-xs text-[hsl(43_45%_55%)] font-medium">
                    <span>{offer.company?.name || 'Issuer'}</span>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Financial data grid — HIG: group related items */}
                <div className="grid grid-cols-3 gap-2">
                    {/* Unit Price */}
                    <div className="p-2.5 bg-black/20 rounded-lg text-center">
                        <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                            <DollarSign className="w-3 h-3" />
                            Price
                        </div>
                        <span className="text-sm font-semibold text-white">${unitPrice}</span>
                    </div>
                    {/* Total Raise */}
                    <div className="p-2.5 bg-black/20 rounded-lg text-center">
                        <div className="text-[11px] text-muted-foreground mb-0.5">
                            Raise
                        </div>
                        <span className="text-sm font-semibold text-white">
                            ${totalRaise >= 1000 ? `${(totalRaise / 1000).toFixed(0)}K` : totalRaise.toLocaleString()}
                        </span>
                    </div>
                    {/* Payment Type */}
                    <div className="p-2.5 bg-black/20 rounded-lg text-center">
                        <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                            <Clock className="w-3 h-3" />
                            Payout
                        </div>
                        <span className="text-sm font-semibold text-white">{paymentLabel}</span>
                    </div>
                </div>

                {/* APY — hero metric, prominent */}
                {offer.annual_interest_rate && (
                    <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Percent className="w-4 h-4 text-emerald-400" />
                            APY
                        </div>
                        <span className="text-lg font-bold text-emerald-400">{offer.annual_interest_rate}%</span>
                    </div>
                )}

                {/* Maturity — secondary detail */}
                {offer.maturity_date && (
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            Maturity
                        </div>
                        <span>{new Date(offer.maturity_date).toLocaleDateString()}</span>
                    </div>
                )}
            </CardContent>

            <CardFooter>
                <Button
                    className="w-full bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white shadow-sm"
                    onClick={() => onInvest(offer.id)}
                >
                    View Details
                </Button>
            </CardFooter>
        </Card>
    );
}
