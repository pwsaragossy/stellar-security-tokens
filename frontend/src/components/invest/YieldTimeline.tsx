import { useState, useEffect } from 'react';
import { Banknote, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';

interface YieldTimelineProps {
    offerId: number;
}

interface PaymentRecord {
    id: string;
    type: string;
    amount: number;
    date: string;
    status: string;
    txHash: string | null;
    details: { paymentType?: string; isBullet?: boolean } | null;
}

const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/tx';

export function YieldTimeline({ offerId }: YieldTimelineProps) {
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);

    // Only render for authenticated investors
    const investor = authStorage.getUser<{ id: number }>('investor');
    const investorId = investor?.id;

    useEffect(() => {
        if (!investorId) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function fetchPayments() {
            try {
                const res = await api.get(
                    `/investors/${investorId}/payments?offerId=${offerId}&type=interest&limit=20`
                );
                if (!cancelled && res?.data?.transactions) {
                    setPayments(res.data.transactions);
                }
            } catch {
                // Silently fail — section just won't render
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchPayments();
        return () => { cancelled = true; };
    }, [investorId, offerId]);

    // Don't render if not authenticated, loading, or no payments
    if (!investorId || loading || payments.length === 0) return null;

    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center gap-3 pt-8 pb-4">
                <span className="text-muted-foreground/50"><Banknote className="h-3.5 w-3.5" /></span>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Your Yield Payments
                </h3>
                <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Timeline */}
            <div className="relative pl-5">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-emerald-400/40 via-emerald-400/20 to-transparent" />

                <div className="space-y-0">
                    {payments.map((payment, i) => (
                        <div key={payment.id} className="relative flex items-start gap-4 py-2.5 group">
                            {/* Dot */}
                            <div className={`absolute left-[-17px] top-3.5 w-2.5 h-2.5 rounded-full border-2 transition-colors ${
                                i === 0
                                    ? 'bg-emerald-400 border-emerald-400 shadow-[0_0_6px_hsl(160_60%_40%/0.4)]'
                                    : 'bg-transparent border-white/20 group-hover:border-emerald-400/50'
                            }`} />

                            {/* Content */}
                            <div className="flex-1 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        ${payment.amount.toFixed(2)}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {new Date(payment.date).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}
                                        {payment.details?.paymentType && (
                                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-white/8 text-muted-foreground/70 capitalize">
                                                {payment.details.isBullet ? 'bullet' : payment.details.paymentType}
                                            </span>
                                        )}
                                    </p>
                                </div>

                                {/* Tx link */}
                                {payment.txHash && (
                                    <a
                                        href={`${EXPLORER_BASE}/${payment.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-[hsl(43_45%_55%)] transition-colors shrink-0"
                                    >
                                        View tx
                                        <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Summary */}
                <div className="relative flex items-center gap-4 pt-3 mt-1 border-t border-white/5">
                    <div className="absolute left-[-17px] top-5 w-2.5 h-2.5 rounded-full border-2 border-white/10 bg-transparent" />
                    <p className="text-xs text-muted-foreground">
                        {payments.length} payment{payments.length !== 1 ? 's' : ''} · <span className="text-emerald-400 font-medium">${totalPaid.toFixed(2)}</span> total
                    </p>
                </div>
            </div>
        </div>
    );
}
