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
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle, Search, RefreshCw } from 'lucide-react';
import { platformAdminsApi, type Investor } from '@/api/platformAdmins';

export function UserManagement() {
    const [loading, setLoading] = useState(true);
    const [investors, setInvestors] = useState<Investor[]>([]);
    const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'rejected'>('all');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    // Reject Modal State
    const [rejectModal, setRejectModal] = useState<{ open: boolean; investor: Investor | null }>({
        open: false,
        investor: null,
    });
    const [rejectReason, setRejectReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

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

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Pending</Badge>;
            case 'active':
                return <Badge variant="outline" className="border-emerald-500 text-emerald-500">Active</Badge>;
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
                    {(['all', 'pending', 'active', 'rejected'] as const).map((f) => (
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
        </div>
    );
}
