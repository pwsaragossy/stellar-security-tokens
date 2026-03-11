import { useState, useEffect, useCallback } from 'react';
import {
    Users,
    Search,
    RefreshCw,
    Loader2,
    CheckCircle,
    XCircle,
    Wallet,
    Copy,
    ExternalLink,
    History,
    Inbox,
    AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { platformAdminsApi } from '@/api/platformAdmins';
import { useAutoSelect, useAdminNavigation } from '@/hooks/useAdminNavigation';

// ─── Types ────────────────────────────────────────────────────────────────

interface Investor {
    id: number;
    name: string;
    email: string;
    document: string;
    status: string;
    walletAddress?: string | null;
    createdAt: string;
}

interface InvestorDetails extends Investor {
    stellarContractId?: string;
    emailVerified?: boolean;
    lastLogin?: string;
    balances?: { xlm: string; usdc: string };
    transactions?: Array<{ hash: string; type: string; amount: string; date: string }>;
    investments?: Array<{
        id: number;
        usdcAmount: string;
        tokenAmount?: string;
        assetCode?: string;
        status: string;
        createdAt: string;
        offer?: {
            id: number;
            offerName: string;
            assetCode?: string;
            company?: { id: number; name: string };
        };
    }>;
    totalInvestedAmount?: string;
    investmentCount?: number;
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

// ─── Design tokens ────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
    pending: 'bg-yellow-400',
    approved: 'bg-emerald-400',
    rejected: 'bg-red-400',
};

const STATUS_BADGE: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const FILTER_CONFIG: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function getInitials(name: string): string {
    return name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}



// ─── Component ────────────────────────────────────────────────────────────

export function UserManagement() {
    const [loading, setLoading] = useState(true);
    const [investors, setInvestors] = useState<Investor[]>([]);
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<InvestorDetails | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Reject dialog (kept as dialog for destructive action confirmation)
    const [rejectDialog, setRejectDialog] = useState<{ open: boolean; investor: InvestorDetails | null }>({
        open: false,
        investor: null,
    });
    const [rejectReason, setRejectReason] = useState('');

    // Sponsor dialog
    const [sponsorDialog, setSponsorDialog] = useState<{ open: boolean; investor: InvestorDetails | null }>({
        open: false,
        investor: null,
    });
    const [sponsorAmount, setSponsorAmount] = useState('10');

    // ─── Data loading ─────────────────────────────────────────────────────

    useEffect(() => {
        loadInvestors();
    }, [filter]);

    const loadInvestors = async () => {
        setLoading(true);
        setError('');
        try {
            const status = filter === 'all' ? undefined : filter;
            const response = await platformAdminsApi.getInvestors(status);
            setInvestors(response.data || []);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load investors');
        } finally {
            setLoading(false);
        }
    };

    const loadDetails = async (investor: Investor) => {
        setSelected({ ...investor } as InvestorDetails);
        setDetailLoading(true);
        try {
            const response = await api.get(`/platform-admins/investors/${investor.id}/details`);
            if (response.data.success) {
                setSelected(response.data.data);
            }
        } catch {
            setSelected({
                ...investor,
                balances: { xlm: '0', usdc: '0' },
                transactions: [],
            } as InvestorDetails);
        } finally {
            setDetailLoading(false);
        }
    };

    // Keep selected in sync after refresh
    useEffect(() => {
        if (selected) {
            const updated = investors.find((i) => i.id === selected.id);
            if (!updated) setSelected(null);
        }
    }, [investors]);

    // Auto-select from URL ?id= param (for cross-navigation)
    const handleAutoSelect = useCallback((id: number) => {
        const investor = investors.find(i => i.id === id);
        if (investor) loadDetails(investor);
    }, [investors]);
    useAutoSelect(handleAutoSelect);

    const { navigateTo } = useAdminNavigation();

    // ─── Actions ──────────────────────────────────────────────────────────

    const handleApprove = async () => {
        if (!selected) return;
        setActionLoading(true);
        try {
            await platformAdminsApi.approveInvestor(selected.id);
            toast.success(`${selected.name} approved`);
            await loadInvestors();
            // Reload details to get updated status
            loadDetails({ ...selected, status: 'approved' });
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to approve');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!rejectDialog.investor || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await platformAdminsApi.rejectInvestor(rejectDialog.investor.id, rejectReason);
            toast.success(`${rejectDialog.investor.name} rejected`);
            setRejectDialog({ open: false, investor: null });
            setRejectReason('');
            await loadInvestors();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSponsor = async () => {
        if (!sponsorDialog.investor) return;
        setActionLoading(true);
        try {
            const response = await platformAdminsApi.sponsorInvestorWallet(sponsorDialog.investor.id, sponsorAmount);
            toast.success(response.message || `Sent ${sponsorAmount} XLM successfully`);
            if (response.data?.explorer) {
                toast.info(
                    <a href={response.data.explorer} target="_blank" rel="noopener noreferrer" className="underline">
                        View on Explorer →
                    </a>
                );
            }
            setSponsorDialog({ open: false, investor: null });
            await loadInvestors();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to sponsor wallet');
        } finally {
            setActionLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    // ─── Filtered list ────────────────────────────────────────────────────

    const filteredInvestors = investors.filter(
        (inv) =>
            inv.name.toLowerCase().includes(search.toLowerCase()) ||
            inv.email.toLowerCase().includes(search.toLowerCase())
    );

    const counts: Record<FilterStatus, number> = {
        all: investors.length,
        pending: investors.filter((i) => i.status === 'pending').length,
        approved: investors.filter((i) => i.status === 'approved').length,
        rejected: investors.filter((i) => i.status === 'rejected').length,
    };

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Filter chips + search */}
            <div className="flex flex-wrap items-center gap-2">
                {FILTER_CONFIG.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === key
                            ? 'bg-white/10 text-white border border-white/20'
                            : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06]'
                            }`}
                    >
                        {label}
                        {counts[key] > 0 && (
                            <span
                                className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${filter === key ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-zinc-500'
                                    }`}
                            >
                                {counts[key]}
                            </span>
                        )}
                    </button>
                ))}

                <div className="ml-auto flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <Input
                            placeholder="Search name or email…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8 h-8 w-56 text-sm bg-white/[0.03] border-white/[0.06]"
                        />
                    </div>
                    <Button variant="outline" size="sm" onClick={loadInvestors} disabled={loading} className="gap-1.5">
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
            <div className="grid grid-cols-[minmax(420px,2fr)_3fr] gap-4 min-h-[calc(100vh-220px)]">
                {/* ── Left: Investor list ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    {/* Table header */}
                    <div className="grid grid-cols-[36px_1fr_28px_28px_80px] gap-2 items-center px-3 py-2 border-b border-white/[0.06] text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                        <span></span>
                        <span>Investor</span>
                        <span className="text-center">KYC</span>
                        <span className="text-center">
                            <Wallet className="w-3 h-3 mx-auto" />
                        </span>
                        <span className="text-right">Registered</span>
                    </div>

                    {/* Scrollable list */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            </div>
                        ) : filteredInvestors.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Users className="w-8 h-8 text-zinc-700 mb-2" />
                                <p className="text-sm text-zinc-500">No investors found</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.04]">
                                {filteredInvestors.map((inv) => {
                                    const isSelected = selected?.id === inv.id;
                                    return (
                                        <button
                                            key={inv.id}
                                            onClick={() => loadDetails(inv)}
                                            className={`w-full text-left grid grid-cols-[36px_1fr_28px_28px_80px] gap-2 items-center px-3 py-2.5 transition-colors hover:bg-white/[0.04] ${isSelected
                                                ? 'bg-white/[0.06] border-l-2 border-l-blue-500'
                                                : 'border-l-2 border-l-transparent'
                                                }`}
                                        >
                                            {/* Avatar */}
                                            <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-[10px] font-semibold text-zinc-300">
                                                {getInitials(inv.name)}
                                            </div>

                                            {/* Name + Email */}
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-medium text-white truncate">
                                                    {inv.name}
                                                </p>
                                                <p className="text-[11px] text-zinc-500 truncate">{inv.email}</p>
                                            </div>

                                            {/* KYC dot */}
                                            <div className="flex justify-center">
                                                <div
                                                    className={`w-2 h-2 rounded-full ${STATUS_DOT[inv.status] || 'bg-zinc-500'}`}
                                                    title={inv.status}
                                                />
                                            </div>

                                            {/* Wallet indicator */}
                                            <div className="flex justify-center">
                                                <Wallet
                                                    className={`w-3 h-3 ${inv.walletAddress ? 'text-emerald-400' : 'text-zinc-600'}`}
                                                />
                                            </div>

                                            {/* Date */}
                                            <span className="text-[11px] text-zinc-600 text-right">
                                                {formatDate(inv.createdAt)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer count */}
                    <div className="px-3 py-2 border-t border-white/[0.06] text-[11px] text-zinc-500">
                        {filteredInvestors.length} investor{filteredInvestors.length !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* ── Right: Detail panel ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    {!selected ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                            <Inbox className="w-10 h-10 text-zinc-700 mb-2" />
                            <p className="text-sm text-zinc-500">Select an investor to view details</p>
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center text-xs font-semibold text-zinc-300">
                                    {getInitials(selected.name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-semibold text-white truncate">
                                            {selected.name}
                                        </h3>
                                        <Badge
                                            variant="outline"
                                            className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${STATUS_BADGE[selected.status] || ''}`}
                                        >
                                            {selected.status}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-zinc-500">{selected.email}</p>
                                </div>
                                {selected.stellarContractId && (
                                    <a
                                        href={`https://stellar.expert/explorer/testnet/contract/${selected.stellarContractId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                        title="View on Explorer"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                                {detailLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                                    </div>
                                ) : (
                                    <>
                                        {/* Profile section */}
                                        <section>
                                            <h4 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
                                                Profile
                                            </h4>
                                            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                                                <div>
                                                    <dt className="text-[11px] text-zinc-500">Email</dt>
                                                    <dd className="text-sm text-white mt-0.5">{selected.email}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] text-zinc-500">Document</dt>
                                                    <dd className="text-sm text-white mt-0.5">{selected.document}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] text-zinc-500">Status</dt>
                                                    <dd className="text-sm mt-0.5">
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] ${STATUS_BADGE[selected.status] || ''}`}
                                                        >
                                                            {selected.status}
                                                        </Badge>
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] text-zinc-500">Registered</dt>
                                                    <dd className="text-sm text-white mt-0.5">
                                                        {formatDate(selected.createdAt)}
                                                    </dd>
                                                </div>
                                                {selected.emailVerified != null && (
                                                    <div>
                                                        <dt className="text-[11px] text-zinc-500">Email Verified</dt>
                                                        <dd className="text-sm mt-0.5">{selected.emailVerified ? '✅ Yes' : '❌ No'}</dd>
                                                    </div>
                                                )}
                                                {selected.lastLogin && (
                                                    <div>
                                                        <dt className="text-[11px] text-zinc-500">Last Login</dt>
                                                        <dd className="text-sm text-white mt-0.5">{formatDate(selected.lastLogin)}</dd>
                                                    </div>
                                                )}
                                                {selected.totalInvestedAmount && selected.totalInvestedAmount !== '0' && (
                                                    <div>
                                                        <dt className="text-[11px] text-zinc-500">Total Invested</dt>
                                                        <dd className="text-sm font-mono text-emerald-400 mt-0.5">${Number(selected.totalInvestedAmount).toLocaleString()}</dd>
                                                    </div>
                                                )}
                                                {selected.investmentCount != null && selected.investmentCount > 0 && (
                                                    <div>
                                                        <dt className="text-[11px] text-zinc-500">Investments</dt>
                                                        <dd className="text-sm text-white mt-0.5">{selected.investmentCount}</dd>
                                                    </div>
                                                )}
                                            </div>
                                        </section>

                                        {/* Wallet section */}
                                        <section>
                                            <h4 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
                                                Wallet
                                            </h4>
                                            {selected.stellarContractId ? (
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-xs text-zinc-300 bg-white/[0.04] px-2 py-1 rounded font-mono flex-1 truncate">
                                                            {selected.stellarContractId}
                                                        </code>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0 text-zinc-500 hover:text-white"
                                                            onClick={() =>
                                                                copyToClipboard(selected.stellarContractId!)
                                                            }
                                                        >
                                                            <Copy className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>

                                                    {selected.balances && (
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                                                                <p className="text-[11px] text-zinc-500 mb-0.5">XLM</p>
                                                                <p className="text-sm font-medium text-white">
                                                                    {parseFloat(selected.balances.xlm).toFixed(2)}
                                                                </p>
                                                            </div>
                                                            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                                                                <p className="text-[11px] text-zinc-500 mb-0.5">USDC</p>
                                                                <p className="text-sm font-medium text-emerald-400">
                                                                    $
                                                                    {parseFloat(selected.balances.usdc).toFixed(2)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-zinc-500">No wallet created yet</p>
                                            )}
                                        </section>

                                        {/* Investments section — enriched with cross-links */}
                                        {selected.investments && selected.investments.length > 0 && (
                                            <section>
                                                <h4 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                                                    <History className="w-3 h-3" />
                                                    Investments ({selected.investments.length})
                                                </h4>
                                                <div className="space-y-1 max-h-64 overflow-y-auto">
                                                    {selected.investments.map((inv) => (
                                                        <button
                                                            key={inv.id}
                                                            onClick={() => inv.offer?.id && navigateTo('offers', inv.offer.id)}
                                                            className="w-full text-left grid grid-cols-[1fr_80px_60px] gap-2 items-center px-2 py-1.5 text-xs rounded hover:bg-white/[0.06] transition-colors group"
                                                        >
                                                            <div className="min-w-0">
                                                                <span className="text-white group-hover:text-blue-300 transition-colors">
                                                                    {inv.offer?.offerName || 'Investment'}
                                                                </span>
                                                                {inv.offer?.company?.name && (
                                                                    <span className="text-zinc-500 text-[10px] ml-1">· {inv.offer.company.name}</span>
                                                                )}
                                                                {inv.assetCode && (
                                                                    <span className="text-zinc-600 text-[10px] ml-1 font-mono">{inv.assetCode}</span>
                                                                )}
                                                            </div>
                                                            <span className="text-emerald-400 text-right font-mono">${Number(inv.usdcAmount).toLocaleString()}</span>
                                                            <span className="text-zinc-600 text-right">{new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {/* Legacy transactions section (backward compat) */}
                                        {(!selected.investments || selected.investments.length === 0) && selected.transactions && selected.transactions.length > 0 && (
                                            <section>
                                                <h4 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                                                    <History className="w-3 h-3" />
                                                    Recent Transactions
                                                </h4>
                                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                                    {selected.transactions.map((tx, i) => (
                                                        <div
                                                            key={i}
                                                            className="grid grid-cols-3 gap-2 items-center px-2 py-1.5 text-xs rounded hover:bg-white/[0.03]"
                                                        >
                                                            <span className="text-zinc-500">{tx.type}</span>
                                                            <span className="text-white text-right">{tx.amount}</span>
                                                            <span className="text-zinc-600 text-right">{tx.date}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Action footer */}
                            <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2">
                                {selected.status === 'pending' && (
                                    <>
                                        <Button
                                            size="sm"
                                            className="bg-emerald-600 hover:bg-emerald-500 gap-1.5"
                                            onClick={handleApprove}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <CheckCircle className="w-3.5 h-3.5" />
                                            )}
                                            Approve
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5"
                                            onClick={() => setRejectDialog({ open: true, investor: selected })}
                                            disabled={actionLoading}
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                            Reject
                                        </Button>
                                    </>
                                )}
                                {selected.status === 'approved' && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 gap-1.5"
                                        onClick={() => setSponsorDialog({ open: true, investor: selected })}
                                        disabled={actionLoading}
                                    >
                                        <Wallet className="w-3.5 h-3.5" />
                                        Sponsor Wallet
                                    </Button>
                                )}
                                {selected.stellarContractId && (
                                    <a
                                        href={`https://stellar.expert/explorer/testnet/contract/${selected.stellarContractId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-auto"
                                    >
                                        <Button size="sm" variant="outline" className="gap-1.5">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Explorer
                                        </Button>
                                    </a>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Reject dialog ── */}
            <Dialog
                open={rejectDialog.open}
                onOpenChange={(open) => setRejectDialog({ open, investor: rejectDialog.investor })}
            >
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Reject {rejectDialog.investor?.name}</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. Please provide a reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="reject-reason">Reason</Label>
                        <Input
                            id="reject-reason"
                            placeholder="e.g., Invalid documentation, incomplete KYC…"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="mt-2 bg-white/5 border-white/10"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectDialog({ open: false, investor: null })}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={!rejectReason.trim() || actionLoading}
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
                onOpenChange={(open) => setSponsorDialog({ open, investor: sponsorDialog.investor })}
            >
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Sponsor Wallet</DialogTitle>
                        <DialogDescription>
                            Send XLM to {sponsorDialog.investor?.name}'s wallet for transaction fees.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label htmlFor="xlm-amount">Amount (XLM)</Label>
                        <Input
                            id="xlm-amount"
                            type="number"
                            min="1"
                            max="1000"
                            placeholder="10"
                            value={sponsorAmount}
                            onChange={(e) => setSponsorAmount(e.target.value)}
                            className="bg-white/5 border-white/10"
                        />
                        <p className="text-xs text-zinc-500">Default: 10 XLM for transaction fees</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSponsorDialog({ open: false, investor: null })}>
                            Cancel
                        </Button>
                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSponsor} disabled={actionLoading}>
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

export default UserManagement;
