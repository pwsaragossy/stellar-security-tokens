import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Wallet, ArrowRightLeft, PenTool, CheckCircle, Loader2, Copy, Clock, AlertCircle } from 'lucide-react';
import { walletsApi } from '@/api/wallets';
import type { WalletStatus, MultiSigTransaction } from '@/api/wallets';

export function Wallets() {
    const [loading, setLoading] = useState(true);
    const [wallets, setWallets] = useState<WalletStatus[]>([]);
    const [proposals, setProposals] = useState<MultiSigTransaction[]>([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

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
            <div className="grid gap-4 md:grid-cols-3">
                {wallets.map((wallet) => (
                    <Card key={wallet.name} className="glass-panel border-white/5 bg-white/5">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-white">{wallet.name}</CardTitle>
                            <Wallet className="h-4 w-4 text-emerald-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-white mb-2">
                                {wallet.exists ? (
                                    wallet.balances.length > 0 ? (
                                        <div className="space-y-1">
                                            {wallet.balances.map((b, i) => (
                                                <div key={i} className="text-sm">
                                                    {parseFloat(b.balance).toLocaleString()} <span className="text-emerald-400">{b.asset_code || 'XLM'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : '0.00 XLM'
                                ) : (
                                    <span className="text-red-400 text-sm">Not Created</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground break-all">
                                <span className="font-mono">{wallet.publicKey?.substring(0, 8)}...{wallet.publicKey?.substring(48)}</span>
                                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => {
                                    navigator.clipboard.writeText(wallet.publicKey);
                                    setSuccess('Copied to clipboard');
                                }}>
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
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
        </div>
    );
}

export default Wallets;
