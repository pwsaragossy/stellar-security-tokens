
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
    const { purchase, loading, error } = useInvestment();

    const handleInvest = async () => {
        try {
            const usdcAmount = parseFloat(amount);
            if (isNaN(usdcAmount) || usdcAmount <= 0) return;

            await purchase(offer.id, usdcAmount, offer.asset_code);
            setOpen(false);
            // Ideally trigger a toast or refresh
            alert('Investment initiated! Please check your transactions.');
        } catch (e) {
            // Error handled by hook
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || <Button>Invest Now</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-white">
                <DialogHeader>
                    <DialogTitle>Invest in {offer.offer_name}</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Enter the amount of USDC you wish to invest.
                        Exchange Rate: 1 USDC = 1 {offer.asset_code}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="amount" className="text-right">
                            Amount
                        </Label>
                        <Input
                            id="amount"
                            type="number"
                            placeholder="1000.00"
                            className="col-span-3 bg-slate-950 border-slate-800 text-white"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                </div>
                <DialogFooter>
                    <Button type="submit" disabled={loading} onClick={handleInvest} className="bg-blue-600 hover:bg-blue-500 text-white">
                        {loading ? 'Processing...' : 'Confirm Integration'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
