
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Key, Shield, Check, ArrowUpRight, ArrowDownLeft, Copy, ExternalLink, Wallet as WalletIcon, Coins, TrendingUp, Calendar } from 'lucide-react';
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

interface TokenizedAsset {
    assetCode: string;
    tokenName: string;
    amount: number;
    currentValue: number;
    interestEarned: number;
    maturityDate: string;
    annualRate?: number;
    issuerName?: string;
}

export function Wallet() {
    const [user, setUser] = useState<any>(null);
    const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [balanceLoading, setBalanceLoading] = useState(true);
    const [balanceError, setBalanceError] = useState(false);
    const [tokenizedAssets, setTokenizedAssets] = useState<TokenizedAsset[]>([]);

    // Withdrawal State
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [depositOpen, setDepositOpen] = useState(false);
    const [withdrawStep, setWithdrawStep] = useState<'form' | 'review' | 'processing' | 'success'>('form');
    const [withdrawData, setWithdrawData] = useState({ amount: '', destination: '', asset: 'USDC' });
    const [withdrawTx, setWithdrawTx] = useState<{ xdr: string; networkPassphrase: string } | null>(null);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);

    // Cache key for localStorage
    const getCacheKey = (userId: number | string) => `wallet_balance_cache_${userId}`;

    // Get cached balance from localStorage
    const getCachedBalance = (userId: number | string) => {
        try {
            const cached = localStorage.getItem(getCacheKey(userId));
            if (cached) {
                return JSON.parse(cached);
            }
        } catch {
            // Ignore parse errors
        }
        return null;
    };

    // Save balance to localStorage cache
    const setCachedBalance = (userId: number | string, balances: { xlm: string; usdc: string }) => {
        try {
            localStorage.setItem(getCacheKey(userId), JSON.stringify({
                balances,
                cachedAt: Date.now()
            }));
        } catch {
            // Ignore storage errors
        }
    };

    useEffect(() => {
        async function fetchWalletStatus() {
            try {
                const userStr = localStorage.getItem('user');
                const storedUser = JSON.parse(userStr || '{}');
                setUser(storedUser);

                if (storedUser.id) {
                    // Get cached balance first for immediate display
                    const cachedData = getCachedBalance(storedUser.id);

                    try {
                        setBalanceLoading(true);
                        setBalanceError(false);

                        const response = await api.get(`/investors/${storedUser.id}/wallet-status`);
                        const data = response.data || response;

                        // Cache the fresh balance
                        if (data.balances) {
                            setCachedBalance(storedUser.id, data.balances);
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
                        // On error, use cached balance if available
                        if (cachedData?.balances) {
                            setWalletStatus({
                                hasWallet: true,
                                walletAddress: cachedData.walletAddress,
                                passkeyRegistered: true,
                                balances: cachedData.balances,
                            });
                            setBalanceError(true); // Mark that we're showing cached data
                        } else {
                            // No cache, show wallet without balance (will show loading indicator)
                            setWalletStatus({
                                hasWallet: false,
                                passkeyRegistered: true,
                                // Don't set balances - this will trigger the loading state
                            });
                        }
                        setBalanceLoading(false);
                    }

                    // Fetch tokenized assets (portfolio)
                    try {
                        const portfolioResponse = await api.get(`/investors/${storedUser.id}/portfolio`);
                        const portfolioData = portfolioResponse.data || portfolioResponse;
                        const assets = Array.isArray(portfolioData) ? portfolioData : (portfolioData.investments || []);

                        setTokenizedAssets(assets.map((inv: any) => ({
                            assetCode: inv.assetCode || inv.asset_code || 'N/A',
                            tokenName: inv.tokenName || inv.token_name || inv.assetCode || 'Security Token',
                            amount: Number(inv.amount) || 0,
                            currentValue: Number(inv.currentValue || inv.amount) || 0,
                            interestEarned: Number(inv.interestEarned || inv.interest_earned) || 0,
                            maturityDate: inv.maturityDate || inv.maturity_date || 'N/A',
                            annualRate: inv.annualRate || inv.annual_rate,
                            issuerName: inv.issuerName || inv.issuer_name,
                        })));
                    } catch (err) {
                        console.log('Could not fetch tokenized assets');
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
            const response = await api.post(`/investors/${user.id}/withdraw/propose`, {
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
            await api.post('/investors/withdraw/submit', { signedXdr });

            setWithdrawStep('success');
            // Refresh wallet status
            const statusResponse = await api.get(`/investors/${user.id}/wallet-status`);
            const statusData = statusResponse.data || statusResponse;
            setWalletStatus({
                hasWallet: statusData.hasWallet || !!statusData.contractId,
                walletAddress: statusData.contractId || statusData.walletAddress,
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
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading wallet...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-3xl">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">Wallet</h2>
                <p className="text-muted-foreground">Manage your Stellar wallet and assets</p>
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
                            <p className="text-xs text-muted-foreground mt-2">Available for investment</p>
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
                            <Button className="flex-1 h-14 bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white rounded-xl shadow-lg shadow-[hsl(160_60%_40%/0.2)]">
                                <ArrowDownLeft className="w-5 h-5 mr-2" />
                                Deposit
                            </Button>
                        </DialogTrigger>
                        <DepositDialog walletAddress={walletStatus.walletAddress!} />
                    </Dialog>

                    <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                        <DialogTrigger asChild>
                            <Button
                                className="flex-1 h-14 bg-[hsl(217_91%_60%)] hover:bg-[hsl(217_91%_55%)] text-white rounded-xl shadow-lg shadow-[hsl(217_91%_60%/0.2)]"
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
                                    Send assets from your wallet to another Stellar address.
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
                                                className={withdrawData.asset === 'USDC' ? 'bg-[hsl(217_91%_60%)]' : 'border-white/10'}
                                            >
                                                USDC
                                            </Button>
                                            <Button
                                                variant={withdrawData.asset === 'XLM' ? 'default' : 'outline'}
                                                onClick={() => setWithdrawData({ ...withdrawData, asset: 'XLM' })}
                                                className={withdrawData.asset === 'XLM' ? 'bg-[hsl(217_91%_60%)]' : 'border-white/10'}
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
                                            className="bg-white/5 border-white/10 rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="destination">Destination Address</Label>
                                        <Input
                                            id="destination"
                                            placeholder="G..."
                                            value={withdrawData.destination}
                                            onChange={(e) => setWithdrawData({ ...withdrawData, destination: e.target.value })}
                                            className="bg-white/5 border-white/10 rounded-xl"
                                        />
                                        <p className="text-xs text-muted-foreground">Ensure the address accepts {withdrawData.asset}.</p>
                                    </div>
                                    {withdrawError && (
                                        <p className="text-sm text-red-400">{withdrawError}</p>
                                    )}
                                </div>
                            )}

                            {withdrawStep === 'review' && (
                                <div className="space-y-4 py-4">
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
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
                                    <div className="flex items-center gap-2 p-3 bg-[hsl(217_91%_60%/0.1)] text-[hsl(217_91%_60%)] rounded-xl text-sm">
                                        <Shield className="w-4 h-4" />
                                        You will be asked to sign with your Passkey.
                                    </div>
                                    {withdrawError && (
                                        <p className="text-sm text-red-400">{withdrawError}</p>
                                    )}
                                </div>
                            )}

                            {withdrawStep === 'processing' && (
                                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(217_91%_60%)]" />
                                    <p className="text-center text-muted-foreground">Processing withdrawal...</p>
                                </div>
                            )}

                            {withdrawStep === 'success' && (
                                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                                    <div className="w-14 h-14 rounded-full bg-[hsl(160_60%_40%/0.2)] flex items-center justify-center">
                                        <Check className="w-7 h-7 text-[hsl(160_60%_40%)]" />
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
                                            className="bg-[hsl(217_91%_60%)] hover:bg-[hsl(217_91%_55%)]"
                                        >
                                            Review
                                        </Button>
                                    </>
                                )}
                                {withdrawStep === 'review' && (
                                    <>
                                        <Button variant="ghost" onClick={() => setWithdrawStep('form')}>Back</Button>
                                        <Button onClick={handleSubmitWithdrawal} className="bg-[hsl(217_91%_60%)] hover:bg-[hsl(217_91%_55%)]">
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

            {/* Tokenized Securities */}
            {walletStatus?.walletAddress && (
                <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-3">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Coins className="w-5 h-5 text-[hsl(43_45%_55%)]" />
                            Tokenized Securities
                        </CardTitle>
                        <CardDescription>Your security token holdings from investments</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {tokenizedAssets.length > 0 ? (
                            <div className="space-y-3">
                                {tokenizedAssets.map((asset, index) => (
                                    <div
                                        key={`${asset.assetCode}-${index}`}
                                        className="activity-item p-4 rounded-xl"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(43_45%_55%)] to-[hsl(43_45%_35%)] flex items-center justify-center text-white font-bold text-sm">
                                                    {asset.assetCode.slice(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{asset.tokenName}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{asset.assetCode}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold value-accent">
                                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(asset.currentValue)}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{asset.amount.toLocaleString()} tokens</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 pt-3 border-t border-white/10">
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <TrendingUp className="w-4 h-4 text-[hsl(160_60%_40%)]" />
                                                <span className="value-success font-medium">
                                                    +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(asset.interestEarned)}
                                                </span>
                                                <span className="text-muted-foreground">earned</span>
                                            </div>
                                            {asset.maturityDate !== 'N/A' && (
                                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    <Calendar className="w-4 h-4" />
                                                    <span>Matures {new Date(asset.maturityDate).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                            {asset.annualRate && (
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <span className="text-muted-foreground">APY:</span>
                                                    <span className="value-success font-medium">{asset.annualRate}%</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="p-5 rounded-2xl bg-muted/30 mb-4">
                                    <Coins className="w-10 h-10 text-muted-foreground/50" />
                                </div>
                                <p className="text-lg font-medium mb-1">No tokenized assets yet</p>
                                <p className="text-sm text-muted-foreground">Invest in security tokens to see them here.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Wallet Address & Security */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-3">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Key className="w-5 h-5 text-[hsl(43_45%_55%)]" />
                        Wallet Details
                    </CardTitle>
                    <CardDescription>Your blockchain wallet and security</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Security Method */}
                    <div className="activity-item flex items-center gap-4 p-4 rounded-xl">
                        <div className="w-12 h-12 rounded-xl bg-[hsl(217_91%_60%/0.15)] flex items-center justify-center">
                            <Shield className="w-6 h-6 text-[hsl(217_91%_60%)]" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium">Passkey Authentication</p>
                            <p className="text-sm text-muted-foreground">
                                {walletStatus?.passkeyRegistered ? 'Active and secured by device biometric' : 'Not registered'}
                            </p>
                        </div>
                        <span className={`px-3 py-1.5 rounded-full text-xs font-medium border ${walletStatus?.passkeyRegistered
                            ? 'bg-[hsl(160_60%_40%/0.15)] text-[hsl(160_60%_40%)] border-[hsl(160_60%_40%/0.3)]'
                            : 'bg-red-500/15 text-red-400 border-red-500/30'
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
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-[hsl(217_91%_60%/0.15)] text-[hsl(217_91%_60%)]">
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
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-red-400 text-sm">Critical Warning</p>
                                        <p className="text-xs text-red-300/80 mt-1 leading-relaxed">
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
                            <p className="text-sm text-muted-foreground">Complete registration to activate your wallet.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
