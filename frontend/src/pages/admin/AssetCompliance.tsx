import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import {
    Loader2,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Search,
    RefreshCw,
    ArrowDownToLine,
    Lock,
    Unlock,
    ExternalLink,
    Users,
    Copy
} from 'lucide-react';
import { tokensApi } from '@/api/tokens';
import api from '@/api/client';
import type { Token } from '@/types';
import { cn } from '@/lib/utils';

interface Holder {
    publicKey: string;
    balance: string;
    authorized: boolean;
    clawbackEnabled: boolean;
}

export function AssetCompliance() {
    // const navigate = useNavigate(); // Removed unused
    const [tokens, setTokens] = useState<Token[]>([]);
    const [selectedAsset, setSelectedAsset] = useState<string>('');
    const [holders, setHolders] = useState<Holder[]>([]);
    const [loadingTokens, setLoadingTokens] = useState(true);
    const [loadingHolders, setLoadingHolders] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<React.ReactNode | string | null>(null);
    const [search, setSearch] = useState('');

    // Clawback Modal State
    const [clawbackModal, setClawbackModal] = useState<{ open: boolean; holder: Holder | null }>({
        open: false,
        holder: null
    });
    const [clawbackAmount, setClawbackAmount] = useState('');

    useEffect(() => {
        loadTokens();
    }, []);

    useEffect(() => {
        if (selectedAsset) {
            loadHolders();
        }
    }, [selectedAsset]);

    const loadTokens = async () => {
        try {
            setLoadingTokens(true);
            const response = await tokensApi.getAll();
            const data = response.data || [];
            setTokens(data);
            if (data.length > 0 && !selectedAsset) {
                setSelectedAsset(data[0].asset_code);
            }
        } catch (err: any) {
            setError('Failed to load assets');
        } finally {
            setLoadingTokens(false);
        }
    };

    const loadHolders = async () => {
        try {
            setLoadingHolders(true);
            const response = await api.get(`/tokens/${selectedAsset}/holders`);
            setHolders(response.data.data || []);
        } catch (err: any) {
            setError('Failed to load holders');
        } finally {
            setLoadingHolders(false);
        }
    };

    const handleFreeze = async (holder: Holder) => {
        setActionLoading(holder.publicKey);
        setError(null);
        setSuccess(null);
        try {
            const response = await tokensApi.freeze({
                investorPublicKey: holder.publicKey,
                assetCode: selectedAsset
            });

            if (response.data.status === 'pending_multisig') {
                setSuccess(
                    <div className="flex flex-col gap-1">
                        <span>Freeze request queued for MultiSig approval</span>
                        <Link to="/admin/transactions" className="text-emerald-400 underline font-bold hover:text-emerald-300">
                            Go to Transaction Queue →
                        </Link>
                    </div>
                );
            } else {
                setSuccess('Account frozen successfully');
            }
            await loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to freeze account');
        } finally {
            setActionLoading(null);
        }
    };

    const handleUnfreeze = async (holder: Holder) => {
        setActionLoading(holder.publicKey);
        setError(null);
        setSuccess(null);
        try {
            const response = await tokensApi.unfreeze({
                investorPublicKey: holder.publicKey,
                assetCode: selectedAsset
            });

            if (response.data.status === 'pending_multisig') {
                setSuccess(
                    <div className="flex flex-col gap-1">
                        <span>Unfreeze request queued for MultiSig approval</span>
                        <Link to="/admin/transactions" className="text-emerald-400 underline font-bold hover:text-emerald-300">
                            Go to Transaction Queue →
                        </Link>
                    </div>
                );
            } else {
                setSuccess('Account unfrozen successfully');
            }
            await loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to unfreeze account');
        } finally {
            setActionLoading(null);
        }
    };

    const handleClawback = async () => {
        if (!clawbackModal.holder || !clawbackAmount) return;
        setActionLoading('clawback');
        setError(null);
        setSuccess(null);
        try {
            const response = await tokensApi.clawback({
                investorPublicKey: clawbackModal.holder.publicKey,
                assetCode: selectedAsset,
                amount: clawbackAmount
            });

            if (response.data.status === 'pending_multisig') {
                setSuccess(
                    <div className="flex flex-col gap-1">
                        <span>Clawback request queued for MultiSig approval</span>
                        <Link to="/admin/transactions" className="text-emerald-400 underline font-bold hover:text-emerald-300">
                            Go to Transaction Queue →
                        </Link>
                    </div>
                );
            } else {
                setSuccess('Clawback successful');
            }
            setClawbackModal({ open: false, holder: null });
            setClawbackAmount('');
            await loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Clawback failed');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDisableClawback = async (holder: Holder) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY disable clawback for this trustline? This action provides finality of ownership and cannot be undone.`)) {
            return;
        }

        setActionLoading(holder.publicKey);
        setError(null);
        setSuccess(null);
        try {
            const response = await tokensApi.disableClawback({
                investorPublicKey: holder.publicKey,
                assetCode: selectedAsset
            });

            if (response.data.status === 'pending_multisig') {
                setSuccess(
                    <div className="flex flex-col gap-1">
                        <span>Finality request queued for MultiSig approval</span>
                        <Link to="/admin/transactions" className="text-emerald-400 underline font-bold hover:text-emerald-300">
                            Go to Transaction Queue →
                        </Link>
                    </div>
                );
            } else {
                setSuccess('Finality applied successfully');
            }
            await loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to disable clawback');
        } finally {
            setActionLoading(null);
        }
    };

    const filteredHolders = holders.filter(h =>
        h.publicKey.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shield className="w-6 h-6 text-red-500" />
                        Asset Compliance
                    </h2>
                    <p className="text-muted-foreground mt-1">Manage asset authorization, freezing, and clawbacks</p>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    {loadingTokens ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                        <select
                            value={selectedAsset}
                            onChange={(e) => setSelectedAsset(e.target.value)}
                            className="w-full md:w-[200px] bg-slate-900 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                            <option value="" disabled>Select Asset</option>
                            {tokens.map(token => (
                                <option key={token.asset_code} value={token.asset_code}>
                                    {token.asset_code}
                                </option>
                            ))}
                        </select>
                    )}

                    <Button variant="outline" size="icon" onClick={loadHolders} disabled={loadingHolders}>
                        <RefreshCw className={cn("w-4 h-4", loadingHolders && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm flex items-center justify-between text-left">
                    <span>{error}</span>
                    <Button variant="ghost" size="sm" onClick={() => setError(null)}>×</Button>
                </div>
            )}

            {success && (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 text-sm flex items-center justify-between text-left animate-in fade-in slide-in-from-top-1">
                    <span>{success}</span>
                    <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>×</Button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Stats */}
                <Card className="lg:col-span-1 bg-white/5 border-white/5 glass-panel">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-muted-foreground">Asset Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-2xl font-bold text-white">{selectedAsset || '---'}</p>
                            <p className="text-xs text-muted-foreground mb-2">Active Security Token</p>
                            {tokens.find(t => t.asset_code === selectedAsset)?.sacContractId && (
                                <div className="p-2 bg-white/5 rounded-lg border border-white/10 mt-2">
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Soroban SAC ID</p>
                                    <div className="flex items-center justify-between gap-1">
                                        <code className="text-[10px] text-emerald-400 truncate flex-1">
                                            {tokens.find(t => t.asset_code === selectedAsset)?.sacContractId}
                                        </code>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(tokens.find(t => t.asset_code === selectedAsset)?.sacContractId || '')}
                                            className="text-muted-foreground hover:text-white"
                                        >
                                            <Copy className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Holders
                                </span>
                                <span className="text-sm font-bold text-white">{holders.length}</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Authorized
                                </span>
                                <span className="text-sm font-bold text-emerald-500">
                                    {holders.filter(h => h.authorized).length}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4 text-red-500" /> Frozen
                                </span>
                                <span className="text-sm font-bold text-red-500">
                                    {holders.filter(h => !h.authorized).length}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Holders List */}
                <Card className="lg:col-span-3 bg-white/5 border-white/5 glass-panel">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                            <CardTitle>Asset Holders</CardTitle>
                            <CardDescription>Accounts with trustlines for {selectedAsset}</CardDescription>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by public key..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-white/5 border-white/10 h-9"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Public Key</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Balance</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Status</th>
                                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHolders.map((holder) => (
                                        <tr key={holder.publicKey} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-3 px-2">
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs text-muted-foreground bg-black/30 px-2 py-1 rounded w-32 truncate">
                                                        {holder.publicKey}
                                                    </code>
                                                    <a
                                                        href={`https://stellar.expert/explorer/testnet/account/${holder.publicKey}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-muted-foreground hover:text-white"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 font-medium text-white">
                                                {parseFloat(holder.balance).toLocaleString()} {selectedAsset}
                                            </td>
                                            <td className="py-3 px-2">
                                                {holder.authorized ? (
                                                    <Badge variant="outline" className="border-emerald-500/50 text-emerald-500 bg-emerald-500/5">
                                                        Authorized
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="border-red-500/50 text-red-500 bg-red-500/5">
                                                        Frozen
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3 px-2 text-right">
                                                <div className="flex gap-2 justify-end">
                                                    {holder.authorized ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 border-red-500/30 text-red-500 hover:bg-red-500/10"
                                                            onClick={() => handleFreeze(holder)}
                                                            disabled={!!actionLoading}
                                                        >
                                                            {actionLoading === holder.publicKey ? (
                                                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                            ) : (
                                                                <Lock className="w-3 h-3 mr-1" />
                                                            )}
                                                            Freeze
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                                                            onClick={() => handleUnfreeze(holder)}
                                                            disabled={!!actionLoading}
                                                        >
                                                            {actionLoading === holder.publicKey ? (
                                                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                            ) : (
                                                                <Unlock className="w-3 h-3 mr-1" />
                                                            )}
                                                            Unfreeze
                                                        </Button>
                                                    )}

                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                                                        onClick={() => setClawbackModal({ open: true, holder })}
                                                        disabled={!!actionLoading}
                                                    >
                                                        <ArrowDownToLine className="w-3 h-3 mr-1" />
                                                        Clawback
                                                    </Button>

                                                    {holder.clawbackEnabled && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                                                            onClick={() => handleDisableClawback(holder)}
                                                            disabled={!!actionLoading}
                                                            title="Disable Clawback (Compliance Finality)"
                                                        >
                                                            <ShieldCheck className="w-3 h-3 mr-1" />
                                                            Finality
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredHolders.length === 0 && !loadingHolders && (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-muted-foreground italic">
                                                No holders found for this asset.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Clawback Modal */}
            <Dialog open={clawbackModal.open} onOpenChange={(open) => setClawbackModal({ open, holder: clawbackModal.holder })}>
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-orange-500">
                            <ArrowDownToLine className="w-5 h-5" />
                            Perform Token Clawback
                        </DialogTitle>
                        <DialogDescription>
                            This will retrieve tokens from the investor's account and return them to the issuer.
                            This action is permanent.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                            <p className="text-xs text-red-200">
                                <strong>Warning:</strong> Clawback should only be used for regulatory compliance or recovery of lost/stolen tokens.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Holder Public Key</Label>
                            <code className="block p-2 bg-white/5 rounded text-xs text-muted-foreground truncate">
                                {clawbackModal.holder?.publicKey}
                            </code>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount to Retrieve ({selectedAsset})</Label>
                            <Input
                                id="amount"
                                type="number"
                                placeholder="0.00"
                                value={clawbackAmount}
                                onChange={(e) => setClawbackAmount(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Max available: {clawbackModal.holder?.balance} {selectedAsset}
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setClawbackModal({ open: false, holder: null })}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-orange-600 hover:bg-orange-700"
                            onClick={handleClawback}
                            disabled={!clawbackAmount || parseFloat(clawbackAmount) <= 0 || actionLoading === 'clawback'}
                        >
                            {actionLoading === 'clawback' ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <ArrowDownToLine className="w-4 h-4 mr-2" />
                            )}
                            Execute Clawback
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}

export default AssetCompliance;
