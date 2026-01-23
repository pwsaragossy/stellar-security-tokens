import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    X,
    Search,
    Snowflake,
    Flame,
    Sun,
    ExternalLink,
    Loader2,
    AlertCircle,
    Copy,
    Users,
    Coins,
    Shield,
    CheckCircle2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/api/client';

interface TokenHolder {
    publicKey: string;
    balance: string;
    authorized: boolean;
}

interface TokenBalance {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
}

interface TokenManagementModalProps {
    token: TokenBalance;
    walletName: string;
    onClose: () => void;
}

export function TokenManagementModal({ token, walletName, onClose }: TokenManagementModalProps) {
    const [holders, setHolders] = useState<TokenHolder[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState<React.ReactNode | string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [clawbackAmount, setClawbackAmount] = useState('');
    const [selectedHolder, setSelectedHolder] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<string | null>(null); // format: "type:address"

    const assetCode = token.asset_code || 'XLM';
    const isNative = token.asset_type === 'native';

    const explorerUrl = isNative
        ? 'https://stellar.expert/explorer/testnet/asset/native'
        : `https://stellar.expert/explorer/testnet/asset/${assetCode}-${token.asset_issuer}`;

    const loadHolders = useCallback(async (isInitial = false) => {
        if (isInitial) setLoading(true);
        else setRefreshing(true);

        setError('');
        try {
            const response = await api.get(`/tokens/${assetCode}/holders`);
            if (response.data.success) {
                setHolders(response.data.data || []);
            }
        } catch (err: any) {
            console.error('Failed to load holders:', err);
            setError(err.response?.data?.error || 'Failed to load token holders');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [assetCode]);

    useEffect(() => {
        if (!isNative) {
            loadHolders(true);
        } else {
            setLoading(false);
        }
    }, [isNative, loadHolders]);

    const handleFreeze = async (holderAddress: string) => {
        setActionLoading(holderAddress);
        setError('');
        setSuccess('');
        try {
            const response = await api.post(`/tokens/freeze`, {
                investorPublicKey: holderAddress,
                assetCode: assetCode
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
                setSuccess(`Account frozen successfully`);
            }
            setPendingAction(null);
            loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to freeze account');
        } finally {
            setActionLoading(null);
        }
    };

    const handleUnfreeze = async (holderAddress: string) => {
        setActionLoading(holderAddress);
        setError('');
        setSuccess('');
        try {
            const response = await api.post(`/tokens/unfreeze`, {
                investorPublicKey: holderAddress,
                assetCode: assetCode
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
                setSuccess(`Account unfrozen successfully`);
            }
            setPendingAction(null);
            loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to unfreeze account');
        } finally {
            setActionLoading(null);
        }
    };

    const handleClawback = async (holderAddress: string, amount: string) => {
        if (!amount || parseFloat(amount) <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        setActionLoading(holderAddress);
        setError('');
        setSuccess('');
        try {
            const response = await api.post(`/tokens/clawback`, {
                investorPublicKey: holderAddress,
                assetCode: assetCode,
                amount
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
                setSuccess(`Clawback of ${amount} ${assetCode} successful`);
            }
            setClawbackAmount('');
            setSelectedHolder(null);
            setPendingAction(null);
            loadHolders();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to clawback tokens');
        } finally {
            setActionLoading(null);
        }
    };

    const filteredHolders = holders.filter(h =>
        h.publicKey.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalCirculating = holders.reduce((sum, h) => sum + parseFloat(h.balance), 0);

    const getPendingType = (address: string) => {
        if (!pendingAction || !pendingAction.includes(':')) return null;
        const [type, addr] = pendingAction.split(':');
        return addr === address ? type : null;
    };
    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl bg-slate-900 border-white/10 text-white p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="p-4 border-b border-white/10 bg-slate-900 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <Coins className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold text-white">
                                {assetCode} Management
                            </DialogTitle>
                            <DialogDescription className="text-slate-400">
                                Controlling assets from {walletName} wallet
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
                    {/* Alerts */}
                    {error && (
                        <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span className="flex-1">{error}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setError('')}>
                                <X className="w-3 h-3" />
                            </Button>
                        </div>
                    )}
                    {success && (
                        <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span className="flex-1">{success}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSuccess('')}>
                                <X className="w-3 h-3" />
                            </Button>
                        </div>
                    )}

                    {/* Token Info Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Asset Code', value: assetCode, color: 'text-emerald-400' },
                            { label: 'In Wallet', value: parseFloat(token.balance).toLocaleString(undefined, { maximumFractionDigits: 4 }) },
                            { label: 'Holders', value: isNative ? 'N/A' : (refreshing ? '...' : holders.length), icon: <Users className="w-3 h-3" /> },
                            { label: 'Circulating', value: isNative ? 'N/A' : (refreshing ? '...' : totalCirculating.toLocaleString(undefined, { maximumFractionDigits: 0 })) },
                        ].map((item, i) => (
                            <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-xl">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{item.label}</div>
                                <div className={`text-lg font-bold flex items-center gap-1.5 ${item.color || 'text-white'}`}>
                                    {item.icon}
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        {!isNative && token.asset_issuer && (
                            <div className="flex-1 bg-white/5 border border-white/10 p-3 rounded-lg flex items-center justify-between">
                                <div className="min-w-0">
                                    <div className="text-[10px] uppercase text-slate-500 font-bold mb-0.5">Issuer</div>
                                    <div className="text-xs text-white truncate font-mono">{token.asset_issuer}</div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigator.clipboard.writeText(token.asset_issuer!)}>
                                    <Copy className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        )}
                        <Button variant="secondary" className="bg-white/5 border-white/10 hover:bg-white/10 text-white" onClick={() => window.open(explorerUrl, '_blank')}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Stellar Expert
                        </Button>
                    </div>

                    {/* Holders Section */}
                    {!isNative && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2 shrink-0">
                                    <Users className="w-4 h-4" />
                                    Holders Directory
                                    {refreshing && <Loader2 className="w-3 h-3 animate-spin" />}
                                </h4>
                                <div className="relative flex-1 max-w-sm">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <Input
                                        placeholder="Filter by address..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 bg-white/5 border-white/10 h-9"
                                    />
                                </div>
                            </div>

                            <div className="relative border border-white/10 rounded-xl overflow-hidden bg-white/5">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                                        <p className="text-sm text-slate-500">Scanning ledger...</p>
                                    </div>
                                ) : filteredHolders.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-white/10 bg-white/5">
                                                    <th className="text-left p-4 text-slate-400 font-medium">Account</th>
                                                    <th className="text-right p-4 text-slate-400 font-medium">Balance</th>
                                                    <th className="text-center p-4 text-slate-400 font-medium">Status</th>
                                                    <th className="text-right p-4 text-slate-400 font-medium">Control Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {filteredHolders.map((holder, i) => {
                                                    const pendingType = getPendingType(holder.publicKey);

                                                    return (
                                                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-2">
                                                                    <code className="text-emerald-400/80 font-mono">
                                                                        {holder.publicKey.substring(0, 8)}...{holder.publicKey.substring(48)}
                                                                    </code>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                        onClick={() => navigator.clipboard.writeText(holder.publicKey)}
                                                                    >
                                                                        <Copy className="w-3 h-3 text-slate-500" />
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-right font-mono text-white">
                                                                {parseFloat(holder.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                {holder.authorized ? (
                                                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10">Active</Badge>
                                                                ) : (
                                                                    <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/10">Frozen</Badge>
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    {/* Inline Confirm UI */}
                                                                    {pendingType ? (
                                                                        <div className="flex items-center gap-2 bg-red-500/10 p-1 rounded-md border border-red-500/20 animate-in zoom-in-95 duration-200">
                                                                            <span className="text-[10px] font-bold text-red-500 px-2 uppercase">Confirm {pendingType}?</span>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-7 text-xs text-white hover:bg-white/10"
                                                                                onClick={(e) => { e.stopPropagation(); setPendingAction(null); }}
                                                                            >Cancel</Button>
                                                                            <Button
                                                                                variant="destructive"
                                                                                size="sm"
                                                                                className="h-7 px-3 text-xs"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (pendingType === 'freeze') handleFreeze(holder.publicKey);
                                                                                    else if (pendingType === 'unfreeze') handleUnfreeze(holder.publicKey);
                                                                                    else handleClawback(holder.publicKey, clawbackAmount);
                                                                                }}
                                                                                disabled={actionLoading === holder.publicKey}
                                                                            >
                                                                                {actionLoading === holder.publicKey ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
                                                                            </Button>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            {holder.authorized ? (
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="h-8 border-white/10 text-slate-300 hover:bg-blue-500/10 hover:text-blue-400"
                                                                                    onClick={(e) => { e.stopPropagation(); setPendingAction(`freeze:${holder.publicKey}`); }}
                                                                                >
                                                                                    <Snowflake className="w-3.5 h-3.5 mr-1.5" />
                                                                                    Freeze
                                                                                </Button>
                                                                            ) : (
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="h-8 border-white/10 text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-400"
                                                                                    onClick={(e) => { e.stopPropagation(); setPendingAction(`unfreeze:${holder.publicKey}`); }}
                                                                                >
                                                                                    <Sun className="w-3.5 h-3.5 mr-1.5" />
                                                                                    Unfreeze
                                                                                </Button>
                                                                            )}

                                                                            {selectedHolder === holder.publicKey ? (
                                                                                <div className="flex items-center gap-1.5 animate-in slide-in-from-right-2">
                                                                                    <Input
                                                                                        type="number"
                                                                                        placeholder="Amount"
                                                                                        value={clawbackAmount}
                                                                                        onChange={(e) => setClawbackAmount(e.target.value)}
                                                                                        className="w-24 h-8 bg-black/40 border-red-500/30 text-xs"
                                                                                    />
                                                                                    <Button
                                                                                        variant="destructive"
                                                                                        size="sm"
                                                                                        className="h-8 bg-red-600 hover:bg-red-500"
                                                                                        onClick={(e) => { e.stopPropagation(); setPendingAction(`clawback:${holder.publicKey}`); }}
                                                                                    >
                                                                                        <Flame className="w-3.5 h-3.5" />
                                                                                    </Button>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon"
                                                                                        className="h-8 w-8"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setSelectedHolder(null);
                                                                                            setClawbackAmount('');
                                                                                        }}
                                                                                    >
                                                                                        <X className="w-4 h-4" />
                                                                                    </Button>
                                                                                </div>
                                                                            ) : (
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    className="h-8 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                                                                                    onClick={(e) => { e.stopPropagation(); setSelectedHolder(holder.publicKey); }}
                                                                                >
                                                                                    <Flame className="w-3.5 h-3.5" />
                                                                                </Button>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-20 text-slate-500 italic">
                                        {searchQuery ? 'Zero results matched' : 'No history for this asset.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {isNative && (
                        <div className="py-12 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                                <Shield className="w-8 h-8 text-blue-400" />
                            </div>
                            <h5 className="text-lg font-bold mb-2">Native Asset Protocol</h5>
                            <p className="max-w-md text-sm text-slate-400 leading-relaxed">
                                XLM is the decentralized backbone of Stellar. Immutable protocols prevent freezing or clawbacks on the native currency.
                            </p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default TokenManagementModal;
