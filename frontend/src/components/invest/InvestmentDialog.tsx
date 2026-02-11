import { useState } from 'react';
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
import { QRCode } from "@/components/ui/qrcode";
import { useInvestment } from '@/hooks/useInvestment';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useInvestmentFees } from '@/hooks/useInvestmentFees';
import { Copy, Check, AlertTriangle, Settings, Wallet, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';
import { authStorage } from '@/utils/authStorage';
import { passkeyClient } from '@/lib/passkey';

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
    };
    trigger?: React.ReactNode;
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button
            size="sm"
            variant="ghost"
            className={`h-6 px-2 ${className}`}
            onClick={handleCopy}
        >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            <span className="ml-1">{copied ? 'Copied!' : 'Copy'}</span>
        </Button>
    );
}

export function InvestmentDialog({ offer, trigger }: InvestmentDialogProps) {
    const [amount, setAmount] = useState('');
    const [open, setOpen] = useState(false);
    const [instructions, setInstructions] = useState<any>(null);
    const [step, setStep] = useState<'form' | 'signing' | 'success'>('form');
    const [txResult, setTxResult] = useState<{ investmentId: number; transactionHash: string } | null>(null);
    const [signingError, setSigningError] = useState<string | null>(null);
    const { purchase, submitSignedTx, loading, error } = useInvestment();
    const { usdcBalance, loading: balanceLoading, refresh: refreshBalance } = useWalletBalance();
    const { blockchainFee } = useInvestmentFees();

    // KYC gate — check before showing the investment form
    const user = authStorage.getUser<{ kycStatus?: string }>('investor') || {};
    const kycApproved = user.kycStatus === 'approved';

    // Offer rules — min/max investment amounts
    const rules = offer.offer_rules || {};
    const minInvestment = rules.min_investment ? Number(rules.min_investment) : undefined;
    const maxInvestment = rules.max_investment ? Number(rules.max_investment) : undefined;

    // HIG Entering Data: dynamic validation
    const parsedAmount = parseFloat(amount);
    const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
    const isBelowMin = minInvestment !== undefined && isValidAmount && parsedAmount < minInvestment;
    const isAboveMax = maxInvestment !== undefined && isValidAmount && parsedAmount > maxInvestment;

    // Remaining supply guard rail
    const unitPrice = offer.unit_price || 1;
    const totalSupply = offer.total_supply ?? 0;
    const tokensSold = offer.tokens_sold ?? 0;
    const remainingTokens = totalSupply - tokensSold;
    const remainingUsdc = remainingTokens * unitPrice;
    const isFullySubscribed = totalSupply > 0 && remainingTokens <= 0;
    const isAboveRemaining = totalSupply > 0 && isValidAmount && parsedAmount > remainingUsdc;

    // Maturity cutoff guard rail
    const cutoffDate = offer.investment_cutoff_date ? new Date(offer.investment_cutoff_date) : null;
    const isPastCutoff = cutoffDate ? new Date() >= cutoffDate : false;
    const daysUntilCutoff = cutoffDate ? Math.ceil((cutoffDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
    const isNearCutoff = daysUntilCutoff !== null && daysUntilCutoff > 0 && daysUntilCutoff <= 30;

    // Fee calculations
    const totalDeduction = isValidAmount ? parsedAmount + blockchainFee : 0;
    const tokensReceived = isValidAmount ? parsedAmount / unitPrice : 0;
    const hasInsufficientFunds = usdcBalance !== null && isValidAmount && totalDeduction > usdcBalance;
    const shortfall = hasInsufficientFunds ? totalDeduction - (usdcBalance || 0) : 0;

    const canSubmit = isValidAmount && !isBelowMin && !isAboveMax && !isAboveRemaining && !isFullySubscribed && !isPastCutoff && !loading && !hasInsufficientFunds;

    const handleInvest = async () => {
        try {
            const usdcAmount = parseFloat(amount);
            if (isNaN(usdcAmount) || usdcAmount <= 0) return;

            const result = await purchase(offer.id, usdcAmount, offer.asset_code);

            if (result && result.transaction) {
                // Smart wallet flow — sign with passkey and submit
                setStep('signing');
                setSigningError(null);
                try {
                    const signedXdr = await passkeyClient.signTransaction(result.transaction.xdr, result.transaction.walletId);
                    const submitResult = await submitSignedTx(signedXdr, result.investment.id);
                    setTxResult(submitResult);
                    setStep('success');
                    refreshBalance();
                } catch (signErr: any) {
                    console.error('Passkey signing failed:', signErr);
                    setSigningError(signErr.message || 'Failed to sign transaction');
                    setStep('form');
                }
            } else if (result && result.paymentInstructions) {
                // Legacy flow — manual USDC transfer
                setInstructions(result.paymentInstructions);
            } else {
                setOpen(false);
                alert('Investment initiated! Please check your transactions.');
            }
        } catch (e) {
            // Error handled by hook
        }
    };

    const handleClose = () => {
        setOpen(false);
        setInstructions(null);
        setAmount('');
        setStep('form');
        setTxResult(null);
        setSigningError(null);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => val ? setOpen(true) : handleClose()}>
            <DialogTrigger asChild>
                {trigger || <Button>Invest Now</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-800 text-white">
                <DialogHeader>
                    <DialogTitle>Invest in {offer.offer_name}</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {step === 'success'
                            ? "Your investment has been confirmed."
                            : step === 'signing'
                                ? "Sign the transaction with your passkey."
                                : instructions
                                    ? "Complete your investment by sending payment."
                                    : "Enter the amount of USDC you wish to invest."}
                    </DialogDescription>
                </DialogHeader>

                {/* KYC Gate — HIG Modality: prevent lost work by gating early */}
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
                ) : step === 'signing' ? (
                    // SIGNING STATE — passkey prompt
                    <div className="py-12 text-center space-y-4">
                        <Loader2 className="h-10 w-10 text-blue-400 mx-auto animate-spin" />
                        <div className="space-y-1">
                            <p className="font-semibold text-white">Confirm with your Passkey</p>
                            <p className="text-sm text-slate-400">
                                Use your biometric (Face ID, fingerprint) to authorize this transaction.
                            </p>
                        </div>
                    </div>
                ) : step === 'success' ? (
                    // SUCCESS STATE — investment confirmed
                    <div className="py-8 text-center space-y-4">
                        <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
                        <div className="space-y-1">
                            <p className="font-semibold text-lg text-white">Investment Confirmed!</p>
                            <p className="text-sm text-slate-400">
                                Your USDC has been transferred. Token distribution will follow shortly.
                            </p>
                        </div>
                        {txResult && (
                            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-left">
                                <Label className="text-xs text-slate-500 uppercase">Transaction Hash</Label>
                                <code className="text-xs text-blue-400 break-all block mt-1">
                                    {txResult.transactionHash}
                                </code>
                            </div>
                        )}
                        <p className="text-xs text-slate-500">
                            You can track your investment status on your Portfolio page.
                        </p>
                        <DialogFooter>
                            <Button
                                onClick={() => { handleClose(); window.location.href = '/portfolio'; }}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                View Portfolio
                            </Button>
                        </DialogFooter>
                    </div>
                ) : !instructions ? (
                    // STEP 1: AMOUNT INPUT
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

                            {/* HIG Entering Data: quick-pick amounts */}
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

                            {/* FEE BREAKDOWN */}
                            {isValidAmount && !isBelowMin && !isAboveMax && (
                                <div className="mt-1 space-y-1.5 p-3 rounded-lg bg-white/[0.03] border border-white/8">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Tokens received</span>
                                        <span className="text-emerald-400 font-medium">
                                            ~{tokensReceived.toFixed(2)} {offer.asset_code}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Blockchain fee</span>
                                        <span className="text-slate-400">+{blockchainFee} USDC</span>
                                    </div>
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
                ) : (
                    // STEP 2: PAYMENT INSTRUCTIONS with MEMO and QR CODE
                    <div className="space-y-4 py-4">
                        {/* CHAIN WARNING */}
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">
                            <p className="font-semibold text-red-400 flex items-center gap-2">
                                ⚠️ Critical Warning
                            </p>
                            <p className="text-slate-300 mt-1">
                                Send <strong>Stellar Network USDC</strong> only. Do NOT send from Ethereum/Solana.
                            </p>
                        </div>

                        {/* QR CODE - Centered */}
                        <div className="flex flex-col items-center space-y-2">
                            <QRCode value={instructions.treasuryAddress} size={150} />
                            <p className="text-xs text-slate-500">Scan to get deposit address</p>
                        </div>

                        <div className="space-y-3">
                            {/* Treasury Address - FULL, not truncated */}
                            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                                <div className="flex items-center justify-between mb-1">
                                    <Label className="text-xs text-slate-500 uppercase">Deposit Address</Label>
                                    <CopyButton text={instructions.treasuryAddress} />
                                </div>
                                <code className="text-xs text-blue-400 break-all block mt-1">
                                    {instructions.treasuryAddress}
                                </code>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                                    <Label className="text-xs text-slate-500 uppercase">Total Amount</Label>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="font-bold text-white">{instructions.requiredAmount} USDC</span>
                                    </div>
                                    {instructions.blockchainFee && (
                                        <p className="text-[10px] text-slate-500 mt-1">
                                            Includes {instructions.blockchainFee} USDC fee
                                        </p>
                                    )}
                                </div>

                                {/* MEMO DISPLAY is CRITICAL */}
                                <div className="p-3 bg-yellow-900/20 rounded-lg border border-yellow-700/50">
                                    <div className="flex items-center justify-between mb-1">
                                        <Label className="text-xs text-yellow-500 uppercase font-bold">REQUIRED MEMO</Label>
                                        <CopyButton text={instructions.memo} className="text-yellow-500 hover:text-yellow-400" />
                                    </div>
                                    <code className="font-bold text-yellow-400 text-lg">{instructions.memo}</code>
                                </div>
                            </div>

                            <p className="text-xs text-center text-slate-500 mt-2">
                                You must include the Memo or your deposit will not be credited.
                            </p>
                        </div>

                        <DialogFooter>
                            <Button onClick={handleClose} className="w-full bg-slate-800 hover:bg-slate-700 text-white">
                                I have sent the payment
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
