import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TransactionLink } from "@/components/ui/TransactionLink";
import { useInvestment } from '@/hooks/useInvestment';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useInvestmentFees } from '@/hooks/useInvestmentFees';
import { AlertTriangle, Settings, Wallet, ExternalLink, CheckCircle2, Loader2, Shield, Copy, Check, Rocket } from 'lucide-react';
import { authStorage } from '@/utils/authStorage';
import { passkeyClient } from '@/lib/passkey';
import {
    getEffectiveRate,
    computePeriodicYield,
    computeTotalReturn,
    PERIOD_LABELS,
} from '@/utils/offerCalculations';

interface InvestmentDialogProps {
    offer: {
        id: number;
        offer_name: string;
        asset_code: string;
        unit_price?: number;
        offer_rules?: Record<string, any>;
        total_supply?: number;
        tokens_sold?: number;
        maturity_date?: string;
        investment_cutoff_date?: string;
        investor_rate?: number | null;
        annual_interest_rate?: number | null;
        payment_type?: string | null;
    };
    trigger?: React.ReactNode;
}

type DialogStep = 'form' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

const MAX_SILENT_RETRIES = 5;

interface PurchaseDetails {
    usdcAmount: number;
    feeAmount: number;
    totalDeduction: number;
    tokensReceived: number;
    assetCode: string;
    offerName: string;
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

// Detect timeout-style errors for user-friendly messaging
function isTimeoutError(msg: string): boolean {
    return /timeout|timed out|ETIMEDOUT|exceeded/i.test(msg);
}

// Detect network congestion / fee contention errors (retryable)
function isCongestionError(msg: string): boolean {
    return /insufficient_fee|tx_insufficient_fee|high demand|E-4091|congestion/i.test(msg);
}

// Any retryable submission error (timeout OR congestion)
function isRetryableError(msg: string): boolean {
    return isTimeoutError(msg) || isCongestionError(msg);
}

// ─── STEPPER STEPS ───
const PROGRESS_STEPS = [
    { key: 'authorized', label: 'Authorized' },
    { key: 'processing', label: 'Processing' },
    { key: 'confirmed', label: 'Confirmed' },
] as const;

function getActiveStepIndex(step: DialogStep): number {
    switch (step) {
        case 'signing': return 0;
        case 'submitting': return 1;
        case 'confirming':
        case 'success': return 2;
        default: return -1;
    }
}

// ─── FLYING ROCKET COMPONENT (replaces Loader2 spinners) ───
function FlyingRocket({ className = '' }: { className?: string }) {
    return (
        <div className={`relative inline-flex items-center justify-center ${className}`}>
            {/* Speed lines */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'speed-lines 1s ease-in-out infinite' }}>
                <div className="absolute w-4 h-[1.5px] bg-gradient-to-r from-transparent to-[hsl(160_60%_45%/0.4)] -translate-x-5 -translate-y-1 rounded-full" />
                <div className="absolute w-6 h-[1.5px] bg-gradient-to-r from-transparent to-[hsl(160_60%_45%/0.3)] -translate-x-6 translate-y-1 rounded-full" style={{ animationDelay: '0.3s' }} />
                <div className="absolute w-3 h-[1.5px] bg-gradient-to-r from-transparent to-[hsl(160_60%_45%/0.5)] -translate-x-4 translate-y-3 rounded-full" style={{ animationDelay: '0.6s' }} />
            </div>
            <Rocket className="w-6 h-6 text-[hsl(160_60%_45%)]" style={{ animation: 'rocket-fly 1.5s ease-in-out infinite' }} />
        </div>
    );
}

// ─── SHUTTLE ANIMATION COMPONENT ───
function ShuttleProgress({ activeIndex }: { activeIndex: number }) {
    const progressPercent = activeIndex <= 0 ? 0 : activeIndex === 1 ? 50 : 100;

    return (
        <div className="relative w-full px-6 mt-8 mb-2">
            {/* Track */}
            <div className="relative h-1 bg-white/10 rounded-full overflow-visible">
                {/* Filled bar */}
                <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-[1200ms] ease-out"
                    style={{
                        width: `${progressPercent}%`,
                        background: 'linear-gradient(90deg, hsl(160 60% 40%), hsl(160 60% 50%))',
                    }}
                />

                {/* Shuttle icon */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 transition-all duration-[1200ms] ease-out"
                    style={{ left: `${progressPercent}%` }}
                >
                    <div className="relative -translate-x-1/2 flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-slate-900 border-2 border-[hsl(160_60%_45%)] flex items-center justify-center shadow-[0_0_12px_hsl(160_60%_45%/0.4)]">
                            <Rocket
                                className="w-3.5 h-3.5 text-[hsl(160_60%_45%)]"
                                style={{
                                    animation: activeIndex === 1
                                        ? 'shuttle-bounce 1.5s ease-in-out infinite'
                                        : activeIndex === 2
                                            ? 'none'
                                            : 'shuttle-pulse 2s ease-in-out infinite',
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Step labels */}
            <div className="flex justify-between mt-3">
                {PROGRESS_STEPS.map((s, i) => {
                    const isActive = i <= activeIndex;
                    const isCurrent = i === activeIndex;
                    return (
                        <div key={s.key} className="flex flex-col items-center gap-1">
                            <div
                                className={`w-2 h-2 rounded-full transition-all duration-500 ${isActive
                                    ? 'bg-[hsl(160_60%_45%)] shadow-[0_0_6px_hsl(160_60%_45%/0.5)]'
                                    : 'bg-white/15'
                                    }`}
                            />
                            <span
                                className={`text-[10px] uppercase tracking-wider font-medium transition-colors duration-500 ${isActive
                                    ? isCurrent
                                        ? 'text-[hsl(160_60%_50%)]'
                                        : 'text-slate-300'
                                    : 'text-slate-600'
                                    }`}
                            >
                                {s.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── COPYABLE HASH ───
function CopyableHash({ hash }: { hash: string }) {
    const [copied, setCopied] = useState(false);

    const short = hash.length > 16
        ? `${hash.slice(0, 8)}…${hash.slice(-8)}`
        : hash;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(hash);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] transition-colors group"
            title="Copy full transaction hash"
        >
            <code className="text-xs text-blue-400">{short}</code>
            {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
            ) : (
                <Copy className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
            )}
        </button>
    );
}

// ─── MAIN COMPONENT ───
export function InvestmentDialog({ offer, trigger }: InvestmentDialogProps) {
    const [amount, setAmount] = useState('');
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<DialogStep>('form');
    const [txResult, setTxResult] = useState<{ investmentId: number; transactionHash: string } | null>(null);
    const [signingError, setSigningError] = useState<string | null>(null);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [purchaseDetails, setPurchaseDetails] = useState<PurchaseDetails | null>(null);
    const [pendingRetry, setPendingRetry] = useState<{ signedXdr: string; investmentContext: any } | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [isExtendedWait, setIsExtendedWait] = useState(false);
    const { purchase, submitSignedTx, loading, error } = useInvestment();
    const { usdcBalance, loading: balanceLoading, refresh: refreshBalance } = useWalletBalance();
    const { processingFee } = useInvestmentFees();
    const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // KYC gate
    const user = authStorage.getUser<{ kycStatus?: string }>('investor') || {};
    const kycApproved = user.kycStatus === 'approved';

    // Offer rules
    const rules = offer.offer_rules || {};
    const minInvestment = rules.min_investment ? Number(rules.min_investment) : undefined;
    const maxInvestment = rules.max_investment ? Number(rules.max_investment) : undefined;

    // Validation
    const parsedAmount = parseFloat(amount);
    const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
    const isBelowMin = minInvestment !== undefined && isValidAmount && parsedAmount < minInvestment;
    const isAboveMax = maxInvestment !== undefined && isValidAmount && parsedAmount > maxInvestment;

    // Supply guard
    const unitPrice = offer.unit_price || 1;
    const totalSupply = offer.total_supply ?? 0;
    const tokensSold = offer.tokens_sold ?? 0;
    const remainingTokens = totalSupply - tokensSold;
    const remainingUsdc = remainingTokens * unitPrice;
    const isFullySubscribed = totalSupply > 0 && remainingTokens <= 0;
    const isAboveRemaining = totalSupply > 0 && isValidAmount && parsedAmount > remainingUsdc;

    // Maturity cutoff
    const cutoffDate = offer.investment_cutoff_date ? new Date(offer.investment_cutoff_date) : null;
    const isPastCutoff = cutoffDate ? new Date() >= cutoffDate : false;
    const daysUntilCutoff = cutoffDate ? Math.ceil((cutoffDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
    const isNearCutoff = daysUntilCutoff !== null && daysUntilCutoff > 0 && daysUntilCutoff <= 30;

    // Fee calculations
    const totalDeduction = isValidAmount ? parsedAmount + processingFee : 0;
    const tokensReceived = isValidAmount ? parsedAmount / unitPrice : 0;
    const hasInsufficientFunds = usdcBalance !== null && isValidAmount && totalDeduction > usdcBalance;
    const shortfall = hasInsufficientFunds ? totalDeduction - (usdcBalance || 0) : 0;

    const canSubmit = isValidAmount && !isBelowMin && !isAboveMax && !isAboveRemaining && !isFullySubscribed && !isPastCutoff && !loading && !hasInsufficientFunds;

    // Cleanup timers on unmount
    useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); }, []);

    const handleInvest = async () => {
        try {
            const usdcAmount = parseFloat(amount);
            if (isNaN(usdcAmount) || usdcAmount <= 0) return;

            const result = await purchase(offer.id, usdcAmount, offer.asset_code);

            if (result && result.transaction) {
                // ─── STEP 1: SIGNING ───
                setStep('signing');
                setSigningError(null);

                // Capture purchase details for the receipt
                const details: PurchaseDetails = {
                    usdcAmount,
                    feeAmount: processingFee,
                    totalDeduction: usdcAmount + processingFee,
                    tokensReceived: result.investmentContext?.tokenAmount ?? (usdcAmount / unitPrice),
                    assetCode: offer.asset_code,
                    offerName: offer.offer_name,
                };
                setPurchaseDetails(details);

                try {
                    const signedXdr = await passkeyClient.signTransaction(
                        result.transaction.xdr,
                        result.transaction.walletId
                    );

                    // ─── STEP 2: SUBMITTING ───
                    setStep('submitting');
                    setRetryCount(0);
                    setIsExtendedWait(false);
                    // Save retry info in case submission fails
                    const retryInfo = { signedXdr, investmentContext: result.investmentContext };
                    setPendingRetry(retryInfo);

                    // Submit with silent auto-retry on timeout or network congestion
                    const attemptSubmit = async (attempt: number): Promise<any> => {
                        try {
                            return await submitSignedTx(retryInfo.signedXdr, retryInfo.investmentContext);
                        } catch (submitErr: any) {
                            const errMsg = submitErr.message || '';
                            if (isRetryableError(errMsg) && attempt < MAX_SILENT_RETRIES) {
                                const reason = isCongestionError(errMsg) ? 'network busy' : 'timed out';
                                console.warn(`[Investment] Attempt ${attempt + 1} ${reason}, retrying silently...`);
                                setRetryCount(attempt + 1);
                                setIsExtendedWait(true);
                                // Backoff before retry: 2s, 4s, 8s, 15s, 15s (capped)
                                await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 15_000)));
                                return attemptSubmit(attempt + 1);
                            }
                            throw submitErr;
                        }
                    };

                    const submitResult = await attemptSubmit(0);

                    // ─── STEP 3: CONFIRMING (brief pause for UX) ───
                    setStep('confirming');
                    setTxResult(submitResult);
                    setPendingRetry(null);
                    setIsExtendedWait(false);
                    refreshBalance();

                    // Let the user see "Confirmed" step for a moment
                    confirmTimerRef.current = setTimeout(() => {
                        setStep('success');
                    }, 1400);

                } catch (signErr: any) {
                    // Distinguish: passkey cancel vs. submission failure
                    if (step === 'submitting' || isExtendedWait) {
                        // All retries exhausted — show error recovery
                        console.error('Transaction submission failed after retries:', signErr);
                        setSubmissionError(signErr.message || 'Transaction submission failed');
                        setStep('error');
                    } else {
                        // Passkey signing was cancelled/failed — go back to form
                        console.error('Passkey signing failed:', signErr);
                        setSigningError(signErr.message || 'Failed to sign transaction');
                        setPendingRetry(null);
                        setStep('form');
                    }
                }
            } else {
                setOpen(false);
            }
        } catch (e) {
            // Error handled by hook
        }
    };

    const handleClose = () => {
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        setOpen(false);
        setAmount('');
        setStep('form');
        setTxResult(null);
        setSigningError(null);
        setSubmissionError(null);
        setPurchaseDetails(null);
        setPendingRetry(null);
        setRetryCount(0);
        setIsExtendedWait(false);
    };

    // Is the dialog in a "processing" state (non-dismissable)?
    const isProcessing = step === 'signing' || step === 'submitting' || step === 'confirming';

    // Retry handler for failed submissions
    const handleRetry = async () => {
        if (!pendingRetry) {
            // No saved XDR — user needs to start over
            setStep('form');
            setSubmissionError(null);
            return;
        }
        try {
            setStep('submitting');
            setSubmissionError(null);
            const submitResult = await submitSignedTx(pendingRetry.signedXdr, pendingRetry.investmentContext);
            setStep('confirming');
            setTxResult(submitResult);
            setPendingRetry(null);
            refreshBalance();
            confirmTimerRef.current = setTimeout(() => {
                setStep('success');
            }, 1400);
        } catch (retryErr: any) {
            console.error('Retry failed:', retryErr);
            setSubmissionError(retryErr.message || 'Transaction submission failed');
            setStep('error');
        }
    };

    // Stepper active index
    const activeStepIndex = getActiveStepIndex(step);

    // Context message for each processing step
    const processingMessage = (() => {
        switch (step) {
            case 'signing':
                return {
                    title: 'Authorize with biometric',
                    subtitle: 'Use Face ID or fingerprint to confirm this transaction.',
                };
            case 'submitting': {
                if (!isExtendedWait) {
                    return {
                        title: 'Processing your investment',
                        subtitle: 'Your transaction is being securely submitted to the blockchain.',
                    };
                }
                // Rotating messages to keep the UI feeling alive during retries
                const waitMessages = [
                    {
                        title: 'Fitting your transaction into blockchain traffic',
                        subtitle: 'The network is a little busy. We\'re working on it — almost there.',
                    },
                    {
                        title: 'Still working on it',
                        subtitle: 'Finding the best slot for your transaction. No funds leave your wallet until confirmed.',
                    },
                    {
                        title: 'Hang tight — we\'re getting there',
                        subtitle: 'The blockchain is processing other transactions ahead of yours. This is normal during peak times.',
                    },
                    {
                        title: 'Your transaction is in the queue',
                        subtitle: 'If it doesn\'t go through, just hit retry. Your wallet is untouched until full success.',
                    },
                    {
                        title: 'Almost there',
                        subtitle: 'We\'re still trying. Your funds are completely safe — nothing moves without confirmation.',
                    },
                ];
                return waitMessages[Math.min(retryCount, waitMessages.length - 1)];
            }
            case 'confirming':
                return {
                    title: 'Almost there!',
                    subtitle: 'Transaction confirmed. Preparing your receipt.',
                };
            default:
                return { title: '', subtitle: '' };
        }
    })();

    return (
        <Dialog open={open} onOpenChange={(val) => val ? setOpen(true) : (isProcessing ? undefined : handleClose())}>
            <DialogTrigger asChild>
                {trigger || <Button>Invest Now</Button>}
            </DialogTrigger>
            <DialogContent
                className="sm:max-w-[500px] bg-slate-900 border-slate-800 text-white"
                onPointerDownOutside={(e) => isProcessing && e.preventDefault()}
                onEscapeKeyDown={(e) => isProcessing && e.preventDefault()}
            >
                {/* ─── SHUTTLE ANIMATION KEYFRAMES (injected once) ─── */}
                <style>{`
                    @keyframes shuttle-bounce {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-3px); }
                    }
                    @keyframes shuttle-pulse {
                        0%, 100% { opacity: 0.7; }
                        50% { opacity: 1; }
                    }
                    @keyframes rocket-fly {
                        0%, 100% { transform: translateX(0); }
                        25% { transform: translateX(3px) translateY(-2px); }
                        75% { transform: translateX(-2px) translateY(1px); }
                    }
                    @keyframes speed-lines {
                        0%, 100% { opacity: 0.3; transform: translateX(0); }
                        50% { opacity: 0.8; transform: translateX(-4px); }
                    }
                    @keyframes receipt-reveal {
                        from { opacity: 0; transform: translateY(12px) scale(0.97); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    @keyframes check-pop {
                        0% { transform: scale(0); opacity: 0; }
                        50% { transform: scale(1.2); }
                        100% { transform: scale(1); opacity: 1; }
                    }
                `}</style>

                <DialogHeader>
                    <DialogTitle>
                        {step === 'success'
                            ? 'Investment Complete'
                            : step === 'error'
                                ? 'Transaction Interrupted'
                                : `Invest in ${offer.offer_name}`}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {step === 'success'
                            ? "Your tokens have been delivered to your wallet."
                            : step === 'error'
                                ? "Don't worry — your funds are safe."
                                : isProcessing
                                    ? processingMessage.subtitle
                                    : "Enter the amount of USDC you wish to invest."}
                    </DialogDescription>
                </DialogHeader>

                {/* ─── KYC GATE ─── */}
                {!kycApproved ? (
                    <div className="py-6">
                        <div className="p-4 bg-yellow-900/20 border border-yellow-700/30 rounded-xl text-center space-y-3">
                            <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto" />
                            <div className="space-y-1">
                                <p className="font-semibold text-yellow-400">KYC Verification Required</p>
                                <p className="text-sm text-slate-400">
                                    Your identity verification must be approved before you can invest.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="border-yellow-700/50 text-yellow-400 hover:bg-yellow-900/30"
                                onClick={() => {
                                    handleClose();
                                    window.location.href = '/settings';
                                }}
                            >
                                <Settings className="h-4 w-4 mr-2" />
                                Go to Settings
                            </Button>
                        </div>
                    </div>

                ) : isProcessing ? (
                    /* ─── PROCESSING STATES (signing / submitting / confirming) ─── */
                    <div className="py-6 space-y-2">
                        {/* Central icon + message */}
                        <div className="text-center space-y-2">
                            {step === 'signing' ? (
                                <div className="mx-auto w-10 h-10 flex items-center justify-center">
                                    <FlyingRocket />
                                </div>
                            ) : step === 'confirming' ? (
                                <CheckCircle2
                                    className="h-10 w-10 text-emerald-400 mx-auto"
                                    style={{ animation: 'check-pop 0.4s ease-out forwards' }}
                                />
                            ) : (
                                <div className="mx-auto w-10 h-10 flex items-center justify-center">
                                    <FlyingRocket />
                                </div>
                            )}
                            <div className="space-y-0.5">
                                <p className="font-semibold text-white">{processingMessage.title}</p>
                                {purchaseDetails && step !== 'signing' && (
                                    <p className="text-xs text-slate-500">
                                        {purchaseDetails.tokensReceived.toFixed(2)} {purchaseDetails.assetCode} · ${purchaseDetails.totalDeduction.toFixed(2)} USDC
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Stepper with shuttle */}
                        <ShuttleProgress activeIndex={activeStepIndex} />

                        {/* Trust badge */}
                        <div className="flex items-center justify-center gap-1.5 pt-2">
                            <Shield className="h-3 w-3 text-emerald-400/60" />
                            <span className="text-[10px] text-slate-500">
                                Secured by blockchain · Do not close this window
                            </span>
                        </div>
                    </div>

                ) : step === 'success' ? (
                    /* ─── SUCCESS RECEIPT ─── */
                    <div
                        className="py-4 space-y-4"
                        style={{ animation: 'receipt-reveal 0.5s ease-out forwards' }}
                    >
                        {/* Hero */}
                        <div className="text-center space-y-1">
                            <CheckCircle2 className="h-11 w-11 text-emerald-400 mx-auto mb-2" />
                            {purchaseDetails && (
                                <p className="text-2xl font-bold text-white">
                                    {purchaseDetails.tokensReceived.toFixed(2)}{' '}
                                    <span className="text-[hsl(43_45%_55%)]">{purchaseDetails.assetCode}</span>
                                </p>
                            )}
                            <p className="text-sm text-slate-400">Tokens delivered to your wallet</p>
                        </div>

                        {/* Receipt card */}
                        {purchaseDetails && (
                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Offer</span>
                                    <span className="text-slate-300 font-medium">{purchaseDetails.offerName}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Investment amount</span>
                                    <span className="text-white">${purchaseDetails.usdcAmount.toFixed(2)}</span>
                                </div>
                                    {purchaseDetails.feeAmount > 0 ? (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Processing fee</span>
                                            <span className="text-slate-400">+${purchaseDetails.feeAmount.toFixed(2)}</span>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Fees</span>
                                            <span className="text-emerald-400">Sponsored — enjoy!</span>
                                        </div>
                                    )}
                                <div className="border-t border-white/8 pt-2 flex justify-between text-xs font-semibold">
                                    <span className="text-white">Total charged</span>
                                    <span className="text-white">${purchaseDetails.totalDeduction.toFixed(2)} USDC</span>
                                </div>
                            </div>
                        )}

                        {/* Transaction hash + explorer */}
                        {txResult && (
                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] text-slate-500 uppercase tracking-wider">Transaction</Label>
                                    <CopyableHash hash={txResult.transactionHash} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Shield className="h-3 w-3 text-emerald-400" />
                                        <span className="text-[10px] text-slate-500">
                                            Verified on the Stellar blockchain
                                        </span>
                                    </div>
                                    <TransactionLink
                                        hash={txResult.transactionHash}
                                        label="Explorer"
                                        variant="link"
                                        className="text-[10px] h-auto p-0 text-blue-400/70 hover:text-blue-400"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <DialogFooter className="flex-col gap-2 sm:flex-col">
                            <Button
                                onClick={() => { handleClose(); window.location.href = '/portfolio'; }}
                                className="w-full bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white"
                            >
                                View Portfolio
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={handleClose}
                                className="w-full text-slate-400 hover:text-white hover:bg-white/[0.04]"
                            >
                                Close
                            </Button>
                        </DialogFooter>
                    </div>
                ) : step === 'error' ? (
                    /* ─── ERROR RECOVERY ─── */
                    <div className="py-6 space-y-4">
                        <div className="text-center space-y-3">
                            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                                <AlertTriangle className="h-7 w-7 text-amber-400" />
                            </div>
                            <div className="space-y-1">
                                <p className="font-semibold text-white">
                                    {submissionError && (isTimeoutError(submissionError) || isCongestionError(submissionError))
                                        ? 'The network is busy'
                                        : 'Something went wrong'
                                    }
                                </p>
                                <p className="text-sm text-slate-400 max-w-xs mx-auto">
                                    {submissionError && isCongestionError(submissionError)
                                        ? 'Multiple transactions are competing for space on the blockchain. Please wait a moment and try again.'
                                        : submissionError && isTimeoutError(submissionError)
                                            ? 'Your transaction took longer than expected. This happens occasionally and your funds have not been charged.'
                                            : 'We couldn\'t complete your transaction. No funds were deducted from your wallet.'
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Reassurance card */}
                        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                            <div className="flex items-start gap-2">
                                <Shield className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                <div className="text-xs text-slate-400">
                                    <p className="font-medium text-emerald-400 mb-0.5">Your funds are safe</p>
                                    <p>The investment was not finalized. You can try again or come back later — nothing has been charged.</p>
                                </div>
                            </div>
                        </div>

                        {/* Purchase context */}
                        {purchaseDetails && (
                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Attempted</span>
                                    <span className="text-white">
                                        {purchaseDetails.tokensReceived.toFixed(2)} {purchaseDetails.assetCode} · ${purchaseDetails.totalDeduction.toFixed(2)} USDC
                                    </span>
                                </div>
                            </div>
                        )}

                        <DialogFooter className="flex-col gap-2 sm:flex-col">
                            <Button
                                onClick={handleRetry}
                                disabled={loading}
                                className="w-full bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_50%)] text-slate-900 font-medium"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Retrying...
                                    </>
                                ) : 'Try Again'}
                            </Button>
                            {txResult && (
                                <TransactionLink
                                    hash={txResult.transactionHash}
                                    label="View on Stellar Explorer"
                                    variant="ghost"
                                    className="w-full text-blue-400/70 hover:text-blue-400"
                                />
                            )}
                            <Button
                                variant="ghost"
                                onClick={handleClose}
                                className="w-full text-slate-400 hover:text-white hover:bg-white/[0.04]"
                            >
                                Close
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    /* ─── INVESTMENT FORM ─── */
                    <div className="grid gap-4 py-4">
                        {/* WALLET BALANCE STRIP */}
                        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                            <div className="flex items-center gap-2">
                                <Wallet className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                                <span className="text-sm text-muted-foreground">USDC Balance</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                    {balanceLoading ? (
                                        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                            <span className="animate-pulse">•</span>
                                            <span className="animate-pulse" style={{ animationDelay: '150ms' }}>•</span>
                                            <span className="animate-pulse" style={{ animationDelay: '300ms' }}>•</span>
                                        </span>
                                    ) : usdcBalance !== null ? (
                                        <span className="text-[hsl(43_45%_55%)]">${usdcBalance.toFixed(2)}</span>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </span>
                                <button
                                    onClick={() => { handleClose(); window.location.href = '/wallet'; }}
                                    className="text-xs text-muted-foreground hover:text-[hsl(43_45%_55%)] transition-colors flex items-center gap-0.5"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="amount">Amount (USDC)</Label>
                            <Input
                                id="amount"
                                type="number"
                                placeholder={minInvestment ? `Min: ${minInvestment} USDC` : '1000.00'}
                                className="bg-slate-950 border-slate-800 text-white"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />

                            {/* Quick-pick amounts */}
                            <div className="flex gap-2">
                                {QUICK_AMOUNTS.map(qa => (
                                    <button
                                        key={qa}
                                        onClick={() => setAmount(qa.toString())}
                                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${amount === qa.toString()
                                            ? 'bg-[hsl(43_45%_55%/0.2)] text-[hsl(43_45%_55%)] border-[hsl(43_45%_55%/0.4)]'
                                            : 'bg-white/[0.03] text-muted-foreground border-white/10 hover:bg-white/[0.06]'
                                            }`}
                                    >
                                        ${qa >= 1000 ? `${qa / 1000}K` : qa}
                                    </button>
                                ))}
                            </div>

                            {/* Fee breakdown */}
                            {isValidAmount && !isBelowMin && !isAboveMax && (
                                <div className="mt-1 space-y-1.5 p-3 rounded-lg bg-white/[0.03] border border-white/8">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Tokens received</span>
                                        <span className="text-emerald-400 font-medium">
                                            ~{tokensReceived.toFixed(2)} {offer.asset_code}
                                        </span>
                                    </div>
                                    {processingFee > 0 ? (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Processing fee</span>
                                            <span className="text-slate-400">+{processingFee} USDC</span>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Fees</span>
                                            <span className="text-emerald-400">Sponsored — enjoy!</span>
                                        </div>
                                    )}
                                    <div className="border-t border-white/10 pt-1.5 flex justify-between text-xs font-semibold">
                                        <span className="text-white">Total deduction</span>
                                        <span className="text-white">{totalDeduction.toFixed(2)} USDC</span>
                                    </div>

                                    {/* Balance after */}
                                    {usdcBalance !== null && !hasInsufficientFunds && (
                                        <div className="flex justify-between text-xs pt-0.5">
                                            <span className="text-muted-foreground">Balance after</span>
                                            <span className="text-slate-500">${(usdcBalance - totalDeduction).toFixed(2)}</span>
                                        </div>
                                    )}

                                    {/* Yield projection rows */}
                                    {(() => {
                                        const rate = getEffectiveRate(offer.investor_rate ?? null, offer.annual_interest_rate ?? null);
                                        const paymentType = offer.payment_type || 'monthly';
                                        const isBulletPayment = paymentType === 'bullet';
                                        if (rate === 0) return null;

                                        const yieldAmt = computePeriodicYield(parsedAmount, rate, paymentType);
                                        const totalRet = computeTotalReturn(parsedAmount, rate, offer.maturity_date);
                                        const periodSuffix = PERIOD_LABELS[paymentType] || '/yr';

                                        return (
                                            <>
                                                <div className="border-t border-white/8 pt-1.5 mt-1.5" />
                                                {!isBulletPayment && yieldAmt > 0 && (
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-muted-foreground">Projected yield</span>
                                                        <span className="text-emerald-400 font-medium">
                                                            ${yieldAmt.toFixed(2)}{periodSuffix}
                                                        </span>
                                                    </div>
                                                )}
                                                {isBulletPayment && totalRet && (
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-muted-foreground">Bullet payout at maturity</span>
                                                        <span className="text-emerald-400 font-medium">
                                                            +${totalRet.totalInterest.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                                {!isBulletPayment && totalRet && (
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-muted-foreground">At maturity</span>
                                                        <span className="text-emerald-400 font-medium">
                                                            +${totalRet.totalInterest.toFixed(2)} ({((totalRet.totalInterest / parsedAmount) * 100).toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Insufficient funds warning */}
                            {hasInsufficientFunds && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                                    <div className="text-xs space-y-1">
                                        <p className="text-red-400 font-medium">Insufficient USDC</p>
                                        <p className="text-red-300/70">
                                            You need <strong>${shortfall.toFixed(2)}</strong> more.{' '}
                                            <button
                                                onClick={() => { handleClose(); window.location.href = '/wallet'; }}
                                                className="underline hover:text-red-300 transition-colors"
                                            >
                                                Deposit funds
                                            </button>
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Min/Max/Supply validation */}
                            <div className="space-y-1">
                                {isBelowMin && (
                                    <p className="text-xs text-yellow-400">
                                        Minimum investment: ${minInvestment!.toLocaleString()} USDC
                                    </p>
                                )}
                                {isAboveMax && (
                                    <p className="text-xs text-yellow-400">
                                        Maximum investment: ${maxInvestment!.toLocaleString()} USDC
                                    </p>
                                )}
                                {isAboveRemaining && !isFullySubscribed && (
                                    <p className="text-xs text-orange-400">
                                        Only ${remainingUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC remaining in this offer ({remainingTokens.toFixed(0)} tokens)
                                    </p>
                                )}
                                {isFullySubscribed && (
                                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                                        <p className="text-xs text-red-400 font-medium">This offer is fully subscribed. No tokens remaining.</p>
                                    </div>
                                )}
                                {isPastCutoff && (
                                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                                        <p className="text-xs text-red-400 font-medium">
                                            This offer is no longer accepting investments — it is too close to maturity.
                                        </p>
                                    </div>
                                )}
                                {isNearCutoff && !isPastCutoff && (
                                    <p className="text-xs text-amber-400">
                                        ⏳ Investment window closes in {daysUntilCutoff} days. Act soon.
                                    </p>
                                )}
                            </div>
                        </div>
                        {(error || signingError) && <p className="text-red-400 text-sm text-center">{signingError || error}</p>}
                        <DialogFooter>
                            <Button
                                type="submit"
                                disabled={!canSubmit}
                                onClick={handleInvest}
                                className="w-full bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white disabled:opacity-40"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Processing...
                                    </>
                                ) : 'Confirm Investment'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
