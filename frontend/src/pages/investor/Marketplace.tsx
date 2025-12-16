
import { useOffers } from "@/hooks/useOffers";
import { OfferCard } from "@/components/ui/offer-card";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Marketplace() {
    const { offers, loading, error } = useOffers();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">Active Opportunities</h2>
                <div className="relative w-72">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search offers..." className="pl-9 bg-white/5 border-white/10" />
                </div>
            </div>

            {error ? (
                <div className="p-8 text-center border border-dashed border-red-500/20 rounded-lg text-red-400">
                    {error}
                </div>
            ) : offers.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-white/10 rounded-lg text-muted-foreground">
                    No active offers available at the moment.
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {offers.map((offer) => (
                        <OfferCard
                            key={offer.id}
                            offer={offer}
                            onInvest={(id) => console.log('View', id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
