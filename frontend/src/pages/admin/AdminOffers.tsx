import { useState, useEffect, useCallback } from 'react';
import {
    Search,
    Loader2,
    FileText,
    Building2,
    DollarSign,
    Landmark,
    Zap,
    Wallet,
    Check,
    Copy,
    Clock,
    RefreshCw,
    Inbox,
    AlertTriangle,
    Rocket,
    ExternalLink,
    Lock, Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

import { toast } from 'sonner';
import api from '@/api/client';
import { offersApi } from '@/api/offers';
import type { Offer } from '@/types';
import { RelatedEntities } from '@/components/admin/RelatedEntities';
import { useAutoSelect } from '@/hooks/useAdminNavigation';

// ─── Types ────────────────────────────────────────────────────────────────

type ActionType = 'issue' | 'activate' | 'verify' | 'deploy_settlement' | 'execute_settlement' | null;
type StatusFilter = 'all' | 'approved' | 'active' | 'matured' | 'rejected' | 'closed';

interface SettlementStatus {
    offerId: number;
    offerType: string;
    offerStatus: string;
    settlementContractId: string | null;
    contractBalance: number | null;
    maturityDate: string | null;
    hasSettlementContract: boolean;
}

// ─── Design tokens ────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
    approved: 'bg-blue-400',
    active: 'bg-emerald-400',
    rejected: 'bg-red-400',
    closed: 'bg-zinc-400',
    paused: 'bg-yellow-400',
    matured: 'bg-purple-400',
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    approved: { label: 'Approved', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    rejected: { label: 'Declined', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
    closed: { label: 'Completed', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
    paused: { label: 'Paused', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    matured: { label: 'Matured', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
};

const FILTER_CONFIG: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'approved', label: 'Approved' },
    { key: 'active', label: 'Active' },
    { key: 'matured', label: 'Matured' },
    { key: 'rejected', label: 'Declined' },
    { key: 'closed', label: 'Completed' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(value: string | number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
        typeof value === 'string' ? parseFloat(value) : value
    );
}

// ─── Component ────────────────────────────────────────────────────────────

export function AdminOffers() {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const [selected, setSelected] = useState<Offer | null>(null);
    const [pendingIssuances, setPendingIssuances] = useState<number[]>([]);

    // Settlement
    const [settlementStatus, setSettlementStatus] = useState<SettlementStatus | null>(null);
    const [settlementLoading, setSettlementLoading] = useState(false);

    // Action dialog state
    const [actionDialog, setActionDialog] = useState<{ type: ActionType; offer: Offer | null }>({ type: null, offer: null });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ─── Data loading ─────────────────────────────────────────────────────

    const loadOffers = async () => {
        try {
            setLoading(true);
            const [offersResponse, pendingResponse] = await Promise.all([
                offersApi.getAllAdmin(),
                api.get('/admin/transactions/pending'),
            ]);

            if (offersResponse.success && offersResponse.data) {
                // Exclude pending offers — those are handled in the Approvals tab
                const nonPendingOffers = offersResponse.data.filter(
                    (o: Offer) => !['pending_review', 'under_review'].includes(o.status)
                );
                setOffers(nonPendingOffers);
            } else {
                setError(offersResponse.error || 'Failed to load offers');
            }

            if (pendingResponse.data.success) {
                const issuingOfferIds = pendingResponse.data.data.transactions
                    .filter((tx: any) => ['token_issue', 'sac_deploy', 'sale_deploy', 'sale_create', 'contract_deposit_auth', 'contract_deposit_transfer', 'contract_resume'].includes(tx.operationType))
                    .map((tx: any) => tx.metadata?.offerId)
                    .filter(Boolean);
                setPendingIssuances(issuingOfferIds);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOffers();
        const interval = setInterval(loadOffers, 30000);
        return () => clearInterval(interval);
    }, []);

    // Keep selected in sync
    useEffect(() => {
        if (selected) {
            const updated = offers.find((o) => o.id === selected.id);
            if (updated) setSelected(updated);
            else setSelected(null);
        }
    }, [offers]);

    // Load settlement status when selecting a matured/collateral offer
    useEffect(() => {
        if (selected && selected.offer_type === 'collateral' && ['matured', 'active'].includes(selected.status)) {
            loadSettlementStatus(selected.id);
        } else {
            setSettlementStatus(null);
        }
    }, [selected?.id]);

    const loadSettlementStatus = async (offerId: number) => {
        try {
            setSettlementLoading(true);
            const res = await offersApi.getSettlementStatus(offerId);
            if (res.success && res.data) {
                setSettlementStatus(res.data);
            }
        } catch {
            setSettlementStatus(null);
        } finally {
            setSettlementLoading(false);
        }
    };

    // Auto-select from URL ?id= param (for cross-navigation)
    const handleAutoSelect = useCallback((id: number) => {
        const offer = offers.find(o => o.id === id);
        if (offer) setSelected(offer);
    }, [offers]);
    useAutoSelect(handleAutoSelect);

    // ─── Actions ──────────────────────────────────────────────────────────



    const closeAction = () => {
        setActionDialog({ type: null, offer: null });
    };

    const handleAction = async () => {
        const { type, offer } = actionDialog;
        if (!offer || !type) return;
        setIsSubmitting(true);
        setError(null);

        try {
            let response;
            if (type === 'issue') {
                response = await offersApi.issueToken(offer.id);
            } else if (type === 'activate') {
                response = await offersApi.activate(offer.id);
            } else if (type === 'verify') {
                response = await offersApi.verifyIssuance(offer.id);
            } else if (type === 'deploy_settlement') {
                response = await offersApi.deploySettlement(offer.id);
            } else if (type === 'execute_settlement') {
                response = await offersApi.executeSettlement(offer.id);
            }

            if (response && response.success) {
                const MSG: Record<string, string> = {
                    issue: 'Token issued successfully',
                    activate: 'Offer activated',
                    verify: 'Issuance verified',
                    deploy_settlement: 'Settlement contract deployed',
                    execute_settlement: 'Settlement executed — offer closed',
                };
                toast.success(MSG[type] || `${type} completed`);
                await loadOffers();
                // Refresh settlement status after deploy/settle
                if (['deploy_settlement', 'execute_settlement'].includes(type)) {
                    await loadSettlementStatus(offer.id);
                }
                closeAction();
            } else {
                setError(response?.error || `Failed to ${type} offer`);
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Filtered list ────────────────────────────────────────────────────

    const filteredOffers = offers.filter((offer) => {
        const matchesSearch = offer.offer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || offer.asset_code?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || offer.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const counts: Record<StatusFilter, number> = {
        all: offers.length,
        approved: offers.filter((o) => o.status === 'approved').length,
        active: offers.filter((o) => o.status === 'active').length,
        matured: offers.filter((o) => o.status === 'matured').length,
        rejected: offers.filter((o) => o.status === 'rejected').length,
        closed: offers.filter((o) => o.status === 'closed').length,
    };

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Filter chips + search */}
            <div className="flex flex-wrap items-center gap-2">
                {FILTER_CONFIG.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setStatusFilter(key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === key
                            ? 'bg-white/10 text-white border border-white/20'
                            : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06]'
                            }`}
                    >
                        {label}
                        {counts[key] > 0 && (
                            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${statusFilter === key ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-zinc-500'}`}>
                                {counts[key]}
                            </span>
                        )}
                    </button>
                ))}

                <div className="ml-auto flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <Input
                            placeholder="Search offers…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 h-8 w-56 text-sm bg-white/[0.03] border-white/[0.06]"
                        />
                    </div>
                    <Button variant="outline" size="sm" onClick={loadOffers} disabled={loading} className="gap-1.5">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Banners */}
            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <Button variant="ghost" size="sm" onClick={() => setError(null)} className="h-6 px-2 text-xs hover:bg-white/10">Dismiss</Button>
                </div>
            )}


            {/* Split pane */}
            <div className="grid grid-cols-[minmax(420px,2fr)_3fr] gap-4 min-h-[calc(100vh-220px)]">
                {/* ── Left: Offer list ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="grid grid-cols-[32px_1fr_90px_80px] gap-2 items-center px-3 py-2 border-b border-white/[0.06] text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                        <span></span>
                        <span>Offer</span>
                        <span className="text-right">Supply</span>
                        <span className="text-right">Created</span>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            </div>
                        ) : filteredOffers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <FileText className="w-8 h-8 text-zinc-700 mb-2" />
                                <p className="text-sm text-zinc-500">No offers found</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.04]">
                                {filteredOffers.map((offer) => {
                                    const isSelected = selected?.id === offer.id;
                                    const isPending = pendingIssuances.includes(offer.id);
                                    return (
                                        <button
                                            key={offer.id}
                                            onClick={() => setSelected(offer)}
                                            className={`w-full text-left grid grid-cols-[32px_1fr_90px_80px] gap-2 items-center px-3 py-2.5 transition-colors hover:bg-white/[0.04] ${isSelected
                                                ? 'bg-white/[0.06] border-l-2 border-l-blue-500'
                                                : 'border-l-2 border-l-transparent'
                                                }`}
                                        >
                                            {/* Asset code badge */}
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center text-[9px] font-bold text-zinc-300 tracking-tight">
                                                {offer.asset_code?.substring(0, 3) || '?'}
                                            </div>

                                            {/* Name + Company + Status */}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-[13px] font-medium text-white truncate">{offer.offer_name}</p>
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${isPending ? 'bg-blue-400 animate-pulse' : STATUS_DOT[offer.status] || 'bg-zinc-500'}`} title={isPending ? 'Issuing...' : offer.status} />
                                                </div>
                                                <p className="text-[11px] text-zinc-500 truncate">
                                                    {(offer as any).company?.name || 'Unknown'} · {offer.asset_code}
                                                </p>
                                            </div>

                                            {/* Supply */}
                                            <p className="text-[12px] text-zinc-400 text-right font-mono">
                                                {formatCurrency(offer.total_supply || '0')}
                                            </p>

                                            {/* Date */}
                                            <p className="text-[11px] text-zinc-500 text-right">
                                                {formatDate(offer.created_at)}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: Detail panel ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    {!selected ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                            <Inbox className="w-10 h-10 text-zinc-700 mb-3" />
                            <p className="text-sm text-zinc-500">Select an offer to view details</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* Header */}
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center text-sm font-bold text-zinc-300">
                                        {selected.asset_code?.substring(0, 3) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-white">{selected.offer_name}</h3>
                                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                                            <Building2 className="w-3.5 h-3.5" />
                                            {(selected as any).company?.name || 'Unknown Company'}
                                        </div>
                                    </div>
                                    {(() => {
                                        if (pendingIssuances.includes(selected.id)) {
                                            return (
                                                <Badge variant="outline" className="shrink-0 bg-blue-500/15 text-blue-400 border-blue-500/30 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> Issuing...
                                                </Badge>
                                            );
                                        }
                                        const cfg = STATUS_BADGE[selected.status];
                                        return cfg ? (
                                            <Badge variant="outline" className={`shrink-0 ${cfg.className}`}>{cfg.label}</Badge>
                                        ) : (
                                            <Badge variant="outline" className="shrink-0">{selected.status}</Badge>
                                        );
                                    })()}
                                </div>

                                {/* Cross-links */}
                                <RelatedEntities items={[
                                    ...((selected as any).company ? [{ tab: 'companies' as const, id: (selected as any).company.id, label: (selected as any).company.name }] : []),
                                    ...(selected.token ? [{ tab: 'tokens' as const, id: selected.token.id, label: selected.token.assetCode || selected.asset_code }] : []),
                                    ...((selected as any).sorobanContractId ? [{ tab: 'contracts' as const, id: selected.id, label: `${(selected as any).sorobanContractId?.slice(0, 12)}…` }] : []),
                                ]} />

                                {/* Info grid */}
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Type</p>
                                        <p className="text-sm font-medium text-white capitalize">{selected.offer_type}</p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Total Supply</p>
                                        <p className="text-sm font-medium text-white">{formatCurrency(selected.total_supply || '0')}</p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Interest Rate</p>
                                        <p className="text-sm font-medium text-emerald-400">
                                            {selected.annual_interest_rate ? `${selected.annual_interest_rate}% APY` : '—'}
                                        </p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Maturity</p>
                                        <p className="text-sm font-medium text-white">
                                            {selected.maturity_date ? formatDate(selected.maturity_date) : '—'}
                                        </p>
                                    </div>
                                </div>

                                {/* Extra info row */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Payment</p>
                                        <p className="text-sm text-white capitalize">{(selected as any).payment_type?.replace('_', ' ') || (selected as any).paymentType?.replace('_', ' ') || '—'}</p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Unit Price</p>
                                        <p className="text-sm font-mono text-white">{(selected as any).unit_price || (selected as any).unitPrice || '—'}</p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        {(selected as any).isTokenLocked !== false ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-emerald-400" />}
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Token</p>
                                            <p className="text-sm text-white">{(selected as any).isTokenLocked !== false ? 'Locked' : 'Unlocked'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                {selected.description && (
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Description</h4>
                                        <p className="text-sm text-zinc-300 leading-relaxed">{selected.description}</p>
                                    </div>
                                )}

                                {/* Token / SAC info */}
                                {selected.token?.sacContractId && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <DollarSign className="w-3 h-3" /> Token
                                        </h4>
                                        <div className="bg-emerald-500/5 rounded-lg border border-emerald-500/10 p-3">
                                            <p className="text-[10px] text-emerald-400 uppercase font-bold mb-1">Soroban SAC ID</p>
                                            <div className="flex items-center gap-2">
                                                <code className="text-xs text-emerald-300 font-mono break-all flex-1">
                                                    {selected.token.sacContractId}
                                                </code>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 hover:bg-emerald-500/10 text-emerald-400"
                                                    onClick={() => navigator.clipboard.writeText(selected.token?.sacContractId || '')}
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Rejection reason */}
                                {selected.status === 'rejected' && selected.rejection_reason && (
                                    <div className="bg-red-500/5 rounded-lg border border-red-500/10 p-3">
                                        <p className="text-[10px] text-red-400 uppercase font-bold mb-1">Rejection Reason</p>
                                        <p className="text-sm text-red-300">{selected.rejection_reason}</p>
                                    </div>
                                )}

                                {/* ── Settlement Panel (matured debt offers) ── */}
                                {selected.offer_type === 'collateral' && ['matured', 'active'].includes(selected.status) && (
                                    <div className="bg-purple-500/5 rounded-xl border border-purple-500/15 p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Landmark className="w-4 h-4 text-purple-400" />
                                            <h4 className="text-sm font-semibold text-purple-300">Bullet Maturity Settlement</h4>
                                            {settlementLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 ml-auto" />}
                                        </div>

                                        {settlementStatus ? (
                                            <>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="bg-white/[0.03] rounded-lg p-2.5">
                                                        <p className="text-[10px] text-zinc-500 mb-0.5">Contract</p>
                                                        <p className="text-xs font-mono text-white truncate">
                                                            {settlementStatus.settlementContractId
                                                                ? `${settlementStatus.settlementContractId.slice(0, 8)}…`
                                                                : '—'}
                                                        </p>
                                                    </div>
                                                    <div className="bg-white/[0.03] rounded-lg p-2.5">
                                                        <p className="text-[10px] text-zinc-500 mb-0.5">Balance</p>
                                                        <p className={`text-xs font-mono font-medium ${
                                                            (settlementStatus.contractBalance ?? 0) > 0 ? 'text-emerald-400' : 'text-zinc-400'
                                                        }`}>
                                                            {settlementStatus.contractBalance != null
                                                                ? `${settlementStatus.contractBalance.toLocaleString()} USDC`
                                                                : '—'}
                                                        </p>
                                                    </div>
                                                    <div className="bg-white/[0.03] rounded-lg p-2.5">
                                                        <p className="text-[10px] text-zinc-500 mb-0.5">Status</p>
                                                        <p className="text-xs font-medium">
                                                            {!settlementStatus.hasSettlementContract ? (
                                                                <span className="text-amber-400">No Contract</span>
                                                            ) : (settlementStatus.contractBalance ?? 0) > 0 ? (
                                                                <span className="text-emerald-400">Ready to Settle</span>
                                                            ) : (
                                                                <span className="text-zinc-400">Awaiting Deposit</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                {settlementStatus.settlementContractId && (
                                                    <div className="flex items-center gap-2 bg-purple-500/5 rounded-lg px-3 py-1.5 border border-purple-500/10">
                                                        <code className="text-[11px] text-purple-300 font-mono flex-1 truncate">
                                                            {settlementStatus.settlementContractId}
                                                        </code>
                                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-purple-400"
                                                            onClick={() => navigator.clipboard.writeText(settlementStatus.settlementContractId || '')}>
                                                            <Copy className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </>
                                        ) : !settlementLoading ? (
                                            <p className="text-xs text-zinc-500">No settlement contract deployed yet.</p>
                                        ) : null}

                                        {/* Settlement actions */}
                                        <div className="flex items-center gap-2 pt-1">
                                            {!settlementStatus?.hasSettlementContract && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                                                    onClick={() => setActionDialog({ type: 'deploy_settlement', offer: selected })}
                                                >
                                                    <Wallet className="w-3.5 h-3.5" /> Deploy Contract
                                                </Button>
                                            )}
                                            {settlementStatus?.hasSettlementContract && (settlementStatus.contractBalance ?? 0) > 0 && (
                                                <Button
                                                    size="sm"
                                                    className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                                                    onClick={() => setActionDialog({ type: 'execute_settlement', offer: selected })}
                                                >
                                                    <Zap className="w-3.5 h-3.5" /> Execute Settlement
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="gap-1 text-zinc-400 ml-auto"
                                                onClick={() => loadSettlementStatus(selected.id)}
                                                disabled={settlementLoading}
                                            >
                                                <RefreshCw className={`w-3 h-3 ${settlementLoading ? 'animate-spin' : ''}`} /> Refresh
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Asset code + dates */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Asset Code</p>
                                        <p className="text-sm font-mono text-white">{selected.asset_code}</p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Created</p>
                                        <p className="text-sm text-white">{formatDate(selected.created_at)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Action footer */}
                            <div className="border-t border-white/[0.06] px-5 py-3 flex items-center gap-2">
                                {pendingIssuances.includes(selected.id) && (
                                    <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30 flex items-center gap-1">
                                        <Clock className="w-3 h-3 animate-pulse" /> Awaiting MultiSig
                                    </Badge>
                                )}
                                {selected.token?.sacContractId && (
                                    <a
                                        href={`https://stellar.expert/explorer/testnet/contract/${selected.token.sacContractId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-auto"
                                    >
                                        <Button size="sm" variant="ghost" className="gap-1.5 text-zinc-400">
                                            <ExternalLink className="w-3.5 h-3.5" /> Explorer
                                        </Button>
                                    </a>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>


            {/* ── Issue Token Dialog ── */}
            <Dialog open={actionDialog.type === 'issue' && !!actionDialog.offer} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-blue-400">Issue Token</DialogTitle>
                        <DialogDescription>This will create the token on the Stellar network for "{actionDialog.offer?.offer_name}".</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                            Issue Token
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Activate Dialog ── */}
            <Dialog open={actionDialog.type === 'activate' && !!actionDialog.offer} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-primary">Activate Offer</DialogTitle>
                        <DialogDescription>This will make "{actionDialog.offer?.offer_name}" available for investors.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
                            Activate
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Verify Dialog ── */}
            <Dialog open={actionDialog.type === 'verify' && !!actionDialog.offer} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-emerald-400">Verify Issuance</DialogTitle>
                        <DialogDescription>Are you sure you want to verify the token issuance for "{actionDialog.offer?.offer_name}"? This will enable the company to launch the offer.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Verify & Enable
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Deploy Settlement Contract Dialog ── */}
            <Dialog open={actionDialog.type === 'deploy_settlement' && !!actionDialog.offer} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-purple-400 flex items-center gap-2">
                            <Wallet className="w-5 h-5" /> Deploy Settlement Contract
                        </DialogTitle>
                        <DialogDescription>
                            This will deploy a MaturitySettlement Soroban contract for "{actionDialog.offer?.offer_name}".
                            The company will then deposit USDC into this contract before you can trigger settlement.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wallet className="w-4 h-4 mr-2" />}
                            Deploy Contract
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Execute Settlement Dialog ── */}
            <Dialog open={actionDialog.type === 'execute_settlement' && !!actionDialog.offer} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-purple-400 flex items-center gap-2">
                            <Zap className="w-5 h-5" /> Execute Settlement
                        </DialogTitle>
                        <DialogDescription>
                            This will execute the full bullet maturity settlement for "{actionDialog.offer?.offer_name}".
                            The contract will pay all investors their principal + interest, burn their tokens,
                            send the platform fee to treasury, and close the offer. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    {settlementStatus && (
                        <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20 space-y-1.5">
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">Contract Balance</span>
                                <span className="text-emerald-400 font-mono font-medium">
                                    {(settlementStatus.contractBalance ?? 0).toLocaleString()} USDC
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">Contract</span>
                                <span className="text-purple-300 font-mono text-xs">
                                    {settlementStatus.settlementContractId?.slice(0, 16)}…
                                </span>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                            Execute Settlement
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default AdminOffers;
