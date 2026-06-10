
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Percent, ShieldCheck, DollarSign, Clock, Landmark, TrendingUp } from "lucide-react";
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

// Accent palettes per offer type
const TYPE_THEME = {
    collateral: {
        label: 'Debt (CR)',
        icon: Landmark,
        badge: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
        accent: 'text-blue-400',
        accentBg: 'bg-blue-500/10 border-blue-500/15',
        glow: 'hover:border-blue-500/25 hover:shadow-blue-500/5',
        button: 'bg-blue-600 hover:bg-blue-500',
        apyColor: 'text-blue-400',
    },
    sale: {
        label: 'Equity',
        icon: TrendingUp,
        badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
        accent: 'text-emerald-400',
        accentBg: 'bg-emerald-500/10 border-emerald-500/15',
        glow: 'hover:border-emerald-500/25 hover:shadow-emerald-500/5',
        button: 'bg-emerald-600 hover:bg-emerald-500',
        apyColor: 'text-emerald-400',
    },
} as const;

export function OfferCard({ offer, onInvest }: OfferCardProps) {
    const unitPrice = offer.unit_price || 1;
    const totalRaise = (offer.total_supply || 0) * unitPrice;
    const paymentLabel = PAYMENT_LABELS[offer.payment_type || ''] || offer.payment_type || '—';
    const theme = TYPE_THEME[offer.offer_type as keyof typeof TYPE_THEME] || TYPE_THEME.sale;
    const TypeIcon = theme.icon;

    const coverPhoto = offer.collateral_photos?.[0];

    return (
        <Card className={`flex flex-col h-full glass-panel border-white/5 bg-white/[0.04] hover:bg-white/[0.06] transition-all duration-300 group hover:scale-[1.02] hover:shadow-lg overflow-hidden ${theme.glow}`}>
            {coverPhoto && (
                <div className="relative w-full h-40 overflow-hidden">
                    <img
                        src={coverPhoto.url}
                        alt={coverPhoto.caption || `${offer.offer_name} asset`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                    />
                    {/* readability scrim into the card body */}
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
            )}
            <CardHeader className="pb-3">
                {/* Type badge + LTV */}
                <div className="flex justify-between items-start">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${theme.badge}`}>
                        <TypeIcon className="w-3 h-3" />
                        {theme.label}
                    </span>
                    {offer.collateral_ltv && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            LTV {Number(offer.collateral_ltv).toFixed(0)}%
                        </span>
                    )}
                </div>

                {/* Offer name */}
                <CardTitle className="text-xl mt-2">{offer.offer_name}</CardTitle>

                {/* Company name */}
                <div className="flex items-center gap-1.5 text-xs text-[hsl(43_45%_55%)] font-medium">
                    <span>{offer.company?.name || 'Issuer'}</span>
                </div>
            </CardHeader>

            {/* flex-grow pushes footer to bottom — cards align regardless of content */}
            <CardContent className="space-y-4 flex-1 flex flex-col">
                {/* Financial data grid */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-black/20 rounded-lg text-center">
                        <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                            <DollarSign className="w-3 h-3" />
                            Price
                        </div>
                        <span className="text-sm font-semibold text-white">${unitPrice}</span>
                    </div>
                    <div className="p-2.5 bg-black/20 rounded-lg text-center">
                        <div className="text-[11px] text-muted-foreground mb-0.5">
                            Raise
                        </div>
                        <span className="text-sm font-semibold text-white">
                            ${totalRaise >= 1000 ? `${(totalRaise / 1000).toFixed(0)}K` : totalRaise.toLocaleString()}
                        </span>
                    </div>
                    <div className="p-2.5 bg-black/20 rounded-lg text-center">
                        <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                            <Clock className="w-3 h-3" />
                            Payout
                        </div>
                        <span className="text-sm font-semibold text-white">{paymentLabel}</span>
                    </div>
                </div>

                {/* APY — hero metric, color-coded by type */}
                {(offer.investor_rate ?? offer.annual_interest_rate) && (
                    <div className={`flex items-center justify-between p-3 rounded-lg border ${theme.accentBg}`}>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Percent className={`w-4 h-4 ${theme.apyColor}`} />
                            APY
                        </div>
                        <span className={`text-lg font-bold ${theme.apyColor}`}>
                            {parseFloat((offer.investor_rate ?? offer.annual_interest_rate)!.toString())}%
                        </span>
                    </div>
                )}

                {/* Maturity — always rendered, takes space even when empty */}
                <div className="flex items-center justify-between text-sm mt-auto">
                    {offer.maturity_date ? (
                        <>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Calendar className="w-4 h-4" />
                                Maturity
                            </div>
                            <span>{new Date(offer.maturity_date).toLocaleDateString()}</span>
                        </>
                    ) : (
                        <div className="h-5" /> /* spacer for alignment */
                    )}
                </div>
            </CardContent>

            <CardFooter>
                <Button
                    className={`w-full text-white shadow-sm ${theme.button}`}
                    onClick={() => onInvest(offer.id)}
                >
                    View Details
                </Button>
            </CardFooter>
        </Card>
    );
}
