import { useState, useEffect, useCallback } from 'react';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Copy, Check, Loader2, AlertCircle, RefreshCw, ArrowLeft, Building2, Wallet, AlertTriangle } from 'lucide-react';
import { QRCode } from '@/components/ui/qrcode';
import { investorsApi } from '@/api/investors';

interface DepositDialogProps {
    investorId?: number;
    walletAddress: string;
    network?: 'testnet' | 'mainnet';
}

interface DepositInfo {
    memo: string;
    treasuryAddress: string;
    status: string;
}

type DepositSource = 'exchange' | 'wallet' | null;

export function DepositDialog({ investorId, walletAddress }: DepositDialogProps) {
    const [copied, setCopied] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [deposit, setDeposit] = useState<DepositInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<DepositSource>(null);

    const handleCopy = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const fetchDepositInfo = useCallback(async () => {
        if (!investorId) return;
        setLoading(true);
        setError(null);
        try {
            const response = await investorsApi.initiateDeposit(investorId);
            setDeposit(response.data);
        } catch (err: any) {
            setError(err.message || 'Failed to load deposit info');
        } finally {
            setLoading(false);
        }
    }, [investorId]);

    useEffect(() => {
        if (investorId) {
            fetchDepositInfo();
        }
    }, [investorId, fetchDepositInfo]);

    // Stellar URI for wallet QR (auto-fills destination in wallet apps)
    const stellarUri = walletAddress
        ? `web+stellar:pay?destination=${walletAddress}`
        : walletAddress;

    return (
        <DialogContent className="sm:max-w-md bg-slate-900 border-white/10 text-white overflow-hidden">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    {source && (
                        <button
                            onClick={() => setSource(null)}
                            className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    Deposit USDC
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                    {source === null && 'How are you sending?'}
                    {source === 'exchange' && 'Send USDC from your exchange to this address.'}
                    {source === 'wallet' && 'Send USDC directly from your Stellar wallet.'}
                </DialogDescription>
            </DialogHeader>

            {/* Loading */}
            {loading && !deposit ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                    <p className="text-sm text-gray-400">Loading…</p>
                </div>

                /* Error */
            ) : error ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                        <AlertCircle className="w-4 h-4" />
                        <span>Something went wrong</span>
                    </div>
                    <p className="text-xs text-red-300/80">{error}</p>
                    <Button variant="outline" size="sm" onClick={fetchDepositInfo} className="w-full border-red-500/20 hover:bg-red-500/10 text-red-400">
                        <RefreshCw className="w-3 h-3 mr-2" /> Retry
                    </Button>
                </div>

                /* Step 1: Source Picker */
            ) : source === null ? (
                <div className="grid grid-cols-2 gap-3 py-2">
                    <button
                        onClick={() => setSource('exchange')}
                        className="flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all group"
                    >
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                            <Building2 className="w-6 h-6 text-amber-400" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-white">Exchange</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Binance, Coinbase…</p>
                        </div>
                    </button>

                    <button
                        onClick={() => setSource('wallet')}
                        className="flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all group"
                    >
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                            <Wallet className="w-6 h-6 text-blue-400" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-white">Wallet</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Lobstr, Freighter…</p>
                        </div>
                    </button>

                    {/* PIX — Coming Soon */}
                    <button
                        disabled
                        className="flex flex-col items-center gap-3 p-5 rounded-xl border border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed col-span-2"
                    >
                        <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <span className="text-xl">🇧🇷</span>
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-gray-500">PIX</p>
                            <p className="text-[10px] text-gray-600 mt-0.5">Coming soon</p>
                        </div>
                    </button>
                </div>

                /* Step 2: Exchange — Treasury + Memo */
            ) : source === 'exchange' && deposit ? (
                <div className="flex flex-col items-center space-y-5 py-2">
                    {/* QR */}
                    <div className="bg-white rounded-xl p-3">
                        <QRCode value={deposit.treasuryAddress} size={160} />
                    </div>

                    {/* Address + Copy */}
                    <div className="w-full space-y-1.5">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/8">
                            <p className="text-xs font-mono text-gray-300 break-all flex-1 leading-relaxed">
                                {deposit.treasuryAddress}
                            </p>
                            <button
                                onClick={() => handleCopy(deposit.treasuryAddress, 'addr')}
                                className="p-1.5 rounded-md hover:bg-white/10 transition-colors shrink-0"
                            >
                                {copied === 'addr'
                                    ? <Check className="w-4 h-4 text-emerald-400" />
                                    : <Copy className="w-4 h-4 text-gray-400" />
                                }
                            </button>
                        </div>
                    </div>

                    {/* Memo */}
                    <div className="w-full">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border-2 border-red-500/25">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Memo</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">Required</span>
                                </div>
                                <p className="text-xl font-bold font-mono text-red-400 tracking-wider">
                                    {deposit.memo}
                                </p>
                            </div>
                            <button
                                onClick={() => handleCopy(deposit.memo, 'memo')}
                                className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors shrink-0"
                            >
                                {copied === 'memo'
                                    ? <Check className="w-4 h-4 text-emerald-400" />
                                    : <Copy className="w-4 h-4 text-red-400" />
                                }
                            </button>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="flex items-start gap-2 text-[11px] text-gray-500 w-full">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
                        <span>Only send <strong className="text-gray-400">Stellar USDC</strong>. Always include the memo.</span>
                    </div>
                </div>

                /* Step 2: Wallet — Smart Wallet Contract */
            ) : source === 'wallet' ? (
                <div className="flex flex-col items-center space-y-5 py-2">
                    {/* QR — Stellar URI for auto-fill */}
                    <div className="bg-white rounded-xl p-3">
                        <QRCode value={stellarUri} size={160} />
                    </div>

                    {/* Address + Copy */}
                    <div className="w-full space-y-1.5">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/8">
                            <p className="text-xs font-mono text-gray-300 break-all flex-1 leading-relaxed">
                                {walletAddress}
                            </p>
                            <button
                                onClick={() => handleCopy(walletAddress, 'wallet')}
                                className="p-1.5 rounded-md hover:bg-white/10 transition-colors shrink-0"
                            >
                                {copied === 'wallet'
                                    ? <Check className="w-4 h-4 text-emerald-400" />
                                    : <Copy className="w-4 h-4 text-gray-400" />
                                }
                            </button>
                        </div>
                        <p className="text-[11px] text-emerald-400/70 px-1">No memo needed.</p>
                    </div>

                    {/* Warning */}
                    <div className="flex items-start gap-2 text-[11px] text-gray-500 w-full">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
                        <span>Only send <strong className="text-gray-400">Stellar USDC</strong> to this address.</span>
                    </div>
                </div>
            ) : null}
        </DialogContent>
    );
}
