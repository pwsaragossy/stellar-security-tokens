import { useEffect, useState } from 'react';
import {
    Wallet,
    PenTool,
    Loader2,
    Copy,
    Clock,
    AlertCircle,
    ExternalLink,
    Info,
    Settings,
    Inbox,
    RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { walletsApi } from '@/api/wallets';
import type { WalletStatus, MultiSigTransaction } from '@/api/wallets';
import { TokenManagementModal } from '@/components/admin/TokenManagementModal';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────

interface TokenBalance {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
    id?: number;
    assetCode?: string;
    issuerPublicKey?: string;
    totalSupply?: string;
}

// ─── Component ────────────────────────────────────────────────────────────

export function Wallets() {
    const [loading, setLoading] = useState(true);
    const [wallets, setWallets] = useState<WalletStatus[]>([]);
    const [proposals, setProposals] = useState<MultiSigTransaction[]>([]);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<WalletStatus | null>(null);
    const [managingToken, setManagingToken] = useState<TokenBalance | null>(null);

    // ─── Data loading ─────────────────────────────────────────────────────

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [walletRes, proposalsRes] = await Promise.all([
                walletsApi.getWalletStatuses(),
                walletsApi.getTransactionProposals('pending'),
            ]);
            setWallets(walletRes.data);
            setProposals(proposalsRes.data);
        } catch (err) {
            console.error('Failed to load wallet data', err);
            setError('Failed to load wallet data');
        } finally {
            setLoading(false);
        }
    };

    // Keep selected in sync
    useEffect(() => {
        if (selected) {
            const updated = wallets.find((w) => w.name === selected.name);
            if (updated) setSelected(updated);
        }
    }, [wallets]);

    // ─── Actions ──────────────────────────────────────────────────────────

    const handleSign = async (id: number) => {
        if (!confirm('This will simulate signing the transaction with your admin key. Proceed?')) return;
        setError('');
        try {
            const proposal = proposals.find((p) => p.id === id);
            if (!proposal) return;
            await walletsApi.submitTransaction(id, proposal.xdr);
            toast.success('Transaction signed and submitted');
            loadData();
        } catch (err: any) {
            console.error('Failed to sign/submit', err);
            toast.error(err.response?.data?.error || 'Failed to sign/submit transaction');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const WALLET_DESCRIPTIONS: Record<string, string> = {
        Treasury: 'Strategic vault for platform revenue and interest reserves. Primary source for automated distribution events.',
        Issuer: 'Master account for security token minting. Operates as the legal root of trust for all smart assets.',
        Distributor: 'Intermediate staging vault for secondary market liquidity and investor onboarding batches.',
        Operations: 'Operational account for gas fees, channel management, and automated transaction sponsoring.',
    };

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Top bar */}
            <div className="flex items-center gap-2">
                <div className="ml-auto">
                    <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Split pane */}
            <div className="grid grid-cols-[minmax(320px,1fr)_2fr] gap-4 min-h-[calc(100vh-220px)]">
                {/* ── Left: Wallet list ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    <div className="px-3 py-2 border-b border-white/[0.06] text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                        System Wallets
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.04]">
                                {wallets.map((wallet) => {
                                    const isSelected = selected?.name === wallet.name;
                                    const activeBalances = wallet.balances.filter((b) => parseFloat(b.balance) > 0);
                                    return (
                                        <button
                                            key={wallet.name}
                                            onClick={() => setSelected(wallet)}
                                            className={`w-full text-left px-3 py-3 transition-colors hover:bg-white/[0.04] ${isSelected
                                                ? 'bg-white/[0.06] border-l-2 border-l-blue-500'
                                                : 'border-l-2 border-l-transparent'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-white/[0.08] flex items-center justify-center">
                                                    <Wallet className="w-4 h-4 text-emerald-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-[13px] font-medium text-white">{wallet.name}</p>
                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${wallet.exists ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                                    </div>
                                                    <p className="text-[11px] text-zinc-500 font-mono truncate">
                                                        {wallet.publicKey?.substring(0, 8)}…{wallet.publicKey?.substring(48)}
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Balance summary */}
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {wallet.exists && activeBalances.length > 0 ? (
                                                    activeBalances.slice(0, 3).map((b, i) => (
                                                        <span key={i} className="text-[11px] bg-white/[0.04] px-1.5 py-0.5 rounded text-zinc-400">
                                                            {parseFloat(b.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-emerald-400">{b.asset_code || 'XLM'}</span>
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-[11px] text-zinc-600">
                                                        {wallet.exists ? '0.00 XLM' : 'Not created'}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Pending proposals section */}
                        {proposals.length > 0 && (
                            <>
                                <div className="px-3 py-2 border-t border-b border-white/[0.06] text-[11px] text-zinc-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" />
                                    Pending Proposals ({proposals.length})
                                </div>
                                <div className="divide-y divide-white/[0.04]">
                                    {proposals.map((prop) => (
                                        <div key={prop.id} className="px-3 py-3 space-y-2">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="text-[13px] text-white font-medium">{prop.description || 'No description'}</p>
                                                    <p className="text-[11px] text-zinc-500">#{prop.id} · {new Date(prop.createdAt).toLocaleDateString()}</p>
                                                </div>
                                                <Badge variant="outline" className="text-[10px] h-5">{prop.status}</Badge>
                                            </div>
                                            <div className="flex justify-end">
                                                <Button variant="outline" size="sm" onClick={() => handleSign(prop.id)} className="gap-1 text-xs h-7">
                                                    <PenTool className="w-3 h-3" /> Sign & Submit
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Right: Detail panel ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    {!selected ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                            <Inbox className="w-10 h-10 text-zinc-700 mb-3" />
                            <p className="text-sm text-zinc-500">Select a wallet to view details</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {/* Header */}
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center">
                                    <Wallet className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-semibold text-white">{selected.name} Wallet</h3>
                                    <p className="text-sm text-zinc-400">System account</p>
                                </div>
                                <Badge variant={selected.exists ? 'default' : 'destructive'} className={selected.exists ? 'bg-emerald-600' : ''}>
                                    {selected.exists ? 'Active on Network' : 'Not Created'}
                                </Badge>
                            </div>

                            {/* Public key */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Wallet Address</h4>
                                <div className="flex items-center gap-2 bg-white/[0.03] rounded-lg p-3">
                                    <code className="text-xs text-emerald-400/80 font-mono break-all flex-1">{selected.publicKey}</code>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(selected.publicKey)}>
                                        <Copy className="w-3.5 h-3.5" />
                                    </Button>
                                    <a href={`https://stellar.expert/explorer/testnet/account/${selected.publicKey}`} target="_blank" rel="noopener noreferrer">
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </Button>
                                    </a>
                                </div>
                            </div>

                            {/* Balances */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Asset Distribution</h4>
                                {selected.exists && selected.balances.filter((b) => parseFloat(b.balance) > 0).length > 0 ? (
                                    <div className="bg-white/[0.03] rounded-lg overflow-hidden border border-white/[0.06]">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-white/[0.06]">
                                                    <th className="text-left p-3 text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Asset</th>
                                                    <th className="text-right p-3 text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Balance</th>
                                                    <th className="text-right p-3 text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/[0.04]">
                                                {selected.balances
                                                    .filter((b) => parseFloat(b.balance) > 0)
                                                    .map((b, i) => (
                                                        <tr
                                                            key={i}
                                                            className="cursor-pointer hover:bg-white/[0.04] transition-colors group"
                                                            onClick={() => setManagingToken(b)}
                                                        >
                                                            <td className="p-3">
                                                                <span className="text-emerald-400 font-bold">{b.asset_code || 'XLM'}</span>
                                                                {b.asset_issuer && (
                                                                    <span className="text-[10px] text-zinc-500 ml-2 font-mono">
                                                                        {b.asset_issuer.substring(0, 8)}...
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-right text-white font-mono">
                                                                {parseFloat(b.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                            </td>
                                                            <td className="p-3 text-right">
                                                                <Button variant="ghost" size="sm" className="h-7 text-zinc-500 group-hover:text-emerald-400 group-hover:bg-emerald-400/10">
                                                                    <Settings className="w-3.5 h-3.5 mr-1.5" /> Manage
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="bg-white/[0.03] rounded-lg p-8 text-center border border-dashed border-white/[0.06]">
                                        <p className="text-sm text-zinc-500 italic">
                                            {selected.exists ? 'No tokens in this wallet' : 'Wallet not yet registered on the Stellar ledger'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Role description */}
                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3">
                                <div className="flex gap-3">
                                    <Info className="w-4 h-4 text-blue-400/60 shrink-0 mt-0.5" />
                                    <p className="text-xs text-blue-300/80 leading-relaxed italic">
                                        {WALLET_DESCRIPTIONS[selected.name] || 'System wallet account.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Token Management Modal (kept as overlay) */}
            {managingToken && (
                <TokenManagementModal
                    token={managingToken}
                    walletName={selected?.name || ''}
                    distributorPublicKey={null}
                    onClose={() => setManagingToken(null)}
                />
            )}
        </div>
    );
}

export default Wallets;
