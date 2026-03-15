/**
 * Pay Investors Page
 * Company dashboard for paying investors their yield
 *
 * For bullet maturity: auto-loops prepare→sign→submit in batches of 49,
 * shows timeline progress, and displays "DO NOT INTERACT" popup when done.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    ArrowLeft, AlertTriangle, Clock, CheckCircle, DollarSign, Users, Calendar,
    Loader2, ShieldAlert, Package, CircleDot, Circle,
} from "lucide-react";
import { companyPaymentsApi, type PaymentDetails, type BulletPaymentDetails } from "@/api/companyPayments";
import { usePasskey } from "@/hooks/usePasskey";

// ─── Types ────────────────────────────────────────────────────────────────

interface BatchStep {
    batch: number;
    investorCount: number;
    status: 'pending' | 'signing' | 'submitting' | 'done' | 'error';
    error?: string;
}

// ─── Component ────────────────────────────────────────────────────────────

export function PayInvestors() {
    const { offerId } = useParams<{ offerId: string }>();
    const navigate = useNavigate();
    const { signTransaction } = usePasskey();

    // Core state
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | BulletPaymentDetails | null>(null);
    const [preparedTx, setPreparedTx] = useState<{ transactionXDR: string; expiresAt: string } | null>(null);

    // Batch signing state (bullet maturity)
    const [batchSteps, setBatchSteps] = useState<BatchStep[]>([]);
    const [isBatchSigning, setIsBatchSigning] = useState(false);
    const [showPendingAdminDialog, setShowPendingAdminDialog] = useState(false);
    const [pendingBatchInfo, setPendingBatchInfo] = useState<{ batchCount: number; batchGroupId: string | null } | null>(null);
    const abortRef = useRef(false);

    useEffect(() => {
        if (offerId) loadPaymentDetails();
    }, [offerId]);

    const loadPaymentDetails = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await companyPaymentsApi.getPaymentDetails(parseInt(offerId!));
            if (response.success) {
                setPaymentDetails(response.data);
                // Check for pending maturity batches on bullet offers
                if (response.data && 'totalPayout' in response.data) {
                    try {
                        const batchRes = await companyPaymentsApi.getBatchStatus(parseInt(offerId!));
                        if (batchRes.success && batchRes.data.hasPending) {
                            setPendingBatchInfo(batchRes.data);
                        }
                    } catch { /* silent — batch status is non-critical */ }
                }
            } else {
                setError('Failed to load payment details');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load payment details');
        } finally {
            setLoading(false);
        }
    };

    // ─── Periodic Payment (unchanged flow) ────────────────────────────────

    const handlePreparePayment = async () => {
        try {
            setSubmitting(true);
            setError(null);
            const response = await companyPaymentsApi.preparePayment(parseInt(offerId!));
            if (response.success) {
                setPreparedTx(response.data);
            } else {
                setError('Failed to prepare payment');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to prepare payment');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSignAndSubmit = async () => {
        if (!preparedTx) return;
        try {
            setSubmitting(true);
            setError(null);
            const signedXDR = await signTransaction(preparedTx.transactionXDR);
            const response = await companyPaymentsApi.submitPayment(parseInt(offerId!), signedXDR);
            if (response.success) {
                setSuccess(true);
                setPreparedTx(null);
            } else {
                setError('Failed to submit payment');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to sign or submit payment');
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Bullet Maturity: Batch Signing Loop ──────────────────────────────

    const handleBulletMaturity = useCallback(async () => {
        abortRef.current = false;
        setIsBatchSigning(true);
        setError(null);
        setBatchSteps([]);

        const groupId = crypto.randomUUID();

        let batchNum = 0;
        let remaining = Infinity;

        try {
            while (remaining > 0 && !abortRef.current) {
                batchNum++;

                // Update timeline: add new batch step
                setBatchSteps(prev => [...prev, {
                    batch: batchNum,
                    investorCount: 0,
                    status: 'signing',
                }]);

                // 1. Prepare
                const prepRes = await companyPaymentsApi.preparePayment(parseInt(offerId!), groupId);
                if (!prepRes.success) throw new Error('Failed to prepare batch');

                const { transactionXDR, batchInfo } = prepRes.data;
                const thisCount = batchInfo?.thisCount || prepRes.data.investorCount;
                remaining = batchInfo?.remaining ?? 0;

                setBatchSteps(prev => prev.map(s =>
                    s.batch === batchNum ? { ...s, investorCount: thisCount } : s
                ));

                // 2. Sign with passkey
                const signedXDR = await signTransaction(transactionXDR);
                if (abortRef.current) break;

                // 3. Submit
                setBatchSteps(prev => prev.map(s =>
                    s.batch === batchNum ? { ...s, status: 'submitting' } : s
                ));

                const submitRes = await companyPaymentsApi.submitPayment(
                    parseInt(offerId!),
                    signedXDR,
                    groupId,
                    batchInfo
                );

                if (!submitRes.success) throw new Error('Failed to submit batch');

                setBatchSteps(prev => prev.map(s =>
                    s.batch === batchNum ? { ...s, status: 'done' } : s
                ));

                const status = submitRes.data?.status;
                if (status === 'pending_admin_approval') {
                    remaining = 0;
                } else if (status === 'batch_queued') {
                    remaining = batchInfo?.remaining ?? 1;
                } else if (status === 'completed') {
                    remaining = 0;
                }
            }

            // All batches signed — show DO NOT INTERACT popup
            setShowPendingAdminDialog(true);
        } catch (err: any) {
            setBatchSteps(prev => prev.map((s, i) =>
                i === prev.length - 1 && s.status !== 'done'
                    ? { ...s, status: 'error', error: err.message }
                    : s
            ));
            setError(err.message || 'Batch signing failed');
        } finally {
            setIsBatchSigning(false);
        }
    }, [offerId, signTransaction]);

    const handleCancelBatch = () => {
        abortRef.current = true;
        setIsBatchSigning(false);
    };

    // ─── Computed Values ──────────────────────────────────────────────────

    const isBulletPayment = paymentDetails && 'totalPayout' in paymentDetails;
    const totalOwed = isBulletPayment
        ? (paymentDetails as BulletPaymentDetails).totalPayout
        : (paymentDetails as PaymentDetails)?.totalOwed || 0;

    const getStatusBadge = () => {
        const status = (paymentDetails as PaymentDetails)?.paymentDueStatus;
        switch (status) {
            case 'current':
                return <span className="px-2 py-1 rounded-full bg-success/20 text-success text-xs">Up to Date</span>;
            case 'upcoming':
                return <span className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs">Due Soon</span>;
            case 'due':
                return <span className="px-2 py-1 rounded-full bg-warning/20 text-warning text-xs">Due Today</span>;
            case 'overdue':
                return <span className="px-2 py-1 rounded-full bg-destructive/20 text-destructive text-xs">Overdue</span>;
            case 'defaulted':
                return <span className="px-2 py-1 rounded-full bg-destructive/30 text-destructive text-xs">Defaulted</span>;
            default:
                return null;
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    // ── Periodic success (direct on-chain) ──
    if (success) {
        return (
            <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
                <Card className="glass-panel border-success/20 bg-success/5">
                    <CardContent className="p-8 text-center">
                        <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2 font-heading">Payment Successful!</h2>
                        <p className="text-muted-foreground mb-6">
                            All investors have been paid successfully.
                        </p>
                        <Button onClick={() => navigate('/company/offers')} className="bg-primary hover:bg-primary/90 text-primary-foreground btn-glow">
                            Back to Offers
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 animate-fade-in">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-white transition-transform hover:scale-110">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white font-heading">Pay Investors</h2>
                    <p className="text-muted-foreground">{paymentDetails?.offerName || 'Loading...'}</p>
                </div>
                {getStatusBadge()}
            </div>

            {error && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive animate-fade-in">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {error}
                </div>
            )}

            {/* Persistent pending batch banner (visible on page revisit) */}
            {pendingBatchInfo && !isBatchSigning && (
                <Card className="glass-panel border-amber-500/20 bg-amber-500/5 animate-fade-in">
                    <CardContent className="p-5 space-y-4">
                        <div className="flex items-start gap-3">
                            <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                            <div>
                                <h4 className="text-amber-300 font-bold text-sm">
                                    ⏳ {pendingBatchInfo.batchCount} batch{pendingBatchInfo.batchCount > 1 ? 'es' : ''} awaiting admin approval
                                </h4>
                                <p className="text-amber-200/70 text-xs mt-1">
                                    Do not initiate new blockchain transactions until admin signing is complete.
                                </p>
                            </div>
                        </div>
                        <div className="space-y-2 pl-8">
                            {[
                                { icon: CheckCircle, text: 'Batches signed by company', color: 'text-emerald-400', done: true },
                                { icon: CircleDot, text: 'Admin reviews and signs with Freighter', color: 'text-amber-400', done: false },
                                { icon: Circle, text: 'Transactions submitted to Stellar', color: 'text-zinc-600', done: false },
                                { icon: Circle, text: 'Investors paid, tokens burned', color: 'text-zinc-600', done: false },
                            ].map((step, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                    <step.icon className={`w-3.5 h-3.5 shrink-0 ${step.color}`} />
                                    <span className={step.done ? 'text-emerald-300' : 'text-zinc-400'}>{step.text}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Payment Summary Card */}
            <Card className="glass-panel border-white/5 bg-white/5 animate-fade-in-up animate-delay-1">
                <CardHeader>
                    <CardTitle className="font-heading">Payment Summary</CardTitle>
                    <CardDescription>
                        {isBulletPayment ? 'Bullet payment at maturity — principal + interest returned, tokens burned' : `${paymentDetails?.paymentType} yield payment`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-white/5 rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <DollarSign className="w-4 h-4" />
                                Total Owed
                            </div>
                            <p className="text-2xl font-bold text-success">
                                ${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <Users className="w-4 h-4" />
                                Investors
                            </div>
                            <p className="text-2xl font-bold text-white">
                                {paymentDetails?.investorCount || 0}
                            </p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <Calendar className="w-4 h-4" />
                                Due Date
                            </div>
                            <p className="text-lg font-medium text-white">
                                {paymentDetails && 'nextPaymentDue' in paymentDetails && paymentDetails.nextPaymentDue
                                    ? new Date(paymentDetails.nextPaymentDue).toLocaleDateString()
                                    : isBulletPayment
                                        ? new Date((paymentDetails as BulletPaymentDetails).maturityDate).toLocaleDateString()
                                        : 'N/A'}
                            </p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                <Clock className="w-4 h-4" />
                                {isBulletPayment ? 'Days to Maturity' : 'Rate'}
                            </div>
                            <p className="text-lg font-medium text-white">
                                {isBulletPayment
                                    ? `${(paymentDetails as BulletPaymentDetails).daysUntilMaturity} days`
                                    : `${(paymentDetails as PaymentDetails).annualInterestRate}% APY`}
                            </p>
                        </div>
                    </div>

                    {/* Investor Breakdown */}
                    {paymentDetails?.breakdown && paymentDetails.breakdown.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-muted-foreground">Investor Breakdown</h4>
                            <div className="max-h-[300px] overflow-auto space-y-2">
                                {paymentDetails.breakdown.map((investor, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                                        <div>
                                            <p className="text-white font-medium">{investor.investorName}</p>
                                            <p className="text-xs text-muted-foreground font-mono">
                                                {investor.investorWallet?.slice(0, 10)}...{investor.investorWallet?.slice(-6)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-success font-medium">
                                                ${('interestOwed' in investor ? investor.interestOwed : investor.totalPayout).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                ${'investedAmount' in investor
                                                    ? investor.investedAmount?.toLocaleString('en-US')
                                                    : investor.principal?.toLocaleString('en-US')} invested
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Batch Signing Timeline (bullet maturity) ── */}
            {batchSteps.length > 0 && (
                <Card className="glass-panel border-purple-500/20 bg-purple-500/5 animate-fade-in-up">
                    <CardHeader className="pb-3">
                        <CardTitle className="font-heading text-lg flex items-center gap-2">
                            <Package className="w-5 h-5 text-purple-400" />
                            Batch Signing Progress
                        </CardTitle>
                        <CardDescription>
                            Each batch covers up to 49 investors. Sign each batch with your passkey.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {batchSteps.map((step) => (
                                <div
                                    key={step.batch}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-300 ${
                                        step.status === 'done'
                                            ? 'bg-emerald-500/10 border-emerald-500/20'
                                            : step.status === 'error'
                                                ? 'bg-red-500/10 border-red-500/20'
                                                : step.status === 'signing' || step.status === 'submitting'
                                                    ? 'bg-purple-500/10 border-purple-500/30 shadow-lg shadow-purple-500/5'
                                                    : 'bg-white/5 border-white/10'
                                    }`}
                                >
                                    {/* Step icon */}
                                    {step.status === 'done' ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                    ) : step.status === 'error' ? (
                                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                                    ) : step.status === 'signing' || step.status === 'submitting' ? (
                                        <Loader2 className="w-5 h-5 text-purple-400 animate-spin shrink-0" />
                                    ) : (
                                        <Circle className="w-5 h-5 text-zinc-600 shrink-0" />
                                    )}

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${
                                            step.status === 'done' ? 'text-emerald-300'
                                                : step.status === 'error' ? 'text-red-300'
                                                : step.status === 'signing' || step.status === 'submitting' ? 'text-purple-300'
                                                : 'text-zinc-400'
                                        }`}>
                                            Batch {step.batch}
                                            {step.investorCount > 0 && (
                                                <span className="text-xs ml-2 text-zinc-500">
                                                    ({step.investorCount} investors)
                                                </span>
                                            )}
                                        </p>
                                        {step.status === 'signing' && (
                                            <p className="text-xs text-purple-400/80 mt-0.5">Waiting for passkey signature...</p>
                                        )}
                                        {step.status === 'submitting' && (
                                            <p className="text-xs text-purple-400/80 mt-0.5">Submitting to queue...</p>
                                        )}
                                        {step.error && (
                                            <p className="text-xs text-red-400 mt-0.5">{step.error}</p>
                                        )}
                                    </div>

                                    {/* Status badge */}
                                    <span className={`text-[10px] uppercase tracking-wider font-medium shrink-0 ${
                                        step.status === 'done' ? 'text-emerald-500'
                                            : step.status === 'error' ? 'text-red-500'
                                            : step.status === 'signing' || step.status === 'submitting' ? 'text-purple-400'
                                            : 'text-zinc-600'
                                    }`}>
                                        {step.status === 'signing' ? 'Sign Now' : step.status}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Cancel button during batch signing */}
                        {isBatchSigning && (
                            <div className="mt-4 flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancelBatch}
                                    className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                                >
                                    Cancel Remaining Batches
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Consequences Warning */}
            {(paymentDetails as PaymentDetails)?.paymentDueStatus === 'overdue' && (
                <Card className="glass-panel border-destructive/20 bg-destructive/5 animate-fade-in-up animate-delay-2">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                            <div>
                                <h4 className="text-destructive font-medium">Payment Overdue - Consequences</h4>
                                <ul className="text-sm text-destructive/80 mt-2 space-y-1">
                                    <li>• Late fee: 0.1% per day accumulating</li>
                                    <li>• After 10 days: Collateral will be liquidated</li>
                                    <li>• Your company may be banned from creating new offers</li>
                                </ul>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 animate-fade-in-up animate-delay-3">
                {isBulletPayment ? (
                    /* ── Bullet Maturity: single "Pay Maturity" button ── */
                    <Button
                        onClick={handleBulletMaturity}
                        disabled={isBatchSigning || showPendingAdminDialog || !!pendingBatchInfo}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-6 text-lg shadow-lg shadow-purple-500/20 transition-all"
                    >
                        {isBatchSigning ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Signing Batches...
                            </>
                        ) : showPendingAdminDialog ? (
                            <>
                                <Clock className="w-5 h-5 mr-2" />
                                Awaiting Admin Approval
                            </>
                        ) : (
                            <>
                                <Package className="w-5 h-5 mr-2" />
                                Pay Maturity (${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                            </>
                        )}
                    </Button>
                ) : !preparedTx ? (
                    /* ── Periodic: prepare button ── */
                    <Button
                        onClick={handlePreparePayment}
                        disabled={submitting || totalOwed === 0}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-6 text-lg btn-glow shadow-lg shadow-primary/20"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Preparing...
                            </>
                        ) : (
                            <>
                                <DollarSign className="w-5 h-5 mr-2" />
                                Pay Investors (${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                            </>
                        )}
                    </Button>
                ) : (
                    /* ── Periodic: sign & submit ── */
                    <div className="flex-1 space-y-3">
                        <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
                            <p className="text-warning text-sm">
                                Transaction prepared. Sign with your passkey to complete the payment.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setPreparedTx(null)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSignAndSubmit}
                                disabled={submitting}
                                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground btn-glow"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    'Sign & Submit Payment'
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                DO NOT INTERACT POPUP — Bullet Maturity Pending Admin Approval
               ══════════════════════════════════════════════════════════════════ */}
            <Dialog open={showPendingAdminDialog} onOpenChange={() => { /* Prevent closing */ }}>
                <DialogContent
                    className="bg-slate-950 border-amber-500/30 max-w-lg [&>button]:hidden"
                    onInteractOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    <DialogHeader className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <ShieldAlert className="w-8 h-8 text-amber-400 animate-pulse" />
                        </div>
                        <DialogTitle className="text-2xl font-bold text-amber-400">
                            ⚠️ AWAITING ADMIN APPROVAL
                        </DialogTitle>
                        <DialogDescription className="text-base text-zinc-300 leading-relaxed">
                            All {batchSteps.length} batch{batchSteps.length > 1 ? 'es have' : ' has'} been signed and submitted
                            to the platform admin for multisig approval.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Big warning box */}
                        <div className="p-5 bg-red-500/10 border-2 border-red-500/30 rounded-xl text-center">
                            <p className="text-red-400 font-bold text-lg mb-2">
                                DO NOT INTERACT WITH THE PLATFORM
                            </p>
                            <p className="text-red-300/80 text-sm">
                                Any blockchain transaction from your company wallet before admin approval
                                will invalidate the sequence number and cause all maturity batches to fail.
                            </p>
                        </div>

                        {/* Timeline of what happens next */}
                        <div className="space-y-3 pt-2">
                            <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-medium">What happens next</h4>
                            <div className="space-y-2">
                                {[
                                    { icon: CheckCircle, text: 'Your batches are signed', color: 'text-emerald-400', done: true },
                                    { icon: CircleDot, text: 'Admin reviews and signs with Freighter', color: 'text-amber-400', done: false },
                                    { icon: Circle, text: 'Transaction submitted to Stellar', color: 'text-zinc-600', done: false },
                                    { icon: Circle, text: 'Investors paid, tokens burned, offer closed', color: 'text-zinc-600', done: false },
                                ].map((step, i) => (
                                    <div key={i} className="flex items-center gap-3 text-sm">
                                        <step.icon className={`w-4 h-4 shrink-0 ${step.color}`} />
                                        <span className={step.done ? 'text-emerald-300' : 'text-zinc-400'}>
                                            {step.text}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex-col sm:flex-col gap-2">
                        <p className="text-xs text-zinc-600 text-center">
                            You can safely close this dialog — the batches are queued server-side.
                        </p>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowPendingAdminDialog(false);
                                navigate('/company/offers');
                            }}
                            className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        >
                            I Understand — Return to Offers
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default PayInvestors;
