/**
 * Distributor.tsx — Platform admin panel for the singleton YieldDistributor v3.
 *
 * F-004 audit follow-up. YieldDistributor is platform-scoped (one contract for
 * all offers), so this is a dedicated page — unlike per-offer settlement which
 * lives under AdminOffers. Provides:
 *
 *   - Aggregated on-chain status (deployed / paused / version / admin / pending)
 *   - Pause + Resume (incident-containment lever, <30-min target)
 *   - 2-step admin rotation (propose + accept, address-poisoning safe)
 *
 * Mirrors the pattern shipped for MaturitySettlement v2 in AdminOffers.tsx so
 * the operator UX is consistent across contracts.
 */
import { useState, useEffect } from 'react';
import {
    Loader2, Coins, Pause, Play, UserCog, Check, ShieldAlert, Copy,
    RefreshCw, AlertTriangle, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { distributorApi, type DistributorStatus } from '@/api/distributor';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { toast } from 'sonner';

type ActionType = null | 'pause' | 'resume' | 'propose_admin' | 'accept_admin';

const STELLAR_G_RE = /^G[A-Z2-7]{55}$/;

export function Distributor() {
    const [status, setStatus] = useState<DistributorStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [actionType, setActionType] = useState<ActionType>(null);
    const [submitting, setSubmitting] = useState(false);

    // propose_admin double-entry state (F-013 address-poisoning mitigation)
    const [proposeInput1, setProposeInput1] = useState('');
    const [proposeInput2, setProposeInput2] = useState('');

    const loadStatus = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await distributorApi.getStatus();
            setStatus(data);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to load status');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
        // 30s poll for on-chain state freshness
        const interval = setInterval(loadStatus, 30_000);
        return () => clearInterval(interval);
    }, []);

    const closeAction = () => {
        setActionType(null);
        setProposeInput1('');
        setProposeInput2('');
    };

    const handleAction = async () => {
        if (!actionType) return;
        setSubmitting(true);
        try {
            if (actionType === 'pause') {
                await distributorApi.pause();
                toast.success('YieldDistributor paused — distribute() calls blocked');
            } else if (actionType === 'resume') {
                await distributorApi.resume();
                toast.success('YieldDistributor resumed');
            } else if (actionType === 'propose_admin') {
                if (proposeInput1 !== proposeInput2 || !STELLAR_G_RE.test(proposeInput1)) {
                    toast.error('Address mismatch or invalid format');
                    setSubmitting(false);
                    return;
                }
                await distributorApi.proposeAdmin(proposeInput1);
                toast.success('New admin proposed — they must sign accept-admin to complete');
            } else if (actionType === 'accept_admin') {
                await distributorApi.acceptAdmin();
                toast.success('Admin role accepted — rotation complete');
            }
            closeAction();
            await loadStatus();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || err?.message || 'Action failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <Coins className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white">Yield Distributor</h1>
                        <p className="text-xs text-zinc-500">Singleton contract — batch-pays investors across all offers</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={loadStatus} disabled={loading} className="gap-1.5 border-white/10">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Body */}
            {loading && !status ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
            ) : error ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-200 text-sm">
                    {error}
                </div>
            ) : !status?.deployed ? (
                <div className="bg-zinc-500/5 border border-white/[0.06] rounded-xl p-6 text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto text-amber-400 mb-3" />
                    <p className="text-zinc-300 font-medium mb-1">No YieldDistributor deployed</p>
                    <p className="text-xs text-zinc-500">
                        Set <code className="font-mono text-amber-400">YIELD_DISTRIBUTOR_CONTRACT_ID</code> in your environment
                        and restart the backend to enable this panel.
                    </p>
                </div>
            ) : status && (
                <>
                    {/* Status grid */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Contract</p>
                            <AddressDisplay
                                value={status.contractId}
                                truncate={[6, 4]}
                                kind="contract"
                                className="text-xs text-white"
                                showCopy
                            />
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Version</p>
                            <p className="text-xs font-mono text-white">v{status.version ?? '?'}</p>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Paused</p>
                            <p className="text-xs font-medium">
                                {!status.v3Ready ? (
                                    <span className="text-amber-400">v2 (no pause)</span>
                                ) : status.paused ? (
                                    <span className="text-amber-400">🔴 Paused</span>
                                ) : (
                                    <span className="text-emerald-400">🟢 Active</span>
                                )}
                            </p>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Status</p>
                            <p className="text-xs font-medium">
                                {status.paused ? (
                                    <span className="text-amber-400">Distribute blocked</span>
                                ) : (
                                    <span className="text-emerald-400">Ready</span>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* v2 banner */}
                    {!status.v3Ready && (
                        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                            <div className="text-xs text-amber-200 space-y-1">
                                <p className="font-medium">Contract is v2 — pause / admin-rotation unavailable.</p>
                                <p className="text-amber-300/80">
                                    Upgrade to v3 by calling <code className="font-mono">upgrade()</code> with the v3 WASM hash.
                                    Use the existing TokenSale contract management page or run the upgrade via CLI.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Admin row */}
                    {status.v3Ready && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                                <UserCog className="w-4 h-4 text-zinc-400 shrink-0" />
                                <span className="text-[11px] text-zinc-500 shrink-0">Current admin:</span>
                                <AddressDisplay
                                    value={status.admin}
                                    truncate={[10, 6]}
                                    kind="account"
                                    showCopy
                                    linkToExplorer
                                    className="text-xs text-zinc-200 flex-1"
                                />
                            </div>
                            {status.pendingAdmin && (
                                <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3">
                                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                                    <span className="text-[11px] text-amber-400 shrink-0">Pending admin (awaiting accept):</span>
                                    <AddressDisplay
                                        value={status.pendingAdmin}
                                        truncate={[10, 6]}
                                        kind="account"
                                        showCopy
                                        linkToExplorer
                                        className="text-xs text-amber-200 flex-1"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                        {status.v3Ready && !status.paused && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                                onClick={() => setActionType('pause')}
                            >
                                <Pause className="w-3.5 h-3.5" /> Pause
                            </Button>
                        )}
                        {status.v3Ready && status.paused && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                onClick={() => setActionType('resume')}
                            >
                                <Play className="w-3.5 h-3.5" /> Resume
                            </Button>
                        )}
                        {status.v3Ready && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-zinc-300 border-white/10 hover:bg-white/[0.06]"
                                onClick={() => setActionType('propose_admin')}
                            >
                                <UserCog className="w-3.5 h-3.5" /> Propose New Admin
                            </Button>
                        )}
                        {status.v3Ready && status.pendingAdmin && (
                            <Button
                                size="sm"
                                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={() => setActionType('accept_admin')}
                            >
                                <Check className="w-3.5 h-3.5" /> Accept Admin Role
                            </Button>
                        )}
                    </div>
                </>
            )}

            {/* Pause Dialog */}
            <Dialog open={actionType === 'pause'} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-amber-400 flex items-center gap-2">
                            <Pause className="w-5 h-5" /> Pause Yield Distributor
                        </DialogTitle>
                        <DialogDescription>
                            This blocks <code>distribute()</code> calls platform-wide. Companies will not be able to
                            pay investors until you resume. Use this to contain an in-flight incident.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={submitting} className="bg-amber-600 hover:bg-amber-700">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                            Pause
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Resume Dialog */}
            <Dialog open={actionType === 'resume'} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-emerald-400 flex items-center gap-2">
                            <Play className="w-5 h-5" /> Resume Yield Distributor
                        </DialogTitle>
                        <DialogDescription>
                            Re-enable distribute() calls. Confirm the incident is contained before resuming.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                            Resume
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Propose Admin Dialog */}
            <Dialog open={actionType === 'propose_admin'} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-zinc-200 flex items-center gap-2">
                            <UserCog className="w-5 h-5" /> Propose New Admin
                        </DialogTitle>
                        <DialogDescription>
                            Step 1 of 2 — the new admin must then call "Accept Admin" with their own wallet.
                            The current admin keeps full control until that happens.
                        </DialogDescription>
                    </DialogHeader>

                    {status?.admin && (
                        <div className="bg-zinc-500/10 rounded-lg p-3 border border-white/[0.08]">
                            <p className="text-[10px] text-zinc-500 mb-1">Current admin (context anchor)</p>
                            <code className="text-xs text-zinc-200 font-mono break-all">{status.admin}</code>
                        </div>
                    )}

                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                        <ShieldAlert className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-200">
                            <strong>Address poisoning warning</strong> — verify every character. Truncated previews
                            can be spoofed. Type the address twice; submit is disabled until they match.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div>
                            <label className="text-[11px] text-zinc-400 mb-1 block">New admin address (G...)</label>
                            <Input
                                value={proposeInput1}
                                onChange={(e) => setProposeInput1(e.target.value.trim())}
                                placeholder="GABC...XYZ (56 chars, paste here)"
                                className="bg-white/[0.03] border-white/[0.08] font-mono text-xs"
                                spellCheck={false}
                                autoCapitalize="off"
                                autoCorrect="off"
                            />
                            {proposeInput1 && !STELLAR_G_RE.test(proposeInput1) && (
                                <p className="text-[10px] text-red-400 mt-1">Invalid format — must be 56 chars starting with G.</p>
                            )}
                        </div>
                        <div>
                            <label className="text-[11px] text-zinc-400 mb-1 block">Re-type to confirm</label>
                            <Input
                                value={proposeInput2}
                                onChange={(e) => setProposeInput2(e.target.value.trim())}
                                placeholder="Type the same address again"
                                className="bg-white/[0.03] border-white/[0.08] font-mono text-xs"
                                spellCheck={false}
                                autoCapitalize="off"
                                autoCorrect="off"
                            />
                            {proposeInput2 && proposeInput1 !== proposeInput2 && (
                                <p className="text-[10px] text-red-400 mt-1">Addresses do not match.</p>
                            )}
                        </div>
                        {status?.admin && proposeInput1 === status.admin && (
                            <p className="text-[10px] text-amber-400">⚠ New admin is the same as the current admin.</p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button
                            onClick={handleAction}
                            disabled={
                                submitting
                                || !STELLAR_G_RE.test(proposeInput1)
                                || proposeInput1 !== proposeInput2
                            }
                            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserCog className="w-4 h-4 mr-2" />}
                            Propose
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Accept Admin Dialog */}
            <Dialog open={actionType === 'accept_admin'} onOpenChange={() => closeAction()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-amber-400 flex items-center gap-2">
                            <Check className="w-5 h-5" /> Accept Admin Role
                        </DialogTitle>
                        <DialogDescription>
                            Step 2 of 2 — the pending admin signs. Soroban verifies the signer matches the
                            proposed address; if you're not the pending admin, the transaction will be rejected.
                        </DialogDescription>
                    </DialogHeader>
                    {status?.pendingAdmin && (
                        <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20 space-y-1">
                            <p className="text-[10px] text-amber-300 mb-1">Pending admin (must sign)</p>
                            <code className="text-xs text-amber-200 font-mono break-all">{status.pendingAdmin}</code>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAction} className="border-white/10">Cancel</Button>
                        <Button onClick={handleAction} disabled={submitting} className="bg-amber-600 hover:bg-amber-700">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Accept Role
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default Distributor;
