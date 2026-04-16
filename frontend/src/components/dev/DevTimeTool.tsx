import { useState, useEffect, useCallback } from 'react';
import { Clock, RotateCcw, X } from 'lucide-react';
import { devNow, getDevOffset, setDevOffset, resetDevTime, onDevTimeChange } from '@/utils/devTime';

/**
 * Floating dev-only time control widget.
 * Lets you scrub through time to test maturity bars, payment ticks, etc.
 * Only renders when import.meta.env.DEV is true.
 */
export function DevTimeTool() {
    const [isOpen, setIsOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState(devNow());
    const [inputDate, setInputDate] = useState('');
    const [inputTime, setInputTime] = useState('');

    const isOverridden = getDevOffset() !== 0;

    // Sync display when offset changes
    useEffect(() => {
        const tick = () => {
            const now = devNow();
            setCurrentTime(now);
            const d = new Date(now);
            setInputDate(d.toISOString().split('T')[0]);
            setInputTime(d.toTimeString().slice(0, 5));
        };
        tick();
        const unsub = onDevTimeChange(tick);

        // Also tick every second for live clock feel
        const interval = setInterval(() => setCurrentTime(devNow()), 1000);
        return () => { unsub(); clearInterval(interval); };
    }, []);

    const applyDateTime = useCallback(() => {
        if (!inputDate) return;
        const target = new Date(`${inputDate}T${inputTime || '12:00'}:00`);
        if (isNaN(target.getTime())) return;
        const offset = target.getTime() - Date.now();
        setDevOffset(offset);
    }, [inputDate, inputTime]);

    const jumpDays = useCallback((days: number) => {
        setDevOffset(getDevOffset() + days * 24 * 60 * 60 * 1000);
    }, []);

    const jumpMonths = useCallback((months: number) => {
        setDevOffset(getDevOffset() + months * 30 * 24 * 60 * 60 * 1000);
    }, []);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-mono font-medium shadow-lg border transition-all hover:scale-105 ${
                    isOverridden
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-amber-500/10'
                        : 'bg-zinc-900/90 border-white/10 text-zinc-400 shadow-black/20'
                }`}
                title="Dev Time Control"
            >
                <Clock className="w-3.5 h-3.5" />
                {isOverridden
                    ? new Date(currentTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Time'
                }
            </button>
        );
    }

    const d = new Date(currentTime);

    return (
        <div className="fixed bottom-4 right-4 z-[9999] w-72 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                    <Clock className={`w-3.5 h-3.5 ${isOverridden ? 'text-amber-400' : 'text-zinc-500'}`} />
                    <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">Dev Time</span>
                    {isOverridden && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                            OVERRIDE
                        </span>
                    )}
                </div>
                <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Current simulated time */}
            <div className="px-3 py-2.5 border-b border-white/[0.06] text-center">
                <p className="text-lg font-mono font-bold text-white tabular-nums">
                    {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="text-sm font-mono text-zinc-400 tabular-nums">
                    {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
            </div>

            {/* Quick jump buttons */}
            <div className="px-3 py-2 border-b border-white/[0.06] space-y-1.5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Jump</p>
                <div className="grid grid-cols-4 gap-1">
                    {[
                        { label: '-1m', fn: () => jumpMonths(-1) },
                        { label: '-7d', fn: () => jumpDays(-7) },
                        { label: '-1d', fn: () => jumpDays(-1) },
                        { label: '+1d', fn: () => jumpDays(1) },
                        { label: '+7d', fn: () => jumpDays(7) },
                        { label: '+1m', fn: () => jumpMonths(1) },
                        { label: '+3m', fn: () => jumpMonths(3) },
                        { label: '+1y', fn: () => jumpMonths(12) },
                    ].map(({ label, fn }) => (
                        <button
                            key={label}
                            onClick={fn}
                            className="px-1.5 py-1 text-[11px] font-mono rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Precise date/time */}
            <div className="px-3 py-2 border-b border-white/[0.06] space-y-1.5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Set exact</p>
                <div className="flex gap-1.5">
                    <input
                        type="date"
                        value={inputDate}
                        onChange={(e) => setInputDate(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs font-mono bg-white/[0.04] border border-white/[0.06] rounded-md text-white focus:border-blue-500/50 focus:outline-none"
                    />
                    <input
                        type="time"
                        value={inputTime}
                        onChange={(e) => setInputTime(e.target.value)}
                        className="w-20 px-2 py-1 text-xs font-mono bg-white/[0.04] border border-white/[0.06] rounded-md text-white focus:border-blue-500/50 focus:outline-none"
                    />
                    <button
                        onClick={applyDateTime}
                        className="px-2 py-1 text-xs font-medium rounded-md bg-blue-600/80 text-white hover:bg-blue-600 transition-colors"
                    >
                        Set
                    </button>
                </div>
            </div>

            {/* Reset */}
            <div className="px-3 py-2">
                <button
                    onClick={resetDevTime}
                    disabled={!isOverridden}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white/[0.04] border border-white/[0.06] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Real Time
                </button>
            </div>
        </div>
    );
}
