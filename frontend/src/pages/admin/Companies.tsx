import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Loader2, Search, RefreshCw, Building2, MoreVertical, ExternalLink, Copy, Users, Wallet, FileText, CheckCircle, XCircle } from 'lucide-react';
import api from '@/api/client';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { HELP_CONTENT } from '@/constants/help-content';

interface Company {
    id: number;
    name: string;
    cnpj: string;
    status: 'pending' | 'approved' | 'active' | 'suspended' | 'rejected';
    walletAddress: string | null;
    stellarContractId: string | null;
    activeOffers: number;
    totalInvestments: number;
    users: Array<{ id: number; name: string; email: string; role: string }>;
    createdAt: string;
}

interface CompanyDetails extends Company {
    balances?: { xlm: string; usdc: string };
    offers: Array<{ id: number; name: string; status: string; totalAmount: number }>;
}

export function Companies() {
    const [loading, setLoading] = useState(true);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'suspended' | 'rejected'>('all');
    const [actionLoading, setActionLoading] = useState(false);

    // Reject Modal State
    const [rejectModal, setRejectModal] = useState<{ open: boolean; company: Company | null }>({
        open: false,
        company: null,
    });
    const [rejectReason, setRejectReason] = useState('');

    // Detail Modal
    const [detailModal, setDetailModal] = useState<{ open: boolean; company: CompanyDetails | null; loading: boolean }>({
        open: false,
        company: null,
        loading: false,
    });

    // Sponsor Modal State
    const [sponsorModal, setSponsorModal] = useState<{ open: boolean; company: Company | null; result?: { success: boolean; message?: string; explorer?: string } }>({
        open: false,
        company: null,
    });
    const [sponsorAmount, setSponsorAmount] = useState('10');

    useEffect(() => {
        loadCompanies();
    }, [filter]);

    const loadCompanies = async () => {
        setLoading(true);
        setError('');
        try {
            const status = filter === 'all' ? undefined : filter;
            const response = await api.get('/platform-admins/companies', { params: { status } });
            setCompanies(response.data.data || []);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load companies');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (company: Company) => {
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${company.id}/approve`);
            loadCompanies();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to approve company');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!rejectModal.company || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await api.post(`/platform-admins/companies/${rejectModal.company.id}/reject`, { reason: rejectReason });
            setRejectModal({ open: false, company: null });
            setRejectReason('');
            loadCompanies();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to reject company');
        } finally {
            setActionLoading(false);
        }
    };

    const handleViewDetails = async (company: Company) => {
        setDetailModal({ open: true, company: { ...company, offers: [], balances: undefined }, loading: true });
        try {
            const response = await api.get(`/platform-admins/companies/${company.id}/details`);
            if (response.data.success) {
                setDetailModal({
                    open: true,
                    company: response.data.data,
                    loading: false,
                });
            }
        } catch {
            setDetailModal({
                open: true,
                company: { ...company, offers: [], balances: { xlm: '0', usdc: '0' } },
                loading: false,
            });
        }
    };

    const handleSponsor = async () => {
        if (!sponsorModal.company) return;
        setActionLoading(true);
        try {
            const response = await api.post(`/platform-admins/companies/${sponsorModal.company.id}/sponsor`, {
                amount: sponsorAmount
            });
            setSponsorModal({
                ...sponsorModal,
                result: {
                    success: true,
                    message: response.data.message || `Sent ${sponsorAmount} XLM successfully`,
                    explorer: response.data.data?.explorer
                }
            });
            loadCompanies();
        } catch (err: any) {
            setSponsorModal({
                ...sponsorModal,
                result: { success: false, message: err.response?.data?.error || 'Failed to sponsor wallet' }
            });
        } finally {
            setActionLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge variant="outline" className="border-emerald-500 text-emerald-500">Active</Badge>;
            case 'pending':
                return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Pending</Badge>;
            case 'suspended':
                return <Badge variant="outline" className="border-red-500 text-red-500">Suspended</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const filteredCompanies = companies.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.cnpj && c.cnpj.includes(search))
    );

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex gap-2">
                    {(['all', 'pending', 'approved', 'suspended', 'rejected'] as const).map((f) => (
                        <Button
                            key={f}
                            variant={filter === f ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter(f)}
                            className={filter === f ? 'bg-red-600 hover:bg-red-700' : ''}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Button>
                    ))}
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or CNPJ..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white/5 border-white/10"
                        />
                    </div>
                    <Button variant="outline" size="icon" onClick={loadCompanies}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm">
                    {error}
                </div>
            )}

            {/* Companies Table */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-red-400" />
                        Companies ({filteredCompanies.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                        </div>
                    ) : filteredCompanies.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No companies found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Company</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Email</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">
                                            <div className="flex items-center gap-1.5">
                                                Status
                                                <InfoTooltip content={HELP_CONTENT.companies.companyStatus.content} side="top" />
                                            </div>
                                        </th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">
                                            <div className="flex items-center gap-1.5">
                                                Offers
                                                <InfoTooltip content={HELP_CONTENT.companies.activeOffersCount.content} side="top" />
                                            </div>
                                        </th>
                                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Actions</th>
                                        <th className="py-3 px-2 text-muted-foreground font-medium w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCompanies.map((company) => (
                                        <tr key={company.id} className="border-b border-white/5 hover:bg-white/5">
                                            <td className="py-3 px-2 text-white font-medium">{company.name}</td>
                                            <td className="py-3 px-2 text-muted-foreground">{(company as any).email || company.cnpj || '-'}</td>
                                            <td className="py-3 px-2">{getStatusBadge(company.status)}</td>
                                            <td className="py-3 px-2 text-white">{company.activeOffers}</td>
                                            <td className="py-3 px-2 text-right">
                                                {company.status === 'pending' && (
                                                    <div className="flex gap-2 justify-end">
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="border-emerald-500 text-emerald-500 hover:bg-emerald-500/10"
                                                                onClick={() => handleApprove(company)}
                                                                disabled={actionLoading}
                                                            >
                                                                <CheckCircle className="w-4 h-4 mr-1" />
                                                                Approve
                                                            </Button>
                                                            <InfoTooltip content={HELP_CONTENT.companies.approveCompany.content} side="left" maxWidth="400px" />
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="border-red-500 text-red-500 hover:bg-red-500/10"
                                                            onClick={() => setRejectModal({ open: true, company })}
                                                            disabled={actionLoading}
                                                        >
                                                            <XCircle className="w-4 h-4 mr-1" />
                                                            Reject
                                                        </Button>
                                                    </div>
                                                )}
                                                {(company.status === 'approved' || company.status === 'active') && company.stellarContractId && (
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="border-blue-500 text-blue-500 hover:bg-blue-500/10"
                                                            onClick={() => setSponsorModal({ open: true, company, result: undefined })}
                                                            disabled={actionLoading}
                                                        >
                                                            <Wallet className="w-4 h-4 mr-1" />
                                                            Sponsor
                                                        </Button>
                                                        <InfoTooltip content={HELP_CONTENT.companies.walletSponsorship.content} side="left" maxWidth="400px" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-2">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                            <MoreVertical className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleViewDetails(company)}>
                                                            <Building2 className="w-4 h-4 mr-2" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        {company.stellarContractId && (
                                                            <DropdownMenuItem onClick={() => copyToClipboard(company.stellarContractId!)}>
                                                                <Copy className="w-4 h-4 mr-2" />
                                                                Copy Wallet
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem asChild>
                                                            <a
                                                                href={`https://stellar.expert/explorer/testnet/contract/${company.stellarContractId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center"
                                                            >
                                                                <ExternalLink className="w-4 h-4 mr-2" />
                                                                View on Explorer
                                                            </a>
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Company Detail Modal */}
            <Dialog open={detailModal.open} onOpenChange={(open) => setDetailModal({ ...detailModal, open })}>
                <DialogContent className="bg-slate-900 border-white/10 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Building2 className="w-5 h-5" />
                            {detailModal.company?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Complete company profile and wallet information
                        </DialogDescription>
                    </DialogHeader>
                    {detailModal.loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                        </div>
                    ) : detailModal.company && (
                        <div className="space-y-6 py-4">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground text-xs flex items-center gap-1.5">
                                        CNPJ
                                        <InfoTooltip content={HELP_CONTENT.companies.cnpjField.content} side="right" />
                                    </Label>
                                    <p className="text-white">{detailModal.company.cnpj}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Status</Label>
                                    <p>{getStatusBadge(detailModal.company.status)}</p>
                                </div>
                            </div>

                            {/* Wallet Info */}
                            <div className="p-4 bg-white/5 rounded-lg space-y-3">
                                <Label className="text-muted-foreground text-xs flex items-center gap-1.5">
                                    <Wallet className="w-3 h-3" /> Wallet Address
                                    <InfoTooltip content={HELP_CONTENT.companies.walletSponsorship.content} side="right" maxWidth="400px" />
                                </Label>
                                {detailModal.company.stellarContractId ? (
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
                                            {detailModal.company.stellarContractId}
                                        </code>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(detailModal.company!.stellarContractId!)}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground text-sm">No wallet created yet</p>
                                )}

                                {/* Balances */}
                                {detailModal.company.balances && (
                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                        <div className="p-3 bg-black/30 rounded">
                                            <p className="text-xs text-muted-foreground">XLM Balance</p>
                                            <p className="text-lg font-semibold text-white">{parseFloat(detailModal.company.balances.xlm).toFixed(2)}</p>
                                        </div>
                                        <div className="p-3 bg-black/30 rounded">
                                            <p className="text-xs text-muted-foreground">USDC Balance</p>
                                            <p className="text-lg font-semibold text-emerald-400">${parseFloat(detailModal.company.balances.usdc).toFixed(2)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Users */}
                            {detailModal.company.users && detailModal.company.users.length > 0 && (
                                <div>
                                    <Label className="text-muted-foreground text-xs flex items-center gap-1 mb-2">
                                        <Users className="w-3 h-3" /> Company Users
                                    </Label>
                                    <div className="space-y-2">
                                        {detailModal.company.users.map((user) => (
                                            <div key={user.id} className="flex items-center justify-between p-2 bg-white/5 rounded text-xs">
                                                <span className="text-white">{user.name}</span>
                                                <span className="text-muted-foreground">{user.email}</span>
                                                <Badge variant="outline" className="text-xs">{user.role}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Offers */}
                            {detailModal.company.offers && detailModal.company.offers.length > 0 && (
                                <div>
                                    <Label className="text-muted-foreground text-xs flex items-center gap-1 mb-2">
                                        <FileText className="w-3 h-3" /> Active Offers
                                    </Label>
                                    <div className="space-y-2">
                                        {detailModal.company.offers.map((offer) => (
                                            <div key={offer.id} className="flex items-center justify-between p-2 bg-white/5 rounded text-xs">
                                                <span className="text-white">{offer.name}</span>
                                                <span className="text-emerald-400">${offer.totalAmount?.toLocaleString()}</span>
                                                <Badge variant="outline" className="text-xs">{offer.status}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDetailModal({ open: false, company: null, loading: false })}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Modal */}
            <Dialog open={rejectModal.open} onOpenChange={(open) => setRejectModal({ open, company: rejectModal.company })}>
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Reject Company</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for rejecting {rejectModal.company?.name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="reason">Rejection Reason</Label>
                            <Input
                                id="reason"
                                placeholder="e.g., Invalid documentation, incomplete KYC..."
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectModal({ open: false, company: null })}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={!rejectReason.trim() || actionLoading}
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Sponsor Modal */}
            <Dialog open={sponsorModal.open} onOpenChange={(open) => setSponsorModal({ open, company: sponsorModal.company })}>
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Sponsor Company Wallet</DialogTitle>
                        <DialogDescription>
                            Send XLM to {sponsorModal.company?.name}'s wallet to cover transaction fees.
                        </DialogDescription>
                    </DialogHeader>
                    {sponsorModal.result ? (
                        <div className="space-y-4 py-4">
                            {sponsorModal.result.success ? (
                                <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                    <p className="text-emerald-400 font-medium mb-2">✅ {sponsorModal.result.message}</p>
                                    {sponsorModal.result.explorer && (
                                        <a
                                            href={sponsorModal.result.explorer}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-sm text-blue-400 hover:underline"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            View Transaction
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                                    <p className="text-red-400">❌ {sponsorModal.result.message}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="xlmAmount">Amount (XLM)</Label>
                                <Input
                                    id="xlmAmount"
                                    type="number"
                                    min="1"
                                    max="1000"
                                    placeholder="10"
                                    value={sponsorAmount}
                                    onChange={(e) => setSponsorAmount(e.target.value)}
                                    className="bg-white/5 border-white/10"
                                />
                                <p className="text-xs text-muted-foreground">Default: 10 XLM for transaction fees</p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSponsorModal({ open: false, company: null })}>
                            {sponsorModal.result ? 'Close' : 'Cancel'}
                        </Button>
                        {!sponsorModal.result && (
                            <Button
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={handleSponsor}
                                disabled={actionLoading}
                            >
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wallet className="w-4 h-4 mr-2" />}
                                Send XLM
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
