
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
import { useInvestment } from '@/hooks/useInvestment';

interface InvestmentDialogProps {
    offer: {
        id: number;
        offer_name: string;
        asset_code: string;
    };
    trigger?: React.ReactNode;
}

export function InvestmentDialog({ offer, trigger }: InvestmentDialogProps) {
    const [amount, setAmount] = useState('');
    const [open, setOpen] = useState(false);
    const [instructions, setInstructions] = useState<any>(null); // State for payment instructions
    const { purchase, loading, error } = useInvestment();

    const handleInvest = async () => {
        try {
            const usdcAmount = parseFloat(amount);
            if (isNaN(usdcAmount) || usdcAmount <= 0) return;

            const result = await purchase(offer.id, usdcAmount, offer.asset_code);

            // If we receive payment instructions (202 Accepted), show them
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

                {!instructions ? (
                    // STEP 1: AMOUNT INPUT
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="amount">Amount (USDC)</Label>
                            <Input
                                id="amount"
                                type="number"
                                placeholder="1000.00"
                                className="bg-slate-950 border-slate-800 text-white"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">Exchange Rate: 1 USDC = 1 {offer.asset_code}</p>
                        </div>
                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                        <DialogFooter>
                            <Button type="submit" disabled={loading || !amount} onClick={handleInvest} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                                {loading ? 'Processing...' : 'Confirm Integration'}
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    // STEP 2: PAYMENT INSTRUCTIONS with MEMO
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

                        <div className="space-y-3">
                            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                                <Label className="text-xs text-slate-500 uppercase">Deposit Address</Label>
                                <div className="flex items-center justify-between mt-1">
                                    <code className="text-sm text-blue-400 break-all">{instructions.treasuryAddress}</code>
                                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => navigator.clipboard.writeText(instructions.treasuryAddress)}>Copy</Button>
                                </div>
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
                                    <Label className="text-xs text-yellow-500 uppercase font-bold">REQUIRED MEMO</Label>
                                    <div className="flex items-center justify-between mt-1">
                                        <code className="font-bold text-yellow-400 text-lg">{instructions.memo}</code>
                                        <Button size="sm" variant="ghost" className="h-6 px-2 text-yellow-500 hover:text-yellow-400" onClick={() => navigator.clipboard.writeText(instructions.memo)}>Copy</Button>
                                    </div>
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
