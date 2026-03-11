import { useState, useEffect } from 'react';
import {
    RefreshCw,
    Loader2,
    CheckCircle,
    XCircle,
    Wallet,
    AlertTriangle,
    Inbox,
    ExternalLink,
    ArrowRight,
    Circle,
    Clock,
} from 'lucide-react';
import { getStellarExplorerTxUrl } from '@/utils/stellar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { platformAdminsApi } from '@/api/platformAdmins';
import { offersApi } from '@/api/offers';

import { useFreighter } from '@/hooks/useFreighter';
import {
    useApprovalQueue,
    type ApprovalItem,
    type ApprovalType,
} from '@/hooks/useApprovalQueue';

// ─── Extracted components ─────────────────────────────────────────────────

import { TYPE_CONFIG, STATUS_BADGE, timeAgo } from '@/components/admin/approvals/constants';
import { FilterChip } from '@/components/admin/approvals/FilterChip';
import { DetailPanel } from '@/components/admin/approvals/DetailPanel';

// ─── Component ────────────────────────────────────────────────────────────

export function Approvals() {
    const { items, counts, loading, error, refresh } = useApprovalQueue();
    const [filter, setFilter] = useState<ApprovalType | 'all'>('all');
    const [selected, setSelected] = useState<ApprovalItem | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Signing progress state — stepped indicator
    type SigningStep = 'fetching_xdr' | 'awaiting_freighter' | 'submitting_signature' | 'processing_stellar' | 'done' | 'error';
    const [signingProgress, setSigningProgress] = useState<{ step: SigningStep; label: string } | null>(null);

    // Success result dialog state
    interface SigningResult {
        success: boolean;
        txHash?: string;
        operationType?: string;
        description?: string;
        signingRole?: string;
        signatureCount?: number;
        thresholdRequired?: number;
        remainingSignatures?: number;
        autoSubmitted?: boolean;
        investorPublicKey?: string;
        investorName?: string;
        assetCode?: string;
        error?: string;
    }
    const [signingResult, setSigningResult] = useState<SigningResult | null>(null);

    // Reject dialog state
    const [rejectDialog, setRejectDialog] = useState<{ open: boolean; item: ApprovalItem | null }>({
        open: false,
        item: null,
    });
    const [rejectReason, setRejectReason] = useState('');

    // Sponsor dialog state
    const [sponsorDialog, setSponsorDialog] = useState<{ open: boolean; item: ApprovalItem | null }>({
        open: false,
        item: null,
    });
    const [sponsorAmount, setSponsorAmount] = useState('10');

    // Freighter for multisig
    const { device: freighterDevice, signTransaction: freighterSign, isSigning, connect: freighterConnect } = useFreighter();

    // System wallets (for showing required signer info)
    const [systemWallets, setSystemWallets] = useState<Array<{ name: string; publicKey: string }>>([]);
    useEffect(() => {
        api.get('/wallets').then((res: any) => {
            const wallets = Array.isArray(res) ? res : res.data || [];
            setSystemWallets(wallets.map((w: any) => ({ name: w.name, publicKey: w.publicKey })));
        }).catch(() => { });
    }, []);

    // Filtered items
    const filteredItems = filter === 'all' ? items : items.filter((i) => i.type === filter);

    // Keep selected item in sync after refresh
    useEffect(() => {
        if (selected) {
            const updated = items.find((i) => i.id === selected.id);
            if (updated) setSelected(updated);
            else setSelected(null);
        }
    }, [items]);

    // ─── Action handlers ──────────────────────────────────────────────────

    const handleApproveInvestor = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await platformAdminsApi.approveInvestor(item.originalId);
            toast.success(`${item.label} approved`);
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to approve');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectInvestor = async () => {
        if (!rejectDialog.item || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await platformAdminsApi.rejectInvestor(rejectDialog.item.originalId, rejectReason);
            toast.success(`${rejectDialog.item.label} rejected`);
            setRejectDialog({ open: false, item: null });
            setRejectReason('');
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSponsorInvestor = async () => {
        if (!sponsorDialog.item) return;
        setActionLoading(true);
        try {
            await platformAdminsApi.sponsorInvestorWallet(sponsorDialog.item.originalId);
            toast.success(`Wallet sponsored for ${sponsorDialog.item.label}`);
            setSponsorDialog({ open: false, item: null });
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to sponsor wallet');
        } finally {
            setActionLoading(false);
        }
    };

    const handleApproveCompany = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${item.originalId}/approve`, {});
            toast.success(`${item.label} approved`);
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to approve');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectCompany = async () => {
        if (!rejectDialog.item || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${rejectDialog.item.originalId}/reject`, {
                reason: rejectReason,
            });
            toast.success(`${rejectDialog.item.label} rejected`);
            setRejectDialog({ open: false, item: null });
            setRejectReason('');
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSponsorCompany = async () => {
        if (!sponsorDialog.item) return;
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${sponsorDialog.item.originalId}/sponsor`, {
                amount: sponsorAmount,
            });
            toast.success(`Sent ${sponsorAmount} XLM to ${sponsorDialog.item.label}`);
            setSponsorDialog({ open: false, item: null });
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to sponsor');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReviewOffer = async (item: ApprovalItem, status: 'approved' | 'rejected') => {
        if (status === 'rejected') {
            setRejectDialog({ open: true, item });
            return;
        }
        setActionLoading(true);
        try {
            const result = await offersApi.review(item.originalId, { status });
            if ((result as any)?.autoIssueResult?.status === 'pending_multisig') {
                toast.success(`${item.label} approved — issuance pipeline started. Sign in the queue below.`);
            } else {
                toast.success(`${item.label} ${status}`);
            }
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to review offer');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectOffer = async () => {
        if (!rejectDialog.item || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await offersApi.review(rejectDialog.item.originalId, {
                status: 'rejected',
                rejection_reason: rejectReason,
            });
            toast.success(`${rejectDialog.item.label} rejected`);
            setRejectDialog({ open: false, item: null });
            setRejectReason('');
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reject offer');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUnlockToken = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await offersApi.unlockToken(item.originalId);
            toast.success(`${item.label} unlocked for trading`);
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to unlock token');
        } finally {
            setActionLoading(false);
        }
    };

    const handleIssueToken = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            // ─── Pre-flight: validate Freighter key before creating the issuance TX ───
            if (!freighterDevice) {
                toast.error('Connect Freighter before issuing a token.');
                return;
            }

            const walletsRes = await api.get('/wallets');
            const wallets: Array<{ name: string; publicKey: string }> = Array.isArray(walletsRes)
                ? walletsRes
                : walletsRes.data || [];
            const issuer = wallets.find((w) => w.name === 'Issuer');
            const distributor = wallets.find((w) => w.name === 'Distributor');
            const requiredKeys = [issuer, distributor].filter(Boolean) as typeof wallets;

            if (!requiredKeys.some((w) => w.publicKey === freighterDevice.publicKey)) {
                const needed = requiredKeys
                    .map((w) => `**${w.name}** (${w.publicKey.slice(0, 4)}…${w.publicKey.slice(-4)})`)
                    .join(', ');
                toast.error(`Wrong Freighter key. Switch to: ${needed}`, { duration: 8000 });
                return;
            }

            const response = await offersApi.issueToken(item.originalId);
            if (!response.success) {
                toast.error(response.error || 'Failed to issue token');
                return;
            }

            // Extract proposal ID from response (multisig path)
            const proposalId = response.data?.multiSigTransactionId
                || response.data?.data?.multiSigTransactionId;

            if (proposalId) {
                // ─── Inline Sign Flow ───
                if (!freighterDevice) {
                    toast.info('Issuance proposal created. Connect Freighter to sign.');
                    await refresh();
                    return;
                }

                // Fetch proposal details to validate signer
                const txDetail = await api.get(`/admin/transactions/${proposalId}`);
                const required: string[] = txDetail.data?.requiredSigners || [];
                const signerRoles: Record<string, string> = txDetail.data?.metadata?.signerRoles || {};
                const getRoleName = (pk: string) => signerRoles[pk] || pk.slice(0, 4) + '…' + pk.slice(-4);

                if (!required.includes(freighterDevice.publicKey)) {
                    const needed = required.map(k => `${getRoleName(k)} (${k.slice(0, 4)}…${k.slice(-4)})`).join(', ');
                    toast.error(`Wrong Freighter key. Switch to: ${needed}`);
                    await refresh();
                    return;
                }

                // Fetch XDR and sign
                const xdrRes = await api.get(`/admin/transactions/${proposalId}/xdr`);
                if (!xdrRes.success) throw new Error('Failed to get transaction XDR');

                const signResult = await freighterSign(xdrRes.data.xdr, xdrRes.data.networkPassphrase);
                if (!signResult) {
                    toast.info('Signing cancelled — proposal saved for later signing.');
                    await refresh();
                    return;
                }

                const submitRes = await api.post(`/admin/transactions/${proposalId}/sign`, {
                    publicKey: signResult.publicKey,
                    signature: signResult.signature,
                });

                if (submitRes.success && submitRes.data?.autoSubmitted) {
                    toast.success(`Token issued for ${item.label} — submitted to Stellar!`);
                } else if (submitRes.success && submitRes.data?.remainingSignatures > 0) {
                    // Tell user which key to switch to
                    const nextSigners = (required as string[])
                        .filter((k: string) => k !== signResult.publicKey && !(submitRes.data?.collectedSignatures || {})[k])
                        .map((k: string) => signerRoles[k] || k.slice(0, 4) + '…' + k.slice(-4));
                    toast.info(`Signed as ${signerRoles[signResult.publicKey] || 'Signer'} ✓ — switch Freighter to ${nextSigners.join(', ')} and sign in the Signatures tab.`);
                } else if (submitRes.success) {
                    toast.success(`Token issued for ${item.label}`);
                } else {
                    toast.error(submitRes.error || 'Signature submission failed');
                }
            } else {
                // Direct execution (env mode)
                toast.success(`Token issued for ${item.label}`);
            }
            await refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Failed to issue token');
        } finally {
            setActionLoading(false);
        }
    };

    const handleVerifyIssuance = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            const response = await offersApi.verifyIssuance(item.originalId);
            if (response.success) {
                toast.success(`${item.label} verified — ready for launch`);
                await refresh();
            } else {
                toast.error(response.error || 'Failed to verify issuance');
            }
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to verify issuance');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSignMultisig = async (item: ApprovalItem) => {
        if (!freighterDevice) {
            toast.error('Freighter not detected. Install the extension and refresh.');
            return;
        }

        const tx = item.raw;
        const signerRoles: Record<string, string> = tx.metadata?.signerRoles || {};
        const getRoleName = (pk: string) => signerRoles[pk] || pk.slice(0, 4) + '…' + pk.slice(-4);
        const collected = tx.collectedSignatures || {};
        const remaining: string[] = (tx.requiredSigners || []).filter((s: string) => !collected[s]);

        console.log('[Approvals] handleSignMultisig called', {
            freighterKey: freighterDevice.publicKey?.slice(0, 8),
            requiredSigners: tx.requiredSigners?.map((k: string) => k.slice(0, 8)),
            remaining: remaining.map((k: string) => k.slice(0, 8)),
            collected: Object.keys(collected).map((k: string) => k.slice(0, 8)),
        });

        // Pre-sign validation
        if (!remaining.includes(freighterDevice.publicKey)) {
            const alreadySigned = tx.requiredSigners?.includes(freighterDevice.publicKey);
            if (alreadySigned) {
                toast.error(`Already signed as ${getRoleName(freighterDevice.publicKey)}. Switch Freighter to another required signer.`);
            } else {
                const neededRoles = remaining.map((k: string) => `${getRoleName(k)} (${k.slice(0, 4)}…${k.slice(-4)})`).join(', ');
                toast.error(`Wrong Freighter key! Switch to: ${neededRoles}`);
                console.warn('[Approvals] Key mismatch — connected:', freighterDevice.publicKey, 'needed:', remaining);
            }
            return;
        }

        const signingRole = getRoleName(freighterDevice.publicKey);

        setActionLoading(true);
        setSigningProgress({ step: 'fetching_xdr', label: 'Fetching transaction...' });
        try {
            console.log('[Approvals] Step 1: Fetching XDR for tx', item.originalId);
            const xdrRes = await api.get(`/admin/transactions/${item.originalId}/xdr`);
            if (!xdrRes.success) throw new Error('Failed to get transaction XDR');

            const { xdr, networkPassphrase } = xdrRes.data;
            setSigningProgress({ step: 'awaiting_freighter', label: 'Sign in Freighter...' });
            const signResult = await freighterSign(xdr, networkPassphrase);
            if (!signResult) {
                setSigningProgress(null);
                setActionLoading(false);
                toast.info('Signing cancelled.');
                return;
            }

            setSigningProgress({ step: 'submitting_signature', label: 'Submitting signature...' });
            const submitRes = await api.post(`/admin/transactions/${item.originalId}/sign`, {
                publicKey: signResult.publicKey,
                signature: signResult.signature,
            });
            console.log('[Approvals] Sign result:', submitRes);

            if (submitRes.success) {
                const data = submitRes.data;
                const remainingAfter = data?.remainingSignatures ?? (tx.thresholdRequired - (data?.signatureCount || 1));

                if (data?.autoSubmitted && data?.submitResult?.success) {
                    // Fully signed and auto-submitted
                    setSigningProgress({ step: 'done', label: 'Transaction executed!' });
                    setSigningResult({
                        success: true,
                        txHash: data.submitResult.hash,
                        operationType: tx.operationType,
                        description: tx.description,
                        signingRole,
                        signatureCount: data.signatureCount,
                        thresholdRequired: tx.thresholdRequired,
                        remainingSignatures: 0,
                        autoSubmitted: true,
                        investorPublicKey: tx.metadata?.investorPublicKey,
                        investorName: tx.metadata?.investorName,
                        assetCode: tx.metadata?.assetCode,
                    });
                } else if (remainingAfter <= 0) {
                    // All signatures collected, pending submission
                    setSigningProgress({ step: 'done', label: 'Signatures complete!' });
                    setSigningResult({
                        success: true,
                        operationType: tx.operationType,
                        description: tx.description,
                        signingRole,
                        signatureCount: data.signatureCount,
                        thresholdRequired: tx.thresholdRequired,
                        remainingSignatures: 0,
                        autoSubmitted: false,
                    });
                } else {
                    // Partially signed — more signers needed
                    const nextSigners = remaining.filter((k: string) => k !== signResult.publicKey);
                    const nextRoles = nextSigners.map((k: string) => getRoleName(k)).join(', ');
                    setSigningProgress({ step: 'done', label: 'Signature recorded' });
                    setSigningResult({
                        success: true,
                        operationType: tx.operationType,
                        description: tx.description,
                        signingRole,
                        signatureCount: data.signatureCount,
                        thresholdRequired: tx.thresholdRequired,
                        remainingSignatures: remainingAfter,
                    });
                    toast.info(`Switch Freighter to ${nextRoles} to continue.`);
                }
            } else {
                console.warn('[Approvals] Submit returned non-success:', submitRes);
                setSigningProgress({ step: 'error', label: 'Submission failed' });
                setSigningResult({
                    success: false,
                    error: submitRes.error || 'Signature submission failed',
                    operationType: tx.operationType,
                    description: tx.description,
                });
            }
            await refresh();
        } catch (err: any) {
            console.error('[Approvals] handleSignMultisig error:', err);
            setSigningProgress({ step: 'error', label: 'Failed' });
            setSigningResult({
                success: false,
                error: err.message || 'Failed to sign',
            });
        } finally {
            setActionLoading(false);
        }
    };

    const handleSubmitMultisig = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await api.post(`/admin/transactions/${item.originalId}/submit`, {});
            toast.success('Transaction submitted to Stellar');
            await refresh();
        } catch (err: any) {
            toast.error(err.message || 'Failed to submit');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectMultisig = async (item: ApprovalItem) => {
        setActionLoading(true);
        try {
            await api.post(`/admin/transactions/${item.originalId}/reject`, {
                reason: 'Rejected by admin',
            });
            toast.success('Transaction rejected');
            await refresh();
        } catch (err: any) {
            toast.error(err.message || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    // Dispatch reject submit based on item type
    const handleRejectSubmit = () => {
        if (!rejectDialog.item) return;
        switch (rejectDialog.item.type) {
            case 'investor': return handleRejectInvestor();
            case 'company': return handleRejectCompany();
            case 'offer': return handleRejectOffer();
            default: return;
        }
    };

    // Dispatch sponsor submit based on item type
    const handleSponsorSubmit = () => {
        if (!sponsorDialog.item) return;
        switch (sponsorDialog.item.type) {
            case 'investor': return handleSponsorInvestor();
            case 'company': return handleSponsorCompany();
            default: return;
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="space-y-5">
            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2">
                <FilterChip
                    active={filter === 'all'}
                    count={counts.all}
                    label="All"
                    onClick={() => setFilter('all')}
                />
                {(Object.keys(TYPE_CONFIG) as ApprovalType[]).map((type) => {
                    const cfg = TYPE_CONFIG[type];
                    const Icon = cfg.icon;
                    return (
                        <FilterChip
                            key={type}
                            active={filter === type}
                            count={counts[type]}
                            label={cfg.label}
                            icon={<Icon className="w-3.5 h-3.5" />}
                            onClick={() => setFilter(type)}
                        />
                    );
                })}
                <div className="ml-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                            // Heal all stuck items before refreshing the queue
                            try {
                                const res = await api.post('/admin/transactions/deposits/retry-all', {});
                                const d = res?.data || res;
                                const msg = d?.message;
                                if (msg && (d?.expiredMultisig || d?.retriedDeposits?.length)) {
                                    toast.info(msg);
                                }
                            } catch {
                                // Silent — heal is best-effort
                            }
                            refresh();
                        }}
                        disabled={loading}
                        className="gap-2"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Split pane */}
            <div className="grid grid-cols-[minmax(340px,2fr)_3fr] gap-4 min-h-[calc(100vh-260px)]">
                {/* ── Left: Master list ── */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                            Queue · {filteredItems.length} items
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <CheckCircle className="w-10 h-10 text-emerald-500/50 mb-3" />
                                <p className="text-sm text-zinc-400">All caught up</p>
                                <p className="text-xs text-zinc-600 mt-1">No pending approvals</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.04]">
                                {filteredItems.map((item) => {
                                    const cfg = TYPE_CONFIG[item.type];
                                    const Icon = cfg.icon;
                                    const isSelected = selected?.id === item.id;

                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => setSelected(item)}
                                            className={`w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.04] ${isSelected ? 'bg-white/[0.06] border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 ${cfg.color}`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-white truncate">
                                                            {item.label}
                                                        </span>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${STATUS_BADGE[item.normalizedStatus]}`}
                                                        >
                                                            {item.normalizedStatus === 'in_progress' ? 'in progress' : item.normalizedStatus}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-zinc-500 truncate mt-0.5">{item.subtitle}</p>
                                                </div>
                                                <span className="text-[11px] text-zinc-600 shrink-0 mt-0.5">
                                                    {timeAgo(item.createdAt)}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: Detail panel ── */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                    {!selected ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                            <Inbox className="w-12 h-12 text-zinc-700 mb-3" />
                            <p className="text-sm text-zinc-500">Select an item to review</p>
                        </div>
                    ) : (
                        <DetailPanel
                            item={selected}
                            actionLoading={actionLoading}
                            isSigning={isSigning}
                            freighterConnected={!!freighterDevice}
                            freighterPublicKey={freighterDevice?.publicKey || ''}
                            systemWallets={systemWallets}
                            onConnectFreighter={freighterConnect}
                            onApproveInvestor={() => handleApproveInvestor(selected)}
                            onRejectInvestor={() => setRejectDialog({ open: true, item: selected })}
                            onSponsorInvestor={() => setSponsorDialog({ open: true, item: selected })}
                            onApproveCompany={() => handleApproveCompany(selected)}
                            onRejectCompany={() => setRejectDialog({ open: true, item: selected })}
                            onSponsorCompany={() => setSponsorDialog({ open: true, item: selected })}
                            onApproveOffer={() => handleReviewOffer(selected, 'approved')}
                            onRejectOffer={() => handleReviewOffer(selected, 'rejected')}
                            onIssueToken={() => handleIssueToken(selected)}
                            onVerifyIssuance={() => handleVerifyIssuance(selected)}
                            onUnlockToken={() => handleUnlockToken(selected)}
                            onSignMultisig={() => handleSignMultisig(selected)}
                            onSubmitMultisig={() => handleSubmitMultisig(selected)}
                            onRejectMultisig={() => handleRejectMultisig(selected)}
                        />
                    )}
                </div>
            </div>

            {/* ── Reject dialog ── */}
            <Dialog
                open={rejectDialog.open}
                onOpenChange={(open) => setRejectDialog({ open, item: rejectDialog.item })}
            >
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Reject {rejectDialog.item?.label}</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. Please provide a reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="reject-reason">Reason</Label>
                        <Input
                            id="reject-reason"
                            placeholder="e.g., Invalid documentation, incomplete KYC..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="mt-2 bg-white/5 border-white/10"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectDialog({ open: false, item: null })}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={!rejectReason.trim() || actionLoading}
                            onClick={handleRejectSubmit}
                        >
                            {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Sponsor dialog ── */}
            <Dialog
                open={sponsorDialog.open}
                onOpenChange={(open) => setSponsorDialog({ open, item: sponsorDialog.item })}
            >
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Sponsor Wallet</DialogTitle>
                        <DialogDescription>
                            Send XLM to {sponsorDialog.item?.label}'s wallet for transaction fees.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label htmlFor="sponsor-amount">Amount (XLM)</Label>
                        <Input
                            id="sponsor-amount"
                            type="number"
                            min="1"
                            max="1000"
                            value={sponsorAmount}
                            onChange={(e) => setSponsorAmount(e.target.value)}
                            className="bg-white/5 border-white/10"
                        />
                        <p className="text-xs text-zinc-500">Default: 10 XLM for transaction fees</p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setSponsorDialog({ open: false, item: null })}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={actionLoading}
                            onClick={handleSponsorSubmit}
                        >
                            {actionLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Wallet className="w-4 h-4 mr-2" />
                            )}
                            Send XLM
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Signing progress overlay ── */}
            {signingProgress && signingProgress.step !== 'done' && signingProgress.step !== 'error' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-white/10 rounded-xl p-8 flex flex-col items-center gap-6 min-w-[340px] shadow-2xl">
                        {/* Step indicators */}
                        <div className="flex flex-col gap-3 w-full">
                            {[
                                { key: 'fetching_xdr', label: 'Fetching transaction' },
                                { key: 'awaiting_freighter', label: 'Sign in Freighter' },
                                { key: 'submitting_signature', label: 'Submitting signature' },
                            ].map((s, i) => {
                                const steps = ['fetching_xdr', 'awaiting_freighter', 'submitting_signature'];
                                const currentIdx = steps.indexOf(signingProgress.step);
                                const stepIdx = i;
                                const isActive = stepIdx === currentIdx;
                                const isDone = stepIdx < currentIdx;

                                return (
                                    <div key={s.key} className="flex items-center gap-3">
                                        {isDone ? (
                                            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                        ) : isActive ? (
                                            <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
                                        ) : (
                                            <Circle className="w-5 h-5 text-zinc-600 shrink-0" />
                                        )}
                                        <span className={`text-sm ${isDone ? 'text-zinc-400 line-through' : isActive ? 'text-white font-medium' : 'text-zinc-600'}`}>
                                            {s.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-xs text-zinc-500 text-center">
                            {signingProgress.step === 'awaiting_freighter'
                                ? 'Approve the transaction in your Freighter extension'
                                : signingProgress.label}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Signing result dialog ── */}
            <Dialog
                open={!!signingResult}
                onOpenChange={(open) => {
                    if (!open) {
                        setSigningResult(null);
                        setSigningProgress(null);
                    }
                }}
            >
                <DialogContent className="bg-slate-900 border-white/10 max-w-lg overflow-hidden">
                    {signingResult && (
                        <>
                            <DialogHeader className="items-center text-center">
                                {signingResult.success ? (
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                                    </div>
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
                                        <XCircle className="w-8 h-8 text-red-400" />
                                    </div>
                                )}
                                <DialogTitle className="text-lg">
                                    {signingResult.success
                                        ? signingResult.remainingSignatures === 0 && signingResult.autoSubmitted
                                            ? 'Transaction Executed'
                                            : signingResult.remainingSignatures === 0
                                                ? 'All Signatures Collected'
                                                : 'Signature Recorded'
                                        : 'Transaction Failed'
                                    }
                                </DialogTitle>
                                <DialogDescription className="text-xs text-zinc-400">
                                    {signingResult.description || signingResult.operationType?.replace(/_/g, ' ') || 'Multisig transaction'}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-4">
                                {/* Signature progress */}
                                {signingResult.success && signingResult.signatureCount != null && signingResult.thresholdRequired != null && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-zinc-400">Signatures</span>
                                            <span className="text-white font-medium">
                                                {signingResult.signatureCount}/{signingResult.thresholdRequired}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 rounded-full transition-all duration-500"
                                                style={{ width: `${(signingResult.signatureCount / signingResult.thresholdRequired) * 100}%` }}
                                            />
                                        </div>
                                        {signingResult.signingRole && (
                                            <p className="text-xs text-zinc-500">
                                                Signed as <span className="text-purple-400 font-medium">{signingResult.signingRole}</span>
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Remaining signatures notice */}
                                {signingResult.success && signingResult.remainingSignatures != null && signingResult.remainingSignatures > 0 && (
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                        <Clock className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                                        <p className="text-xs text-yellow-300">
                                            {signingResult.remainingSignatures} more signature{signingResult.remainingSignatures > 1 ? 's' : ''} required.
                                            Switch Freighter to the next signer.
                                        </p>
                                    </div>
                                )}

                                {/* TX hash + Stellar Expert link */}
                                {signingResult.txHash && (
                                    <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2 overflow-hidden">
                                        <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Transaction Hash</span>
                                        <a
                                            href={getStellarExplorerTxUrl(signingResult.txHash)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 group min-w-0 overflow-hidden"
                                        >
                                            <code className="text-xs text-emerald-400 font-mono truncate min-w-0 flex-1 break-all">
                                                {signingResult.txHash}
                                            </code>
                                            <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 transition-colors shrink-0" />
                                        </a>
                                        <p className="text-[11px] text-zinc-600">
                                            View on Stellar Expert ↗
                                        </p>
                                    </div>
                                )}

                                {/* Error message */}
                                {!signingResult.success && signingResult.error && (
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                        <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                        <p className="text-xs text-red-300">{signingResult.error}</p>
                                    </div>
                                )}
                            </div>

                            <DialogFooter className="flex-col gap-2 sm:flex-col">
                                {/* Contextual navigation based on operation type */}
                                {signingResult.success && signingResult.autoSubmitted && signingResult.txHash && (
                                    <>
                                        {signingResult.operationType === 'token_distribute' && signingResult.investorPublicKey && (
                                            <Button
                                                variant="outline"
                                                className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                                onClick={() => {
                                                    const explorerUrl = `https://stellar.expert/explorer/testnet/contract/${signingResult.investorPublicKey}`;
                                                    window.open(explorerUrl, '_blank');
                                                }}
                                            >
                                                <Wallet className="w-4 h-4 mr-2" />
                                                {signingResult.investorName ? `View ${signingResult.investorName}'s Wallet` : 'View Investor Wallet'}
                                                <ArrowRight className="w-4 h-4 ml-auto" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                                            onClick={() => {
                                                window.open(getStellarExplorerTxUrl(signingResult.txHash!), '_blank');
                                            }}
                                        >
                                            <ExternalLink className="w-4 h-4 mr-2" />
                                            Open in Stellar Expert
                                        </Button>
                                    </>
                                )}
                                <Button
                                    className="w-full"
                                    onClick={() => { setSigningResult(null); setSigningProgress(null); }}
                                >
                                    Done
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default Approvals;
