
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rampApi } from '@/api/ramp';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowUpRight, ArrowDownLeft, ExternalLink, Coins, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import {
    Dialog,
    DialogTrigger,
} from "@/components/ui/dialog";
import { DepositDialog } from '@/components/wallet/DepositDialog';
import { WithdrawDialog } from '@/components/wallet/WithdrawDialog';
import { authStorage } from '@/utils/authStorage';

interface WalletStatus {
    hasWallet: boolean;
    walletAddress?: string;
    passkeyRegistered: boolean;
    balances?: {
        xlm: string;
        usdc: string;
        tesouro?: string; // EtherFuse BR/PIX delivery — yield-bearing BR treasury position
    };
    tesouroMarket?: {
        priceBrl: string | null; // BRL per TESOURO at fetch time
        yieldPctYear: number | null; // Selic meta target (BCB), proxy for treasury yield
        asOf: string;
    } | null;
    explorer?: string;
    depositMemo?: string;
}

interface TokenizedAsset {
    assetCode: string;
    tokenName: string;
    amount: number;
    currentValue: number;
    issuerPublicKey?: string;
}
const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet';

export function Wallet() {
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [balanceLoading, setBalanceLoading] = useState(true);
    const [balanceError, setBalanceError] = useState(false);
    const [tokenizedAssets, setTokenizedAssets] = useState<TokenizedAsset[]>([]);

    // Dialog open state — WithdrawDialog owns its own internal flow.
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [depositOpen, setDepositOpen] = useState(false);

    // Resume-from-URL: when navigated to with `?ramp=<localOrderId>` (e.g.,
    // from the notification bell), fetch the order, open the matching dialog
    // with the order prerigged. Lets the user recover an in-flight ramp after
    // accidentally closing the modal.
    const [searchParams, setSearchParams] = useSearchParams();
    const [resumeOrderId, setResumeOrderId] = useState<number | null>(null);
    const [resumeDirection, setResumeDirection] = useState<'onramp' | 'offramp' | null>(null);

    useEffect(() => {
        const param = searchParams.get('ramp');
        if (!param) return;
        const id = Number(param);
        if (!Number.isFinite(id) || id <= 0) {
            setSearchParams({}, { replace: true });
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await rampApi.getOrder(id);
                if (cancelled || !res.success || !res.data) {
                    setSearchParams({}, { replace: true });
                    return;
                }
                setResumeOrderId(id);
                setResumeDirection(res.data.orderType);
                if (res.data.orderType === 'onramp') setDepositOpen(true);
                else setWithdrawOpen(true);
                // Strip param so refresh doesn't auto-reopen forever.
                setSearchParams({}, { replace: true });
            } catch {
                setSearchParams({}, { replace: true });
            }
        })();
        return () => { cancelled = true; };
    }, [searchParams, setSearchParams]);

    // Clear resume state when either dialog closes so reopening manually
    // starts fresh at the source/destination picker.
    useEffect(() => {
        if (!depositOpen && resumeDirection === 'onramp') {
            setResumeOrderId(null);
            setResumeDirection(null);
        }
    }, [depositOpen, resumeDirection]);
    useEffect(() => {
        if (!withdrawOpen && resumeDirection === 'offramp') {
            setResumeOrderId(null);
            setResumeDirection(null);
        }
    }, [withdrawOpen, resumeDirection]);

    // Cache key for localStorage
    const getCacheKey = (userId: number | string) => `investor_wallet_cache_${userId}`;

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
    const setCachedBalance = (userId: number | string, balances: { xlm: string; usdc: string; tesouro?: string }) => {
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
                const storedUser = authStorage.getUser<any>('investor') || {};
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
                            tesouroMarket: data.tesouroMarket ?? null,
                            explorer: data.explorer,
                            depositMemo: data.depositMemo,
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
                        // Backend returns { success, data: { portfolio: [...] } }
                        const assets = Array.isArray(portfolioData)
                            ? portfolioData
                            : (portfolioData.data?.portfolio || portfolioData.portfolio || portfolioData.investments || []);

                        setTokenizedAssets(assets.map((inv: any) => ({
                            assetCode: inv.assetCode || inv.asset_code || 'N/A',
                            tokenName: inv.offerName || inv.offer_name || inv.assetCode || 'Token',
                            amount: Number(inv.totalDistributed || inv.total_distributed || inv.amount) || 0,
                            currentValue: Number(inv.totalDistributed || inv.total_distributed || 0) * Number(inv.unitPrice || inv.unit_price || 1),
                            issuerPublicKey: inv.issuerPublicKey || inv.issuer_public_key || null,
                        })));
                    } catch {
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

    // Refetch wallet status after a withdrawal completes (either path —
    // on-chain to Stellar or off-ramp to PIX). WithdrawDialog calls this
    // through the onCompleted prop.
    const refreshWalletStatus = useCallback(async () => {
        if (!user?.id) return;
        try {
            const statusResponse = await api.get(`/investors/${user.id}/wallet-status`);
            const statusData = statusResponse.data || statusResponse;
            setWalletStatus({
                hasWallet: statusData.hasWallet || !!statusData.contractId,
                walletAddress: statusData.contractId || statusData.walletAddress,
                passkeyRegistered: statusData.passkeyRegistered !== false,
                balances: statusData.balances,
                tesouroMarket: statusData.tesouroMarket ?? null,
                explorer: statusData.explorer,
                depositMemo: statusData.depositMemo,
            });
        } catch (err) {
            console.error('Failed to refresh wallet status:', err);
        }
    }, [user?.id]);

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


    /* ─── Loading pulse helper ─── */
    const BalancePulse = () => (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="animate-pulse">•</span>
            <span className="animate-pulse animation-delay-150">•</span>
            <span className="animate-pulse animation-delay-300">•</span>
        </span>
    );

    const renderBalance = (value: string | undefined, isLoading: boolean, hasBalances: boolean) => {
        if (isLoading && !hasBalances) return <BalancePulse />;
        if (value !== undefined) return value;
        return <BalancePulse />;
    };

    return (
        <div className="space-y-8 max-w-3xl mx-auto pb-12">
            {/* ═══ HEADER ═══ */}
            <div className="animate-fade-in space-y-1">
                <h2 className="text-3xl font-bold tracking-tight">Wallet</h2>
                <p className="text-muted-foreground">Your funds and investments</p>
            </div>

            {/* ═══ BALANCE STATS ═══ */}
            {walletStatus?.walletAddress && (
                <div className="animate-fade-in-up grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* USDC */}
                    <div className="rounded-xl bg-white/[0.03] border border-white/8 p-5">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                            <Coins className="h-3 w-3" /> USDC Balance
                            {balanceError && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 ml-1">
                                    cached
                                </span>
                            )}
                        </p>
                        <p className="text-2xl font-bold value-accent">
                            {renderBalance(
                                walletStatus.balances?.usdc !== undefined ? `$${Number(walletStatus.balances.usdc).toFixed(2)}` : undefined,
                                balanceLoading,
                                !!walletStatus.balances
                            )}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">Available for investment</p>
                    </div>

                    {/* TESOURO — BR yield-bearing treasury position */}
                    <div className="relative rounded-xl bg-gradient-to-br from-[hsl(43_45%_55%/0.10)] to-[hsl(43_45%_55%/0.02)] border border-[hsl(43_45%_55%/0.25)] p-5 overflow-hidden">
                        <div
                            className="absolute inset-0 pointer-events-none opacity-30"
                            style={{
                                background:
                                    'radial-gradient(120% 60% at 100% 0%, hsl(43 45% 55% / 0.12), transparent 60%)',
                            }}
                            aria-hidden
                        />
                        <div className="relative">
                            <p className="text-[11px] uppercase tracking-wider text-[hsl(43_45%_70%)] mb-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(43_45%_55%)]" /> TESOURO
                                {walletStatus.tesouroMarket?.yieldPctYear != null ? (
                                    <span
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(43_45%_55%/0.15)] border border-[hsl(43_45%_55%/0.3)] text-[hsl(43_45%_75%)] ml-auto uppercase tracking-wider"
                                        title={`Selic meta · BCB · ${new Date(walletStatus.tesouroMarket.asOf).toLocaleDateString('pt-BR')}`}
                                    >
                                        ~{walletStatus.tesouroMarket.yieldPctYear.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.
                                    </span>
                                ) : (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(43_45%_55%/0.15)] border border-[hsl(43_45%_55%/0.3)] text-[hsl(43_45%_75%)] ml-auto uppercase tracking-wider">
                                        Yield-bearing
                                    </span>
                                )}
                            </p>
                            <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
                                {renderBalance(
                                    walletStatus.balances?.tesouro !== undefined
                                        ? Number(walletStatus.balances.tesouro).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                                        : undefined,
                                    balanceLoading,
                                    !!walletStatus.balances
                                )}
                            </p>
                            <p className="text-[10px] text-white/45 mt-1">
                                Tesouro Direto tokenizado
                                {walletStatus.tesouroMarket?.priceBrl ? (
                                    <span className="text-white/35"> · cotação R$ {Number(walletStatus.tesouroMarket.priceBrl).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                                ) : null}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ QUICK ACTIONS ═══ */}
            {walletStatus?.walletAddress && (
                <div className="flex gap-3 animate-fade-in-up">
                    <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
                        <DialogTrigger asChild>
                            <Button className="flex-1 h-12 rounded-xl font-medium bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_45%)] text-white shadow-lg shadow-amber-900/10">
                                <ArrowDownLeft className="w-4 h-4 mr-2" />
                                Deposit
                            </Button>
                        </DialogTrigger>
                        <DepositDialog
                            investorId={user.id}
                            walletAddress={walletStatus.walletAddress || ''}
                            resumeOrderId={resumeDirection === 'onramp' ? resumeOrderId : null}
                        />
                    </Dialog>

                    <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                        <DialogTrigger asChild>
                            <Button
                                className="flex-1 h-12 bg-[hsl(217_91%_60%)] hover:bg-[hsl(217_91%_55%)] text-white rounded-xl shadow-lg shadow-[hsl(217_91%_60%/0.2)]"
                            >
                                <ArrowUpRight className="w-4 h-4 mr-2" />
                                Withdraw
                            </Button>
                        </DialogTrigger>
                        <WithdrawDialog
                            investorId={user?.id}
                            walletAddress={walletStatus.walletAddress || ''}
                            balances={walletStatus.balances}
                            onCompleted={refreshWalletStatus}
                            onClose={() => setWithdrawOpen(false)}
                            resumeOrderId={resumeDirection === 'offramp' ? resumeOrderId : null}
                        />
                    </Dialog>

                    <Button
                        variant="outline"
                        className="h-12 w-12 rounded-xl border-white/10 hover:bg-white/5 shrink-0"
                        title="View on Explorer"
                        onClick={() => {
                            const address = walletStatus.walletAddress;
                            const path = address?.startsWith('C') ? 'contract' : 'account';
                            window.open(
                                walletStatus.explorer || `${STELLAR_EXPLORER}/${path}/${address}`,
                                '_blank'
                            );
                        }}
                    >
                        <ExternalLink className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {/* ═══ ON-CHAIN ASSETS (streamlined) ═══ */}
            {walletStatus?.walletAddress && (
                <div className="space-y-3 animate-fade-in-up">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Holdings</h3>
                        <button
                            onClick={() => navigate('/portfolio')}
                            className="text-xs text-[hsl(43_45%_55%)] hover:text-[hsl(43_45%_65%)] flex items-center gap-1 transition-colors"
                        >
                            View portfolio <ArrowRight className="h-3 w-3" />
                        </button>
                    </div>
                    {tokenizedAssets.length > 0 ? (
                        <div className="rounded-xl border border-white/8 bg-white/[0.03] divide-y divide-white/5">
                            {tokenizedAssets.map((asset, index) => (
                                <div
                                    key={`${asset.assetCode}-${index}`}
                                    className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(43_45%_55%)] to-[hsl(43_45%_35%)] flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                                            {asset.assetCode.slice(0, 2)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium leading-tight">{asset.tokenName}</p>
                                            <p className="text-[11px] text-muted-foreground font-mono">
                                                {asset.amount.toLocaleString()} {asset.assetCode}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <p className="text-sm font-semibold">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(asset.currentValue)}
                                        </p>
                                        {asset.issuerPublicKey && (
                                            <a
                                                href={`${STELLAR_EXPLORER}/asset/${asset.assetCode}-${asset.issuerPublicKey}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
                                                title="View on Stellar Expert"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-white/8 bg-white/[0.03] py-8 text-center">
                            <Coins className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">No assets yet</p>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
