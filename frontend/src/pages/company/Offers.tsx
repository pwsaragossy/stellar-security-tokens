import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Search, Filter, Loader2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useNavigate } from "react-router-dom";

export function Offers() {
    const { offers, loading, error } = useCompany();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
                Failed to load offers: {error}
            </div>
        );
    }

    const filteredOffers = offers.filter(offer => {
        const matchesSearch = offer.offer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            offer.asset_code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || offer.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusOptions = [
        { value: 'all', label: 'All Status' },
        { value: 'pending_review', label: '🟡 Under Review' },
        { value: 'approved', label: '🔵 Approved' },
        { value: 'active', label: '🟢 Active' },
        { value: 'funding', label: '🟣 Funding' },
        { value: 'rejected', label: '🔴 Declined' },
        { value: 'closed', label: '⚫ Completed' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
                <div>
                    <h2 className="text-3xl font-bold font-heading text-foreground">My Offers</h2>
                    <p className="text-muted-foreground">Manage your tokenized asset offers</p>
                </div>
                <Button
                    onClick={() => navigate('/company/offers/new')}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-full px-6 transition-all hover:scale-105 btn-glow"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Offer
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up animate-delay-1">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search offers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground transition-all focus:bg-black/30"
                    />
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="pl-10 pr-8 py-2 rounded-md glass-panel bg-black/20 border border-white/10 text-white appearance-none cursor-pointer focus:border-primary/50 focus:outline-none transition-all hover:bg-black/30"
                        >
                            {statusOptions.map(option => (
                                <option key={option.value} value={option.value} className="bg-slate-900">
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Offers Table */}
            <Card className="glass-panel border-white/5 bg-white/5 overflow-hidden animate-fade-in-up animate-delay-2">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                                <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground w-[100px]">Asset</th>
                                <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</th>
                                <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                                <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Supply</th>
                                <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">APY</th>
                                <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Created</th>
                                <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredOffers.length > 0 ? (
                                filteredOffers.map((offer) => (
                                    <tr
                                        key={offer.id}
                                        onClick={() => navigate(`/company/offers/${offer.id}`)}
                                        className="group hover:bg-white/5 transition-colors cursor-pointer"
                                    >
                                        <td className="p-4 font-mono text-sm font-bold text-accent">
                                            {offer.asset_code}
                                        </td>
                                        <td className="p-4 text-sm font-medium text-foreground">
                                            {offer.offer_name}
                                        </td>
                                        <td className="p-4 text-sm text-muted-foreground capitalize">
                                            {offer.offer_type}
                                        </td>
                                        <td className="p-4 text-sm text-foreground text-right font-mono">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(parseFloat(offer.total_supply || '0'))}
                                        </td>
                                        <td className="p-4 text-sm text-success text-right font-mono">
                                            {offer.annual_interest_rate ? `${offer.annual_interest_rate}%` : '-'}
                                        </td>
                                        <td className="p-4 text-sm text-muted-foreground">
                                            {new Date(offer.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end">
                                                <StatusBadge status={offer.status} />
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-4">
                                            <FileText className="w-12 h-12 opacity-20" />
                                            <div>
                                                <p className="font-medium text-foreground">No offers found</p>
                                                <p className="text-sm opacity-70">
                                                    {searchTerm || statusFilter !== 'all'
                                                        ? 'Try adjusting your filters'
                                                        : 'Create your first offer to get started'}
                                                </p>
                                            </div>
                                            {!searchTerm && statusFilter === 'all' && (
                                                <Button
                                                    onClick={(e) => { e.stopPropagation(); navigate('/company/offers/new'); }}
                                                    variant="outline"
                                                    className="mt-2 border-white/10 hover:bg-white/5 hover:text-white"
                                                >
                                                    Create Offer
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const getStatusConfig = () => {
        switch (status) {
            case 'pending_review':
            case 'draft':
                return {
                    label: 'Under Review',
                    bg: 'bg-amber-500/15',
                    text: 'text-amber-400',
                    border: 'border-amber-500/30',
                    dot: 'bg-amber-400',
                };
            case 'under_review':
                return {
                    label: 'Under Review',
                    bg: 'bg-amber-500/15',
                    text: 'text-amber-400',
                    border: 'border-amber-500/30',
                    dot: 'bg-amber-400',
                };
            case 'approved':
                return {
                    label: 'Approved',
                    bg: 'bg-blue-500/15',
                    text: 'text-blue-400',
                    border: 'border-blue-500/30',
                    dot: 'bg-blue-400',
                };
            case 'active':
                return {
                    label: 'Active',
                    bg: 'bg-emerald-500/15',
                    text: 'text-emerald-400',
                    border: 'border-emerald-500/30',
                    dot: 'bg-emerald-400 animate-pulse',
                };
            case 'funding':
            case 'in_progress':
                return {
                    label: 'Funding',
                    bg: 'bg-purple-500/15',
                    text: 'text-purple-400',
                    border: 'border-purple-500/30',
                    dot: 'bg-purple-400 animate-pulse',
                };
            case 'rejected':
            case 'declined':
                return {
                    label: 'Declined',
                    bg: 'bg-red-500/15',
                    text: 'text-red-400',
                    border: 'border-red-500/30',
                    dot: 'bg-red-400',
                };
            case 'closed':
            case 'completed':
            case 'finished':
                return {
                    label: 'Completed',
                    bg: 'bg-slate-500/15',
                    text: 'text-slate-400',
                    border: 'border-slate-500/30',
                    dot: 'bg-slate-400',
                };
            case 'paused':
                return {
                    label: 'Paused',
                    bg: 'bg-orange-500/15',
                    text: 'text-orange-400',
                    border: 'border-orange-500/30',
                    dot: 'bg-orange-400',
                };
            default:
                return {
                    label: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    bg: 'bg-slate-500/15',
                    text: 'text-slate-400',
                    border: 'border-slate-500/30',
                    dot: 'bg-slate-400',
                };
        }
    };

    const config = getStatusConfig();

    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${config.bg} ${config.text} ${config.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            {config.label}
        </span>
    );
}

