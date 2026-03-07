import { useEffect, useState } from 'react';
import {
    Search,
    Loader2,
    Coins,
    RefreshCw,
    Lock,
    Unlock,
    Inbox,
    ExternalLink,
    Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { tokensApi } from '@/api/tokens';
import { offersApi } from '@/api/offers';
import { walletsApi } from '@/api/wallets';
import type { Token } from '@/types';
import { formatCurrency } from '@/utils/format';
import { TransactionLink } from '@/components/ui/TransactionLink';
import { TokenManagementModal } from '@/components/admin/TokenManagementModal';
import { toast } from 'sonner';

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────

export function TokensPage() {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selected, setSelected] = useState<Token | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [distributorKey, setDistributorKey] = useState<string | null>(null);
    const [unlocking, setUnlocking] = useState<number | null>(null);
    const [managingToken, setManagingToken] = useState<Token | null>(null);

    useEffect(() => {
        fetchTokens();
        fetchDistributorKey();
    }, []);

    const fetchDistributorKey = async () => {
        try {
            const response = await walletsApi.getWalletStatuses();
            if (response.data) {
                const dist = response.data.find(w => w.name === 'Distributor');
                if (dist) setDistributorKey(dist.publicKey);
            }
        } catch (error) {
            console.error('Failed to fetch distributor key:', error);
        }
    };

    const fetchTokens = async () => {
        try {
            setLoading(true);
            const response = await tokensApi.getAll();
            if (response.success && response.data) {
                setTokens(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch tokens:', error);
        } finally {
            setLoading(false);
        }
    };

    // Keep selected in sync
    useEffect(() => {
        if (selected) {
            const updated = tokens.find((t) => t.id === selected.id);
            if (updated) setSelected(updated);
            else setSelected(null);
        }
    }, [tokens]);

    const filteredTokens = tokens.filter(token =>
        token.assetCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        token.issuerPublicKey.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSync = async () => {
        try {
            setSyncing(true);
            const response = await tokensApi.sync();
            if (response.success) {
                toast.success('Ledger synced successfully');
                fetchTokens();
            }
        } catch (error) {
            console.error('Sync failed:', error);
            toast.error('Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const handleUnlock = async (token: Token) => {
        if (!token.offer?.id) {
            toast.error('Token has no associated offer');
            return;
        }

        const confirmed = window.confirm(
            `⚠️ IRREVERSIBLE ACTION\n\nThis will unlock token "${token.assetCode}" for free trading on DEX.\n\n` +
            `Once unlocked:\n` +
            `• Investors can trade freely without platform approval\n` +
            `• Dividend calculations will use on-chain balances\n` +
            `• This action CANNOT be undone\n\n` +
            `Are you sure you want to proceed?`
        );

        if (!confirmed) return;

        try {
            setUnlocking(token.offer.id);
            const response = await offersApi.unlockToken(token.offer.id);
            if (response.success) {
                toast.success(`Token ${token.assetCode} unlocked successfully!`);
                fetchTokens();
            } else {
                toast.error(`Unlock failed: ${response.error || 'Unknown error'}`);
            }
        } catch (error: any) {
            console.error('Unlock failed:', error);
            toast.error(`Error: ${error.message || 'Failed to unlock token'}`);
        } finally {
            setUnlocking(null);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Search + actions */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <Input
                        placeholder="Search asset code or issuer…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 h-8 text-sm bg-white/[0.03] border-white/[0.06]"
                    />
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSync}
                        disabled={syncing || loading}
                        className="gap-1.5"
                    >
                        {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Sync Ledger
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchTokens} disabled={loading} className="gap-1.5">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Split pane */}
            <div className="grid grid-cols-[minmax(420px,2fr)_3fr] gap-4 min-h-[calc(100vh-220px)]">
                {/* ── Left: Token list ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="grid grid-cols-[32px_1fr_28px_90px_80px] gap-2 items-center px-3 py-2 border-b border-white/[0.06] text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                        <span></span>
                        <span>Token</span>
                        <span className="text-center">
                            <Lock className="w-3 h-3 mx-auto" />
                        </span>
                        <span className="text-right">Supply</span>
                        <span className="text-right">Maturity</span>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                            </div>
                        ) : filteredTokens.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Coins className="w-8 h-8 text-zinc-700 mb-2" />
                                <p className="text-sm text-zinc-500">No tokens found</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.04]">
                                {filteredTokens.map((token) => {
                                    const isSelected = selected?.id === token.id;
                                    const isLocked = token.offer?.isTokenLocked !== false;
                                    return (
                                        <button
                                            key={token.id}
                                            onClick={() => setSelected(token)}
                                            className={`w-full text-left grid grid-cols-[32px_1fr_28px_90px_80px] gap-2 items-center px-3 py-2.5 transition-colors hover:bg-white/[0.04] ${isSelected
                                                ? 'bg-white/[0.06] border-l-2 border-l-blue-500'
                                                : 'border-l-2 border-l-transparent'
                                                }`}
                                        >
                                            {/* Icon */}
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center text-[9px] font-bold text-zinc-300">
                                                {token.assetCode.substring(0, 2)}
                                            </div>

                                            {/* Name + offer */}
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-medium text-white truncate">{token.assetCode}</p>
                                                <p className="text-[11px] text-zinc-500 truncate">
                                                    {token.offer?.offer_name || 'No offer'}
                                                    {token.offer?.status && ` · ${token.offer.status.replace('_', ' ')}`}
                                                </p>
                                            </div>

                                            {/* Lock status */}
                                            <div className="flex justify-center">
                                                {isLocked ? (
                                                    <Lock className="w-3 h-3 text-amber-400" />
                                                ) : (
                                                    <Unlock className="w-3 h-3 text-emerald-400" />
                                                )}
                                            </div>

                                            {/* Supply */}
                                            <p className="text-[12px] text-zinc-400 text-right font-mono">
                                                {formatCurrency(token.totalSupply || 0).replace('$', '')}
                                            </p>

                                            {/* Maturity */}
                                            <p className="text-[11px] text-zinc-500 text-right">
                                                {token.offer?.maturity_date ? formatDate(token.offer.maturity_date as string) : '—'}
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
                            <p className="text-sm text-zinc-500">Select a token to view details</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* Header */}
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center text-sm font-bold text-zinc-300">
                                        {selected.assetCode.substring(0, 2)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-white">{selected.assetCode}</h3>
                                        <p className="text-sm text-zinc-400">
                                            {selected.offer?.offer_name || 'No associated offer'}
                                        </p>
                                    </div>
                                    {selected.offer?.isTokenLocked !== false ? (
                                        <Badge variant="outline" className="shrink-0 gap-1 text-amber-400 border-amber-400/30 bg-amber-400/10">
                                            <Lock className="w-3 h-3" /> Locked
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="shrink-0 gap-1 text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
                                            <Unlock className="w-3 h-3" /> Unlocked
                                        </Badge>
                                    )}
                                </div>

                                {/* Info grid */}
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Supply</p>
                                        <p className="text-sm font-semibold text-white font-mono">{formatCurrency(selected.totalSupply || 0)}</p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Interest Rate</p>
                                        <p className="text-sm font-semibold text-emerald-400">
                                            {selected.offer?.annual_interest_rate ? `${selected.offer.annual_interest_rate}% APY` : '—'}
                                        </p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Offer Status</p>
                                        <p className="text-sm font-medium text-white capitalize">
                                            {selected.offer?.status?.replace('_', ' ') || '—'}
                                        </p>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-3">
                                        <p className="text-[11px] text-zinc-500 mb-1">Maturity</p>
                                        <p className="text-sm font-medium text-white">
                                            {selected.offer?.maturity_date ? formatDate(selected.offer.maturity_date as string) : '—'}
                                        </p>
                                    </div>
                                </div>

                                {/* Issuer Key */}
                                <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Issuer Public Key</h4>
                                    <div className="flex items-center gap-2 bg-white/[0.03] rounded-lg p-3">
                                        <code className="text-xs text-zinc-300 font-mono break-all flex-1">{selected.issuerPublicKey}</code>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(selected.issuerPublicKey)}>
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {/* SAC Contract ID */}
                                {selected.sacContractId && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">SAC Contract ID</h4>
                                        <div className="bg-emerald-500/5 rounded-lg border border-emerald-500/10 p-3">
                                            <div className="flex items-center gap-2">
                                                <code className="text-xs text-emerald-300 font-mono break-all flex-1">{selected.sacContractId}</code>
                                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-emerald-500/10 text-emerald-400" onClick={() => copyToClipboard(selected.sacContractId!)}>
                                                    <Copy className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Issuance transaction */}
                                {selected.issuanceTransactionHash && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Issuance Transaction</h4>
                                        <div className="bg-white/[0.03] rounded-lg p-3">
                                            <TransactionLink
                                                hash={selected.issuanceTransactionHash}
                                                label="View on Stellar Expert"
                                                variant="link"
                                                className="text-emerald-400 hover:text-emerald-300 text-xs"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Action footer */}
                            <div className="border-t border-white/[0.06] px-5 py-3 flex items-center gap-2">
                                {selected.offer?.isTokenLocked !== false && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleUnlock(selected)}
                                        disabled={unlocking === selected.offer?.id}
                                        className="gap-1.5 text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
                                    >
                                        {unlocking === selected.offer?.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Unlock className="w-3.5 h-3.5" />
                                        )}
                                        Unlock Token
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setManagingToken(selected)}
                                    className="gap-1.5"
                                >
                                    Manage Token
                                </Button>
                                <a
                                    href={`https://stellar.expert/explorer/testnet/asset/${selected.assetCode}-${selected.issuerPublicKey}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-auto"
                                >
                                    <Button size="sm" variant="ghost" className="gap-1.5 text-zinc-400">
                                        <ExternalLink className="w-3.5 h-3.5" /> Explorer
                                    </Button>
                                </a>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Token Management Modal (kept as overlay for complex management) */}
            {managingToken && (
                <TokenManagementModal
                    token={managingToken}
                    distributorPublicKey={distributorKey}
                    walletName="Tokens"
                    onClose={() => setManagingToken(null)}
                />
            )}
        </div>
    );
}

export default TokensPage;
