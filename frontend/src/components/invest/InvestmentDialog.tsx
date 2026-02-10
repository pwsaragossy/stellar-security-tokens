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
import { Copy, Check, AlertTriangle, Settings } from 'lucide-react';
import { authStorage } from '@/utils/authStorage';

interface InvestmentDialogProps {
    offer: {
        id: number;
        offer_name: string;
        asset_code: string;
        unit_price?: number;
        offer_rules?: Record<string, any>;
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
    const { purchase, loading, error } = useInvestment();

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
    const canSubmit = isValidAmount && !isBelowMin && !isAboveMax && !loading;

    const handleInvest = async () => {
        try {
            const usdcAmount = parseFloat(amount);
            if (isNaN(usdcAmount) || usdcAmount <= 0) return;

            const result = await purchase(offer.id, usdcAmount, offer.asset_code);

            if (result && result.paymentInstructions) {
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
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
            <DialogTrigger asChild>
                {trigger || <Button>Invest Now</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-800 text-white">
                <DialogHeader>
                    <DialogTitle>Invest in {offer.offer_name}</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {instructions ? "Complete your investment by sending payment." : "Enter the amount of USDC you wish to invest."}
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
                ) : !instructions ? (
                    // STEP 1: AMOUNT INPUT
                    <div className="grid gap-4 py-4">
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

                            {/* Dynamic validation feedback */}
                            <div className="space-y-1">
                                <p className="text-xs text-slate-500">
                                    Exchange Rate: {offer.unit_price || 1} USDC = 1 {offer.asset_code}
                                </p>
                                {isValidAmount && !isBelowMin && !isAboveMax && (
                                    <p className="text-xs text-emerald-400 font-medium">
                                        You'll receive ~{(parsedAmount / (offer.unit_price || 1)).toFixed(2)} {offer.asset_code} tokens
                                    </p>
                                )}
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
                            </div>
                        </div>
                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                        <DialogFooter>
                            <Button
                                type="submit"
                                disabled={!canSubmit}
                                onClick={handleInvest}
                                className="w-full bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white disabled:opacity-40"
                            >
                                {loading ? 'Processing...' : 'Confirm Investment'}
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
                                    <Label className="text-xs text-slate-500 uppercase">Amount</Label>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="font-bold text-white">{instructions.requiredAmount} USDC</span>
                                    </div>
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
