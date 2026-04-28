import { useState, useMemo } from 'react';
import { Calculator, Info } from 'lucide-react';
import { useInvestmentFees } from '@/hooks/useInvestmentFees';
import {
    getEffectiveRate,
    computePeriodicYield,
    computeTotalReturn,
    computeIRR,
    PERIOD_LABELS,
} from '@/utils/offerCalculations';

interface InvestmentCalculatorProps {
    offer: {
        id: number;
        investor_rate?: number | null;
        annual_interest_rate?: number | null;
        payment_type?: string | null;
        maturity_date?: string | null;
        unit_price?: number;
        asset_code?: string;
        offer_type?: 'collateral' | 'sale';
    };
}

const QUICK_AMOUNTS = [100, 500, 1_000, 5_000, 10_000];

export function InvestmentCalculator({ offer }: InvestmentCalculatorProps) {
    const [amount, setAmount] = useState<string>('');
    const { processingFee } = useInvestmentFees();

    const effectiveRate = getEffectiveRate(
        offer.investor_rate ?? null,
        offer.annual_interest_rate ?? null,
    );
    const paymentType = offer.payment_type || 'monthly';
    const unitPrice = offer.unit_price || 1;
    const isBullet = paymentType === 'bullet';
    const isPerpetual = !offer.maturity_date;

    // ─── Edge case: matured offer ───
    const isMatured = useMemo(() => {
        if (!offer.maturity_date) return false;
        return new Date(offer.maturity_date).getTime() <= Date.now();
    }, [offer.maturity_date]);

    // ─── Edge case: zero rate ───
    if (effectiveRate === 0) {
        return (
            <div className="rounded-xl bg-white/[0.02] border border-white/8 p-5 animate-fade-in-up">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="p-2 rounded-lg bg-[hsl(43_45%_55%/0.1)]">
                        <Calculator className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">Investment Calculator</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                    This offer does not distribute periodic yield.
                </p>
            </div>
        );
    }

    // ─── Edge case: matured ───
    if (isMatured) {
        return (
            <div className="rounded-xl bg-white/[0.02] border border-white/8 p-5 animate-fade-in-up">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="p-2 rounded-lg bg-[hsl(43_45%_55%/0.1)]">
                        <Calculator className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">Investment Calculator</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                    This offer has matured — no new investments are being accepted.
                </p>
            </div>
        );
    }

    const parsedAmount = parseFloat(amount) || 0;
    const isValidAmount = parsedAmount > 0;

    const periodicYield = computePeriodicYield(parsedAmount, effectiveRate, paymentType);
    const totalReturn = computeTotalReturn(parsedAmount, effectiveRate, offer.maturity_date);
    const tokensReceived = parsedAmount / unitPrice;
    const periodLabel = PERIOD_LABELS[paymentType] || '/yr';

    // Phase 3: IRR — only for debt/collateral with maturity
    const irr = computeIRR(
        unitPrice, effectiveRate, paymentType,
        offer.maturity_date ?? null,
        offer.offer_type || 'sale',
    );

    return (
        <div className="rounded-xl bg-white/[0.02] border border-white/8 p-5 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 rounded-lg bg-[hsl(43_45%_55%/0.1)]">
                    <Calculator className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                </div>
                <h3 className="text-sm font-semibold text-white">Investment Calculator</h3>
                <span className="ml-auto text-xs text-muted-foreground">{effectiveRate}% APY</span>
            </div>

            {/* Amount input */}
            <div className="relative mb-3">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-7 pr-16 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(43_45%_55%/0.5)] focus:ring-1 focus:ring-[hsl(43_45%_55%/0.2)] transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDC</span>
            </div>

            {/* Quick amount buttons */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {QUICK_AMOUNTS.map((qa) => (
                    <button
                        key={qa}
                        onClick={() => setAmount(qa.toString())}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            parsedAmount === qa
                                ? 'bg-[hsl(43_45%_55%/0.2)] text-[hsl(43_45%_55%)] border border-[hsl(43_45%_55%/0.3)]'
                                : 'bg-white/[0.04] text-muted-foreground border border-white/8 hover:bg-white/[0.06] hover:text-white'
                        }`}
                    >
                        ${qa >= 1000 ? `${qa / 1000}K` : qa}
                    </button>
                ))}
            </div>

            {/* Results grid */}
            {isValidAmount && (
                <div className="space-y-3 animate-fade-in">
                    {/* Metrics row */}
                    <div className={`grid gap-3 ${!isBullet && totalReturn && !isPerpetual ? 'grid-cols-3' : isBullet || isPerpetual ? 'grid-cols-2' : 'grid-cols-2'}`}>
                        {/* You invest */}
                        <div className="rounded-lg bg-white/[0.03] border border-white/8 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">You Invest</p>
                            <p className="text-sm font-semibold text-white">${parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{tokensReceived.toFixed(2)} {offer.asset_code || 'tokens'}</p>
                        </div>

                        {/* Periodic yield (not for bullet) */}
                        {!isBullet && (
                            <div className="rounded-lg bg-white/[0.03] border border-white/8 p-3">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Per Period</p>
                                <p className="text-sm font-semibold text-emerald-400">${periodicYield.toFixed(2)}{periodLabel}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{effectiveRate}% APY</p>
                            </div>
                        )}

                        {/* Bullet payout */}
                        {isBullet && totalReturn && (
                            <div className="rounded-lg bg-white/[0.03] border border-white/8 p-3">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">At Maturity</p>
                                <p className="text-sm font-semibold text-emerald-400">+${totalReturn.totalInterest.toFixed(2)}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Bullet payout</p>
                            </div>
                        )}

                        {/* Projected return (non-bullet, non-perpetual) */}
                        {!isBullet && totalReturn && !isPerpetual && (
                            <div className="rounded-lg bg-white/[0.03] border border-white/8 p-3">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Projected Return</p>
                                <p className="text-sm font-semibold text-emerald-400">
                                    +${totalReturn.totalInterest.toFixed(2)}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    +{((totalReturn.totalInterest / parsedAmount) * 100).toFixed(1)}% total
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Fee + token info */}
                    <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            Tokens received: {tokensReceived.toFixed(2)} {offer.asset_code || 'tokens'}
                        </div>
                        {processingFee > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                Processing fee: ${processingFee.toFixed(2)} USDC (charged separately)
                            </div>
                        )}
                        {processingFee > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                Fee does not reduce your invested amount
                            </div>
                        )}
                    </div>
                    {irr !== null && (
                        <div className="flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-emerald-400/40" />
                            <span className="text-muted-foreground">IRR:</span>
                            <span className="text-emerald-400 font-medium">{irr}%</span>
                            <span className="text-muted-foreground/50 text-[10px]">(accounts for cash flow timing)</span>
                        </div>
                    )}

                    {/* Disclaimer */}
                    <div className="flex items-start gap-2 pt-2 border-t border-white/5">
                        <Info className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                            Projected returns are estimates based on current rate and time to maturity. Actual yield calculated from your investment date.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
