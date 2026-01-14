import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Loader2, ExternalLink, FileText, BadgeCheck, FileWarning, Eye } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useState } from 'react';
import { useNavigate } from "react-router-dom";

interface DocumentRow {
    id: string;
    name: string;
    type: string;
    offerName: string;
    offerId: number;
    uploadDate: string;
    cid?: string;
    url?: string;
    fileType?: string;
}

export function Documents() {
    const { offers, loading, error } = useCompany();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 animate-fade-in">
                Failed to load documents: {error}
            </div>
        );
    }

    // Flatten documents from offers
    const allDocuments: DocumentRow[] = offers.flatMap(offer => {
        const docs: DocumentRow[] = [];
        const { legal_documents, created_at, offer_name, id } = offer;

        if (!legal_documents) return [];

        if (legal_documents.contract) {
            docs.push({
                id: `${id}-contract`,
                name: "Investment Contract",
                type: 'Contract',
                offerName: offer_name,
                offerId: id,
                uploadDate: legal_documents.contract.uploadedAt || created_at,
                cid: legal_documents.contract.hash,
                url: legal_documents.contract.url,
                fileType: 'PDF'
            });
        }
        if (legal_documents.terms) {
            docs.push({
                id: `${id}-terms`,
                name: "Terms & Conditions",
                type: 'Terms',
                offerName: offer_name,
                offerId: id,
                uploadDate: legal_documents.terms.uploadedAt || created_at,
                cid: legal_documents.terms.hash,
                url: legal_documents.terms.url,
                fileType: 'PDF'
            });
        }
        if (legal_documents.prospectus) {
            docs.push({
                id: `${id}-prospectus`,
                name: "Prospectus",
                type: 'Prospectus',
                offerName: offer_name,
                offerId: id,
                uploadDate: legal_documents.prospectus.uploadedAt || created_at,
                cid: legal_documents.prospectus.hash,
                url: legal_documents.prospectus.url,
                fileType: 'PDF'
            });
        }
        // Check for other docs if structure changes, currently mapped explicitly
        return docs;
    });

    const filteredDocs = allDocuments.filter(doc => {
        const matchesSearch =
            doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.offerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (doc.cid && doc.cid.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesType = typeFilter === 'all' || doc.type.toLowerCase() === typeFilter.toLowerCase();
        return matchesSearch && matchesType;
    });

    const docTypes = ['All', 'Contract', 'Terms', 'Prospectus'];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
                <div>
                    <h2 className="text-3xl font-bold font-heading text-foreground">Digital Asset Repository</h2>
                    <p className="text-muted-foreground">Manage and verify your decentralized legal records</p>
                </div>
                <div className="flex gap-2">
                    {/* Placeholder for future bulk actions */}
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up animate-delay-1">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, offer, or CID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground transition-all focus:bg-black/30"
                    />
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="pl-10 pr-8 py-2 rounded-md glass-panel bg-black/20 border border-white/10 text-white appearance-none cursor-pointer focus:border-primary/50 focus:outline-none transition-all hover:bg-black/30 h-10"
                        >
                            {docTypes.map(type => (
                                <option key={type} value={type === 'All' ? 'all' : type} className="bg-slate-900">
                                    {type}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Documents List */}
            <Card className="glass-panel border-white/5 bg-white/5 overflow-hidden animate-fade-in-up animate-delay-2">
                {filteredDocs.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10 bg-white/5">
                                    <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground w-[40px]">Type</th>
                                    <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Document Name</th>
                                    <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Associated Offer</th>
                                    <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Upload Date</th>
                                    <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">IPFS CID</th>
                                    <th className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredDocs.map((doc) => (
                                    <tr key={doc.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="p-4">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-medium text-white">{doc.name}</div>
                                            <div className="text-xs text-muted-foreground uppercase">{doc.fileType}</div>
                                        </td>
                                        <td className="p-4">
                                            <div
                                                className="text-sm text-primary hover:underline cursor-pointer font-medium"
                                                onClick={() => navigate(`/company/offers/${doc.offerId}`)}
                                            >
                                                {doc.offerName}
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm text-muted-foreground font-mono">
                                            {new Date(doc.uploadDate).toLocaleDateString()}
                                        </td>
                                        <td className="p-4">
                                            {doc.cid ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-muted-foreground bg-black/20 px-2 py-1 rounded border border-white/5">
                                                        {doc.cid.substring(0, 6)}...{doc.cid.substring(doc.cid.length - 4)}
                                                    </span>
                                                    <BadgeCheck className="w-3 h-3 text-emerald-500" />
                                                </div>
                                            ) : (
                                                <span className="text-xs text-warning flex items-center gap-1">
                                                    <FileWarning className="w-3 h-3" /> Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {doc.url && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-white hover:bg-white/10"
                                                        onClick={() => window.open(doc.url, '_blank')}
                                                        title="View Document"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                {doc.cid && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-white hover:bg-white/10"
                                                        onClick={() => window.open(`https://ipfs.io/ipfs/${doc.cid}`, '_blank')}
                                                        title="View on IPFS"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
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
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <FileText className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">No documents found</h3>
                        <p className="text-muted-foreground max-w-md mx-auto mb-6">
                            Upload legal documents when creating a new token offering to see them listed here.
                        </p>
                        <Button
                            onClick={() => navigate('/company/offers/new')}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground btn-glow"
                        >
                            Create New Offer
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
}
