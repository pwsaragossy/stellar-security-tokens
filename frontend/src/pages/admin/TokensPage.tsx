import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, Coins, Copy } from 'lucide-react';
import { tokensApi } from '@/api/tokens';
import type { Token } from '@/types';
import { formatCurrency } from '@/utils/format';
import { TransactionLink } from '@/components/ui/TransactionLink';
// Removed Tooltip usage

export function TokensPage() {
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // toast.success('Copied to clipboard');
    };

    const truncateKey = (key: string) => `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Coins className="w-6 h-6 text-primary" />
                        Issued Tokens
                    </h2>
                    <p className="text-muted-foreground">Manage and monitor all security tokens issued on the platform.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={fetchTokens} title="Refresh">
                        <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by Asset Code or Issuer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 bg-card/50 border-white/10"
                    />
                </div>
            </div>

            <Card className="bg-card/50 backdrop-blur-sm border-white/5">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-white/5 hover:bg-white/5">
                                <TableHead className="text-muted-foreground">Asset Code</TableHead>
                                <TableHead className="text-muted-foreground">Supply</TableHead>
                                <TableHead className="text-muted-foreground">Issuer Account</TableHead>
                                <TableHead className="text-muted-foreground">SAC Contract</TableHead>
                                <TableHead className="text-muted-foreground">Issuance Date</TableHead>
                                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
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
                                        No tokens found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTokens.map((token) => (
                                    <TableRow key={token.id} className="border-white/5 hover:bg-white/5">
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                    {token.assetCode.substring(0, 2)}
                                                </div>
                                                <span className="font-medium text-white">{token.assetCode}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-white font-mono">
                                            {formatCurrency(token.totalSupply || 0).replace('$', '')}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-mono text-muted-foreground" title={token.issuerPublicKey}>
                                                    {truncateKey(token.issuerPublicKey)}
                                                </span>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(token.issuerPublicKey)}>
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {token.sacContractId ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-mono text-muted-foreground" title={token.sacContractId}>
                                                        {truncateKey(token.sacContractId)}
                                                    </span>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(token.sacContractId!)}>
                                                        <Copy className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {new Date(token.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {token.issuanceTransactionHash && (
                                                    <TransactionLink
                                                        hash={token.issuanceTransactionHash}
                                                        label="Tx"
                                                        variant="ghost"
                                                        className="h-8 px-2 text-xs"
                                                    />
                                                )}
                                                <Button variant="ghost" size="sm">Details</Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
