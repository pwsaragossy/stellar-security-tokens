import { useState, useEffect } from 'react';
import {
    Users,
    Building2,
    FileText,
    Lock,
    Fingerprint,
    RefreshCw,
    Loader2,
    CheckCircle,
    XCircle,
    Wallet,
    Send,

    AlertTriangle,
    Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { platformAdminsApi } from '@/api/platformAdmins';
import { offersApi } from '@/api/offers';
import { FreighterConnect } from '@/components/admin/FreighterConnect';
import { useFreighter } from '@/hooks/useFreighter';
import {
    useApprovalQueue,
    type ApprovalItem,
    type ApprovalType,
} from '@/hooks/useApprovalQueue';

// ─── Design tokens ────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ApprovalType, { icon: typeof Users; label: string; color: string; badgeCls: string }> = {
    investor: {
        icon: Users,
        label: 'Investors',
        color: 'text-teal-400',
        badgeCls: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    },
    company: {
        icon: Building2,
        label: 'Companies',
        color: 'text-slate-300',
        badgeCls: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    },
    offer: {
        icon: FileText,
        label: 'Offers',
        color: 'text-amber-400',
        badgeCls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    },
    token: {
        icon: Lock,
        label: 'Tokens',
        color: 'text-emerald-400',
        badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
    multisig: {
        icon: Fingerprint,
        label: 'Signatures',
        color: 'text-purple-400',
        badgeCls: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    },
};

const STATUS_BADGE: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function timeRemaining(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m left`;
}

// ─── Component ────────────────────────────────────────────────────────────

export function Approvals() {
    const { items, counts, loading, error, refresh } = useApprovalQueue();
    const [filter, setFilter] = useState<ApprovalType | 'all'>('all');
    const [selected, setSelected] = useState<ApprovalItem | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Reject dialog state
    const [rejectDialog, setRejectDialog] = useState<{ open: boolean; item: ApprovalItem | null }>({
        open: false,
        item: null,
    });
    const [rejectReason, setRejectReason] = useState('');

    // Sponsor dialog state
    const [sponsorDialog, setSponsorDialog] = useState<{ open: boolean; item: ApprovalItem | null }>({
        open: false,
        item: null,
    });
    const [sponsorAmount, setSponsorAmount] = useState('10');

    // Freighter for multisig
    const { device: freighterDevice, signTransaction: freighterSign, isSigning } = useFreighter();

    // Filtered items
    const filteredItems = filter === 'all' ? items : items.filter((i) => i.type === filter);

    // Keep selected item in sync after refresh
    useEffect(() => {
        if (selected) {
            const updated = items.find((i) => i.id === selected.id);
            if (updated) setSelected(updated);
            else setSelected(null);
        }
    }, [items]);

    // ─── Action handlers ──────────────────────────────────────────────────

    const handleApproveInvestor = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await platformAdminsApi.approveInvestor(item.originalId);
            toast.success(`${item.label} approved`);
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to approve');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectInvestor = async () => {
        if (!rejectDialog.item || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await platformAdminsApi.rejectInvestor(rejectDialog.item.originalId, rejectReason);
            toast.success(`${rejectDialog.item.label} rejected`);
            setRejectDialog({ open: false, item: null });
            setRejectReason('');
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSponsorInvestor = async () => {
        if (!sponsorDialog.item) return;
        setActionLoading(true);
        try {
            await platformAdminsApi.sponsorInvestorWallet(sponsorDialog.item.originalId);
            toast.success(`Wallet sponsored for ${sponsorDialog.item.label}`);
            setSponsorDialog({ open: false, item: null });
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to sponsor wallet');
        } finally {
            setActionLoading(false);
        }
    };

    const handleApproveCompany = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${item.originalId}/approve`, {});
            toast.success(`${item.label} approved`);
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to approve');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectCompany = async () => {
        if (!rejectDialog.item || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${rejectDialog.item.originalId}/reject`, {
                reason: rejectReason,
            });
            toast.success(`${rejectDialog.item.label} rejected`);
            setRejectDialog({ open: false, item: null });
            setRejectReason('');
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSponsorCompany = async () => {
        if (!sponsorDialog.item) return;
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${sponsorDialog.item.originalId}/sponsor`, {
                amount: sponsorAmount,
            });
            toast.success(`Sent ${sponsorAmount} XLM to ${sponsorDialog.item.label}`);
            setSponsorDialog({ open: false, item: null });
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to sponsor');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReviewOffer = async (item: ApprovalItem, status: 'approved' | 'rejected') => {
        if (status === 'rejected') {
            setRejectDialog({ open: true, item });
            return;
        }
        setActionLoading(true);
        try {
            await offersApi.review(item.originalId, { status });
            toast.success(`${item.label} ${status}`);
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to review offer');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectOffer = async () => {
        if (!rejectDialog.item || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await offersApi.review(rejectDialog.item.originalId, {
                status: 'rejected',
                rejection_reason: rejectReason,
            });
            toast.success(`${rejectDialog.item.label} rejected`);
            setRejectDialog({ open: false, item: null });
            setRejectReason('');
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reject offer');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUnlockToken = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await offersApi.unlockToken(item.originalId);
            toast.success(`${item.label} unlocked for trading`);
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to unlock token');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSignMultisig = async (item: ApprovalItem) => {
        if (!freighterDevice) {
            toast.error('Connect Freighter wallet first');
            return;
        }
        setActionLoading(true);
        try {
            const xdrRes = await api.get(`/admin/transactions/${item.originalId}/xdr`);
            if (!xdrRes.success) throw new Error('Failed to get transaction XDR');

            const { xdr, networkPassphrase } = xdrRes.data;
            const signResult = await freighterSign(xdr, networkPassphrase);
            if (!signResult) throw new Error('Signing cancelled');

            await api.post(`/admin/transactions/${item.originalId}/sign`, {
                publicKey: signResult.publicKey,
                signature: signResult.signature,
            });
            toast.success('Signature submitted');
            await refresh();
        } catch (err: any) {
            toast.error(err.message || 'Failed to sign');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSubmitMultisig = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await api.post(`/admin/transactions/${item.originalId}/submit`, {});
            toast.success('Transaction submitted to Stellar');
            await refresh();
        } catch (err: any) {
            toast.error(err.message || 'Failed to submit');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectMultisig = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await api.post(`/admin/transactions/${item.originalId}/reject`, {
                reason: 'Rejected by admin',
            });
            toast.success('Transaction rejected');
            await refresh();
        } catch (err: any) {
            toast.error(err.message || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    // Dispatch reject submit based on item type
    const handleRejectSubmit = () => {
        if (!rejectDialog.item) return;
        switch (rejectDialog.item.type) {
            case 'investor': return handleRejectInvestor();
            case 'company': return handleRejectCompany();
            case 'offer': return handleRejectOffer();
            default: return;
        }
    };

    // Dispatch sponsor submit based on item type
    const handleSponsorSubmit = () => {
        if (!sponsorDialog.item) return;
        switch (sponsorDialog.item.type) {
            case 'investor': return handleSponsorInvestor();
            case 'company': return handleSponsorCompany();
            default: return;
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="space-y-5">
            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2">
                <FilterChip
                    active={filter === 'all'}
                    count={counts.all}
                    label="All"
                    onClick={() => setFilter('all')}
                />
                {(Object.keys(TYPE_CONFIG) as ApprovalType[]).map((type) => {
                    const cfg = TYPE_CONFIG[type];
                    const Icon = cfg.icon;
                    return (
                        <FilterChip
                            key={type}
                            active={filter === type}
                            count={counts[type]}
                            label={cfg.label}
                            icon={<Icon className="w-3.5 h-3.5" />}
                            onClick={() => setFilter(type)}
                        />
                    );
                })}
                <div className="ml-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        disabled={loading}
                        className="gap-2"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Split pane */}
            <div className="grid grid-cols-[minmax(340px,2fr)_3fr] gap-4 min-h-[calc(100vh-260px)]">
                {/* ── Left: Master list ── */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                            Queue · {filteredItems.length} items
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <CheckCircle className="w-10 h-10 text-emerald-500/50 mb-3" />
                                <p className="text-sm text-zinc-400">All caught up</p>
                                <p className="text-xs text-zinc-600 mt-1">No pending approvals</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.04]">
                                {filteredItems.map((item) => {
                                    const cfg = TYPE_CONFIG[item.type];
                                    const Icon = cfg.icon;
                                    const isSelected = selected?.id === item.id;

                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => setSelected(item)}
                                            className={`w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.04] ${isSelected ? 'bg-white/[0.06] border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 ${cfg.color}`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-white truncate">
                                                            {item.label}
                                                        </span>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${STATUS_BADGE[item.normalizedStatus]}`}
                                                        >
                                                            {item.normalizedStatus === 'in_progress' ? 'in progress' : item.normalizedStatus}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-zinc-500 truncate mt-0.5">{item.subtitle}</p>
                                                </div>
                                                <span className="text-[11px] text-zinc-600 shrink-0 mt-0.5">
                                                    {timeAgo(item.createdAt)}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: Detail panel ── */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                    {!selected ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                            <Inbox className="w-12 h-12 text-zinc-700 mb-3" />
                            <p className="text-sm text-zinc-500">Select an item to review</p>
                        </div>
                    ) : (
                        <DetailPanel
                            item={selected}
                            actionLoading={actionLoading}
                            isSigning={isSigning}
                            freighterConnected={!!freighterDevice}
                            onApproveInvestor={() => handleApproveInvestor(selected)}
                            onRejectInvestor={() => setRejectDialog({ open: true, item: selected })}
                            onSponsorInvestor={() => setSponsorDialog({ open: true, item: selected })}
                            onApproveCompany={() => handleApproveCompany(selected)}
                            onRejectCompany={() => setRejectDialog({ open: true, item: selected })}
                            onSponsorCompany={() => setSponsorDialog({ open: true, item: selected })}
                            onApproveOffer={() => handleReviewOffer(selected, 'approved')}
                            onRejectOffer={() => handleReviewOffer(selected, 'rejected')}
                            onUnlockToken={() => handleUnlockToken(selected)}
                            onSignMultisig={() => handleSignMultisig(selected)}
                            onSubmitMultisig={() => handleSubmitMultisig(selected)}
                            onRejectMultisig={() => handleRejectMultisig(selected)}
                            onRefreshFreighter={refresh}
                        />
                    )}
                </div>
            </div>

            {/* ── Reject dialog ── */}
            <Dialog
                open={rejectDialog.open}
                onOpenChange={(open) => setRejectDialog({ open, item: rejectDialog.item })}
            >
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Reject {rejectDialog.item?.label}</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. Please provide a reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="reject-reason">Reason</Label>
                        <Input
                            id="reject-reason"
                            placeholder="e.g., Invalid documentation, incomplete KYC..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="mt-2 bg-white/5 border-white/10"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectDialog({ open: false, item: null })}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={!rejectReason.trim() || actionLoading}
                            onClick={handleRejectSubmit}
                        >
                            {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Sponsor dialog ── */}
            <Dialog
                open={sponsorDialog.open}
                onOpenChange={(open) => setSponsorDialog({ open, item: sponsorDialog.item })}
            >
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Sponsor Wallet</DialogTitle>
                        <DialogDescription>
                            Send XLM to {sponsorDialog.item?.label}'s wallet for transaction fees.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label htmlFor="sponsor-amount">Amount (XLM)</Label>
                        <Input
                            id="sponsor-amount"
                            type="number"
                            min="1"
                            max="1000"
                            value={sponsorAmount}
                            onChange={(e) => setSponsorAmount(e.target.value)}
                            className="bg-white/5 border-white/10"
                        />
                        <p className="text-xs text-zinc-500">Default: 10 XLM for transaction fees</p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setSponsorDialog({ open: false, item: null })}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={actionLoading}
                            onClick={handleSponsorSubmit}
                        >
                            {actionLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Wallet className="w-4 h-4 mr-2" />
                            )}
                            Send XLM
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function FilterChip({
    active,
    count,
    label,
    icon,
    onClick,
}: {
    active: boolean;
    count: number;
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06]'
                }`}
        >
            {icon}
            {label}
            {count > 0 && (
                <span
                    className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-zinc-500'
                        }`}
                >
                    {count}
                </span>
            )}
        </button>
    );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────

function DetailPanel({
    item,
    actionLoading,
    isSigning,
    freighterConnected,
    onApproveInvestor,
    onRejectInvestor,
    onSponsorInvestor,
    onApproveCompany,
    onRejectCompany,
    onSponsorCompany,
    onApproveOffer,
    onRejectOffer,
    onUnlockToken,
    onSignMultisig,
    onSubmitMultisig,
    onRejectMultisig,
    onRefreshFreighter,
}: {
    item: ApprovalItem;
    actionLoading: boolean;
    isSigning: boolean;
    freighterConnected: boolean;
    onApproveInvestor: () => void;
    onRejectInvestor: () => void;
    onSponsorInvestor: () => void;
    onApproveCompany: () => void;
    onRejectCompany: () => void;
    onSponsorCompany: () => void;
    onApproveOffer: () => void;
    onRejectOffer: () => void;
    onUnlockToken: () => void;
    onSignMultisig: () => void;
    onSubmitMultisig: () => void;
    onRejectMultisig: () => void;
    onRefreshFreighter: () => void;
}) {
    const cfg = TYPE_CONFIG[item.type];
    const Icon = cfg.icon;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-white/[0.04] ${cfg.color}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <h2 className="text-lg font-semibold text-white">{item.label}</h2>
                    <p className="text-sm text-zinc-500">
                        {cfg.label} · {item.status.replace(/_/g, ' ')} · {timeAgo(item.createdAt)}
                    </p>
                </div>
                <Badge variant="outline" className={STATUS_BADGE[item.normalizedStatus]}>
                    {item.normalizedStatus === 'in_progress' ? 'in progress' : item.normalizedStatus}
                </Badge>
            </div>

            {/* Body — type-specific */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {item.type === 'investor' && <InvestorDetail raw={item.raw} />}
                {item.type === 'company' && <CompanyDetail raw={item.raw} />}
                {item.type === 'offer' && <OfferDetail raw={item.raw} />}
                {item.type === 'token' && <TokenDetail raw={item.raw} />}
                {item.type === 'multisig' && <MultisigDetail raw={item.raw} />}
            </div>

            {/* Actions footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] space-y-2">
                {item.type === 'investor' && (
                    <div className="flex gap-2">
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                            disabled={actionLoading}
                            onClick={onApproveInvestor}
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                        </Button>
                        <Button
                            variant="destructive"
                            className="flex-1"
                            disabled={actionLoading}
                            onClick={onRejectInvestor}
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </Button>
                        <Button variant="outline" disabled={actionLoading} onClick={onSponsorInvestor}>
                            <Wallet className="w-4 h-4 mr-2" />
                            Sponsor
                        </Button>
                    </div>
                )}

                {item.type === 'company' && (
                    <div className="flex gap-2">
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                            disabled={actionLoading}
                            onClick={onApproveCompany}
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                        </Button>
                        <Button
                            variant="destructive"
                            className="flex-1"
                            disabled={actionLoading}
                            onClick={onRejectCompany}
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </Button>
                        {item.raw.stellarContractId && (
                            <Button variant="outline" disabled={actionLoading} onClick={onSponsorCompany}>
                                <Wallet className="w-4 h-4 mr-2" />
                                Sponsor
                            </Button>
                        )}
                    </div>
                )}

                {item.type === 'offer' && (
                    <div className="flex gap-2">
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                            disabled={actionLoading}
                            onClick={onApproveOffer}
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                        </Button>
                        <Button
                            variant="destructive"
                            className="flex-1"
                            disabled={actionLoading}
                            onClick={onRejectOffer}
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </Button>
                    </div>
                )}

                {item.type === 'token' && (
                    <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-500"
                        disabled={actionLoading}
                        onClick={onUnlockToken}
                    >
                        <Lock className="w-4 h-4 mr-2" />
                        Unlock Token for Trading
                    </Button>
                )}

                {item.type === 'multisig' && (
                    <div className="space-y-2">
                        <FreighterConnect onConnected={onRefreshFreighter} />
                        {item.raw.status === 'ready' ? (
                            <Button
                                className="w-full bg-emerald-600 hover:bg-emerald-500"
                                disabled={actionLoading}
                                onClick={onSubmitMultisig}
                            >
                                <Send className="w-4 h-4 mr-2" />
                                Submit to Stellar
                            </Button>
                        ) : (
                            <Button
                                className="w-full bg-purple-600 hover:bg-purple-500"
                                disabled={!freighterConnected || actionLoading || isSigning}
                                onClick={onSignMultisig}
                            >
                                {isSigning ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Fingerprint className="w-4 h-4 mr-2" />
                                )}
                                {freighterConnected ? 'Sign with Freighter' : 'Connect Freighter First'}
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            className="w-full text-red-400 border-red-500/30 hover:bg-red-500/10"
                            disabled={actionLoading}
                            onClick={onRejectMultisig}
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject Transaction
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Type-specific detail renderers ───────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-sm text-white">{value || '—'}</p>
        </div>
    );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h3>
            <div className="bg-white/[0.03] rounded-lg p-4 space-y-3">{children}</div>
        </div>
    );
}

function InvestorDetail({ raw }: { raw: any }) {
    return (
        <>
            <DetailSection title="Basic Info">
                <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Name" value={raw.name} />
                    <DetailRow label="Email" value={raw.email} />
                    <DetailRow label="Document" value={raw.document} />
                    <DetailRow label="KYC Status" value={raw.kyc_status} />
                </div>
            </DetailSection>
            <DetailSection title="Wallet">
                <DetailRow
                    label="Public Key"
                    value={
                        raw.stellar_public_key ? (
                            <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded break-all">
                                {raw.stellar_public_key}
                            </code>
                        ) : (
                            <span className="text-zinc-500">Not created yet</span>
                        )
                    }
                />
            </DetailSection>
            <DetailSection title="Timeline">
                <DetailRow label="Applied" value={new Date(raw.created_at).toLocaleString()} />
                {raw.last_login && (
                    <DetailRow label="Last Login" value={new Date(raw.last_login).toLocaleString()} />
                )}
            </DetailSection>
        </>
    );
}

function CompanyDetail({ raw }: { raw: any }) {
    return (
        <>
            <DetailSection title="Company Info">
                <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Name" value={raw.name} />
                    <DetailRow label="CNPJ" value={raw.cnpj} />
                    <DetailRow label="Email" value={raw.email} />
                    <DetailRow label="Status" value={raw.status} />
                    <DetailRow label="Active Offers" value={raw.activeOffers ?? 0} />
                    <DetailRow label="Total Investments" value={raw.totalInvestments ?? 0} />
                </div>
            </DetailSection>
            <DetailSection title="Wallet">
                <DetailRow
                    label="Stellar Address"
                    value={
                        raw.stellarContractId ? (
                            <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded break-all">
                                {raw.stellarContractId}
                            </code>
                        ) : (
                            <span className="text-zinc-500">No wallet created</span>
                        )
                    }
                />
            </DetailSection>
            {raw.users && raw.users.length > 0 && (
                <DetailSection title={`Team · ${raw.users.length} members`}>
                    {raw.users.map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between text-sm">
                            <span className="text-white">{u.name}</span>
                            <span className="text-zinc-500">{u.email}</span>
                            <Badge variant="outline" className="text-xs">{u.role}</Badge>
                        </div>
                    ))}
                </DetailSection>
            )}
        </>
    );
}

function OfferDetail({ raw }: { raw: any }) {
    return (
        <>
            <DetailSection title="Offer Info">
                <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Name" value={raw.offer_name} />
                    <DetailRow label="Asset Code" value={raw.asset_code} />
                    <DetailRow label="Type" value={raw.offer_type} />
                    <DetailRow label="Status" value={raw.status?.replace(/_/g, ' ')} />
                    <DetailRow label="Total Supply" value={raw.total_supply} />
                    <DetailRow
                        label="Interest Rate"
                        value={raw.annual_interest_rate != null ? `${raw.annual_interest_rate}%` : '—'}
                    />
                    {raw.payment_type && <DetailRow label="Payment Type" value={raw.payment_type} />}
                    {raw.maturity_date && (
                        <DetailRow label="Maturity" value={new Date(raw.maturity_date).toLocaleDateString()} />
                    )}
                </div>
            </DetailSection>
            {raw.company && (
                <DetailSection title="Issuing Company">
                    <div className="grid grid-cols-2 gap-4">
                        <DetailRow label="Company" value={raw.company.name} />
                        <DetailRow label="CNPJ" value={raw.company.cnpj} />
                    </div>
                </DetailSection>
            )}
            {raw.description && (
                <DetailSection title="Description">
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{raw.description}</p>
                </DetailSection>
            )}
            {raw.due_diligence_notes && (
                <DetailSection title="Due Diligence Notes">
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{raw.due_diligence_notes}</p>
                </DetailSection>
            )}
        </>
    );
}

function TokenDetail({ raw }: { raw: any }) {
    return (
        <>
            <DetailSection title="Token Info">
                <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Asset Code" value={raw.asset_code} />
                    <DetailRow label="Offer" value={raw.offer_name} />
                    <DetailRow label="Type" value={raw.offer_type} />
                    <DetailRow label="Total Supply" value={raw.total_supply} />
                    <DetailRow
                        label="Token Status"
                        value={
                            <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                                🔒 Locked
                            </Badge>
                        }
                    />
                    <DetailRow
                        label="Interest Rate"
                        value={raw.annual_interest_rate != null ? `${raw.annual_interest_rate}%` : '—'}
                    />
                </div>
            </DetailSection>
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-300">
                    <strong>Unlocking this token</strong> will allow it to be traded on the DEX.
                    This action is irreversible.
                </p>
            </div>
        </>
    );
}

function MultisigDetail({ raw }: { raw: any }) {
    const OP_LABELS: Record<string, string> = {
        token_issue: 'Token Issuance',
        token_distribute: 'Token Distribution',
        freeze_account: 'Account Freeze',
        clawback: 'Token Clawback',
        treasury_payment: 'Treasury Withdrawal',
        dividend_distribution: 'Dividend Distribution',
        opex_withdrawal: 'OpEx Withdrawal',
        trustline_auth: 'Trustline Authorization',
        account_setup: 'Account Setup',
    };

    const sigStatus = raw.signatureStatus;

    return (
        <>
            <DetailSection title="Transaction Info">
                <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Operation" value={OP_LABELS[raw.operationType] || raw.operationType} />
                    <DetailRow label="Status" value={raw.status?.replace(/_/g, ' ')} />
                    <DetailRow label="Created" value={new Date(raw.createdAt).toLocaleString()} />
                    <DetailRow
                        label="Expires"
                        value={
                            <span className={new Date(raw.expiresAt) < new Date() ? 'text-red-400' : 'text-white'}>
                                {timeRemaining(raw.expiresAt)}
                            </span>
                        }
                    />
                </div>
            </DetailSection>

            <DetailSection title="Signature Progress">
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">Collected</span>
                        <span className="text-white font-mono">
                            {sigStatus?.collected || 0} / {raw.thresholdRequired}
                        </span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-2">
                        <div
                            className="h-2 rounded-full bg-purple-500 transition-all"
                            style={{
                                width: `${Math.min(((sigStatus?.collected || 0) / raw.thresholdRequired) * 100, 100)}%`,
                            }}
                        />
                    </div>
                    {sigStatus?.remainingSigners?.length > 0 && (
                        <div className="pt-2">
                            <p className="text-xs text-zinc-500 mb-1">Remaining signers:</p>
                            {sigStatus.remainingSigners.map((s: string) => (
                                <code key={s} className="block text-xs text-zinc-400 bg-black/30 px-2 py-1 rounded mt-1 break-all">
                                    {s}
                                </code>
                            ))}
                        </div>
                    )}
                </div>
            </DetailSection>

            {raw.initiator && (
                <DetailSection title="Initiated By">
                    <div className="grid grid-cols-2 gap-4">
                        <DetailRow label="Name" value={raw.initiator.name} />
                        <DetailRow label="Email" value={raw.initiator.email} />
                    </div>
                </DetailSection>
            )}

            {raw.metadata && Object.keys(raw.metadata).length > 0 && (
                <DetailSection title="Operation Context">
                    {raw.operationType === 'treasury_payment' && (
                        <div className="grid grid-cols-2 gap-4">
                            <DetailRow label="Destination" value={raw.metadata.destination?.slice(0, 12) + '...'} />
                            <DetailRow
                                label="Amount"
                                value={`${raw.metadata.amount} ${raw.metadata.assetCode || ''}`}
                            />
                        </div>
                    )}
                    {raw.operationType === 'dividend_distribution' && (
                        <div className="grid grid-cols-2 gap-4">
                            <DetailRow label="Batch Size" value={`${raw.metadata.operationCount} payments`} />
                            <DetailRow label="Asset" value={raw.metadata.assetCode} />
                        </div>
                    )}
                    {!['treasury_payment', 'dividend_distribution'].includes(raw.operationType) && (
                        <pre className="text-xs text-blue-300 bg-black/30 p-2 rounded overflow-x-auto">
                            {JSON.stringify(raw.metadata, null, 2)}
                        </pre>
                    )}
                </DetailSection>
            )}
        </>
    );
}

export default Approvals;
