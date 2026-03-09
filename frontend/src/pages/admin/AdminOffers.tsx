import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Search,
    Loader2,
    FileText,
    Building2,
    DollarSign,
    Check,
    X,
    Copy,
    Clock,
    RefreshCw,
    Inbox,
    AlertTriangle,
    Rocket,
    Play,
    ExternalLink,
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
import { TransactionLink } from '@/components/ui/TransactionLink';
import { toast } from 'sonner';
import api from '@/api/client';
import { offersApi } from '@/api/offers';
import type { Offer } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────

type ActionType = 'approve' | 'reject' | 'issue' | 'activate' | 'verify' | null;
type StatusFilter = 'all' | 'pending_review' | 'approved' | 'active' | 'rejected' | 'closed';

// ─── Design tokens ────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
    pending_review: 'bg-amber-400',
    under_review: 'bg-amber-400',
    approved: 'bg-blue-400',
    active: 'bg-emerald-400',
    rejected: 'bg-red-400',
    closed: 'bg-zinc-400',
    paused: 'bg-yellow-400',
    matured: 'bg-purple-400',
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending_review: { label: 'Under Review', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    under_review: { label: 'Under Review', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    approved: { label: 'Approved', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    rejected: { label: 'Declined', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
    closed: { label: 'Completed', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
    paused: { label: 'Paused', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    matured: { label: 'Matured', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
};

const FILTER_CONFIG: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending_review', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'active', label: 'Active' },
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
    const [success, setSuccess] = useState<React.ReactNode | string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const [selected, setSelected] = useState<Offer | null>(null);
    const [pendingIssuances, setPendingIssuances] = useState<number[]>([]);

    // Action dialog state
    const [actionDialog, setActionDialog] = useState<{ type: ActionType; offer: Offer | null }>({ type: null, offer: null });
    const [rejectionReason, setRejectionReason] = useState('');
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
                setOffers(offersResponse.data);
            } else {
                setError(offersResponse.error || 'Failed to load offers');
            }

            if (pendingResponse.data.success) {
                const issuingOfferIds = pendingResponse.data.data.transactions
                    .filter((tx: any) => tx.operationType === 'token_issue')
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

    // ─── Actions ──────────────────────────────────────────────────────────

    const openAction = (offer: Offer, type: ActionType) => {
        setActionDialog({ type, offer });
        setRejectionReason('');
    };

    const closeAction = () => {
        setActionDialog({ type: null, offer: null });
        setRejectionReason('');
    };

    const handleAction = async () => {
        const { type, offer } = actionDialog;
        if (!offer || !type) return;
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            let response;
            if (type === 'approve') {
                response = await offersApi.review(offer.id, { status: 'approved' });
            } else if (type === 'reject') {
                response = await offersApi.review(offer.id, { status: 'rejected', rejection_reason: rejectionReason });
            } else if (type === 'issue') {
                response = await offersApi.issueToken(offer.id);
            } else if (type === 'activate') {
                response = await offersApi.activate(offer.id);
            } else if (type === 'verify') {
                response = await offersApi.verifyIssuance(offer.id);
            }

            if (response && response.success) {
                if (type === 'issue' && (response.data?.status === 'pending_multisig' || (response as any).status === 'pending_multisig')) {
                    setSuccess(
                        <div className="flex flex-col gap-1 text-left">
                            <span>Token issuance request queued for MultiSig approval</span>
                            <Link to="/admin/approvals" className="text-emerald-400 underline font-bold hover:text-emerald-300">
                                Go to Transaction Queue →
                            </Link>
                        </div>
                    );
                    setPendingIssuances((prev) => [...prev, offer.id]);
                } else if (type === 'issue') {
                    const txHash =
                        (response.data as any)?.stellar_transaction?.transactionHash ||
                        response.data?.transactionHash ||
                        (response as any).transactionHash;
                    setSuccess(
                        <div className="flex flex-col gap-1 text-left">
                            <span>Token issued successfully</span>
                            {txHash && (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-emerald-300">View transaction:</span>
                                    <TransactionLink hash={txHash} label="Stellar Expert" variant="link" className="text-emerald-400 underline h-auto p-0 font-bold hover:text-emerald-300 text-xs" />
                                </div>
                            )}
                        </div>
                    );
                } else {
                    toast.success(`Offer ${type}d successfully`);
                }
                await loadOffers();
                closeAction();
            } else {
                setError(response?.error || `Failed to ${type} offer`);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Filtered list ────────────────────────────────────────────────────

    const filteredOffers = offers.filter((offer) => {
        const matchesSearch = offer.offer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || offer.asset_code?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || offer.status === statusFilter || (statusFilter === 'pending_review' && offer.status === 'under_review');
        return matchesSearch && matchesStatus;
    });

    const counts: Record<StatusFilter, number> = {
        all: offers.length,
        pending_review: offers.filter((o) => o.status === 'pending_review' || o.status === 'under_review').length,
        approved: offers.filter((o) => o.status === 'approved').length,
        active: offers.filter((o) => o.status === 'active').length,
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
            {success && (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{success}</span>
                    <Button variant="ghost" size="sm" onClick={() => setSuccess(null)} className="h-6 px-2 text-xs hover:bg-white/10">Dismiss</Button>
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
                                {(selected.status === 'pending_review' || selected.status === 'under_review') && (
                                    <>
                                        <Button size="sm" onClick={() => openAction(selected, 'approve')} disabled={isSubmitting} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                                            <Check className="w-3.5 h-3.5" /> Approve
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => openAction(selected, 'reject')} disabled={isSubmitting} className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10">
                                            <X className="w-3.5 h-3.5" /> Decline
                                        </Button>
                                    </>
                                )}
                                {selected.status === 'approved' && !pendingIssuances.includes(selected.id) && !selected.token && (
                                    <Button size="sm" onClick={() => openAction(selected, 'issue')} disabled={isSubmitting} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                                        <DollarSign className="w-3.5 h-3.5" /> Issue Token
                                    </Button>
                                )}
                                {selected.token && !(selected.offer_rules as any)?.admin_verified && selected.status !== 'active' && (
                                    <Button size="sm" onClick={() => openAction(selected, 'verify')} disabled={isSubmitting} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                                        <Check className="w-3.5 h-3.5" /> Verify & Enable
                                    </Button>
                                )}
                                {selected.token && (selected.offer_rules as any)?.admin_verified && selected.status !== 'active' && (
                                    <Button size="sm" onClick={() => openAction(selected, 'activate')} disabled={isSubmitting} className="gap-1.5 bg-primary hover:bg-primary/90 text-white">
                                        <Play className="w-3.5 h-3.5" /> Activate
                                    </Button>
                                )}
                                {selected.token && selected.status !== 'active' && (
                                    <Button size="sm" variant="outline" onClick={() => openAction(selected, 'reject')} disabled={isSubmitting} className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10">
                                        <X className="w-3.5 h-3.5" /> Revoke
                                    </Button>
                                )}
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

            {/* ── Approve Dialog ── */}
            <Dialog open={actionDialog.type === 'approve' && !!actionDialog.offer} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-emerald-400">Approve Offer</DialogTitle>
                        <DialogDescription>Are you sure you want to approve "{actionDialog.offer?.offer_name}"?</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Approve
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Reject Dialog ── */}
            <Dialog open={actionDialog.type === 'reject' && !!actionDialog.offer} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-red-400">Decline Offer</DialogTitle>
                        <DialogDescription>Please provide a reason for declining "{actionDialog.offer?.offer_name}".</DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="Reason for rejection..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="bg-black/20 border-white/10"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={isSubmitting || !rejectionReason} className="bg-red-600 hover:bg-red-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <X className="w-4 h-4 mr-2" />}
                            Decline
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
        </div>
    );
}

export default AdminOffers;
