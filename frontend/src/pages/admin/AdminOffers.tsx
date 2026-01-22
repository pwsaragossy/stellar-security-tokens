import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    FileText, Search, Filter, Loader2, Check, X, Eye,
    Building2, DollarSign, AlertTriangle, Rocket, Copy
} from "lucide-react";
import { offersApi } from "@/api/offers";
import type { Offer } from "@/types";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export function AdminOffers() {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Modal states
    const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
    const [actionType, setActionType] = useState<'approve' | 'reject' | 'view' | 'issue' | 'activate' | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadOffers = async () => {
        try {
            setLoading(true);
            const response = await offersApi.getAllAdmin();
            if (response.success && response.data) {
                setOffers(response.data);
            } else {
                setError(response.error || 'Failed to load offers');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load offers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOffers();
    }, []);

    const handleApprove = async () => {
        if (!selectedOffer) return;
        setIsSubmitting(true);
        try {
            const response = await offersApi.review(selectedOffer.id, { status: 'approved' });
            if (response.success) {
                await loadOffers();
                closeModal();
            } else {
                setError(response.error || 'Failed to approve offer');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!selectedOffer) return;
        setIsSubmitting(true);
        try {
            const response = await offersApi.review(selectedOffer.id, {
                status: 'rejected',
                rejection_reason: rejectionReason
            });
            if (response.success) {
                await loadOffers();
                closeModal();
            } else {
                setError(response.error || 'Failed to reject offer');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleIssueToken = async () => {
        if (!selectedOffer) return;
        setIsSubmitting(true);
        try {
            const response = await offersApi.issueToken(selectedOffer.id);
            if (response.success) {
                await loadOffers();
                closeModal();
            } else {
                setError(response.error || 'Failed to issue token');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleActivate = async () => {
        if (!selectedOffer) return;
        setIsSubmitting(true);
        try {
            const response = await offersApi.activate(selectedOffer.id);
            if (response.success) {
                await loadOffers();
                closeModal();
            } else {
                setError(response.error || 'Failed to activate offer');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const closeModal = () => {
        setSelectedOffer(null);
        setActionType(null);
        setRejectionReason('');
    };

    const openAction = (offer: Offer, action: typeof actionType) => {
        setSelectedOffer(offer);
        setActionType(action);
    };

    const filteredOffers = offers.filter(offer => {
        const matchesSearch =
            offer.offer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            offer.asset_code?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || offer.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusOptions = [
        { value: 'all', label: 'All Status' },
        { value: 'pending_review', label: '🟡 Under Review' },
        { value: 'approved', label: '🔵 Approved' },
        { value: 'active', label: '🟢 Active' },
        { value: 'rejected', label: '🔴 Declined' },
        { value: 'closed', label: '⚫ Completed' },
    ];

    const getStatusBadge = (status: string) => {
        const configs: Record<string, { label: string; className: string }> = {
            pending_review: { label: 'Under Review', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
            under_review: { label: 'Under Review', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
            approved: { label: 'Approved', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
            active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
            rejected: { label: 'Declined', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
            closed: { label: 'Completed', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
        };
        const config = configs[status] || { label: status, className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
        return (
            <Badge variant="outline" className={`${config.className} border`}>
                {config.label}
            </Badge>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Offer Management</h2>
                    <p className="text-muted-foreground">Review and manage company token offers</p>
                </div>
                <Button variant="outline" onClick={loadOffers} className="border-white/10">
                    <Loader2 className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{error}</span>
                    <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto">
                        Dismiss
                    </Button>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search offers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="pl-10 pr-8 py-2 rounded-md glass-panel bg-black/20 border border-white/10 text-white appearance-none cursor-pointer focus:border-primary/50 focus:outline-none"
                    >
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value} className="bg-slate-900">
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: 'Pending Review', value: offers.filter(o => o.status === 'pending_review' || o.status === 'under_review').length, color: 'text-amber-400' },
                    { label: 'Approved', value: offers.filter(o => o.status === 'approved').length, color: 'text-blue-400' },
                    { label: 'Active', value: offers.filter(o => o.status === 'active').length, color: 'text-emerald-400' },
                    { label: 'Declined', value: offers.filter(o => o.status === 'rejected').length, color: 'text-red-400' },
                    { label: 'Total', value: offers.length, color: 'text-white' },
                ].map((stat) => (
                    <Card key={stat.label} className="glass-panel border-white/5 bg-white/5">
                        <CardContent className="p-4 text-center">
                            <p className="text-xs text-muted-foreground">{stat.label}</p>
                            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Offers Table */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        All Offers ({filteredOffers.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredOffers.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Offer</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Company</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Type</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Supply</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Status</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Created</th>
                                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredOffers.map((offer) => (
                                        <tr key={offer.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-3 px-2">
                                                <div>
                                                    <p className="text-white font-medium">{offer.offer_name}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{offer.asset_code}</p>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                                    <span className="text-white">{(offer as any).company?.name || 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 text-white capitalize">{offer.offer_type}</td>
                                            <td className="py-3 px-2 text-white">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(parseFloat(offer.total_supply || '0'))}
                                            </td>
                                            <td className="py-3 px-2">{getStatusBadge(offer.status)}</td>
                                            <td className="py-3 px-2 text-muted-foreground">
                                                {new Date(offer.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="py-3 px-2">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openAction(offer, 'view')}
                                                        className="text-muted-foreground hover:text-white"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    {(offer.status === 'pending_review' || offer.status === 'under_review') && (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openAction(offer, 'approve')}
                                                                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openAction(offer, 'reject')}
                                                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                    {offer.status === 'approved' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => openAction(offer, 'issue')}
                                                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                                        >
                                                            <DollarSign className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    {(offer as any).token_issued && offer.status !== 'active' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => openAction(offer, 'activate')}
                                                            className="text-primary hover:text-primary/80 hover:bg-primary/10"
                                                        >
                                                            <Rocket className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="py-12 text-center">
                            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                            <p className="text-muted-foreground">No offers found</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Action Modals */}
            <Dialog open={actionType === 'view' && !!selectedOffer} onOpenChange={() => closeModal()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Offer Details</DialogTitle>
                        <DialogDescription>Review offer information</DialogDescription>
                    </DialogHeader>
                    {selectedOffer && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">Offer Name</p>
                                    <p className="text-white">{selectedOffer.offer_name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Asset Code</p>
                                    <p className="text-white font-mono">{selectedOffer.asset_code}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Type</p>
                                    <p className="text-white capitalize">{selectedOffer.offer_type}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Total Supply</p>
                                    <p className="text-white">${parseFloat(selectedOffer.total_supply || '0').toLocaleString()}</p>
                                </div>
                                {selectedOffer.annual_interest_rate && (
                                    <div>
                                        <p className="text-xs text-muted-foreground">Interest Rate</p>
                                        <p className="text-emerald-400">{selectedOffer.annual_interest_rate}% APY</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    {getStatusBadge(selectedOffer.status)}
                                </div>
                                {selectedOffer.token?.sacContractId && (
                                    <div className="col-span-2 p-2 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                                        <p className="text-[10px] text-emerald-400 uppercase font-bold mb-1">Soroban SAC ID</p>
                                        <div className="flex items-center justify-between gap-2">
                                            <code className="text-xs text-emerald-300 font-mono break-all flex-1">
                                                {selectedOffer.token.sacContractId}
                                            </code>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 hover:bg-emerald-500/10 text-emerald-400"
                                                onClick={() => navigator.clipboard.writeText(selectedOffer.token?.sacContractId || '')}
                                            >
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Description</p>
                                <p className="text-white/80 text-sm">{selectedOffer.description || 'No description'}</p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} className="border-white/10">Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={actionType === 'approve' && !!selectedOffer} onOpenChange={() => closeModal()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-emerald-400">Approve Offer</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to approve "{selectedOffer?.offer_name}"?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} className="border-white/10">Cancel</Button>
                        <Button onClick={handleApprove} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Approve
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={actionType === 'reject' && !!selectedOffer} onOpenChange={() => closeModal()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-red-400">Decline Offer</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for declining "{selectedOffer?.offer_name}".
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="Reason for rejection..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="bg-black/20 border-white/10"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} className="border-white/10">Cancel</Button>
                        <Button onClick={handleReject} disabled={isSubmitting || !rejectionReason} className="bg-red-600 hover:bg-red-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <X className="w-4 h-4 mr-2" />}
                            Decline
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={actionType === 'issue' && !!selectedOffer} onOpenChange={() => closeModal()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-blue-400">Issue Token</DialogTitle>
                        <DialogDescription>
                            This will create the token on the Stellar network for "{selectedOffer?.offer_name}".
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} className="border-white/10">Cancel</Button>
                        <Button onClick={handleIssueToken} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                            Issue Token
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={actionType === 'activate' && !!selectedOffer} onOpenChange={() => closeModal()}>
                <DialogContent className="bg-slate-900 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-primary">Activate Offer</DialogTitle>
                        <DialogDescription>
                            This will make "{selectedOffer?.offer_name}" available for investors.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} className="border-white/10">Cancel</Button>
                        <Button onClick={handleActivate} disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
                            Activate
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
