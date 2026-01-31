import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, Coins, RefreshCw, Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { tokensApi } from '@/api/tokens';
import { offersApi } from '@/api/offers';
import { walletsApi } from '@/api/wallets';
import type { Token } from '@/types';
import { formatCurrency } from '@/utils/format';
import { TransactionLink } from '@/components/ui/TransactionLink';
import { TokenManagementModal } from '@/components/admin/TokenManagementModal';

export function TokensPage() {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedToken, setSelectedToken] = useState<Token | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [distributorKey, setDistributorKey] = useState<string | null>(null);
    const [unlocking, setUnlocking] = useState<number | null>(null); // offerId being unlocked

    useEffect(() => {
        fetchTokens();
        fetchDistributorKey();
    }, []);

    const fetchDistributorKey = async () => {
        try {
            const response = await walletsApi.getWalletStatuses();
            if (response.data) {
                const dist = response.data.find(w => w.name === 'Distributor');
                if (dist) setDistributorKey(dist.publicKey);
            }
        } catch (error) {
            console.error('Failed to fetch distributor key:', error);
        }
    };

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

    const handleSync = async () => {
        try {
            setSyncing(true);
            const response = await tokensApi.sync();
            if (response.success) {
                fetchTokens();
            }
        } catch (error) {
            console.error('Sync failed:', error);
        } finally {
            setSyncing(false);
        }
    };

    const handleUnlock = async (token: Token) => {
        if (!token.offer?.id) {
            alert('Token has no associated offer');
            return;
        }

        const confirmed = window.confirm(
            `⚠️ IRREVERSIBLE ACTION\n\nThis will unlock token "${token.assetCode}" for free trading on DEX.\n\n` +
            `Once unlocked:\n` +
            `• Investors can trade freely without platform approval\n` +
            `• Dividend calculations will use on-chain balances\n` +
            `• This action CANNOT be undone\n\n` +
            `Are you sure you want to proceed?`
        );

        if (!confirmed) return;

        try {
            setUnlocking(token.offer.id);
            const response = await offersApi.unlockToken(token.offer.id);
            if (response.success) {
                alert(`✅ Token ${token.assetCode} unlocked successfully!\n\nStellar TX: ${response.data?.stellarTxHash || 'N/A'}`);
                fetchTokens(); // Refresh data
            } else {
                alert(`❌ Unlock failed: ${response.error || 'Unknown error'}`);
            }
        } catch (error: any) {
            console.error('Unlock failed:', error);
            alert(`❌ Error: ${error.message || 'Failed to unlock token'}`);
        } finally {
            setUnlocking(null);
        }
    };

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
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSync}
                        disabled={syncing || loading}
                        className="bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary gap-2"
                    >
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sync Ledger
                    </Button>
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
                                <TableHead className="text-muted-foreground">Offer & Status</TableHead>
                                <TableHead className="text-muted-foreground">Supply</TableHead>
                                <TableHead className="text-muted-foreground text-center">Rate (%)</TableHead>
                                <TableHead className="text-muted-foreground text-center">Lock Status</TableHead>
                                <TableHead className="text-muted-foreground">Maturity</TableHead>
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
                                    <TableCell colSpan={7} className="h-24 text-center">
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
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {token.offer ? (
                                                    <>
                                                        <span className="text-white font-medium">{token.offer.offer_name}</span>
                                                        <Badge variant="outline" className={`w-fit text-[10px] py-0 px-1.5 uppercase ${token.offer.status === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                                            'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                                                            }`}>
                                                            {token.offer.status.replace('_', ' ')}
                                                        </Badge>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground italic text-xs">No active offer</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-white font-mono">
                                            {formatCurrency(token.totalSupply || 0).replace('$', '')}
                                        </TableCell>
                                        <TableCell className="text-center text-primary font-medium">
                                            {token.offer?.annual_interest_rate ? `${token.offer.annual_interest_rate}%` : '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
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
                                        <TableCell className="text-muted-foreground text-sm">
                                            {token.offer?.maturity_date ? new Date(token.offer.maturity_date as any).toLocaleDateString() : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {token.offer?.isTokenLocked !== false && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleUnlock(token)}
                                                        disabled={unlocking === token.offer?.id}
                                                        className="h-8 px-2 text-xs text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
                                                    >
                                                        {unlocking === token.offer?.id ? (
                                                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                        ) : (
                                                            <Unlock className="w-3 h-3 mr-1" />
                                                        )}
                                                        Unlock
                                                    </Button>
                                                )}
                                                {token.issuanceTransactionHash && (
                                                    <TransactionLink
                                                        hash={token.issuanceTransactionHash}
                                                        label="Tx"
                                                        variant="ghost"
                                                        className="h-8 px-2 text-xs"
                                                    />
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedToken(token)}
                                                >
                                                    Details
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {selectedToken && (
                <TokenManagementModal
                    token={selectedToken}
                    distributorPublicKey={distributorKey}
                    walletName="Security Tokens"
                    onClose={() => setSelectedToken(null)}
                />
            )}
        </div>
    );
}
