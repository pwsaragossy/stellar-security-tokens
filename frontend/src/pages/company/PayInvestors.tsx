/**
 * Pay Investors Page
 * Company dashboard for paying investors their yield
 *
 * Periodic (monthly/quarterly/etc): Classic Stellar TX — prepare → sign → submit.
 * Bullet (maturity): Company deposits USDC to MaturitySettlement Soroban contract.
 *   Settlement is triggered by admin on the Contracts page.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
    ArrowLeft, AlertTriangle, Clock, CheckCircle, DollarSign, Users, Calendar,
    Loader2, ShieldAlert, Package, TrendingUp, Database,
    History, ChevronDown, ChevronUp,
} from "lucide-react";
import { companyPaymentsApi, type PaymentDetails, type BulletPaymentDetails } from "@/api/companyPayments";
import { usePasskey } from "@/hooks/usePasskey";
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';
import { Wallet as WalletIcon } from 'lucide-react';
import { AddressDisplay } from '@/components/ui/AddressDisplay';


// ─── Payment History Sub-Component ────────────────────────────────────────

function PaymentHistorySection({ offerId, refreshKey = 0 }: { offerId: number; refreshKey?: number }) {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        setLoading(true);
        companyPaymentsApi.getPaymentHistory(offerId)
            .then((res) => setHistory(res.data || []))
            .catch(() => setHistory([]))
            .finally(() => setLoading(false));
    }, [offerId, refreshKey]);

    if (loading || history.length === 0) return null;

    const totalPaid = history
        .filter((p: any) => p.status === 'completed')
        .reduce((sum: number, p: any) => sum + Number(p.usdcAmount || p.usdc_amount || 0), 0);

    return (
        <Card className="glass-panel border-white/5 bg-white/5 animate-fade-in-up">
            <CardHeader
                className="cursor-pointer select-none"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <History className="w-5 h-5 text-zinc-400" />
                        <CardTitle className="font-heading text-base">
                            Payment History ({history.length})
                        </CardTitle>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-emerald-400 font-mono">
                            ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })} paid
                        </span>
                        {expanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-500" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-500" />
                        )}
                    </div>
                </div>
            </CardHeader>
            {expanded && (
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-white/5">
                                    <th className="pb-2 pr-4">Date</th>
                                    <th className="pb-2 pr-4">Amount</th>
                                    <th className="pb-2 pr-4">TX Hash</th>
                                    <th className="pb-2">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {history.map((payment: any, idx: number) => {
                                    const hash = payment.transactionHash || payment.transaction_hash;
                                    const amount = Number(payment.usdcAmount || payment.usdc_amount || 0);
                                    const date = payment.paymentDate || payment.payment_date || payment.createdAt || payment.created_at;
                                    return (
                                        <tr key={idx} className="text-zinc-300">
                                            <td className="py-2.5 pr-4 whitespace-nowrap">
                                                {date ? new Date(date).toLocaleDateString() : '—'}
                                            </td>
                                            <td className="py-2.5 pr-4 font-mono text-emerald-400">
                                                ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                {hash ? (
                                                    <AddressDisplay
                                                        value={hash}
                                                        truncate={[8, 6]}
                                                        kind="tx"
                                                        linkToExplorer
                                                        className="text-sky-400 text-xs"
                                                    />
                                                ) : (
                                                    <span className="text-zinc-600">—</span>
                                                )}
                                            </td>
                                            <td className="py-2.5">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                    payment.status === 'completed'
                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                        : payment.status === 'failed'
                                                            ? 'bg-red-500/10 text-red-400'
                                                            : 'bg-amber-500/10 text-amber-400'
                                                }`}>
                                                    {payment.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────

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
    const [preparedTx, setPreparedTx] = useState<{
        transactionXDR: string;
        batchXDRs?: string[];
        batchCount?: number;
        expiresAt: string;
        platformFee?: number;
        totalAmount?: number;
        netToInvestors?: number;
    } | null>(null);

    // Multi-batch signing progress
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

    // Wallet balance
    const [walletBalance, setWalletBalance] = useState<string | null>(null);

    // History refresh counter — incremented after successful payment
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0);



    // Settlement contract state (bullet maturity — new Soroban flow)
    const [depositSubmitting, setDepositSubmitting] = useState(false);
    const [depositSuccess, setDepositSuccess] = useState(false);
    const [depositBreakdown, setDepositBreakdown] = useState<{
        xdr: string;
        depositAmount: number;
        breakdown: {
            investorPrincipal: number;
            investorInterest: number;
            platformFee: number;
            totalOwed: number;
        };
    } | null>(null);
    const [settlementStatus, setSettlementStatus] = useState<{
        hasSettlementContract: boolean;
        contractBalance: number | null;
        settlementContractId: string | null;
    } | null>(null);

    // Partial failure tracking
    const [partialResult, setPartialResult] = useState<{
        completedBatches: number;
        failedBatches: number;
        investorsPaid: number;
        totalInvestors: number;
    } | null>(null);

    useEffect(() => {
        if (offerId) loadPaymentDetails();
        fetchWalletBalance();
    }, [offerId]);

    const fetchWalletBalance = async () => {
        try {
            const storedUser = authStorage.getUser<any>('company') || {};
            const companyId = storedUser.companyId || storedUser.id;
            if (!companyId) return;
            const response = await api.get(`/companies/${companyId}/wallet-status`);
            const data = response.data || response;
            if (data.balances?.usdc !== undefined) {
                setWalletBalance(data.balances.usdc);
            }
        } catch { /* non-critical */ }
    };

    // Prevent navigation during signing/submission
    useEffect(() => {
        if (submitting || depositSubmitting) {
            const handler = (e: BeforeUnloadEvent) => {
                e.preventDefault();
                e.returnValue = '';
            };
            window.addEventListener('beforeunload', handler);
            return () => window.removeEventListener('beforeunload', handler);
        }
    }, [submitting, depositSubmitting]);

    const loadPaymentDetails = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await companyPaymentsApi.getPaymentDetails(parseInt(offerId!));
            if (response.success) {
                setPaymentDetails(response.data);
                // For bullet offers: check settlement contract status
                if (response.data && 'totalPayout' in response.data) {
                    try {
                        const statusRes = await companyPaymentsApi.getSettlementStatus(parseInt(offerId!));
                        if (statusRes.success && statusRes.data) {
                            setSettlementStatus(statusRes.data);
                        }
                    } catch { /* silent — settlement status is non-critical */ }

                }

                // For periodic offers: check if there's an active yield payment job (recovery on refresh)
                if (!('totalPayout' in response.data)) {
                    try {
                        const jobRes = await companyPaymentsApi.getYieldJobStatus(parseInt(offerId!));
                        if (jobRes.success && jobRes.data) {
                            const { status } = jobRes.data;
                            if (status === 'confirmed') {
                                setSuccess(true);
                                setHistoryRefreshKey(k => k + 1);
                                fetchWalletBalance();
                            } else if (status === 'partial_failure') {
                                setPartialResult({
                                    completedBatches: jobRes.data.batchProgress.completed,
                                    failedBatches: jobRes.data.batchProgress.total - jobRes.data.batchProgress.completed,
                                    investorsPaid: 0, // Unknown from status alone
                                    totalInvestors: (response.data as PaymentDetails)?.investorCount || 0,
                                });
                            }
                            // 'prepared' or 'submitting' — show a warning but allow re-prepare
                        }
                    } catch { /* silent — job status is non-critical */ }
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
            // Change 11b: Handle E_MATURITY_REACHED error code
            const msg = err?.response?.data?.error || err.message || 'Failed to prepare payment';
            if (msg.includes('PAYMENT_SCHEDULE_COMPLETE') || msg.includes('E_MATURITY_REACHED')) {
                setError('All yield payments are complete. Use Settlement to return principal.');
            } else {
                setError(msg);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleSignAndSubmit = async () => {
        if (!preparedTx) return;
        try {
            setSubmitting(true);
            setError(null);

            const batches = preparedTx.batchXDRs || [preparedTx.transactionXDR];
            const isMultiBatch = batches.length > 1;

            if (isMultiBatch) {
                // ─── Multi-batch: sign each XDR sequentially ─────────
                const signedXDRs: string[] = [];
                for (let i = 0; i < batches.length; i++) {
                    setBatchProgress({ current: i + 1, total: batches.length });
                    const signed = await signTransaction(batches[i]);
                    signedXDRs.push(signed);
                }
                setBatchProgress(null);

                const response = await companyPaymentsApi.submitBatchPayment(parseInt(offerId!), signedXDRs);
                if (response.data?.partial) {
                    // Partial failure — some batches confirmed, some failed
                    setPartialResult({
                        completedBatches: response.data.completedBatches ?? 0,
                        failedBatches: response.data.failedBatches ?? 0,
                        investorsPaid: response.data.investorsPaid ?? 0,
                        totalInvestors: paymentDetails?.investorCount || 0,
                    });
                    setPreparedTx(null);
                } else if (response.success) {
                    setSuccess(true);
                    setHistoryRefreshKey(k => k + 1);
                    fetchWalletBalance();
                    setPreparedTx(null);
                } else {
                    setError('Failed to submit batch payment');
                }
            } else {
                // ─── Single TX (classic or 1-batch Soroban) ──────────
                const signedXDR = await signTransaction(batches[0]);
                const response = await companyPaymentsApi.submitPayment(parseInt(offerId!), signedXDR);
                if (response.success) {
                    setSuccess(true);
                    setHistoryRefreshKey(k => k + 1);
                    fetchWalletBalance();
                    setPreparedTx(null);
                } else {
                    setError('Failed to submit payment');
                }
            }
        } catch (err: any) {
            setBatchProgress(null);
            const msg = err?.response?.data?.error || err.message || 'Failed to sign or submit payment';
            if (msg.includes('PAYMENT_SCHEDULE_COMPLETE') || msg.includes('E_MATURITY_REACHED')) {
                setError('All yield payments are complete. Use Settlement to return principal.');
            } else {
                setError(msg);
            }
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Bullet Maturity: Deposit to Settlement Contract ───────────────────

    /** Step 1: Backend computes deposit amount + builds Soroban TX */
    const handlePrepareDeposit = useCallback(async () => {
        try {
            setDepositSubmitting(true);
            setError(null);

            const res = await companyPaymentsApi.prepareDeposit(parseInt(offerId!));
            if (!res.success) throw new Error('Failed to prepare deposit');

            // Store breakdown + XDR for the confirmation step
            setDepositBreakdown({
                xdr: res.data.xdr,
                depositAmount: res.data.depositAmount,
                breakdown: res.data.breakdown,
            });
        } catch (err: any) {
            setError(err.message || 'Failed to prepare deposit');
        } finally {
            setDepositSubmitting(false);
        }
    }, [offerId]);

    /** Step 2: Company signs and submits (no admin needed) */
    const handleSignAndSubmitDeposit = useCallback(async () => {
        if (!depositBreakdown) return;
        try {
            setDepositSubmitting(true);
            setError(null);

            const signedXDR = await signTransaction(depositBreakdown.xdr);
            const res = await companyPaymentsApi.submitDeposit(parseInt(offerId!), signedXDR);
            if (!res.success) throw new Error('Deposit submission failed');

            setDepositSuccess(true);
            setDepositBreakdown(null);

            // Refresh settlement status
            const statusRes = await companyPaymentsApi.getSettlementStatus(parseInt(offerId!));
            if (statusRes.success && statusRes.data) setSettlementStatus(statusRes.data);
        } catch (err: any) {
            setError(err.message || 'Failed to sign or submit deposit');
        } finally {
            setDepositSubmitting(false);
        }
    }, [offerId, depositBreakdown, signTransaction]);



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

    // ── Periodic success: rendered inline below (no early return) ──

    // ── Partial failure (some batches succeeded, some failed) ──
    if (partialResult) {
        return (
            <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
                <Card className="glass-panel border-amber-500/20 bg-amber-500/5">
                    <CardContent className="p-8 text-center">
                        <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2 font-heading">Partial Payment</h2>
                        <p className="text-muted-foreground mb-4">
                            {partialResult.investorsPaid} of {partialResult.totalInvestors} investors paid successfully.
                        </p>
                        <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-6">
                            <div className="p-3 bg-emerald-500/10 rounded-lg">
                                <p className="text-xs text-emerald-400/80">Completed</p>
                                <p className="text-xl font-bold text-emerald-400">{partialResult.completedBatches} batch{partialResult.completedBatches !== 1 ? 'es' : ''}</p>
                            </div>
                            <div className="p-3 bg-red-500/10 rounded-lg">
                                <p className="text-xs text-red-400/80">Failed</p>
                                <p className="text-xl font-bold text-red-400">{partialResult.failedBatches} batch{partialResult.failedBatches !== 1 ? 'es' : ''}</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-6">
                            Admin has been notified and will retry the remaining investors.
                            No action needed from you.
                        </p>
                        <Button onClick={() => navigate('/company/offers')} variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
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

            {/* Wallet Balance */}
            {walletBalance !== null && (
                <div className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-lg animate-fade-in">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <WalletIcon className="w-4 h-4" />
                        <span className="text-sm">Company Wallet</span>
                    </div>
                    <div className="text-right">
                        <span className={`font-mono font-medium ${
                            Number(walletBalance) < totalOwed
                                ? 'text-red-400'
                                : 'text-emerald-400'
                        }`}>
                            ${Number(walletBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                        </span>
                        {Number(walletBalance) < totalOwed && totalOwed > 0 && (
                            <p className="text-xs text-red-400/70 mt-0.5">
                                Insufficient — need ${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {error && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive animate-fade-in">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {error}
                </div>
            )}

            {success && (
                <div className="p-4 bg-success/10 border border-success/20 rounded-lg animate-fade-in flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-success font-medium">Payment Successful</p>
                        <p className="text-success/70 text-sm">All investors have been paid. Check the payment history below for details.</p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/company/offers')}
                        className="border-success/30 text-success hover:bg-success/10 flex-shrink-0"
                    >
                        Back to Offers
                    </Button>
                </div>
            )}


            {/* Payment Schedule Progress */}
            {paymentDetails && !isBulletPayment && (() => {
                const details = paymentDetails as PaymentDetails;
                // Change 8: Server-authoritative data — DELETE client-side Math.ceil
                const paymentsMade = (details as any).paymentsMade ?? 0;
                const totalExpected = (details as any).totalExpectedPayments;
                const isLastPeriod = (details as any).isLastPeriod;
                const maturityReached = (details as any).maturityReached;
                const maturityDate = (details as any).maturityDate;
                const offerCreatedAt = (details as any).offerCreatedAt;

                // Perpetual offers: totalExpected === null
                const isPerpetual = totalExpected === null;
                const isOverpaid = !isPerpetual && paymentsMade > totalExpected;
                const remaining = isPerpetual ? null : Math.max(0, totalExpected - paymentsMade);
                const progressPct = !isPerpetual && totalExpected > 0
                    ? Math.min(100, (paymentsMade / totalExpected) * 100)
                    : 0;

                return (
                    <Card className="glass-panel border-white/5 bg-white/5 animate-fade-in-up">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base font-heading flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-primary" />
                                Payment Schedule
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Change 9: Last-period warning */}
                            {isLastPeriod && !maturityReached && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                                    <p className="text-sm text-amber-300">
                                        This is your <strong>final yield payment</strong>. After payment, initiate Maturity Settlement to return principal and close this offer.
                                    </p>
                                </div>
                            )}

                            {/* Change 10: Maturity-reached block */}
                            {maturityReached && (
                                <div className={`p-3 rounded-lg flex items-start gap-2 ${
                                    details.paymentType === 'bullet'
                                        ? 'bg-red-500/10 border border-red-500/20'
                                        : 'bg-emerald-500/10 border border-emerald-500/20'
                                }`}>
                                    <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${
                                        details.paymentType === 'bullet' ? 'text-red-400' : 'text-emerald-400'
                                    }`} />
                                    <div className="text-sm">
                                        <p className={details.paymentType === 'bullet' ? 'text-red-300' : 'text-emerald-300'}>
                                            All {totalExpected} yield payments complete.
                                            {maturityDate && ` Maturity reached on ${new Date(maturityDate).toLocaleDateString()}.`}
                                        </p>
                                        <p className="text-muted-foreground mt-1">
                                            Go to Contracts → Settlement to return principal and burn tokens.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Change 11: Overpaid warning */}
                            {isOverpaid && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                                    <p className="text-sm text-amber-300">
                                        More payments recorded ({paymentsMade}) than expected ({totalExpected}). Contact admin for reconciliation.
                                    </p>
                                </div>
                            )}

                            {/* Progress bar */}
                            {!isPerpetual && totalExpected > 0 && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            {paymentsMade} of {totalExpected} payments completed
                                        </span>
                                        <span className="text-white font-mono">{Math.round(progressPct)}%</span>
                                    </div>
                                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-primary to-emerald-400 rounded-full transition-all duration-500"
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>{remaining} remaining</span>
                                        <span className="capitalize">{details.paymentType}</span>
                                    </div>
                                </div>
                            )}

                            {/* Perpetual indicator */}
                            {isPerpetual && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <TrendingUp className="w-4 h-4" />
                                    <span>Ongoing — no maturity date set ({paymentsMade} payments made)</span>
                                </div>
                            )}

                            {/* Key dates */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-white/5 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-1">First Payment</p>
                                    <p className="text-sm text-white font-medium">
                                        {details.lastPaymentDate && paymentsMade > 0
                                            ? offerCreatedAt
                                                ? new Date(offerCreatedAt).toLocaleDateString()
                                                : '—'
                                            : 'Pending'}
                                    </p>
                                </div>
                                <div className="p-3 bg-white/5 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-1">Next Due</p>
                                    <p className="text-sm text-white font-medium">
                                        {details.nextPaymentDue
                                            ? new Date(details.nextPaymentDue).toLocaleDateString()
                                            : '—'}
                                    </p>
                                </div>
                                <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                                    <p className="text-xs text-emerald-400/80 mb-1">Maturity</p>
                                    <p className="text-sm text-emerald-400 font-medium">
                                        {maturityDate
                                            ? new Date(maturityDate).toLocaleDateString()
                                            : 'No maturity set'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })()}

            {/* Payment Summary Card */}
            <Card className="glass-panel border-white/5 bg-white/5 animate-fade-in-up animate-delay-1">
                <CardHeader>
                    <CardTitle className="font-heading">Payment Summary</CardTitle>
                    <CardDescription>
                        {isBulletPayment ? 'Bullet payment at maturity — principal + interest returned, tokens burned' : `${paymentDetails?.paymentType} yield payment`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Stats Grid — Payment Breakdown */}
                    {(() => {
                        // Compute spread from the offer's rates
                        const annualRate = isBulletPayment
                            ? 0
                            : (paymentDetails as PaymentDetails)?.annualInterestRate || 0;
                        const investorRate = isBulletPayment
                            ? 0
                            : (paymentDetails as PaymentDetails)?.investorRate ?? annualRate;
                        const spreadPct = Math.max(0, annualRate - investorRate);
                        const platformFeeEst = investorRate > 0
                            ? Math.round(totalOwed * (spreadPct / investorRate) * 100) / 100
                            : 0;
                        const companyPays = totalOwed + platformFeeEst;
                        const balanceSource = (paymentDetails as any)?.balanceSource;

                        return (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-white/5 rounded-lg">
                                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                            <DollarSign className="w-4 h-4" />
                                            Company Pays
                                        </div>
                                        <p className="text-2xl font-bold text-white">
                                            ${companyPays.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                                        <div className="flex items-center gap-2 text-emerald-400/80 text-sm mb-1">
                                            <TrendingUp className="w-4 h-4" />
                                            Net to Investors
                                        </div>
                                        <p className="text-2xl font-bold text-emerald-400">
                                            ${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-lg">
                                        <div className="flex items-center gap-2 text-purple-400/80 text-sm mb-1">
                                            <ShieldAlert className="w-4 h-4" />
                                            Platform Fee
                                        </div>
                                        <p className="text-2xl font-bold text-purple-400">
                                            ${platformFeeEst.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </p>
                                        {spreadPct > 0 && (
                                            <p className="text-xs text-purple-400/60 mt-1">
                                                {spreadPct.toFixed(1)}% spread
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                                        {isBulletPayment ? (
                                            <p className="text-lg font-medium text-white">
                                                {(paymentDetails as BulletPaymentDetails).daysUntilMaturity} days
                                            </p>
                                        ) : (
                                            <div>
                                                <p className="text-lg font-medium text-white">{annualRate}% APY</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {investorRate}% to investors · {spreadPct}% platform
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Balance source indicator */}
                                {balanceSource && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                                        <Database className="w-3 h-3" />
                                        <span>
                                            Balance source: {balanceSource === 'on_chain' ? '🔗 On-chain (Soroban)' : '📊 Database'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Investor Breakdown */}
                    {paymentDetails?.breakdown && paymentDetails.breakdown.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-muted-foreground">Investor Breakdown</h4>
                            <div className="max-h-[300px] overflow-auto space-y-2">
                                {paymentDetails.breakdown.map((investor, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                                        <div>
                                            <p className="text-white font-medium">{investor.investorName}</p>
                                            <AddressDisplay
                                                value={investor.investorWallet}
                                                truncate={[10, 6]}
                                                showCopy
                                                className="text-xs text-muted-foreground"
                                            />

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


            {/* Consequences Warning */}
            {(paymentDetails as PaymentDetails)?.paymentDueStatus === 'overdue' && (
                <Card className="glass-panel border-destructive/20 bg-destructive/5 animate-fade-in-up animate-delay-2">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                            <div>
                                <h4 className="text-destructive font-medium">Payment Overdue</h4>
                                <ul className="text-sm text-destructive/80 mt-2 space-y-1">
                                    <li>• Please settle this payment as soon as possible</li>
                                    <li>• Continued non-payment may result in penalties and collateral enforcement</li>
                                    <li>• Your company may be restricted from creating new offers</li>
                                </ul>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 animate-fade-in-up animate-delay-3">
                {isBulletPayment ? (
                    /* ── Bullet Maturity: Deposit to Settlement Contract ── */
                    depositSuccess ? (
                        <div className="flex-1 p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center space-y-3">
                            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                            <h4 className="text-lg font-bold text-emerald-300">Deposit Submitted</h4>
                            <p className="text-sm text-emerald-200/70">
                                USDC deposited to settlement contract. Admin will execute the settlement to pay investors and burn tokens.
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => navigate('/company/offers')}
                                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            >
                                Back to Offers
                            </Button>
                        </div>
                    ) : settlementStatus?.contractBalance && settlementStatus.contractBalance > 0 ? (
                        <div className="flex-1 p-5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center space-y-3">
                            <Clock className="w-10 h-10 text-amber-400 mx-auto" />
                            <h4 className="text-lg font-bold text-amber-300">Deposit Already Made</h4>
                            <p className="text-sm text-amber-200/70">
                                ${settlementStatus.contractBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC is in the settlement contract. Admin will execute settlement.
                            </p>
                        </div>
                    ) : depositBreakdown ? (
                        /* Confirmation step — show breakdown + sign button */
                        <div className="flex-1 space-y-4">
                            <div className="p-5 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-4">
                                <h4 className="text-sm font-bold text-purple-300 uppercase tracking-wider">Deposit Breakdown</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Investor Principal</span>
                                        <span className="text-white font-mono">${depositBreakdown.breakdown.investorPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Investor Interest</span>
                                        <span className="text-emerald-400 font-mono">${depositBreakdown.breakdown.investorInterest.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Platform Fee (spread)</span>
                                        <span className="text-purple-400 font-mono">${depositBreakdown.breakdown.platformFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="h-px bg-white/10 my-2" />
                                    <div className="flex justify-between text-base font-bold">
                                        <span className="text-white">Total USDC to Deposit</span>
                                        <span className="text-white font-mono">${depositBreakdown.depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setDepositBreakdown(null)}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSignAndSubmitDeposit}
                                    disabled={depositSubmitting}
                                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white"
                                >
                                    {depositSubmitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        'Sign & Deposit'
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            onClick={handlePrepareDeposit}
                            disabled={depositSubmitting}
                            className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-6 text-lg shadow-lg shadow-purple-500/20 transition-all"
                        >
                            {depositSubmitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Preparing...
                                </>
                            ) : (
                                <>
                                    <Package className="w-5 h-5 mr-2" />
                                    Deposit for Maturity (${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                                </>
                            )}
                        </Button>
                    )
                ) : !preparedTx ? (
                    /* ── Periodic: prepare button (hidden when maturity reached) ── */
                    (() => {
                        const mr = (paymentDetails as any)?.maturityReached;
                        const op = (paymentDetails as any)?.paymentsMade > (paymentDetails as any)?.totalExpectedPayments;
                        if (mr || op) return null; // Change 10/11: Block payment
                        return (
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
                        );
                    })()
                ) : (
                    /* ── Periodic: sign & submit ── */
                    <div className="flex-1 space-y-4">
                        {/* Payment Confirmation Card */}
                        <Card className="border-primary/20 bg-primary/5">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base font-heading flex items-center gap-2">
                                    <ShieldAlert className="w-5 h-5 text-primary" />
                                    Confirm Payment Details
                                </CardTitle>
                                <CardDescription>
                                    Review the details below before signing.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Period Context */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <p className="text-xs text-muted-foreground mb-1">Payment Type</p>
                                        <p className="text-white font-medium capitalize">
                                            {(paymentDetails as PaymentDetails)?.paymentType || '—'} Yield
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <p className="text-xs text-muted-foreground mb-1">Last Payment</p>
                                        <p className="text-white font-medium">
                                            {(paymentDetails as PaymentDetails)?.lastPaymentDate
                                                ? new Date((paymentDetails as PaymentDetails).lastPaymentDate!).toLocaleDateString()
                                                : 'Never — first payment'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <p className="text-xs text-muted-foreground mb-1">Next Due</p>
                                        <p className="text-white font-medium">
                                            {(paymentDetails as PaymentDetails)?.nextPaymentDue
                                                ? new Date((paymentDetails as PaymentDetails).nextPaymentDue!).toLocaleDateString()
                                                : '—'}
                                        </p>
                                    </div>
                                </div>

                                {/* Amount Summary */}
                                <div className="p-3 bg-white/5 rounded-lg space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Investors</span>
                                        <span className="text-white font-mono">{paymentDetails?.investorCount || 0}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Total Invested</span>
                                        <span className="text-white font-mono">
                                            ${((paymentDetails as PaymentDetails)?.totalInvested || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="h-px bg-white/10 my-1" />
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Net to Investors
                                            <span className="text-xs ml-1 text-zinc-500">
                                                ({(paymentDetails as PaymentDetails)?.investorRate
                                                    ?? (paymentDetails as PaymentDetails)?.annualInterestRate
                                                    ?? 0}% APY)
                                            </span>
                                        </span>
                                        <span className="text-emerald-400 font-mono">
                                            ${(preparedTx?.netToInvestors ?? totalOwed).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    {(preparedTx?.platformFee ?? 0) > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">
                                                Platform Fee
                                                <span className="text-xs ml-1 text-zinc-500">
                                                    ({((paymentDetails as PaymentDetails)?.annualInterestRate ?? 0) - ((paymentDetails as PaymentDetails)?.investorRate ?? (paymentDetails as PaymentDetails)?.annualInterestRate ?? 0)}% spread)
                                                </span>
                                            </span>
                                            <span className="text-purple-400 font-mono">
                                                ${(preparedTx?.platformFee ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    )}
                                    <div className="h-px bg-white/10 my-1" />
                                    <div className="flex justify-between text-base font-bold">
                                        <span className="text-white">
                                            Company Pays
                                            <span className="text-xs ml-1 font-normal text-zinc-500">
                                                ({(paymentDetails as PaymentDetails)?.annualInterestRate ?? 0}% APY)
                                            </span>
                                        </span>
                                        <span className="text-white font-mono">
                                            ${(preparedTx?.totalAmount ?? totalOwed).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                                        </span>
                                    </div>
                                </div>

                                {/* Duplicate Warning */}
                                {(paymentDetails as PaymentDetails)?.paymentDueStatus === 'current' && (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-amber-400 text-sm font-medium">Already Up to Date</p>
                                            <p className="text-amber-400/70 text-xs mt-0.5">
                                                The last payment was on {new Date((paymentDetails as PaymentDetails).lastPaymentDate!).toLocaleDateString()}.
                                                Proceeding will create a duplicate payment for this period.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Batch info */}
                                {preparedTx.batchXDRs && preparedTx.batchXDRs.length > 1 && (
                                    <p className="text-xs text-muted-foreground">
                                        This payment is split into {preparedTx.batchXDRs.length} batches. You'll sign each batch with your passkey.
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {batchProgress && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Signing batch</span>
                                    <span className="text-white font-mono">{batchProgress.current} / {batchProgress.total}</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-300"
                                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => { setPreparedTx(null); setBatchProgress(null); }}
                                disabled={submitting}
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
                                        {batchProgress
                                            ? `Signing ${batchProgress.current}/${batchProgress.total}...`
                                            : 'Submitting...'
                                        }
                                    </>
                                ) : (
                                    preparedTx.batchXDRs && preparedTx.batchXDRs.length > 1
                                        ? `Sign & Submit (${preparedTx.batchXDRs.length} batches)`
                                        : 'Sign & Submit Payment'
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Payment History ── */}
            {offerId && (
                <PaymentHistorySection offerId={Number(offerId)} refreshKey={historyRefreshKey} />
            )}

        </div>
    );
}

export default PayInvestors;
