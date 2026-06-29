import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, ArrowUpRight, ArrowDownLeft, ExternalLink, Loader2, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';
import { rampApi, type RampOrder } from '@/api/ramp';

// Mirror RampOrderTracker constants so logic stays in sync.
const RAMP_TERMINAL = new Set<RampOrder['status']>([
    'completed', 'finalized', 'failed', 'refunded', 'canceled', 'expired',
]);
const RAMP_MAX_AGE_MS = 60 * 60 * 1000;     // ignore non-terminal orders older than 1h
const RAMP_AUTO_DISMISS_MS = 10_000;        // remove terminal orders from active section after 10s
const RAMP_POLL_MS = 8_000;

interface Notification {
    id: number;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    actionLink?: string;
    isRead: boolean;
    createdAt: string;
}

function rampTokenCode(o: RampOrder): string {
    const id = o.orderType === 'offramp' ? o.sourceAsset : o.targetAsset;
    return (id?.split(':')[0] ?? 'TOKEN').toUpperCase();
}

const RAMP_STATUS_LABEL: Record<RampOrder['status'], string> = {
    created: 'Awaiting',
    funded: 'Settling',
    completed: 'Complete',
    finalized: 'Final',
    failed: 'Failed',
    refunded: 'Refunded',
    canceled: 'Canceled',
    expired: 'Expired',
};

export function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [ramps, setRamps] = useState<RampOrder[]>([]);
    const [rampDismissed, setRampDismissed] = useState<Set<number>>(new Set());
    const [canceling, setCanceling] = useState<Set<number>>(new Set());
    const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
    const rampDismissedRef = useRef(rampDismissed);
    rampDismissedRef.current = rampDismissed;
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const fetchNotifications = async () => {
        // Don't fetch if user is not authenticated
        const token = localStorage.getItem('token');
        if (!token) {
            return;
        }

        try {
            const response = await api.get('/notifications?limit=10');
            if (response.data.success) {
                setNotifications(response.data.data.notifications);
                setUnreadCount(response.data.data.unreadCount);
            }
        } catch (error) {
            // Silently ignore auth errors - user may have just logged out
            if (error instanceof Error && error.message === 'Unauthorized') {
                return;
            }
            console.error('Failed to fetch notifications', error);
        }
    };

    // Poll for notifications every 30 seconds
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    // Poll active ramps (in-flight on/off-ramps). Lighter cadence than per-dialog
    // because the bell is global state.
    const fetchRamps = useCallback(async () => {
        try {
            const res = await rampApi.listOrders(20);
            if (!res.success || !res.data) return;
            const now = Date.now();
            const relevant = res.data.filter((o) => {
                const age = now - new Date(o.createdAt).getTime();
                if (!RAMP_TERMINAL.has(o.status) && age > RAMP_MAX_AGE_MS) return false;
                if (RAMP_TERMINAL.has(o.status)) return !rampDismissedRef.current.has(o.id);
                return true;
            });
            setRamps(relevant);
            relevant.forEach((o) => {
                if (RAMP_TERMINAL.has(o.status) && !rampDismissedRef.current.has(o.id)) {
                    setTimeout(() => {
                        setRampDismissed((prev) => new Set([...prev, o.id]));
                    }, RAMP_AUTO_DISMISS_MS);
                }
            });
        } catch {
            /* silent */
        }
    }, []);

    useEffect(() => {
        fetchRamps();
        const t = setInterval(fetchRamps, RAMP_POLL_MS);
        return () => clearInterval(t);
    }, [fetchRamps]);

    // Emergency cancel: two-tap confirm (first tap arms, second tap fires).
    // Auto-resets the confirm state after 4s if user doesn't follow through.
    useEffect(() => {
        if (confirmCancelId == null) return;
        const t = setTimeout(() => setConfirmCancelId(null), 4000);
        return () => clearTimeout(t);
    }, [confirmCancelId]);

    const cancelRamp = useCallback(async (order: RampOrder) => {
        setCanceling((prev) => new Set([...prev, order.id]));
        try {
            const fn = order.orderType === 'offramp' ? rampApi.cancelOfframpOrder : rampApi.cancelOnrampOrder;
            await fn(order.id);
            await fetchRamps();
        } catch {
            /* failure surfaces as the order staying in flight; next poll reconciles */
        } finally {
            setCanceling((prev) => {
                const next = new Set(prev);
                next.delete(order.id);
                return next;
            });
            setConfirmCancelId(null);
        }
    }, [fetchRamps]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAsRead = async (id: number) => {
        try {
            await api.put(`/notifications/${id}/read`, {});
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            setLoading(true);
            await api.put('/notifications/read-all', {});
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read', error);
        } finally {
            setLoading(false);
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.isRead) {
            await handleMarkAsRead(notification.id);
        }
        if (notification.actionLink) {
            setIsOpen(false);
            navigate(notification.actionLink);
        }
    };

    const activeRamps = ramps.filter((o) => !rampDismissed.has(o.id));
    const inFlightCount = activeRamps.filter((o) => !RAMP_TERMINAL.has(o.status)).length;
    const badgeCount = unreadCount + inFlightCount;

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                size="icon"
                className="relative text-muted-foreground hover:text-white"
                onClick={() => setIsOpen(!isOpen)}
            >
                <Bell className="w-5 h-5" />
                {badgeCount > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
            </Button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 md:w-96 bg-slate-950 border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="p-3 border-b border-white/10 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">Notifications</h3>
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-blue-400 hover:text-blue-300 h-6 px-2"
                                onClick={handleMarkAllAsRead}
                                disabled={loading}
                            >
                                Mark all read
                            </Button>
                        )}
                    </div>

                    {activeRamps.length > 0 && (
                        <div className="border-b border-white/10 bg-white/[0.015]">
                            <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">
                                    Ramps in flight
                                </span>
                                <span className="text-[10px] text-white/35">{activeRamps.length}</span>
                            </div>
                            <div className="max-h-[180px] overflow-y-auto">
                                {activeRamps.map((order) => {
                                    const code = rampTokenCode(order);
                                    const isOff = order.orderType === 'offramp';
                                    const isComplete = order.status === 'completed' || order.status === 'finalized';
                                    const isFailed = order.status === 'failed' || order.status === 'refunded'
                                        || order.status === 'canceled' || order.status === 'expired';
                                    const Icon = isOff ? ArrowUpRight : ArrowDownLeft;
                                    const amt = order.amountInFiat ? `R$ ${Number(order.amountInFiat).toFixed(2)}` : '—';
                                    const canResume = !isFailed; // resume makes no sense for canceled/expired/failed
                                    const onResume = () => {
                                        if (!canResume) return;
                                        setIsOpen(false);
                                        navigate(`/wallet?ramp=${order.id}`);
                                    };
                                    return (
                                        <div
                                            key={order.id}
                                            onClick={onResume}
                                            className={cn(
                                                'px-3 py-2.5 transition-colors border-t border-white/[0.04] first:border-t-0',
                                                canResume ? 'hover:bg-white/[0.04] cursor-pointer' : 'hover:bg-white/[0.02]'
                                            )}
                                            role={canResume ? 'button' : undefined}
                                            title={canResume ? 'Tap to resume this transaction' : undefined}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className={cn(
                                                        'w-6 h-6 rounded-md flex items-center justify-center shrink-0',
                                                        isComplete ? 'bg-[hsl(160_60%_40%/0.18)]'
                                                            : isFailed ? 'bg-red-500/15'
                                                                : 'bg-white/[0.05]',
                                                    )}>
                                                        {isComplete ? <Check className="w-3 h-3 text-[hsl(160_60%_55%)]" />
                                                            : isFailed ? <X className="w-3 h-3 text-red-400" />
                                                                : <Loader2 className="w-3 h-3 animate-spin text-[hsl(76_86%_78%)]" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[12px] font-medium text-white flex items-center gap-1">
                                                            <Icon className="w-2.5 h-2.5 text-white/40" />
                                                            {isOff ? `${code} → BRL` : `BRL → ${code}`}
                                                        </p>
                                                        <p className="text-[10px] uppercase tracking-wider text-white/40">
                                                            {RAMP_STATUS_LABEL[order.status]}
                                                            {canResume && !isComplete && (
                                                                <span className="ml-1.5 text-white/55 normal-case tracking-normal">· tap to resume</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-[11px] font-mono text-white/85 shrink-0 tabular-nums">{amt}</span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5 pl-8">
                                                {order.statusPage && (
                                                    <a
                                                        href={order.statusPage}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[10px] text-[hsl(76_86%_78%)] hover:text-[hsl(76_86%_93%)] inline-flex items-center gap-1 transition-colors"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        EtherFuse <ExternalLink className="w-2.5 h-2.5" />
                                                    </a>
                                                )}
                                                {/* Emergency cancel — only while `created` (EtherFuse rejects after funded). */}
                                                {order.status === 'created' && (
                                                    canceling.has(order.id) ? (
                                                        <span className="text-[10px] text-white/40 inline-flex items-center gap-1 ml-auto">
                                                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Canceling…
                                                        </span>
                                                    ) : confirmCancelId === order.id ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                cancelRamp(order);
                                                            }}
                                                            className="text-[10px] text-red-300 hover:text-red-200 font-medium uppercase tracking-wider transition-colors ml-auto"
                                                        >
                                                            Confirm cancel
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConfirmCancelId(order.id);
                                                            }}
                                                            className="text-[10px] text-red-400/70 hover:text-red-300 transition-colors ml-auto"
                                                            title="Cancel this order on EtherFuse"
                                                        >
                                                            Cancel
                                                        </button>
                                                    )
                                                )}
                                                {(isComplete || isFailed) && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRampDismissed((prev) => new Set([...prev, order.id]));
                                                        }}
                                                        className="text-white/30 hover:text-white/70 transition-colors ml-auto"
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
                        </div>
                    )}

                    <div className="max-h-[400px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                {activeRamps.length > 0 ? 'No other notifications' : 'No notifications yet'}
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={cn(
                                            "p-4 hover:bg-white/5 cursor-pointer transition-colors relative",
                                            !notification.isRead && "bg-blue-500/5"
                                        )}
                                    >
                                        {!notification.isRead && (
                                            <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-12 bg-blue-500 rounded-full md:hidden" />
                                        )}
                                        <div className="flex gap-3">
                                            <div className={cn(
                                                "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                                !notification.isRead ? "bg-blue-500" : "bg-transparent"
                                            )} />
                                            <div className="flex-1 space-y-1">
                                                <p className={cn("text-sm font-medium", !notification.isRead ? "text-white" : "text-muted-foreground")}>
                                                    {notification.title}
                                                </p>
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {notification.message}
                                                </p>
                                                <p className="text-[10px] text-slate-500">
                                                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
