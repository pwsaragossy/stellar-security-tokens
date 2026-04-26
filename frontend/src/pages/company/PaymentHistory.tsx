/**
 * Company Payment History
 * Full payment history across all offers, grouped by offer with filtering
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    History, ExternalLink, DollarSign, Users, TrendingUp,
    Loader2, Filter, ChevronDown, ChevronUp,
} from "lucide-react";
import { companyPaymentsApi } from "@/api/companyPayments";

interface PaymentRecord {
    id: number;
    offerId: number;
    offerName: string;
    offerAssetCode: string;
    offerPaymentType: string;
    investorId: number;
    investor: { id: number; name: string; email: string };
    usdcAmount: string;
    grossAmount?: string;
    netAmount?: string;
    platformFeeAmount?: string;
    transactionHash: string;
    paymentDate: string;
    paymentType: string;
    status: string;
    createdAt: string;
}

const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/tx/';

export function PaymentHistory() {
    const navigate = useNavigate();
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterOffer, setFilterOffer] = useState<number | 'all'>('all');
    const [expandedOffers, setExpandedOffers] = useState<Set<number>>(new Set());

    useEffect(() => {
        companyPaymentsApi.getAllPaymentHistory()
            .then(res => setPayments(res.data || []))
            .catch(() => setPayments([]))
            .finally(() => setLoading(false));
    }, []);

    // Group payments by offer
    const offerGroups = useMemo(() => {
        const groups = new Map<number, { offerName: string; assetCode: string; paymentType: string; payments: PaymentRecord[] }>();
        for (const p of payments) {
            if (!groups.has(p.offerId)) {
                groups.set(p.offerId, {
                    offerName: p.offerName,
                    assetCode: p.offerAssetCode,
                    paymentType: p.offerPaymentType,
                    payments: [],
                });
            }
            groups.get(p.offerId)!.payments.push(p);
        }
        return groups;
    }, [payments]);

    // Filtered groups
    const filteredGroups = useMemo(() => {
        if (filterOffer === 'all') return offerGroups;
        const filtered = new Map<number, typeof offerGroups extends Map<number, infer V> ? V : never>();
        if (offerGroups.has(filterOffer)) {
            filtered.set(filterOffer, offerGroups.get(filterOffer)!);
        }
        return filtered;
    }, [offerGroups, filterOffer]);

    // Summary stats
    const stats = useMemo(() => {
        const completed = payments.filter(p => p.status === 'completed');
        return {
            totalPayments: completed.length,
            totalPaid: completed.reduce((s, p) => s + Number(p.usdcAmount || 0), 0),
            totalFees: completed.reduce((s, p) => s + Number(p.platformFeeAmount || 0), 0),
            uniqueInvestors: new Set(completed.map(p => p.investorId)).size,
        };
    }, [payments]);

    const toggleOffer = (offerId: number) => {
        setExpandedOffers(prev => {
            const next = new Set(prev);
            if (next.has(offerId)) next.delete(offerId);
            else next.add(offerId);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="animate-fade-in">
                <h2 className="text-2xl font-bold text-white font-heading">Payment History</h2>
                <p className="text-muted-foreground">All yield payments across your offers</p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up animate-delay-1">
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <History className="w-4 h-4" />
                            <span className="text-xs">Total Payments</span>
                        </div>
                        <p className="text-xl font-bold text-white font-mono">{stats.totalPayments}</p>
                    </CardContent>
                </Card>
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-xs">Total Paid</span>
                        </div>
                        <p className="text-xl font-bold text-emerald-400 font-mono">
                            ${stats.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                    </CardContent>
                </Card>
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs">Platform Fees</span>
                        </div>
                        <p className="text-xl font-bold text-purple-400 font-mono">
                            ${stats.totalFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                    </CardContent>
                </Card>
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Users className="w-4 h-4" />
                            <span className="text-xs">Investors Paid</span>
                        </div>
                        <p className="text-xl font-bold text-white font-mono">{stats.uniqueInvestors}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filter */}
            {offerGroups.size > 1 && (
                <div className="flex items-center gap-2 animate-fade-in-up animate-delay-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <select
                        value={filterOffer}
                        onChange={e => setFilterOffer(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="all">All Offers</option>
                        {Array.from(offerGroups.entries()).map(([offerId, group]) => (
                            <option key={offerId} value={offerId}>
                                {group.offerName} ({group.assetCode})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Payment Groups */}
            {payments.length === 0 ? (
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardContent className="p-12 text-center">
                        <History className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                        <p className="text-muted-foreground">No payments recorded yet.</p>
                        <p className="text-sm text-muted-foreground/60 mt-1">Payments will appear here after you pay investors.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4 animate-fade-in-up animate-delay-2">
                    {Array.from(filteredGroups.entries()).map(([offerId, group]) => {
                        const isExpanded = expandedOffers.has(offerId);
                        const totalForOffer = group.payments
                            .filter(p => p.status === 'completed')
                            .reduce((s, p) => s + Number(p.usdcAmount || 0), 0);

                        return (
                            <Card key={offerId} className="glass-panel border-white/5 bg-white/5">
                                <CardHeader
                                    className="cursor-pointer select-none"
                                    onClick={() => toggleOffer(offerId)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-base font-heading">
                                                {group.offerName}
                                            </CardTitle>
                                            <CardDescription className="flex items-center gap-2 mt-0.5">
                                                <span className="font-mono text-xs">{group.assetCode}</span>
                                                <span className="text-xs">•</span>
                                                <span className="text-xs capitalize">{group.paymentType}</span>
                                                <span className="text-xs">•</span>
                                                <span className="text-xs">{group.payments.length} payment{group.payments.length !== 1 ? 's' : ''}</span>
                                            </CardDescription>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm text-emerald-400 font-mono">
                                                ${totalForOffer.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </span>
                                            {isExpanded
                                                ? <ChevronUp className="w-4 h-4 text-zinc-500" />
                                                : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                                        </div>
                                    </div>
                                </CardHeader>
                                {isExpanded && (
                                    <CardContent>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-white/5">
                                                        <th className="pb-2 pr-4">Date</th>
                                                        <th className="pb-2 pr-4">Investor</th>
                                                        <th className="pb-2 pr-4">Amount</th>
                                                        <th className="pb-2 pr-4">Fee</th>
                                                        <th className="pb-2 pr-4">TX</th>
                                                        <th className="pb-2">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {group.payments.map(p => {
                                                        const amount = Number(p.usdcAmount || 0);
                                                        const fee = Number(p.platformFeeAmount || 0);
                                                        return (
                                                            <tr key={p.id} className="text-zinc-300">
                                                                <td className="py-2.5 pr-4 whitespace-nowrap">
                                                                    {new Date(p.paymentDate).toLocaleDateString()}
                                                                </td>
                                                                <td className="py-2.5 pr-4">
                                                                    {p.investor?.name || `#${p.investorId}`}
                                                                </td>
                                                                <td className="py-2.5 pr-4 font-mono text-emerald-400">
                                                                    ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                                </td>
                                                                <td className="py-2.5 pr-4 font-mono text-purple-400/70">
                                                                    {fee > 0
                                                                        ? `$${fee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                                                        : '—'}
                                                                </td>
                                                                <td className="py-2.5 pr-4">
                                                                    {p.transactionHash ? (
                                                                        <a
                                                                            href={`${EXPLORER_BASE}${p.transactionHash}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-mono text-xs"
                                                                        >
                                                                            {p.transactionHash.slice(0, 8)}...
                                                                            <ExternalLink className="w-3 h-3" />
                                                                        </a>
                                                                    ) : (
                                                                        <span className="text-zinc-600">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="py-2.5">
                                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                                        p.status === 'completed'
                                                                            ? 'bg-emerald-500/10 text-emerald-400'
                                                                            : p.status === 'failed'
                                                                                ? 'bg-red-500/10 text-red-400'
                                                                                : 'bg-amber-500/10 text-amber-400'
                                                                    }`}>
                                                                        {p.status}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-white/5">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/company/payments/${offerId}`); }}
                                                className="text-xs"
                                            >
                                                <DollarSign className="w-3 h-3 mr-1" />
                                                Pay Investors
                                            </Button>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default PaymentHistory;
