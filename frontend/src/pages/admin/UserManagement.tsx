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
import { Loader2, CheckCircle, XCircle, Search, RefreshCw, Wallet, ExternalLink, MoreVertical, User, Copy, History } from 'lucide-react';
import { platformAdminsApi, type Investor } from '@/api/platformAdmins';
import api from '@/api/client';

// Extended investor with wallet details
interface InvestorDetails extends Investor {
    stellarContractId?: string;
    balances?: { xlm: string; usdc: string };
    transactions?: Array<{ hash: string; type: string; amount: string; date: string }>;
}

export function UserManagement() {
    const [loading, setLoading] = useState(true);
    const [investors, setInvestors] = useState<Investor[]>([]);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    // Reject Modal State
    const [rejectModal, setRejectModal] = useState<{ open: boolean; investor: Investor | null }>({
        open: false,
        investor: null,
    });
    const [rejectReason, setRejectReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // Sponsor Modal State
    const [sponsorModal, setSponsorModal] = useState<{ open: boolean; investor: Investor | null; result?: { success: boolean; message?: string; explorer?: string } }>({
        open: false,
        investor: null,
    });
    const [sponsorAmount, setSponsorAmount] = useState('10');

    // Detail Modal State
    const [detailModal, setDetailModal] = useState<{ open: boolean; investor: InvestorDetails | null; loading: boolean }>({
        open: false,
        investor: null,
        loading: false,
    });

    useEffect(() => {
        loadInvestors();
    }, [filter]);

    const loadInvestors = async () => {
        setLoading(true);
        setError('');
        try {
            const status = filter === 'all' ? undefined : filter;
            const response = await platformAdminsApi.getInvestors(status);
            setInvestors(response.data || []);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load investors');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (investor: Investor) => {
        setActionLoading(true);
        try {
            await platformAdminsApi.approveInvestor(investor.id);
            loadInvestors();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to approve investor');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!rejectModal.investor || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await platformAdminsApi.rejectInvestor(rejectModal.investor.id, rejectReason);
            setRejectModal({ open: false, investor: null });
            setRejectReason('');
            loadInvestors();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to reject investor');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSponsor = async () => {
        if (!sponsorModal.investor) return;
        setActionLoading(true);
        try {
            const response = await platformAdminsApi.sponsorInvestorWallet(sponsorModal.investor.id, sponsorAmount);
            setSponsorModal({
                ...sponsorModal,
                result: {
                    success: true,
                    message: response.message || `Sent ${sponsorAmount} XLM successfully`,
                    explorer: response.data?.explorer
                }
            });
            loadInvestors();
        } catch (err: any) {
            setSponsorModal({
                ...sponsorModal,
                result: { success: false, message: err.response?.data?.error || 'Failed to sponsor wallet' }
            });
        } finally {
            setActionLoading(false);
        }
    };

    const handleViewDetails = async (investor: Investor) => {
        setDetailModal({ open: true, investor: { ...investor }, loading: true });
        try {
            const response = await api.get(`/platform-admins/investors/${investor.id}/details`);
            if (response.data.success) {
                setDetailModal({
                    open: true,
                    investor: response.data.data,
                    loading: false,
                });
            }
        } catch (err: any) {
            setDetailModal({
                open: true,
                investor: { ...investor, balances: { xlm: '0', usdc: '0' }, transactions: [] },
                loading: false,
            });
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Pending</Badge>;
            case 'approved':
                return <Badge variant="outline" className="border-emerald-500 text-emerald-500">Approved</Badge>;
            case 'rejected':
                return <Badge variant="outline" className="border-red-500 text-red-500">Rejected</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const filteredInvestors = investors.filter((inv) =>
        inv.name.toLowerCase().includes(search.toLowerCase()) ||
        inv.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex gap-2">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
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
                            placeholder="Search by name or email..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white/5 border-white/10"
                        />
                    </div>
                    <Button variant="outline" size="icon" onClick={loadInvestors}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm">
                    {error}
                </div>
            )}

            {/* Table */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle>Investors ({filteredInvestors.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                        </div>
                    ) : filteredInvestors.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No investors found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Name</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Email</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Document</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Status</th>
                                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Registered</th>
                                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Actions</th>
                                        <th className="py-3 px-2 text-muted-foreground font-medium w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInvestors.map((investor) => (
                                        <tr key={investor.id} className="border-b border-white/5 hover:bg-white/5">
                                            <td className="py-3 px-2 text-white">{investor.name}</td>
                                            <td className="py-3 px-2 text-muted-foreground">{investor.email}</td>
                                            <td className="py-3 px-2 text-muted-foreground">{investor.document}</td>
                                            <td className="py-3 px-2">{getStatusBadge(investor.status)}</td>
                                            <td className="py-3 px-2 text-muted-foreground">
                                                {new Date(investor.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="py-3 px-2 text-right">
                                                {investor.status === 'pending' && (
                                                    <div className="flex gap-2 justify-end">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="border-emerald-500 text-emerald-500 hover:bg-emerald-500/10"
                                                            onClick={() => handleApprove(investor)}
                                                            disabled={actionLoading}
                                                        >
                                                            <CheckCircle className="w-4 h-4 mr-1" />
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="border-red-500 text-red-500 hover:bg-red-500/10"
                                                            onClick={() => setRejectModal({ open: true, investor })}
                                                            disabled={actionLoading}
                                                        >
                                                            <XCircle className="w-4 h-4 mr-1" />
                                                            Reject
                                                        </Button>
                                                    </div>
                                                )}
                                                {investor.status === 'approved' && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-blue-500 text-blue-500 hover:bg-blue-500/10"
                                                        onClick={() => setSponsorModal({ open: true, investor, result: undefined })}
                                                        disabled={actionLoading}
                                                    >
                                                        <Wallet className="w-4 h-4 mr-1" />
                                                        Sponsor
                                                    </Button>
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
                                                        <DropdownMenuItem onClick={() => handleViewDetails(investor)}>
                                                            <User className="w-4 h-4 mr-2" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        {investor.walletAddress && (
                                                            <DropdownMenuItem onClick={() => copyToClipboard(investor.walletAddress!)}>
                                                                <Copy className="w-4 h-4 mr-2" />
                                                                Copy Wallet
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem asChild>
                                                            <a
                                                                href={`https://stellar.expert/explorer/testnet/account/${investor.walletAddress}`}
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

            {/* Reject Modal */}
            <Dialog open={rejectModal.open} onOpenChange={(open) => setRejectModal({ open, investor: rejectModal.investor })}>
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Reject Investor</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for rejecting {rejectModal.investor?.name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="reason">Rejection Reason</Label>
                            <Input
                                id="reason"
                                placeholder="e.g., Invalid documentation"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectModal({ open: false, investor: null })}>
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
            <Dialog open={sponsorModal.open} onOpenChange={(open) => setSponsorModal({ open, investor: sponsorModal.investor })}>
                <DialogContent className="bg-slate-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle>Sponsor Wallet</DialogTitle>
                        <DialogDescription>
                            Send XLM to {sponsorModal.investor?.name}'s wallet to cover transaction fees.
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
                        <Button variant="outline" onClick={() => setSponsorModal({ open: false, investor: null })}>
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

            {/* User Detail Modal */}
            <Dialog open={detailModal.open} onOpenChange={(open) => setDetailModal({ ...detailModal, open })}>
                <DialogContent className="bg-slate-900 border-white/10 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <User className="w-5 h-5" />
                            {detailModal.investor?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Complete investor profile and wallet information
                        </DialogDescription>
                    </DialogHeader>
                    {detailModal.loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                        </div>
                    ) : detailModal.investor && (
                        <div className="space-y-6 py-4">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground text-xs">Email</Label>
                                    <p className="text-white">{detailModal.investor.email}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Document</Label>
                                    <p className="text-white">{detailModal.investor.document}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Status</Label>
                                    <p>{getStatusBadge(detailModal.investor.status)}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Registered</Label>
                                    <p className="text-white">{new Date(detailModal.investor.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>

                            {/* Wallet Info */}
                            <div className="p-4 bg-white/5 rounded-lg space-y-3">
                                <Label className="text-muted-foreground text-xs flex items-center gap-1">
                                    <Wallet className="w-3 h-3" /> Wallet Address
                                </Label>
                                {detailModal.investor.stellarContractId ? (
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
                                            {detailModal.investor.stellarContractId}
                                        </code>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(detailModal.investor!.stellarContractId!)}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground text-sm">No wallet created yet</p>
                                )}

                                {/* Balances */}
                                {detailModal.investor.balances && (
                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                        <div className="p-3 bg-black/30 rounded">
                                            <p className="text-xs text-muted-foreground">XLM Balance</p>
                                            <p className="text-lg font-semibold text-white">{parseFloat(detailModal.investor.balances.xlm).toFixed(2)}</p>
                                        </div>
                                        <div className="p-3 bg-black/30 rounded">
                                            <p className="text-xs text-muted-foreground">USDC Balance</p>
                                            <p className="text-lg font-semibold text-emerald-400">${parseFloat(detailModal.investor.balances.usdc).toFixed(2)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Recent Transactions */}
                            {detailModal.investor.transactions && detailModal.investor.transactions.length > 0 && (
                                <div>
                                    <Label className="text-muted-foreground text-xs flex items-center gap-1 mb-2">
                                        <History className="w-3 h-3" /> Recent Transactions
                                    </Label>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {detailModal.investor.transactions.map((tx, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 bg-white/5 rounded text-xs">
                                                <span className="text-muted-foreground">{tx.type}</span>
                                                <span className="text-white">{tx.amount}</span>
                                                <span className="text-muted-foreground">{tx.date}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDetailModal({ open: false, investor: null, loading: false })}>
                            Close
                        </Button>
                        {detailModal.investor?.stellarContractId && (
                            <Button asChild className="bg-red-600 hover:bg-red-700">
                                <a
                                    href={`https://stellar.expert/explorer/testnet/contract/${detailModal.investor.stellarContractId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    View on Explorer
                                </a>
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
