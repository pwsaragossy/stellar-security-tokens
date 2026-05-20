import { useState, useEffect, useCallback } from 'react';
import {
    Search, Loader2, RefreshCw, Inbox, Check, Copy,
    Pause, Play, Upload, DollarSign, Clock, Trash2, ArrowUpCircle,
    Snowflake, ExternalLink, Lock, Unlock, Users, Calendar, Percent, Tag,
    Landmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import api from '@/api/client';
import { RelatedEntities } from '@/components/admin/RelatedEntities';
import { useAutoSelect } from '@/hooks/useAdminNavigation';

// ─── Types ─────────────────────────────────────────

interface ContractItem {
    id: number;
    offerName: string;
    assetCode: string;
    sorobanContractId: string | null;
    sorobanInitStatus: string;
    sorobanInitError: string | null;
    status: string;
    unitPrice: string;
    totalSupply: string;
    createdAt: string;
}

interface ContractDetailOffer extends ContractItem {
    sacContractId: string | null;
    offerType?: string;
    paymentType?: string;
    annualInterestRate?: string | number;
    maturityDate?: string;
    description?: string;
    isTokenLocked?: boolean;
    investmentCount?: number;
}

interface ContractDetailCompany {
    id: number;
    name: string;
    cnpj?: string;
    stellarContractId?: string;
}

interface ContractDetailToken {
    id: number;
    assetCode: string;
    sacContractId?: string;
    issuerPublicKey?: string;
    totalSupply?: string;
    issuanceTransactionHash?: string;
}

interface ContractDetail {
    offer: ContractDetailOffer;
    company: ContractDetailCompany | null;
    token: ContractDetailToken | null;
    onChain: { offer: any; balance: string; version: number | null };
    settlementContract?: {
        contractId: string | null;
        balance: string | null;
    } | null;
}

type ActionType = 'pause' | 'resume' | 'deposit' | 'price' | 'withdraw' | 'freeze' |
    'drain' | 'upgrade' | 'ttl' | 'retry' | 'propose_admin' | 'accept_admin' | null;

// ─── Design tokens ─────────────────────────────────

const INIT_STATUS: Record<string, { label: string; className: string }> = {
    deploying: { label: 'Deploying…', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    deployed: { label: 'Deployed', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    creating: { label: 'Creating…', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    created: { label: 'Ready', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    failed: { label: 'Failed', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

// ─── Component ─────────────────────────────────────

export function Contracts() {
    const [contracts, setContracts] = useState<ContractItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ContractDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Action dialog
    const [action, setAction] = useState<{ type: ActionType; data?: any }>({ type: null });
    const [actionInput, setActionInput] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    // F-014 typed-confirm state. For irreversible ops (drain / upgrade) the
    // operator must type the offer's asset code before the confirm button
    // becomes enabled. Mirrors the propose-admin double-entry pattern in
    // AdminOffers.tsx — protects against late-night misclicks.
    const [confirmTypedValue, setConfirmTypedValue] = useState('');
    const isTypedConfirmRequired = action.type === 'drain' || action.type === 'upgrade';
    const typedConfirmMatches = isTypedConfirmRequired
        ? confirmTypedValue.trim().toUpperCase() === (selected?.offer.assetCode || '').toUpperCase()
        : true;
    const closeAction = () => {
        setAction({ type: null });
        setActionInput({});
        setConfirmTypedValue('');
    };

    // ─── Data loading ──────────────────────────────

    const loadContracts = async () => {
        try {
            setLoading(true);
            const res = await api.get('/admin/contracts');
            setContracts(res.data.contracts || []);
        } catch (err: any) {
            toast.error(err.message || 'Failed to load contracts');
        } finally {
            setLoading(false);
        }
    };

    const loadDetail = useCallback(async (offerId: number) => {
        try {
            setDetailLoading(true);
            const res = await api.get(`/admin/contracts/${offerId}`);
            setSelected(res.data);
        } catch (err: any) {
            toast.error(err.message || 'Failed to load detail');
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        loadContracts();
        const i = setInterval(loadContracts, 30000);
        return () => clearInterval(i);
    }, []);

    // Auto-select from URL ?id= param (for cross-navigation)
    useAutoSelect(loadDetail);

    // ─── Actions ───────────────────────────────────

    const openAction = (type: ActionType) => {
        setAction({ type });
        setActionInput({});
    };

    const executeAction = async () => {
        if (!action.type || !selected) return;
        setSubmitting(true);
        const offerId = selected.offer.id;
        try {
            let res;
            switch (action.type) {
                case 'pause':
                    res = await api.post(`/admin/contracts/${offerId}/pause`);
                    break;
                case 'resume':
                    res = await api.post(`/admin/contracts/${offerId}/resume`);
                    break;
                case 'deposit':
                    res = await api.post(`/admin/contracts/${offerId}/deposit`, {
                        amount: parseFloat(actionInput.amount || '0'),
                    });
                    break;
                case 'price':
                    res = await api.post(`/admin/contracts/${offerId}/price`, {
                        sellPrice: parseInt(actionInput.sellPrice || '0'),
                        buyPrice: parseInt(actionInput.buyPrice || '0'),
                    });
                    break;
                case 'withdraw':
                    res = await api.post(`/admin/contracts/${offerId}/withdraw`, {
                        amount: parseFloat(actionInput.amount || '0'),
                    });
                    break;
                case 'freeze':
                    res = await api.post(`/admin/contracts/${offerId}/freeze`, {
                        buyerAddress: actionInput.buyerAddress,
                        frozen: actionInput.frozen !== 'false',
                    });
                    break;
                case 'drain':
                    res = await api.post(`/admin/contracts/${offerId}/drain`, {}, {
                        headers: { 'X-Confirm': 'true' },
                    });
                    break;
                case 'upgrade':
                    res = await api.post(`/admin/contracts/${offerId}/upgrade`, {
                        wasmHash: actionInput.wasmHash,
                    }, { headers: { 'X-Confirm': 'true' } });
                    break;
                case 'ttl':
                    res = await api.post(`/admin/contracts/${offerId}/ttl`);
                    break;
                case 'retry':
                    res = await api.post(`/admin/contracts/${offerId}/retry`);
                    break;
                case 'propose_admin':
                    res = await api.post(`/admin/contracts/${offerId}/propose-admin`, {
                        newAdmin: actionInput.newAdmin,
                    });
                    break;
                case 'accept_admin':
                    res = await api.post(`/admin/contracts/${offerId}/accept-admin`);
                    break;
            }

            if (res?.data?.status === 'pending_multisig') {
                toast.success('Queued for MultiSig approval');
            } else {
                toast.success(`${action.type} executed`);
            }
            closeAction();
            await loadDetail(offerId);
            await loadContracts();
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Filtering ─────────────────────────────────

    const filtered = contracts.filter(c =>
        (c.offerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.assetCode || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ─── Render ────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Top bar */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <Input
                        placeholder="Search contracts…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-8 h-8 text-sm bg-white/[0.03] border-white/[0.06]"
                    />
                </div>
                <Button variant="outline" size="sm" onClick={loadContracts} disabled={loading} className="gap-1.5">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Split layout */}
            <div className="grid grid-cols-[minmax(380px,2fr)_3fr] gap-4 min-h-[calc(100vh-220px)]">
                {/* Left: list */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    <div className="grid grid-cols-[1fr_100px_80px] gap-2 items-center px-3 py-2 border-b border-white/[0.06] text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                        <span>Contract</span>
                        <span className="text-center">Status</span>
                        <span className="text-right">Created</span>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <Inbox className="w-8 h-8 text-zinc-700 mb-2" />
                                <p className="text-sm text-zinc-500">No contracts deployed</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.04]">
                                {filtered.map(c => {
                                    const isSelected = selected?.offer.id === c.id;
                                    const initCfg = INIT_STATUS[c.sorobanInitStatus] || INIT_STATUS.failed;
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => loadDetail(c.id)}
                                            className={`w-full text-left grid grid-cols-[1fr_100px_80px] gap-2 items-center px-3 py-2.5 transition-colors hover:bg-white/[0.04] ${isSelected ? 'bg-white/[0.06] border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'}`}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-medium text-white truncate">{c.offerName || c.assetCode}</p>
                                                <p className="text-[11px] text-zinc-500 font-mono truncate">{c.sorobanContractId?.slice(0, 12)}…</p>
                                            </div>
                                            <div className="text-center">
                                                <Badge variant="outline" className={`text-[10px] ${initCfg.className}`}>{initCfg.label}</Badge>
                                            </div>
                                            <p className="text-[11px] text-zinc-500 text-right">
                                                {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: detail */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    {!selected ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8">
                            <Inbox className="w-10 h-10 text-zinc-700 mb-3" />
                            <p className="text-sm text-zinc-500">Select a contract to view details</p>
                        </div>
                    ) : detailLoading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* Header */}
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center text-sm font-bold text-zinc-300">
                                        {selected.offer.assetCode?.slice(0, 3) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-white">{selected.offer.offerName}</h3>
                                        <p className="text-[11px] text-zinc-500 font-mono">{selected.offer.sorobanContractId}</p>
                                    </div>
                                    <Badge variant="outline" className={INIT_STATUS[selected.offer.sorobanInitStatus]?.className || ''}>
                                        {INIT_STATUS[selected.offer.sorobanInitStatus]?.label || selected.offer.sorobanInitStatus}
                                    </Badge>
                                </div>

                                {/* Cross-links */}
                                <RelatedEntities items={[
                                    ...(selected.company ? [{ tab: 'companies' as const, id: selected.company.id, label: selected.company.name }] : []),
                                    { tab: 'offers', id: selected.offer.id, label: selected.offer.offerName || selected.offer.assetCode },
                                    ...(selected.token ? [{ tab: 'tokens' as const, id: selected.token.id, label: selected.token.assetCode }] : []),
                                ]} />

                                {/* On-chain stats */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">On-Chain Balance</p>
                                        <p className="text-sm font-mono font-medium text-emerald-400">
                                            {selected.onChain?.balance || '0'}
                                        </p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Active</p>
                                        <p className="text-sm font-medium text-white">
                                            {selected.onChain?.offer?.is_active ? '🟢 Yes' : '🔴 No'}
                                        </p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Version</p>
                                        <p className="text-sm font-mono text-white">{selected.onChain?.version ?? '—'}</p>
                                    </div>
                                </div>

                                {/* Offer & Token info */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        <Tag className="w-3.5 h-3.5 text-zinc-500" />
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Type</p>
                                            <p className="text-sm text-white capitalize">{selected.offer.offerType || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Payment</p>
                                            <p className="text-sm text-white capitalize">{selected.offer.paymentType?.replace('_', ' ') || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        <Percent className="w-3.5 h-3.5 text-zinc-500" />
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Interest Rate</p>
                                            <p className="text-sm text-white">{selected.offer.annualInterestRate ? `${Number(selected.offer.annualInterestRate).toFixed(2)}%` : '—'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        <DollarSign className="w-3.5 h-3.5 text-zinc-500" />
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Unit Price</p>
                                            <p className="text-sm font-mono text-white">{selected.offer.unitPrice ?? '—'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Maturity</p>
                                            <p className="text-sm text-white">{selected.offer.maturityDate ? new Date(selected.offer.maturityDate).toLocaleDateString() : '—'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        <Users className="w-3.5 h-3.5 text-zinc-500" />
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Investors</p>
                                            <p className="text-sm text-white">{selected.offer.investmentCount ?? 0}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        {selected.offer.isTokenLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-emerald-400" />}
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Token</p>
                                            <p className="text-sm text-white">{selected.offer.isTokenLocked ? 'Locked' : 'Unlocked'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3 flex items-center gap-2">
                                        <DollarSign className="w-3.5 h-3.5 text-zinc-500" />
                                        <div>
                                            <p className="text-[11px] text-zinc-500">Total Supply</p>
                                            <p className="text-sm font-mono text-white">{Number(selected.offer.totalSupply || 0).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                {selected.offer.description && (
                                    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                                        <p className="text-[11px] text-zinc-500 mb-1">Description</p>
                                        <p className="text-sm text-zinc-300 line-clamp-3">{selected.offer.description}</p>
                                    </div>
                                )}

                                {/* Contract ID + Explorer */}
                                {selected.offer.sorobanContractId && (
                                    <div className="bg-blue-500/5 rounded-lg border border-blue-500/10 p-3 flex items-center gap-2">
                                        <code className="text-xs text-blue-300 font-mono flex-1 break-all">{selected.offer.sorobanContractId}</code>
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-400"
                                            onClick={() => navigator.clipboard.writeText(selected.offer.sorobanContractId || '')}>
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                        <a href={`https://stellar.expert/explorer/testnet/contract/${selected.offer.sorobanContractId}`}
                                            target="_blank" rel="noopener noreferrer">
                                            <Button variant="ghost" size="sm" className="h-7 px-2 text-blue-400 gap-1">
                                                <ExternalLink className="w-3 h-3" /> Explorer
                                            </Button>
                                        </a>
                                    </div>
                                )}

                                {/* Error */}
                                {selected.offer.sorobanInitError && (
                                    <div className="bg-red-500/5 rounded-lg border border-red-500/10 p-3">
                                        <p className="text-[10px] text-red-400 uppercase font-bold mb-1">Init Error</p>
                                        <p className="text-sm text-red-300">{selected.offer.sorobanInitError}</p>
                                    </div>
                                )}

                                {/* Settlement Contract */}
                                {selected.settlementContract?.contractId && (
                                    <div className="bg-purple-500/5 rounded-xl border border-purple-500/15 p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Landmark className="w-3.5 h-3.5 text-purple-400" />
                                            <p className="text-[10px] text-purple-400 uppercase font-bold">Settlement Contract</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <code className="text-xs text-purple-300 font-mono flex-1 break-all">
                                                {selected.settlementContract.contractId}
                                            </code>
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-purple-400"
                                                onClick={() => navigator.clipboard.writeText(selected.settlementContract?.contractId || '')}>
                                                <Copy className="w-3.5 h-3.5" />
                                            </Button>
                                            <a href={`https://stellar.expert/explorer/testnet/contract/${selected.settlementContract.contractId}`}
                                                target="_blank" rel="noopener noreferrer">
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-purple-400 gap-1">
                                                    <ExternalLink className="w-3 h-3" /> Explorer
                                                </Button>
                                            </a>
                                        </div>
                                        {selected.settlementContract.balance && (
                                            <div className="bg-white/[0.03] rounded-lg px-3 py-2 flex items-center justify-between">
                                                <span className="text-[11px] text-zinc-500">USDC Balance</span>
                                                <span className={`text-sm font-mono font-medium ${parseFloat(selected.settlementContract.balance) > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                                    {parseFloat(selected.settlementContract.balance).toLocaleString()} USDC
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Action footer */}
                            <div className="border-t border-white/[0.06] px-5 py-3 flex items-center gap-2 flex-wrap">
                                {/* 🟢 Day-to-day ops */}
                                <Button size="sm" variant="outline" onClick={() => openAction('pause')} className="gap-1.5 text-amber-400 border-amber-500/30">
                                    <Pause className="w-3.5 h-3.5" /> Pause
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openAction('resume')} className="gap-1.5 text-emerald-400 border-emerald-500/30">
                                    <Play className="w-3.5 h-3.5" /> Resume
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openAction('deposit')} className="gap-1.5 text-blue-400 border-blue-500/30">
                                    <Upload className="w-3.5 h-3.5" /> Deposit
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openAction('price')} className="gap-1.5 text-zinc-300 border-white/10">
                                    <DollarSign className="w-3.5 h-3.5" /> Price
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openAction('ttl')} className="gap-1.5 text-zinc-300 border-white/10">
                                    <Clock className="w-3.5 h-3.5" /> Extend TTL
                                </Button>

                                {/* ⚠️ Sensitive ops */}
                                <Button size="sm" variant="outline" onClick={() => openAction('withdraw')} className="gap-1.5 text-orange-400 border-orange-500/30">
                                    <ArrowUpCircle className="w-3.5 h-3.5" /> Withdraw
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openAction('freeze')} className="gap-1.5 text-cyan-400 border-cyan-500/30">
                                    <Snowflake className="w-3.5 h-3.5" /> Freeze
                                </Button>

                                {/* 🔴 Destructive */}
                                <Button size="sm" variant="outline" onClick={() => openAction('drain')} className="gap-1.5 text-red-400 border-red-500/30 ml-auto">
                                    <Trash2 className="w-3.5 h-3.5" /> Emergency Drain
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Action dialogs ── */}
            <Dialog open={!!action.type} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className={action.type === 'drain' || action.type === 'upgrade' ? 'text-red-400' : 'text-blue-400'}>
                            {action.type === 'drain' ? '⚠️ Emergency Drain' :
                                action.type === 'upgrade' ? '⚠️ Upgrade Contract WASM' :
                                    action.type?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </DialogTitle>
                        <DialogDescription>
                            {action.type === 'drain' && 'This will PAUSE the sale AND withdraw ALL tokens immediately. This action cannot be undone.'}
                            {action.type === 'deposit' && 'Deposit sell tokens to the contract. This is a 2-step process (authorize + transfer).'}
                            {action.type === 'price' && 'Update the sell/buy prices. Takes effect for new trades only.'}
                            {action.type === 'freeze' && 'Freeze or unfreeze a buyer address on this contract.'}
                            {action.type === 'withdraw' && 'Withdraw tokens from the contract. Tokens go to the admin/issuer account.'}
                            {action.type === 'upgrade' && 'Replace the contract WASM. This is irreversible.'}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Input fields */}
                    {(action.type === 'deposit' || action.type === 'withdraw') && (
                        <Input type="number" placeholder="Amount (human units, e.g. 100.50)" value={actionInput.amount || ''}
                            onChange={e => setActionInput({ ...actionInput, amount: e.target.value })} className="bg-black/20 border-white/10" />
                    )}
                    {action.type === 'price' && (
                        <div className="space-y-2">
                            <Input type="number" placeholder="Sell price (integer)" value={actionInput.sellPrice || ''}
                                onChange={e => setActionInput({ ...actionInput, sellPrice: e.target.value })} className="bg-black/20 border-white/10" />
                            <Input type="number" placeholder="Buy price (integer)" value={actionInput.buyPrice || ''}
                                onChange={e => setActionInput({ ...actionInput, buyPrice: e.target.value })} className="bg-black/20 border-white/10" />
                        </div>
                    )}
                    {action.type === 'freeze' && (
                        <div className="space-y-2">
                            <Input placeholder="Buyer address (G... or C...)" value={actionInput.buyerAddress || ''}
                                onChange={e => setActionInput({ ...actionInput, buyerAddress: e.target.value })} className="bg-black/20 border-white/10" />
                            <div className="flex gap-2">
                                <Button size="sm" variant={actionInput.frozen !== 'false' ? 'default' : 'outline'} onClick={() => setActionInput({ ...actionInput, frozen: 'true' })}>Freeze</Button>
                                <Button size="sm" variant={actionInput.frozen === 'false' ? 'default' : 'outline'} onClick={() => setActionInput({ ...actionInput, frozen: 'false' })}>Unfreeze</Button>
                            </div>
                        </div>
                    )}
                    {action.type === 'upgrade' && (
                        <Input placeholder="New WASM hash (64-char hex)" value={actionInput.wasmHash || ''}
                            onChange={e => setActionInput({ ...actionInput, wasmHash: e.target.value })} className="bg-black/20 border-white/10 font-mono" />
                    )}
                    {action.type === 'propose_admin' && (
                        <Input placeholder="New admin address (G... or C...)" value={actionInput.newAdmin || ''}
                            onChange={e => setActionInput({ ...actionInput, newAdmin: e.target.value })} className="bg-black/20 border-white/10" />
                    )}

                    {/* F-014 — typed-confirm gate for irreversible ops. */}
                    {isTypedConfirmRequired && selected && (
                        <div className="space-y-2 pt-1">
                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                                <strong>This action is destructive.</strong> Type the asset code
                                <code className="mx-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-100 font-mono">{selected.offer.assetCode}</code>
                                to enable the confirm button.
                            </div>
                            <Input
                                placeholder={`Type ${selected.offer.assetCode} to confirm`}
                                value={confirmTypedValue}
                                onChange={e => setConfirmTypedValue(e.target.value)}
                                className="bg-black/20 border-red-500/30 font-mono"
                                spellCheck={false}
                                autoCapitalize="off"
                                autoCorrect="off"
                            />
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => closeAction()} className="border-white/10">Cancel</Button>
                        <Button
                            onClick={executeAction}
                            disabled={submitting || !typedConfirmMatches}
                            className={`${action.type === 'drain' || action.type === 'upgrade' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-40`}
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default Contracts;
