/**
 * Admin Default Cases Component
 * Displays defaulted offers and allows admin to distribute collateral
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Users, DollarSign, Building2, Loader2, CheckCircle, ArrowRight } from "lucide-react";
import { adminDefaultsApi, DefaultedOffer, DefaultStats } from "@/api/adminDefaults";
import { usePasskey } from "@/hooks/usePasskey";

export function DefaultCases() {
    const { signTransaction } = usePasskey();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ offerId: number; hash: string } | null>(null);
    const [defaults, setDefaults] = useState<DefaultedOffer[]>([]);
    const [stats, setStats] = useState<DefaultStats | null>(null);
    const [selectedOffer, setSelectedOffer] = useState<DefaultedOffer | null>(null);

    useEffect(() => {
        loadDefaults();
    }, []);

    const loadDefaults = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await adminDefaultsApi.getDefaultedOffers();
            if (response.success) {
                setDefaults(response.data.defaults);
                setStats(response.data.stats);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load defaults');
        } finally {
            setLoading(false);
        }
    };

    const handleDistributeCollateral = async (offer: DefaultedOffer) => {
        try {
            setSubmitting(offer.offerId);
            setError(null);

            // Prepare transaction
            const prepareResponse = await adminDefaultsApi.prepareDistribution(offer.offerId);
            if (!prepareResponse.success) {
                throw new Error('Failed to prepare transaction');
            }

            // Sign with admin passkey
            const signedXDR = await signTransaction(prepareResponse.data.transactionXDR);

            // Submit signed transaction
            const distributeResponse = await adminDefaultsApi.distributeCollateral(offer.offerId, signedXDR);

            if (distributeResponse.success) {
                setSuccess({ offerId: offer.offerId, hash: distributeResponse.data.transactionHash });
                // Refresh the list
                await loadDefaults();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to distribute collateral');
        } finally {
            setSubmitting(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[300px]">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with Stats */}
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-white">Default Cases</h2>
                    <p className="text-muted-foreground">Manage defaulted offers and distribute collateral to investors</p>
                </div>
                {stats && (
                    <div className="flex gap-4">
                        <div className="text-center px-4 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                            <p className="text-2xl font-bold text-red-400">{stats.pendingDefaults}</p>
                            <p className="text-xs text-muted-foreground">Pending</p>
                        </div>
                        <div className="text-center px-4 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
                            <p className="text-2xl font-bold text-green-400">{stats.resolvedDefaults}</p>
                            <p className="text-xs text-muted-foreground">Resolved</p>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {error}
                </div>
            )}

            {success && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">
                    <CheckCircle className="w-4 h-4 inline mr-2" />
                    Collateral distributed successfully! Transaction: {success.hash.slice(0, 16)}...
                </div>
            )}

            {/* Default Cases List */}
            {defaults.length === 0 ? (
                <Card className="glass-panel border-white/5 bg-white/5">
                    <CardContent className="p-8 text-center">
                        <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">No Pending Defaults</h3>
                        <p className="text-muted-foreground">All companies are up to date with their payments.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {defaults.map(offer => (
                        <Card key={offer.offerId} className="glass-panel border-red-500/20 bg-red-500/5">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-white flex items-center gap-2">
                                            <AlertTriangle className="w-5 h-5 text-red-400" />
                                            {offer.offerName}
                                        </CardTitle>
                                        <CardDescription className="flex items-center gap-2 mt-1">
                                            <Building2 className="w-4 h-4" />
                                            {offer.companyName} • {offer.assetCode}
                                        </CardDescription>
                                    </div>
                                    <span className="px-2 py-1 rounded-full bg-red-600/30 text-red-300 text-xs">
                                        DEFAULTED
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                            <DollarSign className="w-4 h-4" />
                                            Total Invested
                                        </div>
                                        <p className="text-lg font-bold text-white">
                                            ${offer.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                                            <Users className="w-4 h-4" />
                                            Investors
                                        </div>
                                        <p className="text-lg font-bold text-white">{offer.investorCount}</p>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <div className="text-muted-foreground text-sm mb-1">Collateral Value</div>
                                        <p className="text-lg font-bold text-teal-400">
                                            ${offer.collateralValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <div className="text-muted-foreground text-sm mb-1">Defaulted</div>
                                        <p className="text-sm text-white">
                                            {new Date(offer.defaultedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Collateral Info */}
                                {offer.collateralDescription && (
                                    <div className="p-3 bg-white/5 rounded-lg">
                                        <p className="text-sm text-muted-foreground mb-1">Collateral Description</p>
                                        <p className="text-white">{offer.collateralDescription}</p>
                                    </div>
                                )}

                                {/* Expand to see investors */}
                                {selectedOffer?.offerId === offer.offerId && (
                                    <div className="mt-4 space-y-2">
                                        <h4 className="text-sm font-medium text-muted-foreground">Investor Distribution</h4>
                                        <div className="max-h-[200px] overflow-auto space-y-2">
                                            {offer.distributions.map((dist, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-2 bg-white/5 rounded">
                                                    <div>
                                                        <p className="text-white text-sm">{dist.investorName}</p>
                                                        <p className="text-xs text-muted-foreground font-mono">
                                                            {dist.investorWallet?.slice(0, 10)}...
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-teal-400 text-sm">
                                                            {dist.tokenAmount.toFixed(2)} tokens
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {(dist.proportion * 100).toFixed(1)}% share
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 pt-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => setSelectedOffer(selectedOffer?.offerId === offer.offerId ? null : offer)}
                                        className="flex-1"
                                    >
                                        {selectedOffer?.offerId === offer.offerId ? 'Hide Details' : 'View Investors'}
                                    </Button>
                                    <Button
                                        onClick={() => handleDistributeCollateral(offer)}
                                        disabled={submitting === offer.offerId}
                                        className="flex-1 bg-red-600 hover:bg-red-500 text-white"
                                    >
                                        {submitting === offer.offerId ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                Distribute Collateral
                                                <ArrowRight className="w-4 h-4 ml-2" />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

export default DefaultCases;
