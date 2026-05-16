/**
 * WithdrawDialog — mirror of DepositDialog, but money going out.
 *
 * Two destinations:
 *   - Stellar wallet — send USDC to an external G/C-address (existing on-chain
 *     withdrawal via /investors/:id/withdraw/propose + /submit). Unchanged
 *     behavior; just extracted from Wallet.tsx so the dialog can host both
 *     paths cleanly.
 *   - PIX (BRL) — off-ramp via EtherFuse Anchor Mode. The investor's TESOURO
 *     or USDC is moved to EtherFuse's anchor G-address with a Memo.hash; the
 *     anchor monitor credits the order and EtherFuse pays out PIX to the
 *     investor's registered bank account.
 *
 * The PIX option is gated on `readiness.offrampEnabled` — the backend flag
 * `ENABLE_OFFRAMP` controls whether the routes are mounted. When disabled,
 * the destination picker shows the Stellar option full-width.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Loader2, Check, Shield, AlertCircle, ArrowLeft, ArrowRight,
    Wallet, Send, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { passkeyClient } from '@/lib/passkey';
import {
    rampApi,
    type RampOrder,
    type RampQuote,
    type RampBankAccount,
} from '@/api/ramp';
import { useRampReadiness } from '@/hooks/useRampReadiness';

type WithdrawDestination = 'stellar' | 'pix' | null;
type OfframpAsset = 'TESOURO' | 'USDC';

interface WalletBalances {
    xlm?: string;
    usdc?: string;
    tesouro?: string;
}

interface WithdrawDialogProps {
    investorId?: number;
    walletAddress: string;
    balances?: WalletBalances;
    /**
     * Called after a successful withdrawal (either path) so the parent can
     * re-fetch balances. Optional — parent may poll independently.
     */
    onCompleted?: () => void;
    /** Called when the dialog wants to close (e.g. final success state). */
    onClose?: () => void;
    /**
     * When set (typically from `?ramp=<id>` URL handoff), the dialog skips
     * the destination picker and the off-ramp input, opens directly on the
     * tracking screen with the order rehydrated. Lets the user recover an
     * in-flight off-ramp after accidentally closing the modal.
     */
    resumeOrderId?: number | null;
}

const TERMINAL_OFFRAMP_STATUSES = new Set([
    'completed', 'finalized', 'failed', 'refunded', 'canceled', 'expired',
]);
const OFFRAMP_POLL_INTERVAL_MS = 4_000;

export function WithdrawDialog({
    investorId,
    walletAddress,
    balances,
    onCompleted,
    onClose,
    resumeOrderId,
}: WithdrawDialogProps) {
    const { readiness, loading: readinessLoading } = useRampReadiness();
    // Resume always goes through PIX (the only off-ramp path); skip the picker.
    const [destination, setDestination] = useState<WithdrawDestination>(resumeOrderId ? 'pix' : null);

    const offrampEnabled = !!readiness?.offrampEnabled;

    const title =
        destination === 'pix' ? 'Cash out to PIX' :
        destination === 'stellar' ? 'Withdraw USDC' :
        'Withdraw';

    const description =
        destination === null
            ? offrampEnabled
                ? 'Where should the funds go?'
                : 'Send assets to another Stellar address.'
            : destination === 'pix'
                ? 'Convert TESOURO or USDC to BRL — paid to your registered PIX key.'
                : 'Send assets from your wallet to another Stellar address.';

    return (
        <DialogContent className="sm:max-w-md bg-slate-900 border-white/10 text-white overflow-hidden">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    {destination && (
                        <button
                            onClick={() => setDestination(null)}
                            className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors"
                            aria-label="Back"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    {title}
                </DialogTitle>
                <DialogDescription className="text-gray-400">{description}</DialogDescription>
            </DialogHeader>

            {/* Step 1 — destination picker (skipped when only Stellar is available) */}
            {destination === null && (
                readinessLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-3">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                        <p className="text-xs text-gray-400">Loading…</p>
                    </div>
                ) : (
                    <div className={offrampEnabled ? 'grid grid-cols-1 gap-3 py-2' : 'py-2'}>
                        <DestinationCard
                            onClick={() => setDestination('stellar')}
                            icon={<Wallet className="w-6 h-6 text-blue-400" />}
                            iconBg="bg-blue-500/10 group-hover:bg-blue-500/20"
                            title="Stellar wallet"
                            subtitle="Send USDC to an external Stellar address"
                        />
                        {offrampEnabled && (
                            <DestinationCard
                                onClick={() => setDestination('pix')}
                                icon={<span className="text-xl leading-none">🇧🇷</span>}
                                iconBg="bg-[hsl(43_45%_55%/0.12)] group-hover:bg-[hsl(43_45%_55%/0.22)]"
                                title="PIX (BRL)"
                                subtitle="Convert TESOURO or USDC to BRL — paid to your PIX key"
                            />
                        )}
                    </div>
                )
            )}

            {destination === 'stellar' && (
                <StellarWithdrawPanel
                    investorId={investorId}
                    onCompleted={() => {
                        onCompleted?.();
                    }}
                    onClose={() => {
                        setDestination(null);
                        onClose?.();
                    }}
                />
            )}

            {destination === 'pix' && (
                <PixOfframpPanel
                    investorId={investorId}
                    walletAddress={walletAddress}
                    balances={balances}
                    onCompleted={onCompleted}
                    resumeOrderId={resumeOrderId}
                />
            )}
        </DialogContent>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Destination picker card
// ─────────────────────────────────────────────────────────────────────────────

function DestinationCard({
    onClick,
    icon,
    iconBg,
    title,
    subtitle,
}: {
    onClick: () => void;
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    subtitle: string;
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-4 p-5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all group text-left"
        >
            <div className={'w-12 h-12 rounded-xl flex items-center justify-center transition-colors shrink-0 ' + iconBg}>
                {icon}
            </div>
            <div className="flex-1">
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-white/30 shrink-0" />
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stellar wallet withdrawal — existing on-chain flow, extracted verbatim
// from Wallet.tsx so the dialog can host both paths.
// ─────────────────────────────────────────────────────────────────────────────

type StellarStep = 'form' | 'review' | 'processing' | 'success';

function StellarWithdrawPanel({
    investorId,
    onCompleted,
    onClose,
}: {
    investorId?: number;
    onCompleted: () => void;
    onClose: () => void;
}) {
    const [step, setStep] = useState<StellarStep>('form');
    const [data, setData] = useState({ amount: '', destination: '', asset: 'USDC' });
    const [tx, setTx] = useState<{ xdr: string; networkPassphrase: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handlePropose() {
        if (!investorId || !data.amount || !data.destination) return;
        setStep('processing');
        setError(null);
        try {
            const response = await api.post(`/investors/${investorId}/withdraw/propose`, {
                amount: data.amount,
                destination: data.destination,
                assetCode: data.asset,
            });
            setTx(response.data);
            setStep('review');
        } catch (err: any) {
            setError(err.message || 'Failed to propose withdrawal');
            setStep('form');
        }
    }

    async function handleSubmit() {
        if (!tx) return;
        setStep('processing');
        setError(null);
        try {
            const signedXdr = await passkeyClient.signTransaction(tx.xdr);
            await api.post('/investors/withdraw/submit', { signedXdr });
            setStep('success');
            onCompleted();
        } catch (err: any) {
            console.error('Withdrawal failed:', err);
            setError(err.message || 'Failed to process withdrawal');
            setStep('review');
        }
    }

    return (
        <>
            {step === 'form' && (
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Asset</Label>
                        <div className="flex gap-2">
                            <Button variant="default" className="bg-[hsl(217_91%_60%)]">USDC</Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="stellar-amount">Amount</Label>
                        <Input
                            id="stellar-amount"
                            type="number"
                            placeholder="0.00"
                            value={data.amount}
                            onChange={(e) => setData({ ...data, amount: e.target.value })}
                            className="bg-white/5 border-white/10 rounded-xl"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="stellar-destination">Destination Address</Label>
                        <Input
                            id="stellar-destination"
                            placeholder="G..."
                            value={data.destination}
                            onChange={(e) => setData({ ...data, destination: e.target.value })}
                            className="bg-white/5 border-white/10 rounded-xl"
                        />
                        <p className="text-xs text-muted-foreground">
                            Ensure the address accepts {data.asset}.
                        </p>
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                </div>
            )}

            {step === 'review' && (
                <div className="space-y-4 py-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Asset</span>
                            <span className="font-medium">{data.asset}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Amount</span>
                            <span className="font-medium text-lg">{data.amount}</span>
                        </div>
                        <div className="pt-3 border-t border-white/10">
                            <span className="text-sm text-muted-foreground block mb-1">Destination</span>
                            <span className="text-xs font-mono break-all text-gray-300">{data.destination}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-[hsl(217_91%_60%/0.1)] text-[hsl(217_91%_60%)] rounded-xl text-sm">
                        <Shield className="w-4 h-4" />
                        You will be asked to sign with your Passkey.
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                </div>
            )}

            {step === 'processing' && (
                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(217_91%_60%)]" />
                    <p className="text-center text-muted-foreground">Processing withdrawal...</p>
                </div>
            )}

            {step === 'success' && (
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
                {step === 'form' && (
                    <>
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={handlePropose}
                            disabled={!data.amount || !data.destination}
                            className="bg-[hsl(217_91%_60%)] hover:bg-[hsl(217_91%_55%)]"
                        >
                            Review
                        </Button>
                    </>
                )}
                {step === 'review' && (
                    <>
                        <Button variant="ghost" onClick={() => setStep('form')}>Back</Button>
                        <Button
                            onClick={handleSubmit}
                            className="bg-[hsl(217_91%_60%)] hover:bg-[hsl(217_91%_55%)]"
                        >
                            Confirm &amp; Sign
                        </Button>
                    </>
                )}
                {step === 'success' && (
                    <Button onClick={onClose} className="w-full">Close</Button>
                )}
            </DialogFooter>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIX off-ramp — TESOURO|USDC → BRL via EtherFuse Anchor Mode
//
// State machine:
//   [readinessLoading] → spinner
//   [!isReady]         → CTA to /ramp-kyc (or /bank-accounts when that's the gate)
//   [stage=input]      → asset picker + amount + balance + quote preview button
//   [stage=reviewing]  → quote summary + bank-account picker + confirm button
//   [stage=signing]    → "Sign with passkey" → builds + signs + submits
//   [stage=tracking]   → status timeline, polls every 4s
//
// Open Risk #1 lives here: the SAC transfer to the anchor must be detected
// by EtherFuse's monitor. Phase 0 sandbox probe is required before
// ENABLE_OFFRAMP flips to true in any environment.
// ─────────────────────────────────────────────────────────────────────────────

type OfframpStage = 'input' | 'reviewing' | 'signing' | 'tracking';

function PixOfframpPanel({
    investorId,
    walletAddress: _walletAddress,
    balances,
    onCompleted,
    resumeOrderId,
}: {
    investorId?: number;
    walletAddress: string;
    balances?: WalletBalances;
    onCompleted?: () => void;
    resumeOrderId?: number | null;
}) {
    const navigate = useNavigate();
    const { readiness, isReady, loading: readinessLoading } = useRampReadiness();

    // Resume jumps to tracking. Initial stage chosen from order state in effect below.
    const [stage, setStage] = useState<OfframpStage>(resumeOrderId ? 'tracking' : 'input');
    const [asset, setAsset] = useState<OfframpAsset>('TESOURO');
    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<RampQuote | null>(null);
    const [order, setOrder] = useState<RampOrder | null>(null);
    const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [signing, setSigning] = useState(false);
    const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

    // Resume from URL handoff. Fetch the order and pick the right stage:
    //   - burn tx already submitted (TX 1 landed) → 'tracking'
    //   - status=created, no burn tx → 'signing' (user can re-trigger sign;
    //     prepareSigningTx is idempotent and returns a fresh XDR)
    useEffect(() => {
        if (!resumeOrderId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await rampApi.getOrder(resumeOrderId);
                if (cancelled || !res.success || !res.data) return;
                const o = res.data;
                setOrder(o);
                // Derive asset from order.sourceAsset (CODE:ISSUER → CODE)
                const code = (o.sourceAsset?.split(':')[0] ?? 'TESOURO').toUpperCase() as OfframpAsset;
                if (code === 'TESOURO' || code === 'USDC') setAsset(code);
                const hasBurnTx = !!(o.pixInstructions && typeof o.pixInstructions === 'object'
                    && 'relayerHoldTxHash' in (o.pixInstructions as Record<string, unknown>));
                const isInProgress = o.status !== 'created' || hasBurnTx;
                setStage(isInProgress ? 'tracking' : 'signing');
            } catch {
                /* Fall back to input stage silently */
            }
        })();
        return () => { cancelled = true; };
    }, [resumeOrderId]);

    // Pre-select the default bank account once readiness loads.
    useEffect(() => {
        if (!readiness?.bankAccounts) return;
        if (selectedBankId != null) return;
        const usable = (b: { status: string }) => b.status !== 'inactive';
        const def =
            readiness.bankAccounts.find((b) => b.isDefault && usable(b))
            ?? readiness.bankAccounts.find(usable);
        if (def) setSelectedBankId(def.id);
    }, [readiness, selectedBankId]);

    // Status polling once an order is in flight.
    useEffect(() => {
        if (!order || TERMINAL_OFFRAMP_STATUSES.has(order.status)) {
            if (pollHandle.current) clearInterval(pollHandle.current);
            // Refresh wallet balances when the order reaches a terminal state.
            if (order && TERMINAL_OFFRAMP_STATUSES.has(order.status)) {
                onCompleted?.();
            }
            return;
        }
        pollHandle.current = setInterval(async () => {
            try {
                const res = await rampApi.getOrder(order.id);
                if (res.success && res.data) setOrder(res.data);
            } catch {
                /* silent — next tick retries */
            }
        }, OFFRAMP_POLL_INTERVAL_MS);
        return () => {
            if (pollHandle.current) clearInterval(pollHandle.current);
        };
    }, [order, onCompleted]);

    const availableBalance = useMemo(() => {
        const raw = asset === 'TESOURO' ? balances?.tesouro : balances?.usdc;
        return raw ? Number(raw) : 0;
    }, [asset, balances]);

    async function handlePreview() {
        setError(null);
        const n = Number(amount);
        if (!amount || Number.isNaN(n) || n <= 0) {
            setError('Enter an amount');
            return;
        }
        if (n > availableBalance) {
            setError(`Insufficient ${asset} — available ${availableBalance}`);
            return;
        }
        setBusy(true);
        try {
            const res = await rampApi.createOfframpQuote({ sourceAsset: asset, sourceAmount: amount });
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
        if (!quote || selectedBankId == null || !investorId) return;
        setError(null);
        setBusy(true);
        try {
            const res = await rampApi.createOfframpOrder({
                quoteId: quote.id,
                bankAccountId: selectedBankId,
            });
            if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to create order');
            setOrder(res.data.order);
            setStage('signing');
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err?.message ?? 'Failed to create order');
        } finally {
            setBusy(false);
        }
    }

    async function handleSign() {
        if (!order) return;
        setError(null);
        setSigning(true);
        try {
            // 1. Backend builds the unsigned SAC transfer XDR with Memo.hash.
            const prep = await rampApi.prepareOfframpTx(order.id);
            if (!prep.success || !prep.data) {
                throw new Error(prep.error ?? 'Failed to prepare signing transaction');
            }
            // 2. Passkey signs (same flow as the existing /withdraw).
            const signedXdr = await passkeyClient.signTransaction(prep.data.xdr);
            // 3. Submit to Soroban RPC; backend persists tx hash to the order.
            const submitted = await rampApi.submitOfframpTx(order.id, signedXdr);
            if (!submitted.success || !submitted.data) {
                throw new Error(submitted.error ?? 'Failed to submit signed transaction');
            }
            // 4. Move to tracking; the webhook will advance status.
            const refreshed = await rampApi.getOrder(order.id);
            if (refreshed.success && refreshed.data) setOrder(refreshed.data);
            setStage('tracking');
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err?.message ?? 'Signing failed');
        } finally {
            setSigning(false);
        }
    }

    async function handleCancel() {
        if (!order) return;
        setError(null);
        setBusy(true);
        try {
            await rampApi.cancelOfframpOrder(order.id);
            const refreshed = await rampApi.getOrder(order.id);
            if (refreshed.success && refreshed.data) setOrder(refreshed.data);
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err?.message ?? 'Cancel failed');
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
            reason === 'no_active_bank_account' ? 'Add a PIX key to cash out' :
            reason === 'kyc_rejected' ? 'KYC was rejected — please update' :
            reason === 'kyc_pending' ? 'Your KYC is in review' :
            'Complete a quick onboarding';
        const cta =
            reason === 'no_active_bank_account' ? 'Add PIX key' :
            reason === 'kyc_pending' ? 'Check status' :
            'Start onboarding';
        return (
            <div className="py-5 space-y-5">
                <div className="px-5 py-6 rounded-xl border border-[hsl(43_45%_55%/0.3)] bg-[hsl(43_45%_55%/0.06)]">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[hsl(43_45%_70%)]">
                        <Sparkles className="w-3 h-3" /> One-time setup
                    </div>
                    <p className="mt-3 text-[15px] text-white leading-snug max-w-[36ch]" style={{ fontFamily: 'var(--font-heading)' }}>
                        {heading}
                    </p>
                    <p className="mt-1.5 text-[12px] text-white/55 max-w-[42ch]">
                        Radox needs a few details before you can convert tokens to BRL via PIX.
                    </p>
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

    // ─── Stage: input — asset + amount ─────────────────────────────────────
    if (stage === 'input') {
        return (
            <div className="py-2 space-y-5">
                <AssetPicker
                    selected={asset}
                    onSelect={setAsset}
                    balances={balances}
                />

                <div className="space-y-2">
                    <div className="flex items-baseline justify-between px-1">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                            Amount in {asset}
                        </label>
                        <button
                            type="button"
                            onClick={() => setAmount(String(availableBalance))}
                            disabled={availableBalance <= 0}
                            className="text-[10px] uppercase tracking-wider text-[hsl(43_45%_70%)] hover:text-[hsl(43_45%_85%)] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Max · {availableBalance.toFixed(4)}
                        </button>
                    </div>
                    <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="bg-white/5 border-white/10 rounded-xl h-12 text-lg font-mono"
                        min="0"
                        step="0.0001"
                        autoFocus
                    />
                    <p className="text-[11px] text-white/45 px-1">
                        Rate quoted live by EtherFuse. Quotes expire in 2 minutes.
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
                        <>Preview BRL rate <ArrowRight className="w-4 h-4 ml-2" /></>
                    )}
                </Button>

                <BankAccountList
                    accounts={(readiness?.bankAccounts ?? []) as BankAccountChoice[]}
                    selectedId={selectedBankId}
                    onSelect={setSelectedBankId}
                />
            </div>
        );
    }

    // ─── Stage: reviewing — quote summary + confirm ────────────────────────
    if (stage === 'reviewing' && quote) {
        return (
            <div className="py-2 space-y-5">
                <OfframpQuoteCard quote={quote} asset={asset} />
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
                            <>Create order <ArrowRight className="w-4 h-4 ml-2" /></>
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    // ─── Stage: signing — passkey prompt + on-chain submit ─────────────────
    if (stage === 'signing' && order) {
        return (
            <div className="py-2 space-y-5">
                <div className="px-5 py-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Next step</p>
                    <p className="text-[14px] text-white leading-snug" style={{ fontFamily: 'var(--font-heading)' }}>
                        Sign with your passkey to release{' '}
                        <span className="text-[hsl(43_45%_70%)] font-mono">
                            {order.amountInTokens ? Number(order.amountInTokens).toFixed(4) : '—'} {asset}
                        </span>{' '}
                        to the EtherFuse anchor.
                    </p>
                    <p className="text-[11px] text-white/55">
                        Once on-chain confirmation arrives, EtherFuse pays{' '}
                        <span className="text-white/85 font-mono">
                            R$ {order.amountInFiat ? Number(order.amountInFiat).toFixed(2) : '—'}
                        </span>{' '}
                        to your PIX key.
                    </p>
                </div>

                <div className="flex items-center gap-2 p-3 bg-[hsl(43_45%_55%/0.10)] text-[hsl(43_45%_70%)] rounded-xl text-[12px]">
                    <Shield className="w-4 h-4 shrink-0" />
                    You will be asked to sign with your Passkey.
                </div>

                {error && <InlineError message={error} />}

                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={signing || busy}
                        className="h-11 px-4 text-white/70 hover:text-white hover:bg-white/[0.06]"
                    >
                        Cancel order
                    </Button>
                    <Button
                        onClick={handleSign}
                        disabled={signing}
                        className="flex-1 h-11 rounded-xl bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_62%)] text-[hsl(220_60%_8%)] font-semibold disabled:opacity-50"
                    >
                        {signing ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing…</>
                        ) : (
                            <><Send className="w-4 h-4 mr-2" /> Sign &amp; send</>
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    // ─── Stage: tracking — status timeline ─────────────────────────────────
    if (stage === 'tracking' && order) {
        return (
            <OfframpTracker
                order={order}
                asset={asset}
            />
        );
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIX subviews
// ─────────────────────────────────────────────────────────────────────────────

function AssetPicker({
    selected,
    onSelect,
    balances,
}: {
    selected: OfframpAsset;
    onSelect: (a: OfframpAsset) => void;
    balances?: WalletBalances;
}) {
    const tesouro = balances?.tesouro ? Number(balances.tesouro) : 0;
    const usdc = balances?.usdc ? Number(balances.usdc) : 0;

    // Both TESOURO and USDC off-ramps are supported. USDC quotes return
    // `requiresSwap: true` — EtherFuse routes USDC → TESOURO → BRL internally
    // via SDEX. Verified 2026-05-16 in sandbox.
    return (
        <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 px-1">Asset</p>
            <div className="grid grid-cols-2 gap-2">
                <AssetTile
                    code="TESOURO"
                    label="Yield-bearing"
                    balance={tesouro.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    selected={selected === 'TESOURO'}
                    onClick={() => onSelect('TESOURO')}
                />
                <AssetTile
                    code="USDC"
                    label="Stablecoin"
                    balance={`$${usdc.toFixed(2)}`}
                    selected={selected === 'USDC'}
                    onClick={() => onSelect('USDC')}
                />
            </div>
        </div>
    );
}

function AssetTile({
    code,
    label,
    balance,
    selected,
    onClick,
    disabled,
}: {
    code: string;
    label: string;
    balance: string;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={
                'flex flex-col items-start gap-1 p-3 rounded-lg border transition-colors text-left ' +
                (disabled
                    ? 'border-white/8 bg-white/[0.015] opacity-50 cursor-not-allowed'
                    : selected
                        ? 'border-[hsl(43_45%_55%/0.5)] bg-[hsl(43_45%_55%/0.08)]'
                        : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]')
            }
        >
            <div className="flex items-center gap-2 w-full">
                <span className="text-[13px] font-medium text-white">{code}</span>
                <span className="text-[9px] uppercase tracking-wider text-white/40 ml-auto">{label}</span>
            </div>
            <div className="text-[11px] font-mono text-white/65">{balance}</div>
        </button>
    );
}

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
                <span className="text-[10px] uppercase tracking-wider text-gray-500">To PIX key</span>
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
                    const blocked = b.status === 'inactive';
                    const showStateChip = b.status !== 'active';
                    const chipTone =
                        b.status === 'awaiting_deposit_verification' || b.status === 'pending'
                            ? 'text-amber-400/80'
                            : 'text-white/40';
                    return (
                        <button
                            key={b.id}
                            onClick={() => onSelect(b.id)}
                            disabled={blocked}
                            className={
                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ' +
                                (selected
                                    ? 'border-[hsl(43_45%_55%/0.5)] bg-[hsl(43_45%_55%/0.08)]'
                                    : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]') +
                                (blocked ? ' opacity-50 cursor-not-allowed' : '')
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
                            {showStateChip && (
                                <span className={'text-[9px] uppercase tracking-wider ' + chipTone}>
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

function OfframpQuoteCard({ quote, asset }: { quote: RampQuote; asset: OfframpAsset }) {
    const dest = quote.destinationAmount ? Number(quote.destinationAmount) : null;
    const fee = quote.feeBps != null ? (quote.feeBps / 100).toFixed(2) : null;
    const expiresIn = useCountdown(quote.expiresAt);
    return (
        <div className="px-5 py-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-4">
            <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">You send</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">You receive</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
                <div className="text-right md:text-left">
                    <div className="text-[1.6rem] font-mono text-white tabular-nums" style={{ letterSpacing: '-0.01em' }}>
                        {Number(quote.sourceAmount).toFixed(4)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-white/45 mt-0.5">{asset}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-white/30 shrink-0" />
                <div className="text-right">
                    <div className="text-[1.6rem] font-mono text-[hsl(43_45%_70%)] tabular-nums" style={{ letterSpacing: '-0.01em' }}>
                        R$ {dest != null ? dest.toFixed(2) : '—'}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-white/45 mt-0.5">BRL · PIX</div>
                </div>
            </div>
            <div className="pt-3 border-t border-white/8 flex items-center justify-between text-[11px] text-white/50">
                <span>{fee ? `Fee ${fee}%` : 'Fee included'}</span>
                <span>Quote expires in {expiresIn}</span>
            </div>
        </div>
    );
}

function OfframpTracker({ order, asset }: { order: RampOrder; asset: OfframpAsset }) {
    const isComplete = order.status === 'completed' || order.status === 'finalized';
    const isFailed = order.status === 'failed' || order.status === 'refunded' || order.status === 'canceled' || order.status === 'expired';

    // 3-step user-facing progression. `finalized` is hidden because it's a
    // legal reversal-window marker (24–48h passive wait) that the EtherFuse
    // sandbox often never advances to — surfacing it as a pending step made
    // every completed off-ramp look stuck. We treat `completed` as success
    // and expose the reversal window as a passive note below the steps.
    const steps: Array<{ key: RampOrder['status']; label: string }> = [
        { key: 'created', label: 'Order created' },
        { key: 'funded', label: 'On-chain transfer detected' },
        { key: 'completed', label: 'PIX sent · funds in your bank' },
    ];

    const statusIndex = steps.findIndex((s) => s.key === order.status);

    const isPolling = !isComplete && !isFailed;

    return (
        <div className="py-2 space-y-5">
            <div className="space-y-1.5">
                <OfframpStatusPill status={order.status} />
                {isPolling && (
                    <p className="text-center text-[10px] text-white/40 uppercase tracking-[0.14em]">
                        Auto-updates every 4s
                    </p>
                )}
            </div>

            <div className="px-5 py-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-3">
                <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">Cashing out</span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">to PIX</span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                    <div className="text-[1.4rem] font-mono text-white tabular-nums">
                        {order.amountInTokens ? Number(order.amountInTokens).toFixed(4) : '—'}
                        <span className="text-[hsl(43_45%_70%)] text-[1rem] ml-2">{asset}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/30 shrink-0" />
                    <div className="text-[1.4rem] font-mono text-[hsl(43_45%_70%)] tabular-nums">
                        R$ {order.amountInFiat ? Number(order.amountInFiat).toFixed(2) : '—'}
                    </div>
                </div>
            </div>

            {!isFailed && (
                <ol className="space-y-2">
                    {steps.map((step, i) => {
                        const reached = statusIndex >= i || (isComplete && step.key === 'completed');
                        const current = order.status === step.key;
                        return (
                            <li
                                key={step.key}
                                className={
                                    'flex items-center gap-3 px-3 py-2.5 rounded-lg border ' +
                                    (current
                                        ? 'border-[hsl(43_45%_55%/0.5)] bg-[hsl(43_45%_55%/0.08)]'
                                        : reached
                                            ? 'border-[hsl(160_60%_40%/0.3)] bg-[hsl(160_60%_40%/0.04)]'
                                            : 'border-white/8 bg-white/[0.02]')
                                }
                            >
                                <div className={
                                    'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ' +
                                    (reached
                                        ? 'border-[hsl(160_60%_55%)] bg-[hsl(160_60%_40%/0.2)]'
                                        : current
                                            ? 'border-[hsl(43_45%_55%)] bg-[hsl(43_45%_55%/0.2)] animate-pulse'
                                            : 'border-white/20')
                                }>
                                    {reached && <Check className="w-2.5 h-2.5 text-[hsl(160_60%_55%)]" />}
                                </div>
                                <span className={
                                    'text-[12px] ' +
                                    (current ? 'text-white' : reached ? 'text-white/70' : 'text-white/40')
                                }>
                                    {step.label}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            )}

            {order.failureReason && <InlineError message={order.failureReason} />}

            {order.statusPage && (
                <a
                    href={order.statusPage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center text-[11px] text-[hsl(43_45%_70%)] hover:text-[hsl(43_45%_85%)] underline-offset-4 hover:underline transition-colors"
                >
                    View order on EtherFuse →
                </a>
            )}
        </div>
    );
}

function OfframpStatusPill({ status }: { status: RampOrder['status'] }) {
    const tone =
        status === 'completed' || status === 'finalized'
            ? 'text-[hsl(160_60%_55%)] bg-[hsl(160_60%_40%/0.12)] border-[hsl(160_60%_40%/0.3)]'
            : status === 'funded'
            ? 'text-[hsl(43_45%_70%)] bg-[hsl(43_45%_55%/0.12)] border-[hsl(43_45%_55%/0.3)]'
            : status === 'failed' || status === 'refunded' || status === 'canceled' || status === 'expired'
            ? 'text-red-400 bg-red-500/10 border-red-500/30'
            : 'text-white/60 bg-white/[0.04] border-white/10';
    const copy: Record<RampOrder['status'], string> = {
        created: 'Waiting for signing',
        funded: 'On-chain — PIX in flight',
        completed: 'PIX sent',
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

export default WithdrawDialog;
