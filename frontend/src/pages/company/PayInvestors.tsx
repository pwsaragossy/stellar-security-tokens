/**
 * Pay Investors Page
 * Company dashboard for paying investors their yield
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, Clock, CheckCircle, DollarSign, Users, Calendar, Loader2 } from "lucide-react";
import { companyPaymentsApi, type PaymentDetails, type BulletPaymentDetails } from "@/api/companyPayments";
import { usePasskey } from "@/hooks/usePasskey";

export function PayInvestors() {
    const { offerId } = useParams<{ offerId: string }>();
    const navigate = useNavigate();
    const { signTransaction } = usePasskey();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | BulletPaymentDetails | null>(null);
    const [preparedTx, setPreparedTx] = useState<{ transactionXDR: string; expiresAt: string } | null>(null);

    useEffect(() => {
        if (offerId) {
            loadPaymentDetails();
        }
    }, [offerId]);

    const loadPaymentDetails = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await companyPaymentsApi.getPaymentDetails(parseInt(offerId!));
            if (response.success) {
                setPaymentDetails(response.data);
            } else {
                setError('Failed to load payment details');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load payment details');
        } finally {
            setLoading(false);
        }
    };

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

            // Sign with passkey
            const signedXDR = await signTransaction(preparedTx.transactionXDR);

            // Submit signed transaction
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

    const isBulletPayment = paymentDetails && 'totalPayout' in paymentDetails;
    const totalOwed = isBulletPayment
        ? (paymentDetails as BulletPaymentDetails).totalPayout
        : (paymentDetails as PaymentDetails)?.totalOwed || 0;

    const getStatusBadge = () => {
        const status = (paymentDetails as PaymentDetails)?.paymentDueStatus;
        switch (status) {
            case 'current':
                return <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs">Up to Date</span>;
            case 'upcoming':
                return <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs">Due Soon</span>;
            case 'due':
                return <span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs">Due Today</span>;
            case 'overdue':
                return <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs">Overdue</span>;
            case 'defaulted':
                return <span className="px-2 py-1 rounded-full bg-red-600/30 text-red-300 text-xs">Defaulted</span>;
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            </div>
        );
    }

    if (success) {
        return (
            <div className="max-w-2xl mx-auto space-y-6">
                <Card className="glass-panel border-green-500/20 bg-green-500/5">
                    <CardContent className="p-8 text-center">
                        <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
                        <p className="text-muted-foreground mb-6">
                            All investors have been paid successfully.
                        </p>
                        <Button onClick={() => navigate('/company/offers')} className="bg-teal-600 hover:bg-teal-500">
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
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-white">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white">Pay Investors</h2>
                    <p className="text-muted-foreground">{paymentDetails?.offerName || 'Loading...'}</p>
                </div>
                {getStatusBadge()}
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {error}
                </div>
            )}

            {/* Payment Summary Card */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle>Payment Summary</CardTitle>
                    <CardDescription>
                        {isBulletPayment ? 'Bullet payment at maturity' : `${paymentDetails?.paymentType} yield payment`}
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
                            <p className="text-2xl font-bold text-teal-400">
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
                                            <p className="text-teal-400 font-medium">
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
                <Card className="glass-panel border-red-500/20 bg-red-500/5">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                            <div>
                                <h4 className="text-red-400 font-medium">Payment Overdue - Consequences</h4>
                                <ul className="text-sm text-red-300/80 mt-2 space-y-1">
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
            <div className="flex gap-4">
                {!preparedTx ? (
                    <Button
                        onClick={handlePreparePayment}
                        disabled={submitting || totalOwed === 0}
                        className="flex-1 bg-teal-600 hover:bg-teal-500 text-white py-6 text-lg"
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
                    <div className="flex-1 space-y-3">
                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-yellow-400 text-sm">
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
                                className="flex-1 bg-teal-600 hover:bg-teal-500 text-white"
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
        </div>
    );
}

export default PayInvestors;
