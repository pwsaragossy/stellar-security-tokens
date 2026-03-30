import { DetailRow, DetailSection } from '../shared';
import { OfferPipelineStepper } from '../OfferPipelineStepper';

interface OfferDetailProps {
    raw: any;
    platformFee: number;
    onPlatformFeeChange?: (fee: number) => void;
}

export function OfferDetail({ raw, platformFee, onPlatformFeeChange }: OfferDetailProps) {
    const annualRate = parseFloat(raw.annual_interest_rate || raw.annualInterestRate || 0);
    const investorRate = Math.max(0, annualRate - platformFee);
    const isPending = raw.status === 'pending_review' || raw.status === 'under_review';

    return (
        <>
            <OfferPipelineStepper currentStep="review" offerName={raw.offer_name} assetCode={raw.asset_code} />
            <DetailSection title="Offer Info">
                <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Name" value={raw.offer_name} />
                    <DetailRow label="Asset Code" value={raw.asset_code} />
                    <DetailRow label="Type" value={raw.offer_type} />
                    <DetailRow label="Status" value={raw.status?.replace(/_/g, ' ')} />
                    <DetailRow label="Total Supply" value={raw.total_supply} />
                    <DetailRow
                        label="Interest Rate"
                        value={annualRate ? `${annualRate}%` : '—'}
                    />
                    {raw.payment_type && <DetailRow label="Payment Type" value={raw.payment_type} />}
                    {raw.maturity_date && (
                        <DetailRow label="Maturity" value={new Date(raw.maturity_date).toLocaleDateString()} />
                    )}
                </div>
            </DetailSection>

            {/* ── Platform Fee & Yield Spread (editable during review) ── */}
            {isPending && annualRate > 0 && (
                <DetailSection title="Yield Spread Configuration">
                    <div className="space-y-4">
                        {/* Platform Fee Input */}
                        <div>
                            <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">
                                Platform Fee (%)
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="0"
                                    max={annualRate}
                                    step="0.1"
                                    value={platformFee}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const clamped = Math.min(Math.max(0, val), annualRate);
                                        onPlatformFeeChange?.(clamped);
                                    }}
                                    className="w-24 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-colors"
                                />
                                <span className="text-sm text-zinc-400">% of company rate goes to platform</span>
                            </div>
                        </div>

                        {/* Visual Breakdown */}
                        <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-4 space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-400">Company Rate</span>
                                <span className="text-white font-mono font-semibold">{annualRate}%</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-400">Platform Fee</span>
                                <span className="text-purple-400 font-mono font-semibold">
                                    −{platformFee}%
                                </span>
                            </div>
                            <div className="border-t border-zinc-700/50 my-1" />
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-400">Investor APY</span>
                                <span className="text-emerald-400 font-mono font-bold text-base">
                                    {investorRate.toFixed(1)}%
                                </span>
                            </div>
                        </div>

                        {platformFee === 0 && (
                            <p className="text-[11px] text-amber-400/80">
                                ⚠ Platform fee is 0% — no yield spread revenue on this offer.
                            </p>
                        )}
                    </div>
                </DetailSection>
            )}

            {/* Show read-only yield spread for already-approved offers */}
            {!isPending && raw.investor_rate != null && annualRate > 0 && (
                <DetailSection title="Yield Spread">
                    <div className="grid grid-cols-3 gap-4">
                        <DetailRow label="Company Rate" value={`${annualRate}%`} />
                        <DetailRow label="Platform Fee" value={`${(annualRate - parseFloat(raw.investor_rate)).toFixed(1)}%`} />
                        <DetailRow label="Investor APY" value={`${parseFloat(raw.investor_rate)}%`} />
                    </div>
                </DetailSection>
            )}

            {raw.company && (
                <DetailSection title="Issuing Company">
                    <div className="grid grid-cols-2 gap-4">
                        <DetailRow label="Company" value={raw.company.name} />
                        <DetailRow label="CNPJ" value={raw.company.cnpj} />
                    </div>
                </DetailSection>
            )}
            {raw.description && (
                <DetailSection title="Description">
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{raw.description}</p>
                </DetailSection>
            )}
            {raw.due_diligence_notes && (
                <DetailSection title="Due Diligence Notes">
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{raw.due_diligence_notes}</p>
                </DetailSection>
            )}
        </>
    );
}
