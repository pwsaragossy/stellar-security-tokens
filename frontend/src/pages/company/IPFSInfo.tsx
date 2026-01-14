import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Globe, Lock, Eye, FileCheck, Shield, Database, ExternalLink, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function IPFSInfo() {
    const navigate = useNavigate();

    return (
        <div className="max-w-4xl mx-auto space-y-8 py-8 px-4">
            {/* Header */}
            <div className="space-y-4 animate-fade-in">
                <Button
                    variant="ghost"
                    onClick={() => navigate(-1)}
                    className="text-muted-foreground hover:text-white transition-transform hover:scale-105"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <div>
                    <h1 className="text-3xl font-bold font-heading text-white">Understanding IPFS Document Storage</h1>
                    <p className="text-muted-foreground mt-2">
                        Learn how your legal documents are stored securely and transparently on the blockchain
                    </p>
                </div>
            </div>

            {/* What is IPFS */}
            <Card className="glass-panel border-white/10 animate-fade-in-up animate-delay-1">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3 font-heading">
                        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                            <Globe className="w-5 h-5 text-primary" />
                        </div>
                        What is IPFS?
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-white/80">
                    <p>
                        <strong className="text-white">IPFS (InterPlanetary File System)</strong> is a decentralized,
                        peer-to-peer network for storing and sharing files. Unlike traditional web hosting where files
                        are stored on a single server, IPFS distributes content across a global network of nodes.
                    </p>
                    <p>
                        When you upload a document to IPFS, it receives a unique identifier called a <strong className="text-primary">CID
                            (Content Identifier)</strong>. This CID is generated based on the file's content, not its location,
                        making it a cryptographic fingerprint of your document.
                    </p>
                </CardContent>
            </Card>

            {/* Key Features Grid */}
            <div className="grid gap-4 md:grid-cols-2 animate-fade-in-up animate-delay-2">
                {/* Immutability */}
                <Card className="glass-panel border-white/10">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                                <FileCheck className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold font-heading text-white mb-2">Immutability</h3>
                                <p className="text-sm text-white/70">
                                    Once a document is uploaded, it cannot be modified or tampered with. Any change
                                    to the file would produce a completely different CID, making alterations immediately detectable.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Transparency */}
                <Card className="glass-panel border-white/10">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                                <Eye className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold font-heading text-white mb-2">Transparency</h3>
                                <p className="text-sm text-white/70">
                                    All investors can verify that the documents they're viewing are the exact same
                                    documents that were originally submitted. The CID serves as cryptographic proof of authenticity.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Decentralization */}
                <Card className="glass-panel border-white/10">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                                <Database className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold font-heading text-white mb-2">Decentralization</h3>
                                <p className="text-sm text-white/70">
                                    Documents are stored across multiple nodes worldwide, eliminating single points of
                                    failure. Your documents remain accessible even if some network nodes go offline.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Permanence */}
                <Card className="glass-panel border-white/10">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                                <Shield className="w-6 h-6 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold font-heading text-white mb-2">Permanence</h3>
                                <p className="text-sm text-white/70">
                                    Documents pinned to IPFS through our platform are preserved indefinitely, ensuring
                                    that legal agreements remain available throughout the life of the investment.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Privacy Considerations */}
            <div className="space-y-8 animate-fade-in-up animate-delay-3">
                <Card className="glass-panel border-amber-500/20 bg-amber-500/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-amber-300 font-heading">
                            <Lock className="w-5 h-5" />
                            Important: Privacy Considerations
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3 text-white/80">
                            <p>
                                <strong className="text-amber-300">Documents uploaded to IPFS are publicly accessible.</strong> Anyone
                                with the CID can view the content. This is by design for transparency in investment offerings.
                            </p>

                            <div className="p-4 rounded-xl bg-black/20 border border-white/10 space-y-3">
                                <h4 className="font-medium text-white">What this means for you:</h4>
                                <ul className="space-y-2 text-sm">
                                    <li className="flex items-start gap-2">
                                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                        <span><strong className="text-white">Do upload:</strong> Investment contracts, terms and conditions, prospectuses,
                                            and other legal documents that investors need to review.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                        <span><strong className="text-white">Do NOT upload:</strong> Personally identifiable information (PII),
                                            bank account details, passwords, or any sensitive personal data.</span>
                                    </li>
                                </ul>
                            </div>

                            <p className="text-sm">
                                The CID of your documents is stored on the Stellar blockchain alongside your offer, creating
                                an immutable link between the offer and its legal documentation.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* How It Works */}
                <Card className="glass-panel border-white/10">
                    <CardHeader>
                        <CardTitle className="font-heading">How Document Storage Works</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-sm">1</div>
                                <div>
                                    <h4 className="font-medium text-white">Upload</h4>
                                    <p className="text-sm text-white/70">You upload your legal documents during offer creation.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-sm">2</div>
                                <div>
                                    <h4 className="font-medium text-white">Processing</h4>
                                    <p className="text-sm text-white/70">Our system uploads the document to IPFS and generates a unique CID.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-sm">3</div>
                                <div>
                                    <h4 className="font-medium text-white">Blockchain Recording</h4>
                                    <p className="text-sm text-white/70">The CID is stored on the Stellar blockchain as part of your offer metadata.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400 font-bold text-sm">✓</div>
                                <div>
                                    <h4 className="font-medium text-white">Verification</h4>
                                    <p className="text-sm text-white/70">Anyone can verify document authenticity by comparing the CID on-chain with the document hash.</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Learn More */}
                <Card className="glass-panel border-white/10">
                    <CardContent className="pt-6">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <h3 className="font-semibold text-white">Want to learn more about IPFS?</h3>
                                <p className="text-sm text-muted-foreground">Visit the official IPFS documentation for technical details.</p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => window.open('https://docs.ipfs.tech/', '_blank')}
                                className="shrink-0 transition-transform hover:scale-105"
                            >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                IPFS Documentation
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
