/**
 * Company Wallet Page
 * Passkey-secured Soroban smart contract wallet for companies
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Key, Shield, Check, ArrowUpRight, ArrowDownLeft, Copy, ExternalLink, Wallet as WalletIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { passkeyClient } from '@/lib/passkey';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { DepositDialog } from '@/components/wallet/DepositDialog';

interface WalletStatus {
    hasWallet: boolean;
    walletAddress?: string;
    passkeyRegistered: boolean;
    balances?: {
        xlm: string;
        usdc: string;
    };
    explorer?: string;
}

export function Wallet() {
    const [user, setUser] = useState<any>(null);
    const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [balanceLoading, setBalanceLoading] = useState(true);
    const [balanceError, setBalanceError] = useState(false);

    // Withdrawal State
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [depositOpen, setDepositOpen] = useState(false);
    const [withdrawStep, setWithdrawStep] = useState<'form' | 'review' | 'processing' | 'success'>('form');
    const [withdrawData, setWithdrawData] = useState({ amount: '', destination: '', asset: 'USDC' });
    const [withdrawTx, setWithdrawTx] = useState<{ xdr: string; networkPassphrase: string } | null>(null);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);

    // Cache functions for localStorage
    const getCacheKey = (userId: number | string) => `company_wallet_cache_${userId}`;

    const getCachedBalance = (userId: number | string) => {
        try {
            const cached = localStorage.getItem(getCacheKey(userId));
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }
        return null;
    };

    const setCachedBalance = (userId: number | string, balances: { xlm: string; usdc: string }, walletAddress?: string) => {
        try {
            localStorage.setItem(getCacheKey(userId), JSON.stringify({ balances, walletAddress, cachedAt: Date.now() }));
        } catch { /* ignore */ }
    };

    useEffect(() => {
        async function fetchWalletStatus() {
            try {
                const userStr = localStorage.getItem('user');
                const storedUser = JSON.parse(userStr || '{}');
                setUser(storedUser);

                const userId = storedUser.companyId || storedUser.id;
                const cachedData = getCachedBalance(userId);

                // Company users store their stellarContractId directly from the Company entity
                // (set during login via /auth/passkey-login/discover)
                if (storedUser.stellarContractId) {
                    // We have a wallet - fetch balances
                    try {
                        setBalanceLoading(true);
                        setBalanceError(false);

                        const response = await api.get(`/companies/${userId}/wallet-status`);
                        const data = response.data || response;

                        // Cache fresh balance
                        if (data.balances) {
                            setCachedBalance(userId, data.balances, storedUser.stellarContractId);
                        }

                        setWalletStatus({
                            hasWallet: true,
                            walletAddress: storedUser.stellarContractId,
                            passkeyRegistered: true,
                            balances: data.balances,
                            explorer: data.explorer,
                        });
                        setBalanceLoading(false);
                    } catch {
                        // Use cached balance if available, never fall back to 0
                        if (cachedData?.balances) {
                            setWalletStatus({
                                hasWallet: true,
                                walletAddress: storedUser.stellarContractId,
                                passkeyRegistered: true,
                                balances: cachedData.balances,
                                explorer: `https://stellar.expert/explorer/testnet/contract/${storedUser.stellarContractId}`,
                            });
                            setBalanceError(true);
                        } else {
                            // No cache - show wallet but no balances (loading state)
                            setWalletStatus({
                                hasWallet: true,
                                walletAddress: storedUser.stellarContractId,
                                passkeyRegistered: true,
                                // Don't set balances - will show loading indicator
                                explorer: `https://stellar.expert/explorer/testnet/contract/${storedUser.stellarContractId}`,
                            });
                        }
                        setBalanceLoading(false);
                    }
                } else if (storedUser.id) {
                    // Fallback: try company-users endpoint (for actual CompanyUser records)
                    try {
                        setBalanceLoading(true);
                        setBalanceError(false);

                        const response = await api.get(`/company-users/${storedUser.id}/wallet-status`);
                        const data = response.data || response;

                        if (data.balances) {
                            setCachedBalance(storedUser.id, data.balances, data.contractId || data.walletAddress);
                        }

                        setWalletStatus({
                            hasWallet: data.hasWallet || !!data.contractId,
                            walletAddress: data.contractId || data.walletAddress,
                            passkeyRegistered: data.passkeyRegistered !== false,
                            balances: data.balances,
                            explorer: data.explorer,
                        });
                        setBalanceLoading(false);
                    } catch {
                        if (cachedData?.balances) {
                            setWalletStatus({
                                hasWallet: true,
                                walletAddress: cachedData.walletAddress,
                                passkeyRegistered: true,
                                balances: cachedData.balances,
                            });
                            setBalanceError(true);
                        } else {
                            setWalletStatus({
                                hasWallet: false,
                                passkeyRegistered: true,
                            });
                        }
                        setBalanceLoading(false);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch wallet status:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchWalletStatus();
    }, []);

    const handleProposeWithdrawal = async () => {
        if (!user?.id || !withdrawData.amount || !withdrawData.destination) return;

        setWithdrawStep('processing');
        setWithdrawError(null);

        try {
            // Use companies endpoint (companyId is same as user.id for company owners)
            const companyId = user.companyId || user.id;
            const response = await api.post(`/companies/${companyId}/withdraw/propose`, {
                amount: withdrawData.amount,
                destination: withdrawData.destination,
                assetCode: withdrawData.asset
            });

            const { data } = response;
            setWithdrawTx(data);
            setWithdrawStep('review');
        } catch (err: any) {
            setWithdrawError(err.message || 'Failed to propose withdrawal');
            setWithdrawStep('form');
        }
    };

    const handleSubmitWithdrawal = async () => {
        if (!withdrawTx) return;

        setWithdrawStep('processing');
        setWithdrawError(null);

        try {
            const signedXdr = await passkeyClient.signTransaction(withdrawTx.xdr);
            await api.post('/companies/withdraw/submit', { signedXdr });

            setWithdrawStep('success');
            // Refresh wallet status using company endpoint
            const companyId = user.companyId || user.id;
            const statusResponse = await api.get(`/companies/${companyId}/wallet-status`);
            const statusData = statusResponse.data || statusResponse;
            setWalletStatus({
                hasWallet: statusData.hasWallet || !!statusData.contractId,
                walletAddress: statusData.contractId || statusData.walletAddress || user.stellarContractId,
                passkeyRegistered: statusData.passkeyRegistered !== false,
                balances: statusData.balances,
                explorer: statusData.explorer,
            });
        } catch (err: any) {
            console.error('Withdrawal failed:', err);
            setWithdrawError(err.message || 'Failed to process withdrawal');
            setWithdrawStep('review');
        }
    };

    const resetWithdrawal = () => {
        setWithdrawOpen(false);
        setWithdrawStep('form');
        setWithdrawData({ amount: '', destination: '', asset: 'USDC' });
        setWithdrawTx(null);
        setWithdrawError(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-muted-foreground text-sm">Loading wallet...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-3xl">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">Company Wallet</h2>
                <p className="text-muted-foreground">Manage your company's Stellar wallet and funds</p>
            </div>

            {/* Balance Cards */}
            {walletStatus?.walletAddress && (
                <div className="grid gap-5 md:grid-cols-2 animate-fade-in-up animate-delay-1">
                    <Card className="stat-card rounded-2xl">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                USDC Balance
                                {balanceError && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                                        cached
                                    </span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold value-accent">
                                {balanceLoading && !walletStatus.balances ? (
                                    <span className="inline-flex items-center gap-1">
                                        <span className="animate-pulse">•</span>
                                        <span className="animate-pulse animation-delay-150">•</span>
                                        <span className="animate-pulse animation-delay-300">•</span>
                                    </span>
                                ) : walletStatus.balances?.usdc !== undefined ? (
                                    `$${Number(walletStatus.balances.usdc).toFixed(2)}`
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                                        <span className="animate-pulse">•</span>
                                        <span className="animate-pulse animation-delay-150">•</span>
                                        <span className="animate-pulse animation-delay-300">•</span>
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">Available for operations</p>
                        </CardContent>
                    </Card>
                    <Card className="stat-card rounded-2xl">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                XLM Balance
                                {balanceError && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                                        cached
                                    </span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold">
                                {balanceLoading && !walletStatus.balances ? (
                                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                                        <span className="animate-pulse">•</span>
                                        <span className="animate-pulse animation-delay-150">•</span>
                                        <span className="animate-pulse animation-delay-300">•</span>
                                    </span>
                                ) : walletStatus.balances?.xlm !== undefined ? (
                                    Number(walletStatus.balances.xlm).toFixed(4)
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                                        <span className="animate-pulse">•</span>
                                        <span className="animate-pulse animation-delay-150">•</span>
                                        <span className="animate-pulse animation-delay-300">•</span>
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">Network fees</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Quick Actions */}
            {walletStatus?.walletAddress && (
                <div className="flex gap-3 animate-fade-in-up animate-delay-2">
                    <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
                        <DialogTrigger asChild>
                            <Button className="flex-1 h-14 bg-success hover:bg-success/90 text-success-foreground rounded-xl shadow-lg shadow-success/20">
                                <ArrowDownLeft className="w-5 h-5 mr-2" />
                                Deposit
                            </Button>
                        </DialogTrigger>
                        <DepositDialog walletAddress={walletStatus.walletAddress!} />
                    </Dialog>

                    <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                        <DialogTrigger asChild>
                            <Button
                                className="flex-1 h-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20"
                                onClick={() => setWithdrawStep('form')}
                            >
                                <ArrowUpRight className="w-5 h-5 mr-2" />
                                Withdraw
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md bg-slate-900 border-white/10 text-white">
                            <DialogHeader>
                                <DialogTitle>Withdraw Funds</DialogTitle>
                                <DialogDescription>
                                    Send assets from your company wallet to another Stellar address.
                                </DialogDescription>
                            </DialogHeader>

                            {withdrawStep === 'form' && (
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Asset</Label>
                                        <div className="flex gap-2">
                                            <Button
                                                variant={withdrawData.asset === 'USDC' ? 'default' : 'outline'}
                                                onClick={() => setWithdrawData({ ...withdrawData, asset: 'USDC' })}
                                                className={withdrawData.asset === 'USDC' ? 'bg-primary' : 'border-white/10'}
                                            >
                                                USDC
                                            </Button>
                                            <Button
                                                variant={withdrawData.asset === 'XLM' ? 'default' : 'outline'}
                                                onClick={() => setWithdrawData({ ...withdrawData, asset: 'XLM' })}
                                                className={withdrawData.asset === 'XLM' ? 'bg-primary' : 'border-white/10'}
                                            >
                                                XLM
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">Amount</Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            placeholder="0.00"
                                            value={withdrawData.amount}
                                            onChange={(e) => setWithdrawData({ ...withdrawData, amount: e.target.value })}
                                            className="glass-panel bg-black/20 border-white/10 rounded-xl text-foreground"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="destination">Destination Address</Label>
                                        <Input
                                            id="destination"
                                            placeholder="G..."
                                            value={withdrawData.destination}
                                            onChange={(e) => setWithdrawData({ ...withdrawData, destination: e.target.value })}
                                            className="glass-panel bg-black/20 border-white/10 rounded-xl text-foreground"
                                        />
                                        <p className="text-xs text-muted-foreground">Ensure the address accepts {withdrawData.asset}.</p>
                                    </div>
                                    {withdrawError && (
                                        <p className="text-sm text-destructive">{withdrawError}</p>
                                    )}
                                </div>
                            )}

                            {withdrawStep === 'review' && (
                                <div className="space-y-4 py-4">
                                    <div className="p-4 rounded-xl glass-panel bg-black/20 border border-white/10 space-y-3">
                                        <div className="flex justify-between">
                                            <span className="text-sm text-muted-foreground">Asset</span>
                                            <span className="font-medium">{withdrawData.asset}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm text-muted-foreground">Amount</span>
                                            <span className="font-medium text-lg">{withdrawData.amount}</span>
                                        </div>
                                        <div className="pt-3 border-t border-white/10">
                                            <span className="text-sm text-muted-foreground block mb-1">Destination</span>
                                            <span className="text-xs font-mono break-all text-gray-300">{withdrawData.destination}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-3 bg-primary/10 text-primary rounded-xl text-sm">
                                        <Shield className="w-4 h-4" />
                                        You will be asked to sign with your Passkey.
                                    </div>
                                    {withdrawError && (
                                        <p className="text-sm text-destructive">{withdrawError}</p>
                                    )}
                                </div>
                            )}

                            {withdrawStep === 'processing' && (
                                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                                    <p className="text-center text-muted-foreground">Processing withdrawal...</p>
                                </div>
                            )}

                            {withdrawStep === 'success' && (
                                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                                    <div className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center">
                                        <Check className="w-7 h-7 text-success" />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="font-medium text-lg">Withdrawal Successful</h3>
                                        <p className="text-sm text-muted-foreground">Your funds have been sent.</p>
                                    </div>
                                </div>
                            )}

                            <DialogFooter className="gap-2 sm:gap-0">
                                {withdrawStep === 'form' && (
                                    <>
                                        <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
                                        <Button
                                            onClick={handleProposeWithdrawal}
                                            disabled={!withdrawData.amount || !withdrawData.destination}
                                            className="bg-primary hover:bg-primary/90"
                                        >
                                            Review
                                        </Button>
                                    </>
                                )}
                                {withdrawStep === 'review' && (
                                    <>
                                        <Button variant="ghost" onClick={() => setWithdrawStep('form')}>Back</Button>
                                        <Button onClick={handleSubmitWithdrawal} className="bg-primary hover:bg-primary/90">
                                            Confirm & Sign
                                        </Button>
                                    </>
                                )}
                                {withdrawStep === 'success' && (
                                    <Button onClick={resetWithdrawal} className="w-full">Close</Button>
                                )}
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Button
                        variant="outline"
                        className="h-14 px-6 rounded-xl"
                        onClick={() => {
                            const address = walletStatus.walletAddress;
                            // Soroban contracts start with 'C', classic accounts start with 'G'
                            const path = address?.startsWith('C') ? 'contract' : 'account';
                            window.open(
                                walletStatus.explorer || `https://stellar.expert/explorer/testnet/${path}/${address}`,
                                '_blank'
                            );
                        }}
                    >
                        <ExternalLink className="w-5 h-5 mr-2" />
                        Explorer
                    </Button>
                </div>
            )}

            {/* Wallet Address & Security */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-3">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Key className="w-5 h-5 text-accent" />
                        Wallet Details
                    </CardTitle>
                    <CardDescription>Your company's blockchain wallet and security</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Security Method */}
                    <div className="activity-item flex items-center gap-4 p-4 rounded-xl">
                        <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium">Passkey Authentication</p>
                            <p className="text-sm text-muted-foreground">
                                {walletStatus?.passkeyRegistered ? 'Active and secured by device biometric' : 'Not registered'}
                            </p>
                        </div>
                        <span className={`px-3 py-1.5 rounded-full text-xs font-medium border ${walletStatus?.passkeyRegistered
                            ? 'bg-success/15 text-success border-success/30'
                            : 'bg-destructive/15 text-destructive border-destructive/30'
                            }`}>
                            {walletStatus?.passkeyRegistered ? 'Active' : 'Inactive'}
                        </span>
                    </div>

                    {/* Wallet Address */}
                    {walletStatus?.walletAddress && (
                        <div className="space-y-4 pt-4 border-t border-white/10">
                            <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                                <div className="flex items-center gap-2 mb-3">
                                    <p className="text-sm font-medium">Deposit Address</p>
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-primary/15 text-primary">
                                        Stellar Testnet
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 p-3 bg-black/30 rounded-lg border border-white/5">
                                    <p className="text-xs font-mono text-muted-foreground break-all">{walletStatus.walletAddress}</p>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 hover:bg-white/10 shrink-0"
                                        onClick={() => navigator.clipboard.writeText(walletStatus.walletAddress!)}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Warning */}
                            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-destructive text-sm">Critical Warning</p>
                                        <p className="text-xs text-destructive/80 mt-1 leading-relaxed">
                                            Only send <strong>Stellar Network USDC</strong> (Native).
                                            Do <strong>NOT</strong> send USDC from Ethereum, Solana, or Polygon directly.
                                            Sending wrong chain assets will result in <strong>permanent loss of funds</strong>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!walletStatus?.walletAddress && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="p-5 rounded-2xl bg-muted/30 mb-4">
                                <WalletIcon className="w-10 h-10 text-muted-foreground/50" />
                            </div>
                            <p className="text-lg font-medium mb-1">No wallet connected</p>
                            <p className="text-sm text-muted-foreground">Complete registration to activate your company wallet.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default Wallet;
