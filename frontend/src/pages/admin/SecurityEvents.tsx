/**
 * SecurityEvents.tsx — F-009 audit follow-up.
 *
 * Read-only feed of the AdminAction audit log + dormant-active anomaly
 * alerts. Operators use this page to triage:
 *   - Who hit which admin endpoint, when, from where (IP / UA)
 *   - Which denials happened (potential probe attempts)
 *   - Which SECURITY_ANOMALY:* events fired (dormant-active wakes, etc)
 *
 * Filter by result (success / failure / denied / detected), action prefix
 * (e.g. SECURITY_ANOMALY), target type, time window. Highlights anomaly
 * rows in red.
 */
import { useEffect, useMemo, useState } from 'react';
import {
    Shield, RefreshCw, Loader2, AlertTriangle, Check, X, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { securityEventsApi, type AdminActionRow } from '@/api/securityEvents';
import { toast } from 'sonner';

type ResultFilter = 'all' | 'success' | 'failure' | 'denied' | 'detected';

const PAGE_SIZE = 50;

function ResultBadge({ result }: { result: string }) {
    if (result === 'success') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Check className="w-3 h-3" /> Success
            </span>
        );
    }
    if (result === 'denied') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                <Ban className="w-3 h-3" /> Denied
            </span>
        );
    }
    if (result === 'detected') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="w-3 h-3" /> Anomaly
            </span>
        );
    }
    if (result === 'failure') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <X className="w-3 h-3" /> Failure
            </span>
        );
    }
    return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-500/10 text-zinc-400">
            {result}
        </span>
    );
}

export function SecurityEvents() {
    const [rows, setRows] = useState<AdminActionRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
    const [actionPrefix, setActionPrefix] = useState('');
    const [actorIdInput, setActorIdInput] = useState('');
    const [offset, setOffset] = useState(0);

    const load = async () => {
        try {
            setLoading(true);
            const data = await securityEventsApi.list({
                limit: PAGE_SIZE,
                offset,
                result: resultFilter === 'all' ? undefined : resultFilter,
                actionPrefix: actionPrefix || undefined,
                actorId: actorIdInput ? Number(actorIdInput) : undefined,
            });
            setRows(data.items);
            setTotal(data.total);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load security events');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resultFilter, offset]);

    const anomalyCount = useMemo(
        () => rows.filter(r => r.result === 'detected' || r.action.startsWith('SECURITY_ANOMALY')).length,
        [rows]
    );

    const isAnomaly = (r: AdminActionRow) =>
        r.result === 'detected' || r.action.startsWith('SECURITY_ANOMALY');

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white">Security Events</h1>
                        <p className="text-xs text-zinc-500">
                            Immutable audit log of admin actions + dormant-active anomaly alerts
                        </p>
                    </div>
                </div>
                <Button
                    variant="outline" size="sm"
                    onClick={load}
                    disabled={loading}
                    className="gap-1.5 border-white/10"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
                {(['all', 'success', 'failure', 'denied', 'detected'] as const).map((r) => (
                    <button
                        key={r}
                        onClick={() => { setResultFilter(r); setOffset(0); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            resultFilter === r
                                ? 'bg-white/10 text-white border border-white/20'
                                : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06]'
                        }`}
                    >
                        {r === 'all' ? 'All' : r === 'detected' ? 'Anomalies' : r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                    <Input
                        placeholder="action prefix (e.g. SECURITY_ANOMALY)"
                        value={actionPrefix}
                        onChange={(e) => setActionPrefix(e.target.value)}
                        onBlur={() => { setOffset(0); load(); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setOffset(0); load(); } }}
                        className="h-8 w-56 text-xs bg-white/[0.03] border-white/[0.06]"
                    />
                    <Input
                        placeholder="actor id"
                        value={actorIdInput}
                        onChange={(e) => setActorIdInput(e.target.value.replace(/\D/g, ''))}
                        onBlur={() => { setOffset(0); load(); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setOffset(0); load(); } }}
                        className="h-8 w-24 text-xs bg-white/[0.03] border-white/[0.06]"
                    />
                </div>
            </div>

            {/* Counts */}
            <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>{total} total events</span>
                {anomalyCount > 0 && (
                    <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/5">
                        {anomalyCount} anomalies on this page
                    </Badge>
                )}
            </div>

            {/* Table */}
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <table className="w-full text-xs">
                    <thead className="bg-white/[0.03] text-zinc-500">
                        <tr>
                            <th className="text-left px-3 py-2 font-medium">When</th>
                            <th className="text-left px-3 py-2 font-medium">Actor</th>
                            <th className="text-left px-3 py-2 font-medium">Action</th>
                            <th className="text-left px-3 py-2 font-medium">Target</th>
                            <th className="text-left px-3 py-2 font-medium">Result</th>
                            <th className="text-left px-3 py-2 font-medium">IP</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                        {loading && rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-zinc-500">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-zinc-500">
                                    No events match the current filter.
                                </td>
                            </tr>
                        ) : (
                            rows.map((r) => (
                                <tr
                                    key={r.id}
                                    className={isAnomaly(r) ? 'bg-red-500/[0.06]' : 'hover:bg-white/[0.02]'}
                                >
                                    <td className="px-3 py-2 text-zinc-400 font-mono whitespace-nowrap">
                                        {new Date(r.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2 text-zinc-300">
                                        <div className="flex flex-col">
                                            <span className="font-medium">{r.actorType ?? 'unknown'}</span>
                                            <span className="text-[10px] text-zinc-500">
                                                #{r.actorId ?? '—'} {r.actorRole ? `· ${r.actorRole}` : ''}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-zinc-300 font-mono text-[11px] max-w-md truncate">
                                        {r.action}
                                    </td>
                                    <td className="px-3 py-2 text-zinc-400">
                                        {r.targetType && r.targetId ? (
                                            <span className="font-mono text-[11px]">
                                                {r.targetType}/{r.targetId}
                                            </span>
                                        ) : (
                                            <span className="text-zinc-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <ResultBadge result={r.result} />
                                    </td>
                                    <td className="px-3 py-2 text-zinc-500 font-mono text-[11px]">
                                        {r.ip ? (
                                            <AddressDisplay value={r.ip} truncate={[0, 0]} className="text-zinc-500" />
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pager */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">
                    Showing {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length} of {total}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline" size="sm"
                        disabled={offset === 0 || loading}
                        onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
                        className="border-white/10"
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline" size="sm"
                        disabled={offset + rows.length >= total || loading}
                        onClick={() => setOffset(offset + PAGE_SIZE)}
                        className="border-white/10"
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default SecurityEvents;
