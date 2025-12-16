
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Percent, ShieldCheck } from "lucide-react";
import type { Offer } from "@/hooks/useOffers";

interface OfferCardProps {
    offer: Offer;
    onInvest: (id: number) => void;
}

export function OfferCard({ offer, onInvest }: OfferCardProps) {
    return (
        <Card className="glass-panel border-white/5 bg-white/5 hover:bg-white/10 transition-colors group">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <Badge variant={offer.offer_type === 'collateral' ? 'default' : 'secondary'}>
                        {offer.offer_type === 'collateral' ? 'Debt (CR)' : 'Equity'}
                    </Badge>
                    {offer.collateral_ltv && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            LTV {offer.collateral_ltv.toFixed(0)}%
                        </span>
                    )}
                </div>
                <CardTitle className="text-xl mt-2">{offer.offer_name}</CardTitle>
                <CardDescription className="line-clamp-2">{offer.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {offer.annual_interest_rate && (
                    <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Percent className="w-4 h-4 text-emerald-400" />
                            APY
                        </div>
                        <span className="text-lg font-bold text-emerald-400">{offer.annual_interest_rate}%</span>
                    </div>
                )}

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
                <Button className="w-full bg-blue-600 hover:bg-blue-500" onClick={() => onInvest(offer.id)}>
                    View Details
                </Button>
            </CardFooter>
        </Card>
    );
}
