import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Wallet, TrendingUp, PieChart, Briefcase, Clock, Copy, Check, RefreshCw, AlertCircle, Hourglass, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';
import { usePendingInvestments, type PendingInvestment } from '@/hooks/usePendingInvestments';

interface Investment {
    assetCode: string;
    tokenName: string;
    amount: number;
    currentValue: number;
    interestEarned: number;
    maturityDate: string;
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 gap-2 text-xs border-white/10 hover:bg-white/5"
        >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            {label}
        </Button>
    );
}

function PendingInvestmentCard({ investment, isProcessing }: { investment: PendingInvestment; isProcessing?: boolean }) {
    const statusConfig = isProcessing ? {
        label: 'Processing',
        sublabel: 'Payment detected, distributing tokens...',
        bgClass: 'bg-blue-500/10 border-blue-500/30',
        textClass: 'text-blue-400',
        icon: RefreshCw,
        iconClass: 'animate-spin',
    } : {
        label: 'Awaiting Payment',
        sublabel: 'Send USDC to complete your investment',
        bgClass: 'bg-amber-500/10 border-amber-500/30',
        textClass: 'text-amber-400',
        icon: Hourglass,
        iconClass: '',
    };

    const StatusIcon = statusConfig.icon;

    return (
        <div className={`p-4 rounded-xl border ${statusConfig.bgClass} space-y-4`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(43_45%_55%)] to-[hsl(43_45%_35%)] flex items-center justify-center text-white font-bold text-sm">
                        {investment.assetCode.slice(0, 2)}
                    </div>
                    <div>
                        <p className="font-medium">{investment.offerName || investment.assetCode}</p>
                        <p className="text-xs text-muted-foreground font-mono">{investment.assetCode}</p>
                    </div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${statusConfig.bgClass} ${statusConfig.textClass}`}>
                    <StatusIcon className={`h-3 w-3 ${statusConfig.iconClass}`} />
                    {statusConfig.label}
                </div>
            </div>

            {/* Investment Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-muted-foreground">Amount to Pay</p>
                    <p className="font-semibold text-lg">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(investment.usdcAmount)}
                    </p>
                </div>
                <div>
                    <p className="text-muted-foreground">Tokens to Receive</p>
                    <p className="font-semibold text-lg">
                        {investment.tokenAmount.toLocaleString()} {investment.assetCode}
                    </p>
                </div>
            </div>

            {/* Payment Instructions (only for pending_payment) */}
            {!isProcessing && investment.paymentInstructions && (
                <div className="space-y-3 pt-2 border-t border-white/10">
                    <p className={`text-xs ${statusConfig.textClass}`}>{statusConfig.sublabel}</p>

                    {/* Memo - Most Important */}
                    <div className="bg-amber-500/5 p-3 rounded-lg border border-amber-500/20">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-amber-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> MEMO (Required)
                            </span>
                            <CopyButton text={investment.paymentInstructions.memo} label="Copy Memo" />
                        </div>
                        <p className="font-mono text-sm break-all">{investment.paymentInstructions.memo}</p>
                    </div>

                    {/* Treasury Address */}
                    <div className="bg-white/5 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">Treasury Address</span>
                            <CopyButton text={investment.paymentInstructions.treasuryAddress} label="Copy" />
                        </div>
                        <p className="font-mono text-xs break-all text-muted-foreground">
                            {investment.paymentInstructions.treasuryAddress}
                        </p>
                    </div>
                </div>
            )}

            {/* Processing message + Stellar Expert link */}
            {isProcessing && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                    <p className={`text-xs ${statusConfig.textClass}`}>{statusConfig.sublabel}</p>
                    {investment.usdcPaymentHash && (
                        <a
                            href={`https://stellar.expert/explorer/testnet/tx/${investment.usdcPaymentHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            <ExternalLink className="h-3 w-3" />
                            View USDC payment on Stellar Expert
                        </a>
                    )}
                </div>
            )}

            {/* Timestamp */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Created {new Date(investment.createdAt).toLocaleString()}
            </div>
        </div>
    );
}

export function Portfolio() {
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const {
        pendingInvestments,
        processingInvestments,
        hasPending,
        loading: pendingLoading,
        refresh: refreshPending,
        lastUpdated,
    } = usePendingInvestments();

    useEffect(() => {
        async function fetchPortfolio() {
            try {
                const user = authStorage.getUser<{ id: number }>('investor');
                if (!user?.id) throw new Error('User not found');
                const response = await api.get(`/investors/${user.id}/portfolio`);

                const data = response.data || response;
                const investmentsList = Array.isArray(data)
                    ? data
                    : (data.portfolio || data.investments || []);

                setInvestments(investmentsList.map((inv: any) => ({
                    assetCode: inv.assetCode || inv.asset_code || 'N/A',
                    tokenName: inv.offerName || inv.tokenName || inv.token_name || inv.assetCode || 'Security Token',
                    amount: Number(inv.totalDistributed || inv.amount) || 0,
                    currentValue: Number(inv.currentValue || inv.totalDistributed || inv.amount) || 0,
                    interestEarned: Number(inv.interestEarned || inv.interest_earned) || 0,
                    maturityDate: inv.maturityDate || inv.maturity_date || 'N/A',
                })));
            } catch (err: any) {
                console.error('Failed to fetch portfolio:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchPortfolio();
    }, [processingInvestments.length]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading your portfolio...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 animate-fade-in">
                Failed to load portfolio: {error}
            </div>
        );
    }

    const totalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0);
    const totalInterest = investments.reduce((sum, inv) => sum + inv.interestEarned, 0);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">My Portfolio</h2>
                <p className="text-muted-foreground">Track your security token investments</p>
            </div>

            {/* Pending Investments Section */}
            {(hasPending || pendingLoading) && (
                <Card className="glass-panel rounded-2xl border-amber-500/20 animate-fade-in-up">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Hourglass className="h-5 w-5 text-amber-400" />
                                Pending Investments
                            </CardTitle>
                            <CardDescription>
                                {pendingInvestments.length} awaiting payment, {processingInvestments.length} processing
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            {lastUpdated && (
                                <span className="text-xs text-muted-foreground">
                                    Updated {lastUpdated.toLocaleTimeString()}
                                </span>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={refreshPending}
                                disabled={pendingLoading}
                                className="h-8 gap-2 border-white/10"
                            >
                                <RefreshCw className={`h-3 w-3 ${pendingLoading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Processing investments first (more urgent) */}
                        {processingInvestments.map(inv => (
                            <PendingInvestmentCard key={inv.id} investment={inv} isProcessing />
                        ))}
                        {/* Pending payment investments */}
                        {pendingInvestments.map(inv => (
                            <PendingInvestmentCard key={inv.id} investment={inv} />
                        ))}
                        {pendingLoading && pendingInvestments.length === 0 && processingInvestments.length === 0 && (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Summary Cards */}
            <div className="grid gap-5 md:grid-cols-3">
                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-1">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Portfolio Value</CardTitle>
                        <div className="icon-bg icon-bg-accent">
                            <Wallet className="h-5 w-5 text-[hsl(43_45%_55%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold value-accent">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalValue)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Interest Earned</CardTitle>
                        <div className="icon-bg icon-bg-success">
                            <TrendingUp className="h-5 w-5 text-[hsl(160_60%_40%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold value-success">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalInterest)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="stat-card rounded-2xl animate-fade-in-up animate-delay-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Investments</CardTitle>
                        <div className="icon-bg icon-bg-primary">
                            <PieChart className="h-5 w-5 text-[hsl(217_91%_60%)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{investments.length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Investment List */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-4">
                <CardHeader>
                    <CardTitle className="text-xl">My Investments</CardTitle>
                    <CardDescription>Your security token holdings</CardDescription>
                </CardHeader>
                <CardContent>
                    {investments.length > 0 ? (
                        <div className="space-y-3">
                            {investments.map((inv, index) => (
                                <div
                                    key={`${inv.assetCode}-${index}`}
                                    className="activity-item flex items-center justify-between p-4 rounded-xl"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(43_45%_55%)] to-[hsl(43_45%_35%)] flex items-center justify-center text-white font-bold text-sm">
                                            {inv.assetCode.slice(0, 2)}
                                        </div>
                                        <div>
                                            <p className="font-medium">{inv.tokenName}</p>
                                            <p className="text-sm text-muted-foreground font-mono">{inv.assetCode}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(inv.currentValue)}
                                        </p>
                                        <p className="text-sm value-success">
                                            +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(inv.interestEarned)} earned
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="p-5 rounded-2xl bg-muted/30 mb-4">
                                <Briefcase className="w-10 h-10 text-muted-foreground/50" />
                            </div>
                            <p className="text-lg font-medium mb-1">No investments yet</p>
                            <p className="text-sm text-muted-foreground">Visit the Marketplace to invest in security tokens.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
