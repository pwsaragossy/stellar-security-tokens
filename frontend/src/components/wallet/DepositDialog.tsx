import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Copy, Check, Loader2, AlertCircle, RefreshCw, ArrowLeft,
    Building2, Wallet, AlertTriangle, ArrowRight, Sparkles,
} from 'lucide-react';
import { QRCode } from '@/components/ui/qrcode';
import { investorsApi } from '@/api/investors';
import {
    rampApi,
    type RampOrder,
    type RampQuote,
    type RampBankAccount,
} from '@/api/ramp';
import { useRampReadiness } from '@/hooks/useRampReadiness';

interface DepositDialogProps {
    investorId?: number;
    walletAddress: string;
    network?: 'testnet' | 'mainnet';
}

interface DepositInfo {
    memo: string;
    treasuryAddress: string;
    status: string;
}

type DepositSource = 'exchange' | 'wallet' | 'pix' | null;

export function DepositDialog({ investorId, walletAddress }: DepositDialogProps) {
    const [copied, setCopied] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [deposit, setDeposit] = useState<DepositInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<DepositSource>(null);

    const handleCopy = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const fetchDepositInfo = useCallback(async () => {
        if (!investorId) return;
        setLoading(true);
        setError(null);
        try {
            const response = await investorsApi.initiateDeposit(investorId);
            setDeposit(response.data);
        } catch (err: any) {
            setError(err.message || 'Failed to load deposit info');
        } finally {
            setLoading(false);
        }
    }, [investorId]);

    useEffect(() => {
        if (investorId && (source === 'exchange' || source === null)) {
            fetchDepositInfo();
        }
    }, [investorId, source, fetchDepositInfo]);

    const stellarUri = walletAddress
        ? `web+stellar:pay?destination=${walletAddress}`
        : walletAddress;

    const title = source === 'pix' ? 'Deposit BRL' : 'Deposit USDC';

    return (
        <DialogContent className="sm:max-w-md bg-slate-900 border-white/10 text-white overflow-hidden">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    {source && (
                        <button
                            onClick={() => setSource(null)}
                            className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    {title}
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                    {source === null && 'Where is your money right now?'}
                    {source === 'exchange' && 'Copy the address and memo below into your exchange withdrawal.'}
                    {source === 'wallet' && 'Scan or copy the address below to send USDC.'}
                    {source === 'pix' && 'Pay with PIX, receive yield-bearing TESOURO on Stellar.'}
                </DialogDescription>
            </DialogHeader>

            {/* Loading (only for exchange flow that needs deposit info) */}
            {source === 'exchange' && loading && !deposit ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                    <p className="text-sm text-gray-400">Loading…</p>
                </div>

                /* Error (exchange only — PIX flow has its own error handling) */
            ) : source === 'exchange' && error ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                        <AlertCircle className="w-4 h-4" />
                        <span>Something went wrong</span>
                    </div>
                    <p className="text-xs text-red-300/80">{error}</p>
                    <Button variant="outline" size="sm" onClick={fetchDepositInfo} className="w-full border-red-500/20 hover:bg-red-500/10 text-red-400">
                        <RefreshCw className="w-3 h-3 mr-2" /> Retry
                    </Button>
                </div>

                /* Step 1: Source Picker */
            ) : source === null ? (
                <div className="grid grid-cols-2 gap-3 py-2">
                    <SourceCard
                        onClick={() => setSource('exchange')}
                        icon={<Building2 className="w-6 h-6 text-amber-400" />}
                        iconBg="bg-amber-500/10 group-hover:bg-amber-500/20"
                        title="Exchange"
                        subtitle="Binance, Coinbase…"
                    />
                    <SourceCard
                        onClick={() => setSource('wallet')}
                        icon={<Wallet className="w-6 h-6 text-blue-400" />}
                        iconBg="bg-blue-500/10 group-hover:bg-blue-500/20"
                        title="Wallet"
                        subtitle="Lobstr, Freighter…"
                    />
                    <SourceCard
                        onClick={() => setSource('pix')}
                        icon={<span className="text-xl leading-none">🇧🇷</span>}
                        iconBg="bg-[hsl(43_45%_55%/0.12)] group-hover:bg-[hsl(43_45%_55%/0.22)]"
                        title="PIX (BRL)"
                        subtitle="Deposit BRL, receive yield-bearing TESOURO"
                        colSpan={2}
                    />
                </div>

                /* Step 2: Exchange — Treasury + Memo */
            ) : source === 'exchange' && deposit ? (
                <div className="flex flex-col items-center space-y-5 py-2">
                    <div className="bg-white rounded-xl p-3">
                        <QRCode value={deposit.treasuryAddress} size={160} />
                    </div>

                    <div className="w-full space-y-1.5">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/8">
                            <p className="text-xs font-mono text-gray-300 break-all flex-1 leading-relaxed">
                                {deposit.treasuryAddress}
                            </p>
                            <button
                                onClick={() => handleCopy(deposit.treasuryAddress, 'addr')}
                                className="p-1.5 rounded-md hover:bg-white/10 transition-colors shrink-0"
                            >
                                {copied === 'addr'
                                    ? <Check className="w-4 h-4 text-emerald-400" />
                                    : <Copy className="w-4 h-4 text-gray-400" />
                                }
                            </button>
                        </div>
                    </div>

                    <div className="w-full">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border-2 border-red-500/25">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Memo</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">Required</span>
                                </div>
                                <p className="text-xl font-bold font-mono text-red-400 tracking-wider">
                                    {deposit.memo}
                                </p>
                            </div>
                            <button
                                onClick={() => handleCopy(deposit.memo, 'memo')}
                                className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors shrink-0"
                            >
                                {copied === 'memo'
                                    ? <Check className="w-4 h-4 text-emerald-400" />
                                    : <Copy className="w-4 h-4 text-red-400" />
                                }
                            </button>
                        </div>
                    </div>

                    <div className="flex items-start gap-2 text-[11px] text-gray-500 w-full">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
                        <span>Only send <strong className="text-gray-400">Stellar USDC</strong>. Always include the memo.</span>
                    </div>
                </div>

                /* Step 2: Wallet — Smart Wallet Contract */
            ) : source === 'wallet' ? (
                <div className="flex flex-col items-center space-y-5 py-2">
                    <div className="bg-white rounded-xl p-3">
                        <QRCode value={stellarUri} size={160} />
                    </div>

                    <div className="w-full space-y-1.5">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/8">
                            <p className="text-xs font-mono text-gray-300 break-all flex-1 leading-relaxed">
                                {walletAddress}
                            </p>
                            <button
                                onClick={() => handleCopy(walletAddress, 'wallet')}
                                className="p-1.5 rounded-md hover:bg-white/10 transition-colors shrink-0"
                            >
                                {copied === 'wallet'
                                    ? <Check className="w-4 h-4 text-emerald-400" />
                                    : <Copy className="w-4 h-4 text-gray-400" />
                                }
                            </button>
                        </div>
                        <p className="text-[11px] text-emerald-400/70 px-1">No memo needed.</p>
                    </div>

                    <div className="flex items-start gap-2 text-[11px] text-gray-500 w-full">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
                        <span>Only send <strong className="text-gray-400">Stellar USDC</strong> to this address.</span>
                    </div>
                </div>

                /* Step 2: PIX — real on-ramp via EtherFuse */
            ) : source === 'pix' ? (
                <PixPanel onCopy={handleCopy} copied={copied} />
            ) : null}
        </DialogContent>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Source picker card — extracted to keep the source switch readable
// ─────────────────────────────────────────────────────────────────────────────

function SourceCard({
    onClick,
    icon,
    iconBg,
    title,
    subtitle,
    colSpan,
}: {
    onClick: () => void;
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    subtitle: string;
    colSpan?: 2;
}) {
    return (
        <button
            onClick={onClick}
            className={
                'flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all group ' +
                (colSpan === 2 ? 'col-span-2' : '')
            }
        >
            <div className={'w-12 h-12 rounded-xl flex items-center justify-center transition-colors ' + iconBg}>
                {icon}
            </div>
            <div className="text-center">
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>
            </div>
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIX panel — the real BRL → TESOURO flow
//
// State machine, internal to this component:
//   [readinessLoading]  → spinner
//   [!isReady]          → CTA to /ramp-kyc
//   [ready, no quote]   → BRL amount + "Preview rate" button
//   [quote loaded]      → quote summary + bank-account picker + "Confirm" button
//   [order created]     → PIX BR code, countdown, status pill (polls every 4s)
//
// Polling is gated on a non-terminal status; clears on unmount.
// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['completed', 'finalized', 'failed', 'refunded', 'canceled', 'expired']);
const POLL_INTERVAL_MS = 4_000;

function PixPanel({
    onCopy,
    copied,
}: {
    onCopy: (text: string, id: string) => Promise<void>;
    copied: string | null;
}) {
    const navigate = useNavigate();
    const { readiness, isReady, loading: readinessLoading } = useRampReadiness();

    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<RampQuote | null>(null);
    const [order, setOrder] = useState<RampOrder | null>(null);
    const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
    const [stage, setStage] = useState<'input' | 'reviewing' | 'submitted'>('input');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

    // Pre-select the default active bank account.
    useEffect(() => {
        if (!readiness?.bankAccounts) return;
        if (selectedBankId != null) return;
        const def = readiness.bankAccounts.find((b) => b.isDefault && b.status === 'active')
            ?? readiness.bankAccounts.find((b) => b.status === 'active');
        if (def) setSelectedBankId(def.id);
    }, [readiness, selectedBankId]);

    // Status polling once an order exists.
    useEffect(() => {
        if (!order || TERMINAL_STATUSES.has(order.status)) {
            if (pollHandle.current) clearInterval(pollHandle.current);
            return;
        }
        pollHandle.current = setInterval(async () => {
            try {
                const res = await rampApi.getOrder(order.id);
                if (res.success && res.data) setOrder(res.data);
            } catch {
                /* silent — next tick retries */
            }
        }, POLL_INTERVAL_MS);
        return () => {
            if (pollHandle.current) clearInterval(pollHandle.current);
        };
    }, [order]);

    async function handlePreview() {
        setError(null);
        if (!amount || Number(amount) <= 0) {
            setError('Enter an amount in BRL');
            return;
        }
        setBusy(true);
        try {
            const res = await rampApi.createQuote(amount);
            if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to get quote');
            setQuote(res.data.quote);
            setStage('reviewing');
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err?.message ?? 'Failed to get quote');
        } finally {
            setBusy(false);
        }
    }

    async function handleConfirm() {
        if (!quote || selectedBankId == null) return;
        setError(null);
        setBusy(true);
        try {
            const res = await rampApi.createOrder({ quoteId: quote.id, bankAccountId: selectedBankId });
            if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to create order');
            setOrder(res.data.order);
            setStage('submitted');
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err?.message ?? 'Failed to create order');
        } finally {
            setBusy(false);
        }
    }

    // ─── Readiness loading ─────────────────────────────────────────────────
    if (readinessLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <Loader2 className="w-6 h-6 animate-spin text-[hsl(43_45%_55%)]" />
                <p className="text-xs text-gray-400">Checking onboarding status…</p>
            </div>
        );
    }

    // ─── Blocked: needs KYC / bank account ─────────────────────────────────
    if (!isReady) {
        const reason = readiness?.blockedReason;
        const heading =
            reason === 'no_active_bank_account' ? 'Add a PIX key to continue' :
            reason === 'kyc_rejected' ? 'KYC was rejected — please update' :
            reason === 'kyc_pending' ? 'Your KYC is in review' :
            'Complete a quick onboarding';
        const cta =
            reason === 'no_active_bank_account' ? 'Add PIX key' :
            reason === 'kyc_pending' ? 'Check status' :
            'Start onboarding';
        return (
            <div className="py-5 space-y-5">
                <div className="relative px-5 py-6 rounded-xl border border-[hsl(43_45%_55%/0.3)] bg-[hsl(43_45%_55%/0.06)] overflow-hidden">
                    <div className="relative">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[hsl(43_45%_70%)]">
                            <Sparkles className="w-3 h-3" /> One-time setup
                        </div>
                        <p className="mt-3 text-[15px] text-white leading-snug max-w-[36ch]" style={{ fontFamily: 'var(--font-heading)' }}>
                            {heading}
                        </p>
                        <p className="mt-1.5 text-[12px] text-white/55 max-w-[42ch]">
                            Radox needs a few details to enable PIX deposits. Takes about a minute.
                        </p>
                    </div>
                </div>

                <Button
                    onClick={() => navigate(reason === 'no_active_bank_account' ? '/bank-accounts' : '/ramp-kyc')}
                    className="w-full h-11 rounded-xl bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_62%)] text-[hsl(220_60%_8%)] font-semibold"
                >
                    {cta} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>
        );
    }

    // ─── Ready: amount input + quote preview ───────────────────────────────
    if (stage === 'input') {
        return (
            <div className="py-2 space-y-5">
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between px-1">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                            Amount in BRL
                        </label>
                        <span className="text-[10px] text-amber-400/80 uppercase tracking-wider">
                            Sandbox cap · R$ 500
                        </span>
                    </div>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">R$</span>
                        <Input
                            type="number"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="pl-10 bg-white/5 border-white/10 rounded-xl h-12 text-lg font-mono"
                            min="1"
                            max="500"
                            step="0.01"
                            autoFocus
                        />
                    </div>
                    <p className="text-[11px] text-white/45 px-1">
                        TESOURO is a yield-bearing Brazilian treasury token.{' '}
                        <span className="text-white/30">Rate quoted live by EtherFuse.</span>
                    </p>
                </div>

                {error && <InlineError message={error} />}

                <Button
                    onClick={handlePreview}
                    disabled={busy || !amount || Number(amount) <= 0}
                    className="w-full h-11 rounded-xl bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_62%)] text-[hsl(220_60%_8%)] font-semibold disabled:opacity-50"
                >
                    {busy ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Quoting…</>
                    ) : (
                        <>Preview rate <ArrowRight className="w-4 h-4 ml-2" /></>
                    )}
                </Button>

                <BankAccountList
                    accounts={readiness?.bankAccounts ?? []}
                    selectedId={selectedBankId}
                    onSelect={setSelectedBankId}
                />
            </div>
        );
    }

    // ─── Quote review ──────────────────────────────────────────────────────
    if (stage === 'reviewing' && quote) {
        return (
            <div className="py-2 space-y-5">
                <QuoteCard quote={quote} />
                {error && <InlineError message={error} />}
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => { setStage('input'); setQuote(null); }}
                        className="h-11 px-4 text-white/70 hover:text-white hover:bg-white/[0.06]"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={busy || selectedBankId == null}
                        className="flex-1 h-11 rounded-xl bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_62%)] text-[hsl(220_60%_8%)] font-semibold disabled:opacity-50"
                    >
                        {busy ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating order…</>
                        ) : (
                            <>Generate PIX <ArrowRight className="w-4 h-4 ml-2" /></>
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    // ─── Order created — show PIX BR code + status ─────────────────────────
    if (stage === 'submitted' && order) {
        return <OrderInProgress order={order} onCopy={onCopy} copied={copied} />;
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIX subviews
// ─────────────────────────────────────────────────────────────────────────────

/** Accepts the trimmed shape from /readiness or the full RampBankAccount. */
type BankAccountChoice = {
    id: number;
    abbrPixKey?: string | null;
    label?: string | null;
    status: RampBankAccount['status'];
    isDefault: boolean;
};

function BankAccountList({
    accounts,
    selectedId,
    onSelect,
}: {
    accounts: BankAccountChoice[];
    selectedId: number | null;
    onSelect: (id: number) => void;
}) {
    const navigate = useNavigate();
    if (accounts.length === 0) return null;
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">From</span>
                <button
                    onClick={() => navigate('/bank-accounts')}
                    className="text-[11px] text-[hsl(43_45%_70%)] hover:text-[hsl(43_45%_85%)]"
                >
                    Manage
                </button>
            </div>
            <div className="space-y-1.5">
                {accounts.map((b) => {
                    const selected = selectedId === b.id;
                    return (
                        <button
                            key={b.id}
                            onClick={() => onSelect(b.id)}
                            disabled={b.status !== 'active'}
                            className={
                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ' +
                                (selected
                                    ? 'border-[hsl(43_45%_55%/0.5)] bg-[hsl(43_45%_55%/0.08)]'
                                    : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]') +
                                (b.status !== 'active' ? ' opacity-50 cursor-not-allowed' : '')
                            }
                        >
                            <div className={
                                'w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ' +
                                (selected ? 'border-[hsl(43_45%_55%)] bg-[hsl(43_45%_55%)]' : 'border-white/30')
                            } />
                            <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-mono text-white/85 truncate">
                                    {b.abbrPixKey ?? '(no preview)'}
                                </div>
                                {b.label && <div className="text-[10px] text-white/40 mt-0.5">{b.label}</div>}
                            </div>
                            {b.status !== 'active' && (
                                <span className="text-[9px] uppercase tracking-wider text-amber-400/80">
                                    {b.status.replace(/_/g, ' ')}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function QuoteCard({ quote }: { quote: RampQuote }) {
    const dest = quote.destinationAmount ? Number(quote.destinationAmount) : null;
    const fee = quote.feeBps != null ? (quote.feeBps / 100).toFixed(2) : null;
    const expiresIn = useCountdown(quote.expiresAt);
    return (
        <div className="px-5 py-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-4">
            <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">You pay</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">You receive</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
                <div className="text-[1.6rem] font-mono text-white tabular-nums" style={{ letterSpacing: '-0.01em' }}>
                    R$ {Number(quote.sourceAmount).toFixed(2)}
                </div>
                <ArrowRight className="w-4 h-4 text-white/30 shrink-0" />
                <div className="text-right">
                    <div className="text-[1.6rem] font-mono text-[hsl(43_45%_70%)] tabular-nums" style={{ letterSpacing: '-0.01em' }}>
                        {dest != null ? dest.toFixed(6) : '—'}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-white/45 mt-0.5">TESOURO</div>
                </div>
            </div>
            <div className="pt-3 border-t border-white/8 flex items-center justify-between text-[11px] text-white/50">
                <span>{fee ? `Fee ${fee}%` : 'Fee included'}</span>
                <span>Quote expires in {expiresIn}</span>
            </div>
        </div>
    );
}

function OrderInProgress({
    order,
    onCopy,
    copied,
}: {
    order: RampOrder;
    onCopy: (text: string, id: string) => Promise<void>;
    copied: string | null;
}) {
    const brcode = useMemo(() => {
        const p = order.pixInstructions ?? {};
        // EtherFuse canonical BR fields (per Elliot's starter pack client):
        // depositPixCode is the BR-Code copy-paste string the user pays from
        // their bank app; depositPixKey is the underlying key. Fall back
        // through legacy names defensively.
        return p.depositPixCode || p.depositPixKey || p.brcode || p.qrCode || p.depositClabe || '';
    }, [order]);
    const beneficiary = order.pixInstructions?.beneficiary || order.pixInstructions?.depositAccountHolder || 'EtherFuse';
    const pixExpiresIn = useCountdown(order.pixExpiresAt);

    const isSandbox = import.meta.env.MODE !== 'production';
    const [simulating, setSimulating] = useState(false);
    const [simError, setSimError] = useState<string | null>(null);

    async function handleSimulate() {
        setSimError(null);
        setSimulating(true);
        try {
            const res = await rampApi.simulateFiatReceived(order.id);
            if (!res.success) throw new Error(res.error ?? 'Simulator rejected the call');
        } catch (err: any) {
            setSimError(err?.response?.data?.error ?? err?.message ?? 'Simulator failed');
        } finally {
            setSimulating(false);
        }
    }

    const explorerUrl = order.confirmedTxSignature
        ? `https://stellar.expert/explorer/testnet/tx/${order.confirmedTxSignature}`
        : null;
    const isComplete = order.status === 'completed' || order.status === 'finalized';

    return (
        <div className="py-2 space-y-5">
            <StatusPill status={order.status} />

            {brcode && !isComplete ? (
                <div className="flex flex-col items-center gap-3">
                    <div className="bg-white rounded-xl p-3">
                        <QRCode value={brcode} size={180} />
                    </div>
                    <div className="w-full flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/8">
                        <p className="text-[10px] font-mono text-white/70 break-all flex-1 leading-relaxed">
                            {brcode}
                        </p>
                        <button
                            onClick={() => onCopy(brcode, 'brcode')}
                            className="p-1.5 rounded-md hover:bg-white/10 transition-colors shrink-0"
                        >
                            {copied === 'brcode'
                                ? <Check className="w-4 h-4 text-emerald-400" />
                                : <Copy className="w-4 h-4 text-gray-400" />
                            }
                        </button>
                    </div>
                    {order.pixExpiresAt && (
                        <p className="text-[11px] text-white/45">
                            PIX expires in <span className="text-white/70 font-mono">{pixExpiresIn}</span>
                        </p>
                    )}
                </div>
            ) : isComplete ? (
                <div className="px-5 py-6 rounded-xl bg-gradient-to-br from-[hsl(160_60%_40%/0.10)] to-[hsl(160_60%_40%/0.02)] border border-[hsl(160_60%_40%/0.3)] text-center">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[hsl(160_60%_55%)]">Delivered</p>
                    <p
                        className="mt-2 text-3xl font-bold text-white"
                        style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}
                    >
                        {order.amountInTokens
                            ? Number(order.amountInTokens).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                            : '—'}{' '}
                        <span className="text-[hsl(43_45%_70%)] text-xl">TESOURO</span>
                    </p>
                    {order.amountInFiat && (
                        <p className="text-[12px] text-white/50 mt-1">
                            from R$ {Number(order.amountInFiat).toFixed(2)}
                        </p>
                    )}
                </div>
            ) : (
                <div className="px-4 py-6 rounded-xl border border-dashed border-white/10 text-center text-[12px] text-white/50">
                    Waiting for PIX instructions…
                </div>
            )}

            {!isComplete && (
                <div className="text-[11px] text-white/45 space-y-1.5 px-1">
                    <p>
                        Pay the PIX to <span className="text-white/70 font-mono">{beneficiary}</span> from your bank app.
                        TESOURO lands in your wallet seconds after the PIX clears.
                    </p>
                </div>
            )}

            {/* Sandbox-only: skip the bank app and short-circuit the deposit */}
            {isSandbox && order.status === 'created' && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 space-y-3">
                    <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-amber-300">Sandbox · skip the bank app</p>
                        <span className="text-[10px] text-amber-200/60">testnet only</span>
                    </div>
                    <Button
                        onClick={handleSimulate}
                        disabled={simulating}
                        className="w-full h-9 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/30 text-[12px] font-medium disabled:opacity-50"
                    >
                        {simulating ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Simulating…</>
                        ) : (
                            <>Simulate PIX paid</>
                        )}
                    </Button>
                    {simError && (
                        <p className="text-[11px] text-red-300/90">{simError}</p>
                    )}
                </div>
            )}

            {explorerUrl && (
                <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center text-[11px] text-[hsl(43_45%_70%)] hover:text-[hsl(43_45%_85%)] underline-offset-4 hover:underline transition-colors"
                >
                    View on-chain delivery →
                </a>
            )}

            {order.failureReason && (
                <InlineError message={order.failureReason} />
            )}
        </div>
    );
}

function StatusPill({ status }: { status: RampOrder['status'] }) {
    const tone =
        status === 'completed' || status === 'finalized'
            ? 'text-[hsl(160_60%_55%)] bg-[hsl(160_60%_40%/0.12)] border-[hsl(160_60%_40%/0.3)]'
            : status === 'funded'
            ? 'text-[hsl(43_45%_70%)] bg-[hsl(43_45%_55%/0.12)] border-[hsl(43_45%_55%/0.3)]'
            : status === 'failed' || status === 'refunded' || status === 'canceled' || status === 'expired'
            ? 'text-red-400 bg-red-500/10 border-red-500/30'
            : 'text-white/60 bg-white/[0.04] border-white/10';
    const copy: Record<RampOrder['status'], string> = {
        created: 'Waiting for PIX',
        funded: 'PIX received — settling',
        completed: 'TESOURO delivered',
        finalized: 'Final',
        failed: 'Failed',
        refunded: 'Refunded',
        canceled: 'Canceled',
        expired: 'Expired',
    };
    return (
        <div className="flex items-center justify-center">
            <span className={'inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] px-3 py-1.5 rounded-full border ' + tone}>
                {(status === 'created' || status === 'funded') && (
                    <span className="relative flex w-2 h-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-50 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
                    </span>
                )}
                {copy[status]}
            </span>
        </div>
    );
}

function InlineError({ message }: { message: string }) {
    return (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-red-300 text-[12px] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{message}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Countdown — renders mm:ss until target, "expired" after.
// ─────────────────────────────────────────────────────────────────────────────

function useCountdown(target: string | null | undefined): string {
    const [, force] = useState(0);
    useEffect(() => {
        if (!target) return;
        const t = setInterval(() => force((n) => n + 1), 1000);
        return () => clearInterval(t);
    }, [target]);
    if (!target) return '—';
    const remainingMs = new Date(target).getTime() - Date.now();
    if (remainingMs <= 0) return 'expired';
    const totalSec = Math.floor(remainingMs / 1000);
    const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const ss = (totalSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
}
