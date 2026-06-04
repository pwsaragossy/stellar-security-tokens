/**
 * Emergency Controls Page
 * 
 * Centralized admin panel for emergency actions:
 * - Freeze/Unfreeze investor accounts (reversible)
 * - Pause/Resume offers (reversible)
 * - Clawback tokens (semi-reversible - can re-issue)
 * 
 * NOTE: Irreversible operations (lock issuer, change signers) are
 * terminal-only via scripts/setup-multisig.js for safety.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { HELP_CONTENT } from '@/constants/help-content';
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
    AlertTriangle,
    ShieldAlert,
    Lock,
    Pause,
    Play,
    ArrowDownToLine,
    Search,
    RefreshCw,
    Terminal,
    ExternalLink,
} from 'lucide-react';
import { tokensApi } from '@/api/tokens';
import api from '@/api/client';
import type { Token, Offer } from '@/types';

interface Holder {
    publicKey: string;
    balance: string;
    authorized: boolean;
}

interface EmergencyOffer extends Offer {
    // Add any additional fields here
}

export function EmergencyControls() {
    // State
    const [tokens, setTokens] = useState<Token[]>([]);
    const [offers, setOffers] = useState<EmergencyOffer[]>([]);
    const [selectedAsset, setSelectedAsset] = useState<string>('');
    const [holders, setHolders] = useState<Holder[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    // Clawback modal
    const [clawbackModal, setClawbackModal] = useState<{
        open: boolean;
        holder: Holder | null;
    }>({ open: false, holder: null });
    const [clawbackAmount, setClawbackAmount] = useState('');

    // Load data
    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedAsset) {
            loadHolders();
        }
    }, [selectedAsset]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [tokensRes, offersRes] = await Promise.all([
                tokensApi.getAll(),
                api.get('/admin/offers'),
            ]);
            setTokens(tokensRes.data || []);
            setOffers(offersRes.data.data || []);
            if (tokensRes.data && tokensRes.data.length > 0) {
                setSelectedAsset(tokensRes.data[0].assetCode);
            }
        } catch {
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const loadHolders = async () => {
        try {
            const response = await api.get(`/tokens/${selectedAsset}/holders`);
            setHolders(response.data.data || []);
        } catch (err: any) {
            console.error('Failed to load holders:', err);
        }
    };

    // Emergency Actions
    const handleFreeze = async (holder: Holder) => {
        setActionLoading(`freeze-${holder.publicKey}`);
        setError(null);
        try {
            await tokensApi.freeze({
                investorPublicKey: holder.publicKey,
                assetCode: selectedAsset,
            });
            setSuccess(`Account ${holder.publicKey.slice(0, 8)}... frozen successfully`);
            await loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to freeze account');
        } finally {
            setActionLoading(null);
        }
    };

    const handleUnfreeze = async (holder: Holder) => {
        setActionLoading(`unfreeze-${holder.publicKey}`);
        setError(null);
        try {
            await tokensApi.unfreeze({
                investorPublicKey: holder.publicKey,
                assetCode: selectedAsset,
            });
            setSuccess(`Account ${holder.publicKey.slice(0, 8)}... unfrozen successfully`);
            await loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to unfreeze account');
        } finally {
            setActionLoading(null);
        }
    };

    const handlePauseOffer = async (offer: EmergencyOffer) => {
        setActionLoading(`pause-${offer.id}`);
        setError(null);
        try {
            await api.put(`/admin/offers/${offer.id}/pause-toggle`, { status: 'paused' });
            setSuccess(`Offer "${offer.offer_name}" paused`);
            await loadData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to pause offer');
        } finally {
            setActionLoading(null);
        }
    };

    const handleResumeOffer = async (offer: EmergencyOffer) => {
        setActionLoading(`resume-${offer.id}`);
        setError(null);
        try {
            await api.put(`/admin/offers/${offer.id}/pause-toggle`, { status: 'active' });
            setSuccess(`Offer "${offer.offer_name}" resumed`);
            await loadData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to resume offer');
        } finally {
            setActionLoading(null);
        }
    };

    const handleClawback = async () => {
        if (!clawbackModal.holder || !clawbackAmount) return;
        setActionLoading('clawback');
        setError(null);
        try {
            await tokensApi.clawback({
                investorPublicKey: clawbackModal.holder.publicKey,
                assetCode: selectedAsset,
                amount: clawbackAmount,
            });
            setSuccess(`Clawback of ${clawbackAmount} ${selectedAsset} executed`);
            setClawbackModal({ open: false, holder: null });
            setClawbackAmount('');
            await loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Clawback failed');
        } finally {
            setActionLoading(null);
        }
    };

    const frozenAccounts = holders.filter(h => !h.authorized);
    const activeOffers = offers.filter(o => o.status === 'active');
    const pausedOffers = offers.filter(o => o.status === 'paused');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                        Emergency Controls
                        <InfoTooltip content={HELP_CONTENT.emergencyControls.platformPause.content} side="right" />
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Quick access to emergency actions for compliance and security
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
                    <RefreshCw className={loading ? 'animate-spin' : ''} />
                </Button>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 flex items-center justify-between">
                    <span>{error}</span>
                    <Button variant="ghost" size="sm" onClick={() => setError(null)}>×</Button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20 flex items-center justify-between">
                    <span>{success}</span>
                    <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>×</Button>
                </div>
            )}

            {/* Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-white/5 border-white/5">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-2xl font-bold text-white">{frozenAccounts.length}</p>
                                <p className="text-xs text-muted-foreground">Frozen Accounts</p>
                            </div>
                            <ShieldAlert className="w-8 h-8 text-red-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/5">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-2xl font-bold text-white">{pausedOffers.length}</p>
                                <p className="text-xs text-muted-foreground">Paused Offers</p>
                            </div>
                            <Pause className="w-8 h-8 text-amber-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/5">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-2xl font-bold text-white">{activeOffers.length}</p>
                                <p className="text-xs text-muted-foreground">Active Offers</p>
                            </div>
                            <Play className="w-8 h-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/5">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-2xl font-bold text-white">{holders.length}</p>
                                <p className="text-xs text-muted-foreground">Token Holders</p>
                            </div>
                            <Lock className="w-8 h-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Offer Controls */}
                <Card className="bg-white/5 border-white/5">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Pause className="w-5 h-5 text-amber-500" />
                            Offer Controls
                        </CardTitle>
                        <CardDescription>Pause or resume active offers instantly</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                            {offers.filter(o => ['active', 'paused'].includes(o.status)).length === 0 ? (
                                <p className="text-sm text-muted-foreground italic text-center py-4">
                                    No active or paused offers
                                </p>
                            ) : (
                                offers
                                    .filter(o => ['active', 'paused'].includes(o.status))
                                    .map(offer => (
                                        <div
                                            key={offer.id}
                                            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                                        >
                                            <div>
                                                <p className="font-medium text-white text-sm">{offer.offer_name}</p>
                                                <p className="text-xs text-muted-foreground">{offer.asset_code}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        offer.status === 'active'
                                                            ? 'border-green-500/50 text-green-500'
                                                            : 'border-amber-500/50 text-amber-500'
                                                    }
                                                >
                                                    {offer.status}
                                                </Badge>
                                                {offer.status === 'active' ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                                                        onClick={() => handlePauseOffer(offer)}
                                                        disabled={!!actionLoading}
                                                    >
                                                        {actionLoading === `pause-${offer.id}` ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Pause className="w-3 h-3" />
                                                        )}
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 border-green-500/30 text-green-500 hover:bg-green-500/10"
                                                        onClick={() => handleResumeOffer(offer)}
                                                        disabled={!!actionLoading}
                                                    >
                                                        {actionLoading === `resume-${offer.id}` ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Play className="w-3 h-3" />
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Account Freeze Controls */}
                <Card className="bg-white/5 border-white/5">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Lock className="w-5 h-5 text-red-500" />
                                    Account Freeze
                                    <InfoTooltip content={HELP_CONTENT.assetCompliance.freezeAccount.content} side="right" />
                                </CardTitle>
                                <CardDescription>Freeze/unfreeze investor accounts</CardDescription>
                            </div>
                            <select
                                value={selectedAsset}
                                onChange={e => setSelectedAsset(e.target.value)}
                                className="bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-xs"
                            >
                                {tokens.map(t => (
                                    <option key={t.assetCode} value={t.assetCode}>
                                        {t.assetCode}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by public key..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 h-8 text-xs bg-white/5 border-white/10"
                            />
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {holders
                                .filter(h => h.publicKey.toLowerCase().includes(search.toLowerCase()))
                                .slice(0, 10)
                                .map(holder => (
                                    <div
                                        key={holder.publicKey}
                                        className="flex items-center justify-between p-2 bg-white/5 rounded-lg"
                                    >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <code className="text-xs text-muted-foreground truncate max-w-[120px]">
                                                {holder.publicKey}
                                            </code>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    holder.authorized
                                                        ? 'border-green-500/50 text-green-500 text-[10px]'
                                                        : 'border-red-500/50 text-red-500 text-[10px]'
                                                }
                                            >
                                                {holder.authorized ? 'Active' : 'Frozen'}
                                            </Badge>
                                        </div>
                                        <div className="flex gap-1">
                                            {holder.authorized ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 px-2 text-xs border-red-500/30 text-red-500"
                                                    onClick={() => handleFreeze(holder)}
                                                    disabled={!!actionLoading}
                                                >
                                                    {actionLoading === `freeze-${holder.publicKey}` ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        'Freeze'
                                                    )}
                                                    <InfoTooltip content={HELP_CONTENT.assetCompliance.freezeAccount.content} side="top" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 px-2 text-xs border-green-500/30 text-green-500"
                                                    onClick={() => handleUnfreeze(holder)}
                                                    disabled={!!actionLoading}
                                                >
                                                    {actionLoading === `unfreeze-${holder.publicKey}` ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        'Unfreeze'
                                                    )}
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-6 px-2 text-xs border-orange-500/30 text-orange-500"
                                                onClick={() => setClawbackModal({ open: true, holder })}
                                                disabled={!!actionLoading}
                                            >
                                                <ArrowDownToLine className="w-3 h-3" />
                                                <InfoTooltip content={HELP_CONTENT.assetCompliance.clawback.content} side="top" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            {holders.length === 0 && (
                                <p className="text-sm text-muted-foreground italic text-center py-4">
                                    No token holders found
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Terminal Commands Reference */}
            <Card className="bg-amber-500/5 border-amber-500/20">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-amber-500">
                        <Terminal className="w-5 h-5" />
                        Terminal-Only Operations (Irreversible)
                    </CardTitle>
                    <CardDescription>
                        These operations are too dangerous for the UI. Use the CLI for maximum safety.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-black/30 rounded-lg border border-white/10">
                            <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-red-500" />
                                Lock Issuer Account
                            </h4>
                            <p className="text-xs text-muted-foreground mb-3">
                                Prevents any new tokens from being minted. <strong className="text-red-400">IRREVERSIBLE!</strong>
                            </p>
                            <code className="block p-2 bg-black/50 rounded text-xs text-green-400 overflow-x-auto">
                                npm run multisig:setup -- -a issuer --lock
                            </code>
                        </div>

                        <div className="p-4 bg-black/30 rounded-lg border border-white/10">
                            <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-amber-500" />
                                Setup Multisig
                            </h4>
                            <p className="text-xs text-muted-foreground mb-3">
                                Add Ledger signers to an account (treasury, distributor).
                            </p>
                            <code className="block p-2 bg-black/50 rounded text-xs text-green-400 overflow-x-auto">
                                npm run multisig:setup -- -a treasury -s GXXX... -t 2
                            </code>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ExternalLink className="w-4 h-4" />
                        <span>Full documentation:</span>
                        <code className="bg-white/5 px-2 py-1 rounded">docs/STELLAR_SECURITY_AUDIT.md</code>
                    </div>
                </CardContent>
            </Card>

            {/* Clawback Modal */}
            <Dialog
                open={clawbackModal.open}
                onOpenChange={open => setClawbackModal({ open, holder: clawbackModal.holder })}
            >
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-orange-500">
                            <ArrowDownToLine className="w-5 h-5" />
                            Perform Token Clawback
                        </DialogTitle>
                        <DialogDescription>
                            Retrieve tokens from the investor's account. This is a compliance action.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                            <p className="text-xs text-red-200">
                                <strong>Warning:</strong> Clawback should only be used for regulatory compliance
                                or recovery of lost/stolen tokens.
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
                                onChange={e => setClawbackAmount(e.target.value)}
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
        </div>
    );
}

export default EmergencyControls;
