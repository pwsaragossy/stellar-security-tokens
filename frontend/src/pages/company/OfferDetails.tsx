import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Edit, ExternalLink, Clock, CheckCircle, XCircle, Loader2, Users, DollarSign } from "lucide-react";
import { offersApi } from "@/api/offers";
import type { Offer } from '@/types';

export function OfferDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [offer, setOffer] = useState<Offer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchOffer = async () => {
            if (!id) return;

            try {
                const response = await offersApi.getById(parseInt(id));
                if (response.success && response.data) {
                    setOffer(response.data);
                } else {
                    setError('Offer not found');
                }
            } catch (err: any) {
                console.error('Failed to fetch offer:', err);
                setError(err.message || 'Failed to load offer');
            } finally {
                setLoading(false);
            }
        };

        fetchOffer();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            </div>
        );
    }

    if (error || !offer) {
        return (
            <div className="space-y-4">
                <Button
                    variant="ghost"
                    onClick={() => navigate('/company/offers')}
                    className="text-muted-foreground hover:text-white"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Offers
                </Button>
                <div className="p-4 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20">
                    {error || 'Offer not found'}
                </div>
            </div>
        );
    }

    const canEdit = ['pending_review', 'rejected'].includes(offer.status);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/company/offers')}
                        className="text-muted-foreground hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-white">{offer.offer_name}</h2>
                            <StatusBadge status={offer.status} />
                        </div>
                        <p className="text-muted-foreground font-mono">{offer.asset_code}</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    {offer.status === 'active' && offer.offer_type === 'collateral' && (
                        <Button
                            onClick={() => navigate(`/company/payments/${offer.id}`)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            <DollarSign className="w-4 h-4 mr-2" />
                            Pay Investors
                        </Button>
                    )}
                    {canEdit && (
                        <Button className="bg-teal-600 hover:bg-teal-500 text-white">
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Offer
                        </Button>
                    )}
                </div>
            </div>

            {/* Status Timeline */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="text-base">Status Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <TimelineStep
                            label="Created"
                            date={offer.created_at}
                            isComplete={true}
                            isCurrent={offer.status === 'pending_review'}
                        />
                        <TimelineConnector isComplete={['under_review', 'approved', 'active', 'closed'].includes(offer.status)} />
                        <TimelineStep
                            label="Under Review"
                            date={offer.status === 'under_review' ? offer.updated_at : undefined}
                            isComplete={['approved', 'active', 'closed'].includes(offer.status)}
                            isCurrent={offer.status === 'under_review'}
                        />
                        <TimelineConnector isComplete={['approved', 'active', 'closed'].includes(offer.status)} />
                        <TimelineStep
                            label="Approved"
                            date={offer.reviewed_at}
                            isComplete={['active', 'closed'].includes(offer.status)}
                            isCurrent={offer.status === 'approved'}
                            isRejected={offer.status === 'rejected'}
                        />
                        <TimelineConnector isComplete={['active', 'closed'].includes(offer.status)} />
                        <TimelineStep
                            label="Active"
                            isComplete={offer.status === 'closed'}
                            isCurrent={offer.status === 'active'}
                        />
                    </div>
                    {offer.status === 'rejected' && offer.rejection_reason && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-sm text-red-400">
                                <strong>Rejection Reason:</strong> {offer.rejection_reason}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Main Content */}
            <div className="grid gap-6 md:grid-cols-3">
                {/* Offer Details */}
                <Card className="md:col-span-2 glass-panel border-white/5 bg-white/5">
                    <CardHeader>
                        <CardTitle>Offer Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                            <p className="text-white">{offer.description || 'No description provided'}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-2">Offer Type</h4>
                                <p className="text-white capitalize">{offer.offer_type}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-2">Total Supply</h4>
                                <p className="text-white">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(offer.total_supply || '0'))}
                                </p>
                            </div>
                            {offer.annual_interest_rate && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Annual Interest Rate</h4>
                                    <p className="text-emerald-400">{offer.annual_interest_rate}% APY</p>
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-2">Created</h4>
                                <p className="text-white">
                                    {new Date(offer.created_at).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                    })}
                                </p>
                            </div>
                        </div>

                        {offer.offer_rules && Object.keys(offer.offer_rules).length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-2">Investment Rules</h4>
                                <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-lg">
                                    {offer.offer_rules.min_investment && (
                                        <div>
                                            <p className="text-xs text-muted-foreground">Minimum Investment</p>
                                            <p className="text-white">${offer.offer_rules.min_investment}</p>
                                        </div>
                                    )}
                                    {offer.offer_rules.max_investment && (
                                        <div>
                                            <p className="text-xs text-muted-foreground">Maximum Investment</p>
                                            <p className="text-white">${offer.offer_rules.max_investment}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Stats & Documents */}
                <div className="space-y-6">
                    {/* Quick Stats */}
                    <Card className="glass-panel border-white/5 bg-white/5">
                        <CardHeader>
                            <CardTitle className="text-base">Statistics</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                                <DollarSign className="w-5 h-5 text-emerald-400" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Total Raised</p>
                                    <p className="text-lg font-semibold text-white">$0.00</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                                <Users className="w-5 h-5 text-blue-400" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Investors</p>
                                    <p className="text-lg font-semibold text-white">0</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Legal Documents */}
                    <Card className="glass-panel border-white/5 bg-white/5">
                        <CardHeader>
                            <CardTitle className="text-base">Legal Documents</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {offer.legal_documents && Object.keys(offer.legal_documents).length > 0 ? (
                                Object.entries(offer.legal_documents).map(([key, doc]) => (
                                    doc && (
                                        <a
                                            key={key}
                                            href={doc.url || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                                        >
                                            <FileText className="w-4 h-4 text-teal-400" />
                                            <span className="text-sm text-white flex-1 capitalize">{key}</span>
                                            <ExternalLink className="w-4 h-4 text-muted-foreground" />
                                        </a>
                                    )
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    No documents uploaded
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const getStatusStyles = () => {
        switch (status) {
            case 'active':
                return 'bg-emerald-500/20 text-emerald-400';
            case 'approved':
                return 'bg-blue-500/20 text-blue-400';
            case 'pending_review':
            case 'under_review':
                return 'bg-yellow-500/20 text-yellow-400';
            case 'rejected':
                return 'bg-red-500/20 text-red-400';
            case 'closed':
                return 'bg-gray-500/20 text-gray-400';
            default:
                return 'bg-gray-500/20 text-gray-400';
        }
    };

    const getStatusLabel = () => {
        switch (status) {
            case 'pending_review': return 'Pending Review';
            case 'under_review': return 'Under Review';
            default: return status.charAt(0).toUpperCase() + status.slice(1);
        }
    };

    return (
        <span className={`text-xs px-2 py-1 rounded-full ${getStatusStyles()}`}>
            {getStatusLabel()}
        </span>
    );
}

function TimelineStep({
    label,
    date,
    isComplete,
    isCurrent,
    isRejected
}: {
    label: string;
    date?: string;
    isComplete: boolean;
    isCurrent?: boolean;
    isRejected?: boolean;
}) {
    return (
        <div className="flex flex-col items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isRejected
                ? 'bg-red-500/20'
                : isComplete
                    ? 'bg-emerald-500/20'
                    : isCurrent
                        ? 'bg-teal-500/20'
                        : 'bg-white/10'
                }`}>
                {isRejected ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                ) : isComplete ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : isCurrent ? (
                    <Clock className="w-4 h-4 text-teal-400" />
                ) : (
                    <div className="w-2 h-2 rounded-full bg-white/30" />
                )}
            </div>
            <div className="text-center">
                <p className={`text-xs font-medium ${isCurrent ? 'text-teal-400' : isComplete ? 'text-white' : 'text-muted-foreground'
                    }`}>
                    {label}
                </p>
                {date && (
                    <p className="text-xs text-muted-foreground">
                        {new Date(date).toLocaleDateString()}
                    </p>
                )}
            </div>
        </div>
    );
}

function TimelineConnector({ isComplete }: { isComplete: boolean }) {
    return (
        <div className={`flex-1 h-0.5 ${isComplete ? 'bg-emerald-500/50' : 'bg-white/10'}`} />
    );
}
