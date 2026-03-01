import { useState, useEffect, useCallback } from 'react';
import { ArrowDownLeft, Check, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { investorsApi } from '@/api/investors';
import { authStorage } from '@/utils/authStorage';

interface ActiveDeposit {
    id: number;
    memo: string;
    status: string;
    actualAmount: string | null;
    createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; messages: string[]; color: string }> = {
    received: {
        label: 'Payment detected',
        messages: [
            'We received your USDC.',
            'Preparing to forward to your wallet...',
        ],
        color: 'text-amber-400',
    },
    forwarding: {
        label: 'Transferring to wallet',
        messages: [
            'Almost there — forwarding to your account.',
            'Securing the transfer on the Stellar network...',
        ],
        color: 'text-blue-400',
    },
    pending_approval: {
        label: 'Awaiting approval',
        messages: [
            'Your deposit requires administrator approval.',
            'This usually takes just a moment...',
        ],
        color: 'text-amber-400',
    },
    completed: {
        label: 'Deposit complete',
        messages: ['Your balance has been updated.'],
        color: 'text-emerald-400',
    },
    failed: {
        label: 'Deposit failed',
        messages: ['Something went wrong. Please contact support.'],
        color: 'text-red-400',
    },
};

const ACTIVE_STATUSES = ['received', 'forwarding', 'pending_approval'];

function CyclingMessage({ messages }: { messages: string[] }) {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (messages.length <= 1) return;
        const timer = setInterval(() => {
            setIndex(prev => (prev + 1) % messages.length);
        }, 4000);
        return () => clearInterval(timer);
    }, [messages.length]);

    return (
        <p className="text-[11px] text-gray-400 transition-opacity duration-500">
            {messages[index]}
        </p>
    );
}

export function DepositTracker() {
    const [deposits, setDeposits] = useState<ActiveDeposit[]>([]);
    const [dismissed, setDismissed] = useState<Set<number>>(new Set());
    const [minimized, setMinimized] = useState(false);

    const fetchDeposits = useCallback(async () => {
        const user = authStorage.getUser<any>('investor');
        if (!user?.id) return;

        try {
            const response = await investorsApi.getDeposits(user.id);
            const active = (response.data || []).filter(
                (d: ActiveDeposit) => ACTIVE_STATUSES.includes(d.status) || d.status === 'completed'
            );
            setDeposits(active);

            // Auto-dismiss completed deposits after 8s
            active.forEach((d: ActiveDeposit) => {
                if (d.status === 'completed' && !dismissed.has(d.id)) {
                    setTimeout(() => {
                        setDismissed(prev => new Set([...prev, d.id]));
                    }, 8000);
                }
            });
        } catch {
            // Silently ignore — user might not be logged in
        }
    }, [dismissed]);

    // Poll every 5s
    useEffect(() => {
        fetchDeposits();
        const interval = setInterval(fetchDeposits, 5000);
        return () => clearInterval(interval);
    }, [fetchDeposits]);

    const visibleDeposits = deposits.filter(d => !dismissed.has(d.id));

    if (visibleDeposits.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
            {/* Minimize/expand toggle */}
            {visibleDeposits.length > 0 && (
                <button
                    onClick={() => setMinimized(!minimized)}
                    className="self-end flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-800/90 border border-white/10 text-[10px] text-gray-400 hover:text-white transition-colors backdrop-blur-xl"
                >
                    {minimized ? (
                        <>
                            <ChevronUp className="w-3 h-3" />
                            {visibleDeposits.length} active deposit{visibleDeposits.length > 1 ? 's' : ''}
                        </>
                    ) : (
                        <>
                            <ChevronDown className="w-3 h-3" />
                            Minimize
                        </>
                    )}
                </button>
            )}

            {/* Deposit cards */}
            {!minimized && visibleDeposits.map(deposit => {
                const config = STATUS_CONFIG[deposit.status] || STATUS_CONFIG.received;
                const isComplete = deposit.status === 'completed';
                const amount = deposit.actualAmount ? `$${Number(deposit.actualAmount).toFixed(2)}` : '';

                return (
                    <div
                        key={deposit.id}
                        className={cn(
                            "rounded-xl border bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-4 space-y-2 animate-in slide-in-from-bottom-4 duration-300",
                            isComplete ? "border-emerald-500/30" : "border-white/10"
                        )}
                    >
                        {/* Header row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {isComplete ? (
                                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    </div>
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                                        {deposit.status === 'pending_approval' ? (
                                            <ArrowDownLeft className="w-3.5 h-3.5 text-amber-400" />
                                        ) : (
                                            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                                        )}
                                    </div>
                                )}
                                <span className={cn("text-sm font-medium", config.color)}>
                                    {config.label}
                                </span>
                            </div>
                            {isComplete && (
                                <button
                                    onClick={() => setDismissed(prev => new Set([...prev, deposit.id]))}
                                    className="text-gray-500 hover:text-white transition-colors p-1"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Amount */}
                        {amount && (
                            <p className="text-lg font-bold text-white">{amount} USDC</p>
                        )}

                        {/* Cycling status message */}
                        <CyclingMessage messages={config.messages} />

                        {/* Progress bar */}
                        {!isComplete && (
                            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                                <div className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    deposit.status === 'received' && "w-1/3 bg-amber-500",
                                    deposit.status === 'forwarding' && "w-2/3 bg-blue-500",
                                    deposit.status === 'pending_approval' && "w-2/3 bg-amber-500",
                                )} />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
