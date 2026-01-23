import { useState, useEffect, useCallback } from 'react';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Shield, ExternalLink, Wallet, CreditCard, ArrowLeftRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { QRCode } from '@/components/ui/qrcode';
import { investorsApi } from '@/api/investors';

interface DepositDialogProps {
    investorId: number;
    walletAddress: string;
    network?: 'testnet' | 'mainnet';
}

interface RelayDeposit {
    memo: string;
    treasuryAddress: string;
    status: 'pending' | 'received' | 'forwarding' | 'completed' | 'expired' | 'failed';
    actualAmount?: number;
    outgoingTxHash?: string;
}

export function DepositDialog({ investorId, walletAddress }: DepositDialogProps) {
    const [copied, setCopied] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [deposit, setDeposit] = useState<RelayDeposit | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleCopy = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const initiateDeposit = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await investorsApi.initiateDeposit(investorId);
            setDeposit(response.data);
        } catch (err: any) {
            setError(err.message || 'Failed to initiate deposit');
        } finally {
            setLoading(false);
        }
    }, [investorId]);

    // Initial initiation
    useEffect(() => {
        initiateDeposit();
    }, [initiateDeposit]);

    // Status Polling
    useEffect(() => {
        if (!deposit || deposit.status === 'completed' || deposit.status === 'failed' || deposit.status === 'expired') {
            return;
        }

        const pollInterval = setInterval(async () => {
            try {
                const response = await investorsApi.getDeposits(investorId);
                const currentDeposit = response.data.find((d: any) => d.memo === deposit.memo);
                if (currentDeposit && currentDeposit.status !== deposit.status) {
                    setDeposit(currentDeposit);
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 5000);

        return () => clearInterval(pollInterval);
    }, [deposit, investorId]);

    const onRamps = [
        { name: 'Coinbase', url: 'https://www.coinbase.com', description: 'Buy USDC, then withdraw to Stellar' },
        { name: 'Kraken', url: 'https://www.kraken.com', description: 'Supports direct Stellar USDC withdrawals' },
        { name: 'Binance', url: 'https://www.binance.com', description: 'Convert and withdraw to Stellar network' },
    ];

    return (
        <DialogContent className="sm:max-w-lg bg-slate-900 border-white/10 text-white overflow-hidden">
            <DialogHeader>
                <DialogTitle>Deposit USDC</DialogTitle>
                <DialogDescription className="text-gray-400">
                    Send USDC from any exchange or wallet.
                </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="relay" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-white/5 p-1 rounded-xl">
                    <TabsTrigger value="relay" className="data-[state=active]:bg-blue-600 rounded-lg text-xs py-2">
                        <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
                        Relay (Recommended)
                    </TabsTrigger>
                    <TabsTrigger value="buy" className="data-[state=active]:bg-blue-600 rounded-lg text-xs py-2">
                        <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                        Buy
                    </TabsTrigger>
                    <TabsTrigger value="direct" className="data-[state=active]:bg-blue-600 rounded-lg text-xs py-2">
                        <Wallet className="w-3.5 h-3.5 mr-1.5" />
                        Direct (Advanced)
                    </TabsTrigger>
                </TabsList>

                {/* Relay Deposit Tab */}
                <TabsContent value="relay" className="space-y-4 mt-6">
                    {loading && !deposit ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            <p className="text-sm text-gray-400">Generating unique deposit memo...</p>
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3">
                            <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                                <AlertCircle className="w-4 h-4" />
                                <span>Failed to initialize</span>
                            </div>
                            <p className="text-xs text-red-300/80">{error}</p>
                            <Button variant="outline" size="sm" onClick={initiateDeposit} className="w-full border-red-500/20 hover:bg-red-500/10 text-red-400">
                                <RefreshCw className="w-3 h-3 mr-2" />
                                Retry
                            </Button>
                        </div>
                    ) : deposit ? (
                        <div className="space-y-6">
                            {/* Status Indicator */}
                            <div className="flex items-center justify-between px-4 py-2 bg-white/5 rounded-full border border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${deposit.status === 'completed' ? 'bg-emerald-500 animate-pulse' :
                                        deposit.status === 'failed' ? 'bg-red-500' :
                                            'bg-blue-500 animate-pulse'
                                        }`} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                        Status: {deposit.status}
                                    </span>
                                </div>
                                {deposit.status === 'completed' && (
                                    <span className="text-[10px] text-emerald-400 font-medium">Payment Received & Forwarded</span>
                                )}
                            </div>

                            <div className="flex flex-col items-center space-y-4">
                                <div className="p-4 bg-white rounded-2xl">
                                    <QRCode value={deposit.treasuryAddress} size={160} />
                                </div>

                                <div className="w-full space-y-4">
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center px-1">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Relay Address</p>
                                            <span className="text-[10px] text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">Safe for Exchanges</span>
                                        </div>
                                        <div className="flex items-center gap-2 p-3 bg-black/40 rounded-xl border border-white/10 group">
                                            <p className="text-xs font-mono text-gray-300 break-all flex-1">
                                                {deposit.treasuryAddress}
                                            </p>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 hover:bg-white/10 shrink-0"
                                                onClick={() => handleCopy(deposit.treasuryAddress, 'addr')}
                                            >
                                                {copied === 'addr' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center px-1">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Required Memo</p>
                                            <span className="text-[10px] text-red-400/60">Must include this</span>
                                        </div>
                                        <div className="flex items-center gap-2 p-3 bg-red-500/5 rounded-xl border border-red-500/20 group animate-pulse">
                                            <p className="text-sm font-bold font-mono text-red-400 flex-1">
                                                {deposit.memo}
                                            </p>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 hover:bg-red-500/10 shrink-0"
                                                onClick={() => handleCopy(deposit.memo, 'memo')}
                                            >
                                                {copied === 'memo' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-red-400" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </TabsContent>

                {/* Buy crypto/Exchanges context */}
                <TabsContent value="buy" className="space-y-4 mt-6">
                    <p className="text-sm text-gray-400">
                        Purchase USDC and send to the <strong>Relay Address</strong> using the <strong>Memo</strong> above.
                    </p>
                    <div className="space-y-2">
                        {onRamps.map((ramp) => (
                            <a key={ramp.name} href={ramp.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                <div>
                                    <p className="font-semibold text-sm">{ramp.name}</p>
                                    <p className="text-xs text-gray-400">{ramp.description}</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-500" />
                            </a>
                        ))}
                    </div>
                </TabsContent>

                {/* Advanced: Direct Deposit */}
                <TabsContent value="direct" className="space-y-4 mt-6">
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-amber-500 text-sm font-bold">
                            <Shield className="w-4 h-4" />
                            <span>Advanced Users Only</span>
                        </div>
                        <p className="text-xs text-amber-300/80 leading-relaxed">
                            This is your Smart Wallet contract address. Most exchanges (Binance, Coinbase) <strong>DO NOT</strong> support direct deposits to contract addresses yet.
                        </p>
                    </div>

                    <div className="flex flex-col items-center space-y-4">
                        <QRCode value={walletAddress} size={140} />
                        <div className="w-full space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Contract Address</p>
                            <div className="flex items-center gap-2 p-3 bg-black/40 rounded-xl border border-white/5">
                                <p className="text-xs font-mono text-gray-400 break-all flex-1">{walletAddress}</p>
                                <Button variant="ghost" size="sm" onClick={() => handleCopy(walletAddress, 'direct')}>
                                    {copied === 'direct' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-gray-500" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/10 rounded-2xl">
                <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold text-blue-400 text-xs">How it works</p>
                        <p className="text-[10px] text-blue-300/80 mt-1 leading-relaxed">
                            Funds sent to the relay address with your memo are automatically detected and forwarded to your smart wallet within seconds.
                        </p>
                    </div>
                </div>
            </div>
        </DialogContent>
    );
}
