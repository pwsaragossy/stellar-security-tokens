
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Loader2, TrendingUp, Briefcase, Clock,
    RefreshCw, Hourglass, ExternalLink,
    ChevronDown, Calendar, Percent, DollarSign, ArrowRight,
    Hash, Coins,
} from 'lucide-react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';
import { usePendingInvestments, type PendingInvestment } from '@/hooks/usePendingInvestments';

/* ─── Types ─── */
interface PortfolioHolding {
    id: number;
    assetCode: string;
    offerName: string | null;
    offerType: string | null;
    offerId: number | null;
    annualInterestRate: number;
    maturityDate: string | null;
    paymentType: string | null;
    unitPrice: number;
    totalDistributed: number;
    interestEarned: number;
    interestPaymentCount: number;
    issuerPublicKey: string | null;
    sacContractId: string | null;
    offerStatus: string | null;
    issuedAt: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Semi-Annual',
    annual: 'Annual',
    bullet: 'Bullet',
};

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet';

/* ─── Helpers ─── */
function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function getMaturityLabel(date: string | null): string | null {
    if (!date) return null;
    const maturity = new Date(date);
    const now = new Date();
    const diffMs = maturity.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Matured';
    if (diffDays === 0) return 'Matures today';
    if (diffDays <= 30) return `${diffDays}d remaining`;
    if (diffDays <= 365) return `${Math.ceil(diffDays / 30)} months`;
    return `${(diffDays / 365).toFixed(1)} years`;
}

function getMaturityAccent(date: string | null): string {
    if (!date) return 'text-muted-foreground';
    const diffDays = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'text-muted-foreground';
    if (diffDays <= 30) return 'text-amber-400';
    return 'text-muted-foreground';
}


/* ─── Pending Investment Card (kept compact) ─── */
function PendingInvestmentCard({ investment, isProcessing }: { investment: PendingInvestment; isProcessing?: boolean }) {
    const navigate = useNavigate();
    const statusConfig = isProcessing ? {
        label: investment.status === 'trade_submitted' ? 'Submitting Trade' : 'Processing',
        sublabel: investment.status === 'trade_submitted'
            ? 'Soroban atomic swap in progress…'
            : 'Payment detected, distributing tokens…',
        bgClass: 'bg-blue-500/10 border-blue-500/30',
        textClass: 'text-blue-400',
        icon: RefreshCw,
        iconClass: 'animate-spin',
    } : {
        label: 'Awaiting Signature',
        sublabel: 'Your transaction was prepared but not signed yet.',
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

            {/* Amount row */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-muted-foreground">Amount to Pay</p>
                    <p className="font-semibold text-lg">{formatCurrency(investment.usdcAmount)}</p>
                </div>
                <div>
                    <p className="text-muted-foreground">Tokens to Receive</p>
                    <p className="font-semibold text-lg">{investment.tokenAmount.toLocaleString()} {investment.assetCode}</p>
                </div>
            </div>

            {/* Pending: action button + message */}
            {!isProcessing && (
                <div className="pt-3 border-t border-white/10 space-y-3">
                    <p className={`text-xs ${statusConfig.textClass}`}>{statusConfig.sublabel}</p>
                    {investment.offerId && (
                        <Button
                            size="sm"
                            className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-medium gap-2"
                            onClick={() => navigate(`/market/${investment.offerId}`)}
                        >
                            <ArrowRight className="h-3.5 w-3.5" />
                            Complete Investment
                        </Button>
                    )}
                </div>
            )}

            {/* Processing message */}
            {isProcessing && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                    <p className={`text-xs ${statusConfig.textClass}`}>{statusConfig.sublabel}</p>
                    {investment.usdcPaymentHash && (
                        <a
                            href={`${STELLAR_EXPLORER}/tx/${investment.usdcPaymentHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            <ExternalLink className="h-3 w-3" />
                            View payment on Stellar Expert
                        </a>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Created {new Date(investment.createdAt).toLocaleString()}
            </div>
        </div>
    );
}

/* ─── Investment Holding Card (new rich card) ─── */
function HoldingCard({ holding, index }: { holding: PortfolioHolding; index: number }) {
    const navigate = useNavigate();
    const maturityLabel = getMaturityLabel(holding.maturityDate);
    const maturityAccent = getMaturityAccent(holding.maturityDate);
    const paymentLabel = PAYMENT_LABELS[holding.paymentType || ''] || holding.paymentType || '—';
    const holdingValue = holding.totalDistributed * holding.unitPrice;

    return (
        <div
            className={`rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.05] transition-all duration-300 animate-fade-in-up`}
            style={{ animationDelay: `${index * 80}ms` }}
        >
            {/* ── Card header ── */}
            <div className="p-5 pb-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[hsl(43_45%_55%)] to-[hsl(43_45%_35%)] flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {holding.assetCode.slice(0, 2)}
                        </div>
                        <div>
                            <h3 className="font-semibold text-[15px] leading-tight">
                                {holding.offerName || holding.assetCode}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground font-mono">{holding.assetCode}</span>
                                <Badge className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border border-white/10 capitalize">
                                    {holding.offerType === 'collateral' ? 'Debt' : 'Equity'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                    {/* Hero: holding value + expected payout */}
                    <div className="text-right">
                        <p className="text-lg font-bold">{formatCurrency(holdingValue)}</p>
                        <p className="text-xs text-muted-foreground">
                            {holding.totalDistributed.toLocaleString()} tokens
                        </p>
                        {holding.annualInterestRate > 0 && (
                            <p className="text-xs text-emerald-400 mt-0.5">
                                → {formatCurrency(holdingValue * (1 + holding.annualInterestRate / 100))} at maturity
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Key metrics strip ── */}
            <div className="mx-5 mb-4 p-3 rounded-xl bg-black/20 grid grid-cols-3 gap-3">
                {/* APY */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                        <Percent className="h-3 w-3" />
                        <span className="text-[10px] uppercase tracking-wider">APY</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">
                        {holding.annualInterestRate ? `${parseFloat(String(holding.annualInterestRate))}%` : '—'}
                    </span>
                </div>
                {/* Payout */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                        <DollarSign className="h-3 w-3" />
                        <span className="text-[10px] uppercase tracking-wider">Payout</span>
                    </div>
                    <span className="text-sm font-semibold">{paymentLabel}</span>
                </div>
                {/* Maturity */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                        <Calendar className="h-3 w-3" />
                        <span className="text-[10px] uppercase tracking-wider">Maturity</span>
                    </div>
                    <span className={`text-sm font-semibold ${maturityAccent}`}>
                        {maturityLabel || 'Perpetual'}
                    </span>
                </div>
            </div>

            {/* ── Maturity progress bar ── */}
            {holding.maturityDate && (() => {
                const maturity = new Date(holding.maturityDate).getTime();
                const now = Date.now();
                // Use actual issuance date as start, fall back to 1 year before maturity
                const start = holding.issuedAt
                    ? new Date(holding.issuedAt).getTime()
                    : maturity - 365 * 24 * 60 * 60 * 1000;
                const totalDuration = maturity - start;
                const elapsed = Math.max(0, now - start);
                const progress = totalDuration > 0
                    ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100))
                    : 0;
                const isMatured = now >= maturity;

                return (
                    <div className="mx-5 mb-4">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Maturity Progress</span>
                            <span className={`text-[10px] font-medium ${isMatured ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                                {isMatured ? 'Matured' : `${Math.round(progress)}%`}
                            </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${isMatured
                                    ? 'bg-emerald-400'
                                    : progress > 75
                                        ? 'bg-amber-400'
                                        : 'bg-[hsl(43_45%_55%)]'
                                    }`}
                                style={{ width: `${isMatured ? 100 : progress}%` }}
                            />
                        </div>
                    </div>
                );
            })()}

            {/* ── Interest earned callout ── */}
            {holding.interestEarned > 0 && (
                <div className="mx-5 mb-4 flex items-center justify-between p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                    <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                        <span className="text-muted-foreground">Interest Earned</span>
                    </div>
                    <div className="text-right">
                        <span className="text-sm font-bold text-emerald-400">
                            {formatCurrency(holding.interestEarned)}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                            ({holding.interestPaymentCount} payments)
                        </span>
                    </div>
                </div>
            )}

            {/* ── Quick actions ── */}
            <div className="px-5 pb-4 flex items-center gap-2">
                {holding.offerId && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-white/10 hover:bg-white/5 gap-1.5"
                        onClick={() => navigate(`/market/${holding.offerId}`)}
                    >
                        <ArrowRight className="h-3 w-3" /> View Offer
                    </Button>
                )}
                {holding.issuerPublicKey && (
                    <a
                        href={`${STELLAR_EXPLORER}/asset/${holding.assetCode}-${holding.issuerPublicKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs border-white/10 hover:bg-white/5 gap-1.5"
                        >
                            <Hash className="h-3 w-3" /> Stellar Expert
                            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                        </Button>
                    </a>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════ */
/*  MAIN PAGE                              */
/* ═══════════════════════════════════════ */
export function Portfolio() {
    const navigate = useNavigate();
    const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pendingOpen, setPendingOpen] = useState(false);
    const [usdcBalance, setUsdcBalance] = useState<string | null>(null);

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

                // Fetch portfolio + wallet status in parallel
                const [portfolioRes, walletRes] = await Promise.allSettled([
                    api.get(`/investors/${user.id}/portfolio`),
                    api.get(`/investors/${user.id}/wallet-status`),
                ]);

                // Process portfolio
                if (portfolioRes.status === 'fulfilled') {
                    const data = portfolioRes.value.data || portfolioRes.value;
                    const raw = Array.isArray(data)
                        ? data
                        : (data.portfolio || data.investments || []);

                    setHoldings(raw.map((inv: any) => ({
                        id: inv.id || 0,
                        assetCode: inv.assetCode || inv.asset_code || 'N/A',
                        offerName: inv.offerName || inv.offer_name || null,
                        offerType: inv.offerType || inv.offer_type || null,
                        offerId: inv.offerId || inv.offer_id || null,
                        annualInterestRate: Number(inv.annualInterestRate || inv.annual_interest_rate || 0),
                        maturityDate: inv.maturityDate || inv.maturity_date || null,
                        paymentType: inv.paymentType || inv.payment_type || null,
                        unitPrice: Number(inv.unitPrice || inv.unit_price || 1),
                        totalDistributed: Number(inv.totalDistributed || inv.total_distributed || inv.amount || 0),
                        interestEarned: Number(inv.interestEarned || inv.interest_earned || 0),
                        interestPaymentCount: Number(inv.interestPaymentCount || 0),
                        issuerPublicKey: inv.issuerPublicKey || inv.issuer_public_key || null,
                        sacContractId: inv.sacContractId || inv.sac_contract_id || null,
                        offerStatus: inv.offerStatus || inv.offer_status || null,
                        issuedAt: inv.issuedAt || inv.issued_at || null,
                    })));
                } else {
                    throw new Error(portfolioRes.reason?.message || 'Failed to load portfolio');
                }

                // Process wallet balance
                if (walletRes.status === 'fulfilled') {
                    const walletData = walletRes.value.data || walletRes.value;
                    if (walletData.balances?.usdc !== undefined) {
                        setUsdcBalance(walletData.balances.usdc);
                    }
                }
            } catch (err: any) {
                console.error('Failed to fetch portfolio:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchPortfolio();
    }, [processingInvestments.length]);

    /* ─── Loading ─── */
    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading your portfolio…</p>
                </div>
            </div>
        );
    }

    /* ─── Error ─── */
    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 animate-fade-in">
                Failed to load portfolio: {error}
            </div>
        );
    }

    /* ─── Computed values ─── */
    const totalValue = holdings.reduce((sum, h) => sum + h.totalDistributed * h.unitPrice, 0);
    const expectedPayout = holdings.reduce((sum, h) => {
        const value = h.totalDistributed * h.unitPrice;
        const apy = h.annualInterestRate || 0;
        return sum + value * (1 + apy / 100);
    }, 0);
    const pendingCount = pendingInvestments.length + processingInvestments.length;

    return (
        <div className="space-y-8 max-w-3xl mx-auto pb-12">
            {/* ═══ HEADER with inline stats ═══ */}
            <div className="animate-fade-in space-y-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">My Portfolio</h2>
                    <p className="text-muted-foreground">Your digital asset holdings</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                            <Coins className="h-3 w-3" /> USDC Balance
                        </p>
                        <p className="text-xl font-bold value-accent">
                            {usdcBalance !== null ? `$${Number(usdcBalance).toFixed(2)}` : '—'}
                        </p>
                        {(usdcBalance === null || Number(usdcBalance) === 0) && (
                            <button
                                onClick={() => navigate('/wallet')}
                                className="text-[11px] text-[hsl(43_45%_55%)] hover:text-[hsl(43_45%_65%)] mt-1 flex items-center gap-1 transition-colors"
                            >
                                Deposit <ArrowRight className="h-2.5 w-2.5" />
                            </button>
                        )}
                    </div>
                    <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Portfolio Value</p>
                        <p className="text-xl font-bold">{formatCurrency(totalValue)}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Expected Payout
                        </p>
                        <p className="text-xl font-bold text-emerald-400">{formatCurrency(expectedPayout)}</p>
                    </div>
                </div>
            </div>

            {/* ═══ PENDING INVESTMENTS — Collapsible ═══ */}
            {(hasPending || pendingLoading) && (
                <div className="rounded-2xl border border-amber-500/20 bg-white/[0.02] animate-fade-in-up overflow-hidden">
                    {/* Disclosure header */}
                    <button
                        onClick={() => setPendingOpen(!pendingOpen)}
                        className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors text-left"
                    >
                        <div className="flex items-center gap-3">
                            <Hourglass className="h-5 w-5 text-amber-400" />
                            <div>
                                <h3 className="font-semibold text-base">Pending Investments</h3>
                                <p className="text-xs text-muted-foreground">
                                    {pendingInvestments.length} awaiting payment, {processingInvestments.length} processing
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {pendingCount > 0 && (
                                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
                                    {pendingCount}
                                </Badge>
                            )}
                            {lastUpdated && (
                                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                    {lastUpdated.toLocaleTimeString()}
                                </span>
                            )}
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${pendingOpen ? 'rotate-180' : ''}`} />
                        </div>
                    </button>

                    {/* Collapsible content */}
                    {pendingOpen && (
                        <div className="px-5 pb-5 space-y-4 animate-fade-in">
                            <div className="flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={refreshPending}
                                    disabled={pendingLoading}
                                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                                >
                                    <RefreshCw className={`h-3 w-3 ${pendingLoading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </Button>
                            </div>
                            {processingInvestments.map(inv => (
                                <PendingInvestmentCard key={inv.id} investment={inv} isProcessing />
                            ))}
                            {pendingInvestments.map(inv => (
                                <PendingInvestmentCard key={inv.id} investment={inv} />
                            ))}
                            {pendingLoading && pendingCount === 0 && (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ INVESTMENT HOLDINGS ═══ */}
            {holdings.length > 0 ? (
                <div className="space-y-4">
                    {holdings.map((holding, index) => (
                        <HoldingCard key={holding.assetCode} holding={holding} index={index} />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
                    <div className="p-5 rounded-2xl bg-muted/30 mb-5">
                        <Briefcase className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                    <p className="text-lg font-medium mb-1">No investments yet</p>
                    <p className="text-sm text-muted-foreground mb-5">
                        Explore our marketplace to invest in digital assets.
                    </p>
                    <Button
                        className="bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white rounded-xl px-6"
                        onClick={() => navigate('/market')}
                    >
                        Browse Marketplace <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}
