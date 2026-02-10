
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useOffers } from "@/hooks/useOffers";
import { OfferCard } from "@/components/ui/offer-card";
import { Search, Loader2, TrendingUp, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Marketplace() {
    const { offers, loading, error } = useOffers();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'collateral'>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'apy' | 'maturity'>('newest');

    const SORT_OPTIONS = [
        { key: 'newest' as const, label: 'Newest' },
        { key: 'apy' as const, label: 'Highest APY' },
        { key: 'maturity' as const, label: 'Soonest Maturity' },
    ];

    const TYPE_CHIPS = [
        { key: 'all' as const, label: 'All' },
        { key: 'sale' as const, label: 'Equity' },
        { key: 'collateral' as const, label: 'Debt' },
    ];

    // HIG: Start search immediately on type + filter by type + sort
    const filteredOffers = useMemo(() => {
        let result = [...offers];

        // Type filter
        if (typeFilter !== 'all') {
            result = result.filter(o => o.offer_type === typeFilter);
        }

        // Search filter
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(o =>
                o.offer_name?.toLowerCase().includes(q) ||
                o.asset_code?.toLowerCase().includes(q) ||
                o.description?.toLowerCase().includes(q) ||
                o.company?.name?.toLowerCase().includes(q)
            );
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === 'apy') {
                return (b.annual_interest_rate || 0) - (a.annual_interest_rate || 0);
            }
            if (sortBy === 'maturity') {
                const dateA = a.maturity_date ? new Date(a.maturity_date).getTime() : Infinity;
                const dateB = b.maturity_date ? new Date(b.maturity_date).getTime() : Infinity;
                return dateA - dateB;
            }
            // newest — by created_at DESC
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });

        return result;
    }, [offers, search, typeFilter, sortBy]);

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

    // Stats computed from loaded data
    const totalOffers = offers.length;
    const totalRaise = offers.reduce((sum, o) => sum + (o.total_supply || 0) * (o.unit_price || 1), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Active Opportunities</h2>
                    {/* Stats inline — compact */}
                    <p className="text-muted-foreground">
                        {totalOffers} active offer{totalOffers !== 1 ? 's' : ''} · ${totalRaise >= 1_000_000 ? `${(totalRaise / 1_000_000).toFixed(1)}M` : totalRaise >= 1000 ? `${(totalRaise / 1000).toFixed(0)}K` : totalRaise.toLocaleString()} total raise
                    </p>
                </div>
                {/* HIG Search: descriptive placeholder, immediate filtering, clear button */}
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-4 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, asset, or company..."
                        className="pl-10 pr-10 h-11 bg-white/[0.03] border-white/10 rounded-xl focus:border-[hsl(43_45%_55%/0.5)] focus:ring-1 focus:ring-[hsl(43_45%_55%/0.3)]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-3 text-muted-foreground hover:text-white transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Filter bar — HIG: group related controls */}
            <div className="flex items-center justify-between gap-4 animate-fade-in">
                {/* Type filter chips */}
                <div className="flex items-center gap-2">
                    {TYPE_CHIPS.map(chip => (
                        <button
                            key={chip.key}
                            onClick={() => setTypeFilter(chip.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${typeFilter === chip.key
                                ? 'bg-[hsl(43_45%_55%/0.2)] text-[hsl(43_45%_55%)] border border-[hsl(43_45%_55%/0.4)]'
                                : 'bg-white/[0.03] text-muted-foreground border border-white/10 hover:bg-white/[0.06] hover:text-white'
                                }`}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
                {/* Sort dropdown */}
                <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                        className="bg-white/[0.03] border border-white/10 text-sm text-muted-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-[hsl(43_45%_55%/0.5)] appearance-none cursor-pointer"
                    >
                        {SORT_OPTIONS.map(opt => (
                            <option key={opt.key} value={opt.key} className="bg-slate-900">
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {error ? (
                <div className="p-8 text-center border border-dashed border-red-500/20 rounded-2xl text-red-400 bg-red-500/[0.03] animate-fade-in">
                    {error}
                </div>
            ) : filteredOffers.length === 0 ? (
                <div className="p-16 text-center border border-dashed border-white/10 rounded-2xl animate-fade-in">
                    <div className="flex flex-col items-center gap-4">
                        <div className="p-5 rounded-2xl bg-muted/30">
                            <TrendingUp className="w-10 h-10 text-muted-foreground/50" />
                        </div>
                        <div className="space-y-2">
                            {search ? (
                                <>
                                    <p className="text-lg font-medium">No matches found</p>
                                    <p className="text-sm text-muted-foreground">
                                        No offers match "{search}". Try a different search term.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-lg font-medium">No active offers</p>
                                    <p className="text-sm text-muted-foreground">Check back soon for new investment opportunities.</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredOffers.map((offer, index) => (
                        <div
                            key={offer.id}
                            className="animate-fade-in-up"
                            style={{ animationDelay: `${index * 0.08}s`, opacity: 0 }}
                        >
                            <OfferCard
                                offer={offer}
                                onInvest={(id) => navigate(`/market/${id}`)}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
