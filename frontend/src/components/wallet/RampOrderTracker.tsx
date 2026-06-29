import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2, Check,
    X, ChevronDown, ChevronUp, RefreshCw, Banknote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { rampApi, type RampOrder } from '@/api/ramp';

/**
 * Floating tracker for in-flight ramp orders (BRL ↔ TESOURO/USDC).
 *
 * Mounts globally in DashboardLayout so the user never loses sight of an
 * open ramp order — even after closing the deposit/withdraw dialog. Each
 * card carries the live EtherFuse status page link and a shortcut to the
 * Transactions page where the order has a permanent record.
 *
 * Mirrors DepositTracker's UX pattern (bottom-right floating card stack),
 * but pinned to bottom-LEFT to avoid stacking with it.
 */

const TERMINAL_STATUSES = new Set<RampOrder['status']>([
    'completed', 'finalized', 'failed', 'refunded', 'canceled', 'expired',
]);
const POLL_INTERVAL_MS = 8_000;
const AUTO_DISMISS_TERMINAL_MS = 10_000;
const MAX_AGE_MS = 60 * 60 * 1000;        // hide non-terminal orders older than 1h (abandoned)
const VISIBLE_CAP = 3;                     // max cards visible at once; remainder collapses to "+N more"

function tokenCodeOf(order: RampOrder): string {
    const id = order.orderType === 'offramp' ? order.sourceAsset : order.targetAsset;
    return (id?.split(':')[0] ?? 'TOKEN').toUpperCase();
}

const STATUS_LABEL: Record<RampOrder['status'], string> = {
    created: 'Awaiting',
    funded: 'On-chain — settling',
    completed: 'Complete',
    finalized: 'Final',
    failed: 'Failed',
    refunded: 'Refunded',
    canceled: 'Canceled',
    expired: 'Expired',
};

const STATUS_TONE: Record<RampOrder['status'], string> = {
    created: 'text-white/60',
    funded: 'text-[hsl(76_86%_78%)]',
    completed: 'text-[hsl(160_60%_55%)]',
    finalized: 'text-[hsl(160_60%_55%)]',
    failed: 'text-red-400',
    refunded: 'text-red-400',
    canceled: 'text-white/40',
    expired: 'text-white/40',
};

function formatAmount(order: RampOrder): string {
    if (order.orderType === 'offramp') {
        // Off-ramp: showing the BRL the user will receive
        const brl = order.amountInFiat ? Number(order.amountInFiat) : null;
        return brl != null ? `R$ ${brl.toFixed(2)}` : '—';
    }
    // On-ramp: showing the BRL the user pays in PIX
    const brl = order.amountInFiat ? Number(order.amountInFiat) : null;
    return brl != null ? `R$ ${brl.toFixed(2)}` : '—';
}

export function RampOrderTracker() {
    const [orders, setOrders] = useState<RampOrder[]>([]);
    const [dismissed, setDismissed] = useState<Set<number>>(new Set());
    const [minimized, setMinimized] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const dismissedRef = useRef(dismissed);
    dismissedRef.current = dismissed;
    const navigate = useNavigate();

    const fetch = useCallback(async () => {
        try {
            const res = await rampApi.listOrders(20);
            if (!res.success || !res.data) return;
            const now = Date.now();
            const relevant = res.data.filter((o) => {
                // Drop abandoned non-terminal orders that are way past their PIX window.
                // EtherFuse will eventually expire/cancel them, but until then the tracker
                // shouldn't pile them up. Auto-dismiss locally without action.
                const age = now - new Date(o.createdAt).getTime();
                if (!TERMINAL_STATUSES.has(o.status) && age > MAX_AGE_MS) return false;
                // Terminal orders: only show if not yet auto-dismissed
                if (TERMINAL_STATUSES.has(o.status)) return !dismissedRef.current.has(o.id);
                return true;
            });
            setOrders(relevant);

            relevant.forEach((o) => {
                if (TERMINAL_STATUSES.has(o.status) && !dismissedRef.current.has(o.id)) {
                    setTimeout(() => {
                        setDismissed((prev) => new Set([...prev, o.id]));
                    }, AUTO_DISMISS_TERMINAL_MS);
                }
            });
        } catch {
            /* silent — next tick retries */
        }
    }, []);

    useEffect(() => {
        fetch();
        const t = setInterval(fetch, POLL_INTERVAL_MS);
        return () => clearInterval(t);
    }, [fetch]);

    const visible = orders.filter((o) => !dismissed.has(o.id));
    if (visible.length === 0) return null;

    // Cap visible cards so the widget never covers the viewport. Excess collapses
    // into the minimize chip ("+N more") which the user can click to expand.
    const overflowCount = Math.max(0, visible.length - VISIBLE_CAP);
    const cardsToRender = expanded ? visible : visible.slice(0, VISIBLE_CAP);

    return (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm w-[22rem] max-h-[80vh]">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setMinimized(!minimized)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/95 border border-white/10 text-[10px] text-gray-400 hover:text-white transition-colors"
                >
                    {minimized ? (
                        <>
                            <ChevronUp className="w-3 h-3" />
                            {visible.length} ramp{visible.length > 1 ? 's' : ''}
                        </>
                    ) : (
                        <>
                            <ChevronDown className="w-3 h-3" />
                            Minimize
                        </>
                    )}
                </button>
                <button
                    onClick={fetch}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/95 border border-white/10 text-[10px] text-gray-400 hover:text-white transition-colors"
                    aria-label="Refresh"
                >
                    <RefreshCw className="w-3 h-3" />
                </button>
                {overflowCount > 0 && !minimized && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/95 border border-white/10 text-[10px] text-amber-300/80 hover:text-white transition-colors ml-auto"
                    >
                        {expanded ? `Show ${VISIBLE_CAP}` : `+${overflowCount} more`}
                    </button>
                )}
            </div>

            {!minimized && (
                <div className={cn(
                    'flex flex-col gap-2',
                    expanded ? 'overflow-y-auto pr-1' : '',
                )} style={expanded ? { maxHeight: 'calc(80vh - 3rem)' } : undefined}>
                {cardsToRender.map((order) => {
                const code = tokenCodeOf(order);
                const isOfframp = order.orderType === 'offramp';
                const isComplete = order.status === 'completed' || order.status === 'finalized';
                const isFailed = order.status === 'failed' || order.status === 'refunded'
                    || order.status === 'canceled' || order.status === 'expired';
                const Icon = isOfframp ? ArrowUpRight : ArrowDownLeft;
                return (
                    <div
                        key={order.id}
                        className={cn(
                            'rounded-xl border bg-slate-900/95 shadow-2xl shadow-black/50 p-3.5 space-y-2 animate-in slide-in-from-bottom-4 duration-300',
                            isComplete ? 'border-[hsl(160_60%_40%/0.3)]'
                                : isFailed ? 'border-red-500/30'
                                    : 'border-white/10',
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className={cn(
                                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                                    isComplete ? 'bg-[hsl(160_60%_40%/0.18)]'
                                        : isFailed ? 'bg-red-500/15'
                                            : 'bg-white/[0.04]',
                                )}>
                                    {isComplete
                                        ? <Check className="w-3.5 h-3.5 text-[hsl(160_60%_55%)]" />
                                        : isFailed
                                            ? <X className="w-3.5 h-3.5 text-red-400" />
                                            : <Loader2 className="w-3.5 h-3.5 animate-spin text-[hsl(76_86%_78%)]" />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[12px] font-medium text-white truncate flex items-center gap-1.5">
                                        <Icon className="w-3 h-3 text-white/40" />
                                        {isOfframp ? `${code} → BRL` : `BRL → ${code}`}
                                    </p>
                                    <p className={cn('text-[10px] uppercase tracking-wider', STATUS_TONE[order.status])}>
                                        {STATUS_LABEL[order.status]}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-[12px] font-mono text-white tabular-nums">{formatAmount(order)}</p>
                                <p className="text-[10px] text-white/40">
                                    <Banknote className="w-2.5 h-2.5 inline-block mr-0.5" />
                                    PIX
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-1 border-t border-white/5">
                            {order.statusPage && (
                                <a
                                    href={order.statusPage}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-[hsl(76_86%_78%)] hover:text-[hsl(76_86%_93%)] inline-flex items-center gap-1 transition-colors"
                                >
                                    EtherFuse <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            )}
                            <button
                                onClick={() => navigate(`/transactions?ramp=${order.etherfuseOrderId}`)}
                                className="text-[10px] text-white/55 hover:text-white/85 transition-colors ml-auto"
                            >
                                Transactions →
                            </button>
                            {(isComplete || isFailed) && (
                                <button
                                    onClick={() => setDismissed((prev) => new Set([...prev, order.id]))}
                                    className="text-white/30 hover:text-white/70 transition-colors"
                                    aria-label="Dismiss"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
                </div>
            )}
        </div>
    );
}
