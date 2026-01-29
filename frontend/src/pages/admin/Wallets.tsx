import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Wallet, ArrowRightLeft, PenTool, CheckCircle, Loader2, Copy, Clock, AlertCircle, ExternalLink, Info, Settings } from 'lucide-react';
import { walletsApi } from '@/api/wallets';
import type { WalletStatus, MultiSigTransaction } from '@/api/wallets';
import { TokenManagementModal } from '@/components/admin/TokenManagementModal';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

// Use a more generic interface that matches what TokenManagementModal expects
interface TokenBalance {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
    // Compatibility fields for the new ManagedToken interface
    id?: number;
    assetCode?: string;
    issuerPublicKey?: string;
    totalSupply?: string;
}

// Wallet Detail Modal Component
function WalletDetailModal({ wallet, onClose }: { wallet: WalletStatus; onClose: () => void }) {
    const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
    const explorerUrl = `https://stellar.expert/explorer/testnet/account/${wallet.publicKey}`;

    // Filter out zero balance tokens to hide test artifacts
    const activeBalances = wallet.balances.filter(b => parseFloat(b.balance) > 0);

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl bg-slate-900 border-white/10 text-white p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <DialogHeader className="p-4 border-b border-white/10 bg-slate-900 flex flex-row items-center gap-3 space-y-0">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Wallet className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <DialogTitle className="text-xl font-bold text-white">{wallet.name} Wallet Detail</DialogTitle>
                        <DialogDescription className="text-slate-400">System account identifier and balances</DialogDescription>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-6 space-y-6">
                    {/* Status */}
                    <div className="flex items-center gap-2">
                        <Badge variant={wallet.exists ? 'default' : 'destructive'} className={wallet.exists ? 'bg-emerald-600' : ''}>
                            {wallet.exists ? 'Active on Network' : 'Not Created'}
                        </Badge>
                    </div>

                    {/* Full Address */}
                    <div className="space-y-2">
                        <Label className="text-slate-400 text-xs font-bold uppercase tracking-wider">Wallet Address</Label>
                        <div className="flex items-center gap-2 bg-black/40 p-3 rounded-lg border border-white/5">
                            <code className="text-sm text-emerald-400/80 break-all flex-1 font-mono">{wallet.publicKey}</code>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigator.clipboard.writeText(wallet.publicKey)}>
                                <Copy className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Explorer Link */}
                    <Button variant="outline" className="w-full border-white/10 hover:bg-white/5 text-white" onClick={() => window.open(explorerUrl, '_blank')}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View on Stellar Expert
                    </Button>

                    {/* Balances Table - Clickable rows */}
                    <div className="space-y-3">
                        <Label className="text-slate-400 text-xs font-bold uppercase tracking-wider">Asset Distribution</Label>
                        {wallet.exists && activeBalances.length > 0 ? (
                            <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5">
                                        <tr>
                                            <th className="text-left p-3 text-slate-500 font-medium tracking-tight">Asset</th>
                                            <th className="text-right p-3 text-slate-500 font-medium tracking-tight">Balance</th>
                                            <th className="text-right p-3 text-slate-500 font-medium tracking-tight">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {activeBalances.map((b, i) => (
                                            <tr
                                                key={i}
                                                className="cursor-pointer hover:bg-white/5 transition-colors group"
                                                onClick={() => setSelectedToken(b)}
                                            >
                                                <td className="p-3">
                                                    <span className="text-emerald-400 font-bold tracking-tight">{b.asset_code || 'XLM'}</span>
                                                    {b.asset_issuer && (
                                                        <span className="text-[10px] text-slate-500 ml-2 font-mono">
                                                            {b.asset_issuer.substring(0, 8)}...
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right text-white font-mono">
                                                    {parseFloat(b.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <Button variant="ghost" size="sm" className="h-7 text-slate-500 group-hover:text-emerald-400 group-hover:bg-emerald-400/10">
                                                        <Settings className="w-3.5 h-3.5 mr-1.5" />
                                                        Manage
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="bg-black/40 p-10 rounded-xl text-center border border-dashed border-white/10">
                                <p className="text-sm text-slate-500 italic">
                                    {wallet.exists ? 'No tokens found in this vault' : 'Wallet not yet registered on the Stellar ledger'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Wallet Role Description */}
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
                        <div className="flex gap-3">
                            <Info className="w-5 h-5 text-blue-400/60 shrink-0 mt-0.5" />
                            <div className="text-xs text-blue-300/80 leading-relaxed italic">
                                {wallet.name === 'Treasury' && 'Strategic vault for platform revenue and interest reserves. Primary source for automated distribution events.'}
                                {wallet.name === 'Issuer' && 'Master account for security token minting. Operates as the legal root of trust for all smart assets. Restricted bypass recommended.'}
                                {wallet.name === 'Distributor' && 'Intermediate staging vault for secondary market liquidity and investor onboarding batches.'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub-modal: Token Management */}
                {selectedToken && (
                    <TokenManagementModal
                        token={selectedToken}
                        walletName={wallet.name}
                        distributorPublicKey={null} // Will be enhanced later if needed
                        onClose={() => setSelectedToken(null)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

export function Wallets() {
    const [loading, setLoading] = useState(true);
    const [wallets, setWallets] = useState<WalletStatus[]>([]);
    const [proposals, setProposals] = useState<MultiSigTransaction[]>([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [selectedWallet, setSelectedWallet] = useState<WalletStatus | null>(null);

    // Form State
    const [sourceWallet, setSourceWallet] = useState('treasury');
    const [destination, setDestination] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (error || success) {
            const timer = setTimeout(() => {
                setError('');
                setSuccess('');
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error, success]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [walletRes, proposalsRes] = await Promise.all([
                walletsApi.getWalletStatuses(),
                walletsApi.getTransactionProposals('pending')
            ]);
            setWallets(walletRes.data);
            setProposals(proposalsRes.data);
        } catch (error) {
            console.error('Failed to load wallet data', error);
            setError('Failed to load wallet data');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProposal = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');
        try {
            await walletsApi.createTransactionProposal({
                sourceWallet,
                destination,
                amount,
                assetCode: 'XLM', // Defaulting for now
                description
            });
            setSuccess('Transaction proposed successfully');
            setDestination('');
            setAmount('');
            setDescription('');
            loadData(); // Reload data
        } catch (error: any) {
            console.error('Failed to create proposal', error);
            setError(error.response?.data?.error || 'Failed to create proposal');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSign = async (id: number) => {
        // Mock signing for now as per plan
        if (!confirm('This will simulate signing the transaction with your admin key. Proceed?')) return;

        setError('');
        setSuccess('');
        try {
            // In production, this would use passkey signing or admin key from secure storage
            // For now, we simulate signing by sending the XDR back
            const proposal = proposals.find(p => p.id === id);
            if (!proposal) return;

            await walletsApi.submitTransaction(id, proposal.xdr);
            setSuccess('Transaction signed and submitted');
            loadData();
        } catch (error: any) {
            console.error('Failed to sign/submit', error);
            setError(error.response?.data?.error || 'Failed to sign/submit transaction');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">System Wallet Management</h2>
                    <p className="text-muted-foreground">Monitor and control Treasury, Issuer, and Distributor wallets.</p>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {success && (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {success}
                </div>
            )}

            {/* Wallet Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {wallets.map((wallet) => {
                    const activeBalances = wallet.balances.filter(b => parseFloat(b.balance) > 0);
                    return (
                        <Card
                            key={wallet.name}
                            className="glass-panel border-white/5 bg-white/5 cursor-pointer hover:border-emerald-500/30 transition-colors"
                            onClick={() => setSelectedWallet(wallet)}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-white">{wallet.name}</CardTitle>
                                <Wallet className="h-4 w-4 text-emerald-400" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-white mb-2">
                                    {wallet.exists ? (
                                        activeBalances.length > 0 ? (
                                            <div className="space-y-1">
                                                {activeBalances.slice(0, 2).map((b, i) => (
                                                    <div key={i} className="text-sm">
                                                        {parseFloat(b.balance).toLocaleString()} <span className="text-emerald-400">{b.asset_code || 'XLM'}</span>
                                                    </div>
                                                ))}
                                                {activeBalances.length > 2 && (
                                                    <div className="text-xs text-muted-foreground">+{activeBalances.length - 2} more...</div>
                                                )}
                                            </div>
                                        ) : '0.00 XLM'
                                    ) : (
                                        <span className="text-red-400 text-sm">Not Created</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground break-all">
                                    <span className="font-mono">{wallet.publicKey?.substring(0, 8)}...{wallet.publicKey?.substring(48)}</span>
                                    <Button variant="ghost" size="icon" className="h-4 w-4" onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(wallet.publicKey);
                                        setSuccess('Copied to clipboard');
                                    }}>
                                        <Copy className="h-3 w-3" />
                                    </Button>
                                </div>
                                <div className="text-xs text-emerald-400 mt-2">Click for details →</div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Create Transaction */}
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5" />
                            New Transfer
                        </CardTitle>
                        <CardDescription>Propose a new transaction from a system wallet</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreateProposal} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="source">Source Wallet</Label>
                                <select
                                    id="source"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                    value={sourceWallet}
                                    onChange={(e) => setSourceWallet(e.target.value)}
                                >
                                    <option value="treasury">Treasury</option>
                                    <option value="issuer">Issuer</option>
                                    <option value="distributor">Distributor</option>
                                    {/* Operations wallet intentionally excluded from manual transfers */}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="amount">Amount (XLM)</Label>
                                    <Input
                                        id="amount"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="asset">Asset</Label>
                                    <Input id="asset" value="XLM" disabled />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="destination">Destination Address</Label>
                                <Input
                                    id="destination"
                                    placeholder="G..."
                                    value={destination}
                                    onChange={(e) => setDestination(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="desc">Description</Label>
                                <Input
                                    id="desc"
                                    placeholder="Reason for transfer..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>

                            <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={submitting}>
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PenTool className="w-4 h-4 mr-2" />}
                                Propose Transaction
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Pending Transactions */}
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            Pending Proposals
                        </CardTitle>
                        <CardDescription>Transactions waiting for signature</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {proposals.length > 0 ? (
                            <div className="space-y-4">
                                {proposals.map((prop) => (
                                    <div key={prop.id} className="p-4 rounded-lg bg-black/20 border border-white/5 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-medium text-white">{prop.description || 'No description'}</p>
                                                <p className="text-xs text-muted-foreground">ID: #{prop.id} • {new Date(prop.createdAt).toLocaleDateString()}</p>
                                            </div>
                                            <Badge variant={prop.status === 'pending' ? 'outline' : 'secondary'}>
                                                {prop.status}
                                            </Badge>
                                        </div>

                                        <div className="text-xs font-mono bg-black/40 p-2 rounded truncate text-muted-foreground">
                                            {prop.xdr.substring(0, 20)}...{prop.xdr.substring(prop.xdr.length - 20)}
                                        </div>

                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleSign(prop.id)}>
                                                <PenTool className="w-3 h-3 mr-2" />
                                                Sign & Submit
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                                <CheckCircle className="w-10 h-10 mb-2 opacity-20" />
                                <p>No pending transactions</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Wallet Detail Modal */}
            {selectedWallet && (
                <WalletDetailModal
                    wallet={selectedWallet}
                    onClose={() => setSelectedWallet(null)}
                />
            )}
        </div>
    );
}

export default Wallets;
