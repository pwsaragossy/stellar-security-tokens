import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, Coins, ArrowUpRight, Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { tokensApi } from '@/api/tokens';
import type { Token } from '@/types';
import { formatCurrency } from '@/utils/format';

export function Tokens() {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchTokens();
    }, []);

    const fetchTokens = async () => {
        try {
            setLoading(true);
            const response = await tokensApi.getAll();
            if (response.success && response.data) {
                // Ideally filter by company here or backend
                // For now, assuming backend returns what we have access to or we show all public tokens
                setTokens(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch tokens:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredTokens = tokens.filter(token =>
        token.assetCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        token.issuerPublicKey.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Coins className="w-6 h-6 text-primary" />
                        My Tokens
                    </h2>
                    <p className="text-muted-foreground">Monitor your issued security tokens.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={fetchTokens} title="Refresh">
                        <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <Card className="glass-panel border-white/5 bg-white/5">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search tokens..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 glass-panel bg-black/20 border-white/10"
                            />
                        </div>
                    </div>

                    <div className="rounded-md border border-white/10">
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="border-white/10 hover:bg-transparent">
                                    <TableHead className="text-white">Asset Code</TableHead>
                                    <TableHead className="text-white">Total Supply</TableHead>
                                    <TableHead className="text-white">Description</TableHead>
                                    <TableHead className="text-white">Status</TableHead>
                                    <TableHead className="text-white">Created At</TableHead>
                                    <TableHead className="text-right text-white">Stellar Explorer</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredTokens.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            No tokens found. Create an offer to issue tokens.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredTokens.map((token) => (
                                        <TableRow key={token.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                            <TableCell>
                                                <Badge variant="outline" className="font-mono text-primary border-primary/20 bg-primary/10">
                                                    {token.assetCode}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-medium text-white">
                                                {formatCurrency(Number(token.totalSupply))}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground max-w-xs truncate">
                                                {token.description}
                                            </TableCell>
                                            <TableCell>
                                                {token.offer?.isTokenLocked !== false ? (
                                                    <Badge variant="outline" className="gap-1 text-amber-400 border-amber-400/30 bg-amber-400/10">
                                                        <Lock className="w-3 h-3" />
                                                        Locked
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="gap-1 text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
                                                        <Unlock className="w-3 h-3" />
                                                        Unlocked
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {new Date(token.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <a
                                                    href={`https://stellar.expert/explorer/testnet/asset/${token.assetCode}-${token.issuerPublicKey}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                                                >
                                                    View <ArrowUpRight className="w-3 h-3" />
                                                </a>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div >
    );
}
