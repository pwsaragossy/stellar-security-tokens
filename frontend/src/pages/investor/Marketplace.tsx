
import { useOffers } from "@/hooks/useOffers";
import { OfferCard } from "@/components/ui/offer-card";
import { Search, Loader2, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Marketplace() {
    const { offers, loading, error } = useOffers();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading opportunities...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Active Opportunities</h2>
                    <p className="text-muted-foreground">Discover tokenized investment opportunities</p>
                </div>
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-4 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search offers..."
                        className="pl-10 h-11 bg-white/[0.03] border-white/10 rounded-xl focus:border-[hsl(43_45%_55%/0.5)] focus:ring-1 focus:ring-[hsl(43_45%_55%/0.3)]"
                    />
                </div>
            </div>

            {error ? (
                <div className="p-8 text-center border border-dashed border-red-500/20 rounded-2xl text-red-400 bg-red-500/[0.03] animate-fade-in">
                    {error}
                </div>
            ) : offers.length === 0 ? (
                <div className="p-16 text-center border border-dashed border-white/10 rounded-2xl animate-fade-in">
                    <div className="flex flex-col items-center gap-4">
                        <div className="p-5 rounded-2xl bg-muted/30">
                            <TrendingUp className="w-10 h-10 text-muted-foreground/50" />
                        </div>
                        <div className="space-y-2">
                            <p className="text-lg font-medium">No active offers</p>
                            <p className="text-sm text-muted-foreground">Check back soon for new investment opportunities.</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {offers.map((offer, index) => (
                        <div
                            key={offer.id}
                            className="animate-fade-in-up"
                            style={{ animationDelay: `${index * 0.08}s`, opacity: 0 }}
                        >
                            <OfferCard
                                offer={offer}
                                onInvest={(id) => console.log('View', id)}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
