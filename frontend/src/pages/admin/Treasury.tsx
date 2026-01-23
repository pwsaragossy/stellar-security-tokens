import React, { useState, useEffect } from 'react';
import {
    Building2,
    ArrowUpRight,
    RefreshCcw,
    Wallet,
    DollarSign,
    ExternalLink,
    History,
    CheckCircle2,
    Clock,
    AlertCircle,
    Loader2,
    Shield
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { usePusherSubscription } from '@/lib/pusher';

interface Balance {
    balance: string;
    asset_code?: string;
    asset_issuer?: string;
    asset_type: string;
}

interface TreasuryData {
    publicKey: string;
    balances: Balance[];
}

export function Treasury() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [treasuryData, setTreasuryData] = useState<TreasuryData | null>(null);
    const [withdrawForm, setWithdrawForm] = useState({
        destination: '',
        amount: '',
        assetCode: 'USDC',
        description: ''
    });

    const fetchBalances = async () => {
        try {
            setLoading(true);
            const response = await api.get('/platform-admins/treasury/balances');
            setTreasuryData(response.data.data);
        } catch (error) {
            console.error('Failed to fetch treasury balances:', error);
            toast.error('Failed to load treasury balances');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBalances();
    }, []);

    // Real-time synchronization: Update balances when a transaction is executed
    usePusherSubscription('admin-governance', 'transaction-executed', () => {
        fetchBalances();
    });

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!withdrawForm.destination || !withdrawForm.amount || !withdrawForm.description) {
            toast.error('Please fill in all fields');
            return;
        }

        try {
            setActionLoading(true);
            const response = await api.post('/platform-admins/treasury/withdraw', withdrawForm);

            if (response.data.status === 'pending_multisig') {
                toast.success('Withdrawal request queued for MultiSig approval');
                navigate('/admin/transactions');
            } else {
                toast.success('Withdrawal processed successfully');
                fetchBalances();
                setWithdrawForm({ ...withdrawForm, amount: '', description: '' });
            }
        } catch (error: any) {
            console.error('Withdrawal error:', error);
            toast.error(error.response?.data?.error || 'Failed to process withdrawal');
        } finally {
            setActionLoading(false);
        }
    };

    const getUSDCBalance = () => {
        if (!treasuryData) return '0.00';
        const usdc = treasuryData.balances.find(b => b.asset_code === 'USDC');
        return usdc ? parseFloat(usdc.balance).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00';
    };

    const getXLMBalance = () => {
        if (!treasuryData) return '0.00';
        const xlm = treasuryData.balances.find(b => b.asset_type === 'native');
        return xlm ? parseFloat(xlm.balance).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00';
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <Building2 className="w-8 h-8 text-blue-500" />
                        Institutional Treasury
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Manage operational expenses and monitor foundation balances.
                    </p>
                </div>
                <Button
                    onClick={fetchBalances}
                    disabled={loading}
                    variant="outline"
                    className="border-white/10 bg-white/5 hover:bg-white/10 transition-all"
                >
                    <RefreshCcw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                    Refresh Balances
                </Button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 bg-slate-900/50 border-white/5 backdrop-blur-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <DollarSign className="w-16 h-16 text-emerald-400" />
                    </div>
                    <div className="flex items-center gap-3 text-emerald-400 mb-2">
                        <DollarSign className="w-5 h-5" />
                        <span className="text-sm font-medium uppercase tracking-wider">Available USDC</span>
                    </div>
                    <div className="text-4xl font-bold text-white tabular-nums">
                        {loading ? '...' : getUSDCBalance()}
                    </div>
                    <div className="mt-4 flex items-center text-xs text-muted-foreground bg-emerald-500/10 px-2 py-1 rounded w-fit">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Ready for OpEx
                    </div>
                </Card>

                <Card className="p-6 bg-slate-900/50 border-white/5 backdrop-blur-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wallet className="w-16 h-16 text-blue-400" />
                    </div>
                    <div className="flex items-center gap-3 text-blue-400 mb-2">
                        <Wallet className="w-5 h-5" />
                        <span className="text-sm font-medium uppercase tracking-wider">Gas Reserve (XLM)</span>
                    </div>
                    <div className="text-4xl font-bold text-white tabular-nums">
                        {loading ? '...' : getXLMBalance()}
                    </div>
                    <div className="mt-4 flex items-center text-xs text-muted-foreground bg-blue-500/10 px-2 py-1 rounded w-fit">
                        <Clock className="w-3 h-3 mr-1" />
                        Auto-refilling enabled
                    </div>
                </Card>

                <Card className="p-6 bg-slate-900/50 border-white/5 backdrop-blur-xl border-l-4 border-l-red-500/50">
                    <div className="flex items-center gap-3 text-red-400 mb-2">
                        <Shield className="w-5 h-5" />
                        <span className="text-sm font-medium uppercase tracking-wider">Governance Status</span>
                    </div>
                    <div className="text-xl font-semibold text-white">
                        MultiSig Active
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        All treasury withdrawals require a threshold of signatures from the authorized admin pool.
                    </p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Withdrawal Form */}
                <Card className="bg-slate-900/40 border-white/5 p-8 relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <ArrowUpRight className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">OpEx Withdrawal</h3>
                            <p className="text-sm text-muted-foreground">Request a manual payment to a service provider.</p>
                        </div>
                    </div>

                    <form onSubmit={handleWithdraw} className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-slate-300">Destination Address (Stellar G...)</Label>
                            <Input
                                placeholder="GA..."
                                value={withdrawForm.destination}
                                onChange={e => setWithdrawForm({ ...withdrawForm, destination: e.target.value })}
                                className="bg-white/5 border-white/10 text-white h-12 focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Amount</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={withdrawForm.amount}
                                    onChange={e => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                                    className="bg-white/5 border-white/10 text-white h-12 focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Asset</Label>
                                <select
                                    value={withdrawForm.assetCode}
                                    onChange={e => setWithdrawForm({ ...withdrawForm, assetCode: e.target.value })}
                                    className="w-full flex h-12 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="USDC">USDC</option>
                                    <option value="XLM">XLM</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-300">Description / Memo</Label>
                            <Input
                                placeholder="e.g., AWS Hosting Fee - Jan 2026"
                                value={withdrawForm.description}
                                onChange={e => setWithdrawForm({ ...withdrawForm, description: e.target.value })}
                                className="bg-white/5 border-white/10 text-white h-12 focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>

                        <Button
                            className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg shadow-lg shadow-blue-900/20 transition-all hover:-translate-y-1"
                            disabled={actionLoading}
                        >
                            {actionLoading ? (
                                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            ) : (
                                <ArrowUpRight className="w-6 h-6 mr-2" />
                            )}
                            {actionLoading ? 'Creating Proposal...' : 'Propose Withdrawal'}
                        </Button>
                    </form>
                </Card>

                {/* Treasury Info & Identity */}
                <div className="space-y-6">
                    <Card className="bg-slate-900/40 border-white/5 p-6 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <History className="w-5 h-5 text-purple-400" />
                            <h3 className="font-bold text-white">Treasury Wallet Identity</h3>
                        </div>

                        <div className="p-4 rounded-lg bg-black/40 border border-white/5 font-mono text-xs break-all relative group">
                            <div className="text-muted-foreground mb-2">Public Key</div>
                            <div className="text-slate-300">
                                {treasuryData?.publicKey || 'Loading...'}
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => {
                                    navigator.clipboard.writeText(treasuryData?.publicKey || '');
                                    toast.success('Address copied');
                                }}
                            >
                                <RefreshCcw className="w-3 h-3" />
                            </Button>
                        </div>

                        <div className="mt-6 space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    Account Status
                                </span>
                                <span className="text-white font-medium">Standard Foundation</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <ExternalLink className="w-4 h-4 text-slate-400" />
                                    Explorer
                                </span>
                                <a
                                    href={`https://stellar.expert/explorer/testnet/account/${treasuryData?.publicKey}`}
                                    target="_blank"
                                    className="text-blue-400 hover:underline flex items-center gap-1"
                                >
                                    View on StellarExpert
                                </a>
                            </div>
                        </div>
                    </Card>

                    <Card className="bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20 p-6">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                                <AlertCircle className="w-6 h-6 text-red-500" />
                            </div>
                            <div>
                                <h4 className="text-white font-bold mb-1 font-premium">Safety Policy</h4>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    All Treasury actions are auditable and require cryptographic approval. If the network is under high load, your withdrawal may take longer to appear in the transaction queue. Always verify the destination address triple-fold.
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
