import { useEffect, useState, useCallback } from 'react';
import {
    Building2,
    Search,
    RefreshCw,
    Loader2,
    CheckCircle,
    XCircle,
    Wallet,
    Copy,
    ExternalLink,
    FileText,
    Users,
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
import { useAutoSelect, useAdminNavigation } from '@/hooks/useAdminNavigation';

// ─── Types ────────────────────────────────────────────────────────────────

interface Company {
    id: number;
    name: string;
    cnpj: string;
    status: 'pending' | 'approved' | 'active' | 'suspended' | 'rejected';
    walletAddress: string | null;
    stellarContractId: string | null;
    activeOffers: number;
    totalInvestments: number;
    users: Array<{ id: number; name: string; email: string; role: string }>;
    createdAt: string;
}

interface CompanyDetails extends Company {
    email?: string;
    legalRepresentative?: string;
    phone?: string;
    address?: string;
    balances?: { xlm: string; usdc: string };
    totalOfferCount?: number;
    totalInvestmentVolume?: string;
    offers: Array<{
        id: number;
        offerName?: string;
        name?: string;
        assetCode?: string;
        status: string;
        totalSupply?: number;
        totalAmount?: number;
        annualInterestRate?: number;
        maturityDate?: string;
        sorobanContractId?: string;
        offerType?: string;
        tokens?: Array<{ id: number; assetCode: string; sacContractId?: string }>;
        _count?: { investments: number };
    }>;
}

type FilterKey = 'all' | 'pending' | 'approved' | 'suspended' | 'rejected';

// ─── Design tokens ────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
    pending: 'bg-yellow-400',
    approved: 'bg-emerald-400',
    active: 'bg-emerald-400',
    suspended: 'bg-red-400',
    rejected: 'bg-red-400',
};

const STATUS_BADGE: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    suspended: 'bg-red-500/15 text-red-400 border-red-500/30',
    rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const FILTER_CONFIG: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'rejected', label: 'Rejected' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function getInitials(name: string): string {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────

export function Companies() {
    const [loading, setLoading] = useState(true);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [filter, setFilter] = useState<FilterKey>('all');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<CompanyDetails | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Reject dialog
    const [rejectDialog, setRejectDialog] = useState<{ open: boolean; company: CompanyDetails | null }>({
        open: false,
        company: null,
    });
    const [rejectReason, setRejectReason] = useState('');

    // Sponsor dialog
    const [sponsorDialog, setSponsorDialog] = useState<{ open: boolean; company: CompanyDetails | null }>({
        open: false,
        company: null,
    });
    const [sponsorAmount, setSponsorAmount] = useState('10');

    // ─── Data loading ─────────────────────────────────────────────────────

    useEffect(() => {
        loadCompanies();
    }, [filter]);

    const loadCompanies = async () => {
        setLoading(true);
        setError('');
        try {
            const status = filter === 'all' ? undefined : filter;
            const response = await api.get('/platform-admins/companies', { params: { status } });
            setCompanies(response.data.data || []);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load companies');
        } finally {
            setLoading(false);
        }
    };

    const loadDetails = async (company: Company) => {
        setSelected({ ...company, offers: [], balances: undefined } as CompanyDetails);
        setDetailLoading(true);
        try {
            const response = await api.get(`/platform-admins/companies/${company.id}/details`);
            if (response.data.success) {
                setSelected(response.data.data);
            }
        } catch {
            setSelected({
                ...company,
                offers: [],
                balances: { xlm: '0', usdc: '0' },
            } as CompanyDetails);
        } finally {
            setDetailLoading(false);
        }
    };

    // Keep selected in sync after refresh
    useEffect(() => {
        if (selected) {
            const updated = companies.find((c) => c.id === selected.id);
            if (!updated) setSelected(null);
        }
    }, [companies]);

    // Auto-select from URL ?id= param (for cross-navigation)
    const handleAutoSelect = useCallback((id: number) => {
        const company = companies.find(c => c.id === id);
        if (company) loadDetails(company);
    }, [companies]);
    useAutoSelect(handleAutoSelect);

    const { navigateTo } = useAdminNavigation();

    // ─── Actions ──────────────────────────────────────────────────────────

    const handleApprove = async () => {
        if (!selected) return;
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${selected.id}/approve`);
            toast.success(`${selected.name} approved`);
            await loadCompanies();
            loadDetails({ ...selected, status: 'approved' } as Company);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to approve');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!rejectDialog.company || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${rejectDialog.company.id}/reject`, { reason: rejectReason });
            toast.success(`${rejectDialog.company.name} rejected`);
            setRejectDialog({ open: false, company: null });
            setRejectReason('');
            await loadCompanies();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSponsor = async () => {
        if (!sponsorDialog.company) return;
        setActionLoading(true);
        try {
            const response = await api.post(`/platform-admins/companies/${sponsorDialog.company.id}/sponsor`, {
                amount: sponsorAmount,
            });
            toast.success(response.data.message || `Sent ${sponsorAmount} XLM successfully`);
            if (response.data.data?.explorer) {
                toast.info(
                    <a href={response.data.data.explorer} target="_blank" rel="noopener noreferrer" className="underline">
                        View on Explorer →
                    </a>
                );
            }
            setSponsorDialog({ open: false, company: null });
            await loadCompanies();
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

    const filteredCompanies = companies.filter(
        (c) =>
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            (c.cnpj && c.cnpj.includes(search))
    );

    const counts: Record<FilterKey, number> = {
        all: companies.length,
        pending: companies.filter((c) => c.status === 'pending').length,
        approved: companies.filter((c) => c.status === 'approved' || c.status === 'active').length,
        suspended: companies.filter((c) => c.status === 'suspended').length,
        rejected: companies.filter((c) => c.status === 'rejected').length,
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
                            placeholder="Search name or CNPJ…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8 h-8 w-56 text-sm bg-white/[0.03] border-white/[0.06]"
                        />
                    </div>
                    <Button variant="outline" size="sm" onClick={loadCompanies} disabled={loading} className="gap-1.5">
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
                {/* ── Left: Company list ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    {/* Table header */}
                    <div className="grid grid-cols-[36px_1fr_28px_60px_80px] gap-2 items-center px-3 py-2 border-b border-white/[0.06] text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                        <span></span>
                        <span>Company</span>
                        <span className="text-center">
                            <Wallet className="w-3 h-3 mx-auto" />
                        </span>
                        <span className="text-center">Offers</span>
                        <span className="text-right">Registered</span>
                    </div>

                    {/* Scrollable list */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            </div>
                        ) : filteredCompanies.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Building2 className="w-8 h-8 text-zinc-700 mb-2" />
                                <p className="text-sm text-zinc-500">No companies found</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.04]">
                                {filteredCompanies.map((company) => {
                                    const isSelected = selected?.id === company.id;
                                    return (
                                        <button
                                            key={company.id}
                                            onClick={() => loadDetails(company)}
                                            className={`w-full text-left grid grid-cols-[36px_1fr_28px_60px_80px] gap-2 items-center px-3 py-2.5 transition-colors hover:bg-white/[0.04] ${isSelected
                                                ? 'bg-white/[0.06] border-l-2 border-l-blue-500'
                                                : 'border-l-2 border-l-transparent'
                                                }`}
                                        >
                                            {/* Avatar */}
                                            <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-[10px] font-semibold text-zinc-300">
                                                {getInitials(company.name)}
                                            </div>

                                            {/* Name + CNPJ */}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-[13px] font-medium text-white truncate">{company.name}</p>
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[company.status] || 'bg-zinc-500'}`} title={company.status} />
                                                </div>
                                                <p className="text-[11px] text-zinc-500 truncate">{company.cnpj || 'No CNPJ'}</p>
                                            </div>

                                            {/* Wallet indicator */}
                                            <div className="flex justify-center">
                                                <Wallet className={`w-3 h-3 ${company.stellarContractId ? 'text-emerald-400' : 'text-zinc-600'}`} />
                                            </div>

                                            {/* Offers count */}
                                            <div className="text-center text-[12px] text-zinc-400">
                                                {company.activeOffers}
                                            </div>

                                            {/* Date */}
                                            <p className="text-[11px] text-zinc-500 text-right">
                                                {formatDate(company.createdAt)}
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
                            <p className="text-sm text-zinc-500">Select a company to view details</p>
                        </div>
                    ) : (
                        <>
                            {/* Detail body */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {detailLoading ? (
                                    <div className="flex items-center justify-center py-16">
                                        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                                    </div>
                                ) : (
                                    <>
                                        {/* Header */}
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center text-sm font-bold text-zinc-300">
                                                {getInitials(selected.name)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg font-semibold text-white">{selected.name}</h3>
                                                <p className="text-sm text-zinc-400">{selected.cnpj || 'No CNPJ'}</p>
                                            </div>
                                            <Badge variant="outline" className={`shrink-0 ${STATUS_BADGE[selected.status] || ''}`}>
                                                {selected.status}
                                            </Badge>
                                        </div>

                                        {/* Info grid */}
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-white/[0.03] rounded-lg p-3">
                                                <p className="text-[11px] text-zinc-500 mb-1">Active Offers</p>
                                                <p className="text-lg font-semibold text-white">{selected.activeOffers}</p>
                                            </div>
                                            <div className="bg-white/[0.03] rounded-lg p-3">
                                                <p className="text-[11px] text-zinc-500 mb-1">Total Investments</p>
                                                <p className="text-lg font-semibold text-white">{selected.totalInvestments ?? 0}</p>
                                            </div>
                                            <div className="bg-white/[0.03] rounded-lg p-3">
                                                <p className="text-[11px] text-zinc-500 mb-1">Registered</p>
                                                <p className="text-sm font-medium text-white">{formatDate(selected.createdAt)}</p>
                                            </div>
                                        </div>

                                        {/* Extra info */}
                                        <div className="grid grid-cols-2 gap-3">
                                            {selected.email && (
                                                <div className="bg-white/[0.03] rounded-lg p-3">
                                                    <p className="text-[11px] text-zinc-500 mb-1">Email</p>
                                                    <p className="text-sm text-white truncate">{selected.email}</p>
                                                </div>
                                            )}
                                            {selected.legalRepresentative && (
                                                <div className="bg-white/[0.03] rounded-lg p-3">
                                                    <p className="text-[11px] text-zinc-500 mb-1">Legal Rep</p>
                                                    <p className="text-sm text-white truncate">{selected.legalRepresentative}</p>
                                                </div>
                                            )}
                                            {selected.phone && (
                                                <div className="bg-white/[0.03] rounded-lg p-3">
                                                    <p className="text-[11px] text-zinc-500 mb-1">Phone</p>
                                                    <p className="text-sm text-white">{selected.phone}</p>
                                                </div>
                                            )}
                                            {selected.totalInvestmentVolume && selected.totalInvestmentVolume !== '0' && (
                                                <div className="bg-white/[0.03] rounded-lg p-3">
                                                    <p className="text-[11px] text-zinc-500 mb-1">Investment Volume</p>
                                                    <p className="text-sm font-mono text-emerald-400">${Number(selected.totalInvestmentVolume).toLocaleString()}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Wallet section */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Wallet className="w-3 h-3" /> Wallet
                                            </h4>
                                            {selected.stellarContractId ? (
                                                <div className="bg-white/[0.03] rounded-lg p-3 space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
                                                            {selected.stellarContractId}
                                                        </code>
                                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(selected.stellarContractId!)}>
                                                            <Copy className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <a
                                                            href={`https://stellar.expert/explorer/testnet/contract/${selected.stellarContractId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex"
                                                        >
                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </a>
                                                    </div>
                                                    {selected.balances && (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="bg-black/20 rounded p-2">
                                                                <p className="text-[10px] text-zinc-500">XLM</p>
                                                                <p className="text-sm font-semibold text-white">{parseFloat(selected.balances.xlm).toFixed(2)}</p>
                                                            </div>
                                                            <div className="bg-black/20 rounded p-2">
                                                                <p className="text-[10px] text-zinc-500">USDC</p>
                                                                <p className="text-sm font-semibold text-emerald-400">${parseFloat(selected.balances.usdc).toFixed(2)}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-zinc-500">No wallet created yet</p>
                                            )}
                                        </div>

                                        {/* Users section */}
                                        {selected.users && selected.users.length > 0 && (
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Users className="w-3 h-3" /> Users ({selected.users.length})
                                                </h4>
                                                <div className="space-y-1">
                                                    {selected.users.map((user) => (
                                                        <div key={user.id} className="flex items-center justify-between p-2 bg-white/[0.03] rounded text-xs">
                                                            <span className="text-white">{user.name}</span>
                                                            <span className="text-zinc-500">{user.email}</span>
                                                            <Badge variant="outline" className="text-[10px] h-5">{user.role}</Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Offers section */}
                                        {selected.offers && selected.offers.length > 0 && (
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <FileText className="w-3 h-3" /> Offers ({selected.offers.length})
                                                </h4>
                                                <div className="space-y-1">
                                                    {selected.offers.map((offer) => (
                                                        <button
                                                            key={offer.id}
                                                            onClick={() => navigateTo('offers', offer.id)}
                                                            className="w-full text-left flex items-center justify-between p-2 bg-white/[0.03] rounded text-xs hover:bg-white/[0.06] transition-colors group"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <span className="text-white group-hover:text-blue-300 transition-colors">{offer.offerName || offer.name}</span>
                                                                {offer.assetCode && (
                                                                    <span className="text-zinc-500 ml-1.5 font-mono text-[10px]">{offer.assetCode}</span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {offer._count?.investments != null && (
                                                                    <span className="text-zinc-500 text-[10px]">{offer._count.investments} inv</span>
                                                                )}
                                                                <span className="text-emerald-400">
                                                                    {offer.totalSupply ? `$${Number(offer.totalSupply).toLocaleString()}` : offer.totalAmount ? `$${offer.totalAmount.toLocaleString()}` : ''}
                                                                </span>
                                                                <Badge variant="outline" className="text-[10px] h-5">{offer.status}</Badge>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Action footer */}
                            <div className="border-t border-white/[0.06] px-5 py-3 flex items-center gap-2">
                                {selected.status === 'pending' && (
                                    <>
                                        <Button
                                            size="sm"
                                            onClick={handleApprove}
                                            disabled={actionLoading}
                                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                        >
                                            {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                            Approve
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setRejectDialog({ open: true, company: selected })}
                                            disabled={actionLoading}
                                            className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                            Reject
                                        </Button>
                                    </>
                                )}
                                {(selected.status === 'approved' || selected.status === 'active') && selected.stellarContractId && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setSponsorDialog({ open: true, company: selected })}
                                        disabled={actionLoading}
                                        className="gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
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
                                        <Button size="sm" variant="ghost" className="gap-1.5 text-zinc-400">
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

            {/* ── Reject Dialog ── */}
            <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ open, company: rejectDialog.company })}>
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Reject Company</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for rejecting {rejectDialog.company?.name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="reason">Rejection Reason</Label>
                            <Input
                                id="reason"
                                placeholder="e.g., Invalid documentation, incomplete KYC..."
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectDialog({ open: false, company: null })}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || actionLoading}>
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Sponsor Dialog ── */}
            <Dialog open={sponsorDialog.open} onOpenChange={(open) => setSponsorDialog({ open, company: sponsorDialog.company })}>
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Sponsor Company Wallet</DialogTitle>
                        <DialogDescription>
                            Send XLM to {sponsorDialog.company?.name}'s wallet to cover transaction fees.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="xlmAmount">Amount (XLM)</Label>
                            <Input
                                id="xlmAmount"
                                type="number"
                                min="1"
                                max="1000"
                                placeholder="10"
                                value={sponsorAmount}
                                onChange={(e) => setSponsorAmount(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                            <p className="text-xs text-muted-foreground">Default: 10 XLM for transaction fees</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSponsorDialog({ open: false, company: null })}>
                            Cancel
                        </Button>
                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSponsor} disabled={actionLoading}>
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wallet className="w-4 h-4 mr-2" />}
                            Send XLM
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default Companies;
