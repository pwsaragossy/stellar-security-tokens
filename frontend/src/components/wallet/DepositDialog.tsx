import { useState, useEffect, useCallback } from 'react';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Copy, Check, Shield, Loader2, AlertCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { QRCode } from '@/components/ui/qrcode';
import { investorsApi } from '@/api/investors';

interface DepositDialogProps {
    investorId?: number;
    walletAddress: string;
    network?: 'testnet' | 'mainnet';
}

interface RelayDeposit {
    memo: string;
    treasuryAddress: string;
    status: 'pending' | 'received' | 'forwarding' | 'pending_approval' | 'completed' | 'expired' | 'failed' | 'rejected';
    actualAmount?: number;
    outgoingTxHash?: string;
}

// -- Status stepper config --
const STEPPER_STEPS = [
    { key: 'pending', label: 'Waiting for payment', description: 'Send USDC to the address below' },
    { key: 'received', label: 'Payment detected', description: 'USDC received at treasury' },
    { key: 'forwarding', label: 'Forwarding to wallet', description: 'Transferring to your smart wallet' },
    { key: 'completed', label: 'Deposit complete', description: 'Funds available in your wallet' },
] as const;

function getStepIndex(status: RelayDeposit['status']): number {
    switch (status) {
        case 'pending': return 0;
        case 'received': return 1;
        case 'forwarding':
        case 'pending_approval': return 2;
        case 'completed': return 3;
        default: return -1; // failed/expired
    }
}

// -- Visual Stepper Component --
function DepositStepper({ status }: { status: RelayDeposit['status'] }) {
    const currentIndex = getStepIndex(status);
    const isFailed = status === 'failed' || status === 'expired';
    const isRejected = status === 'rejected';

    if (isRejected) {
        return (
            <div className="flex flex-col gap-2 px-4 py-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-medium text-amber-400">
                        Deposit relay declined by administrator
                    </span>
                </div>
                <p className="text-[10px] text-amber-300/70 leading-relaxed">
                    Your funds are safe in the platform treasury. Tap "Retry" below to re-initiate the relay.
                </p>
            </div>
        );
    }

    if (isFailed) {
        return (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-xs font-medium text-red-400">
                    {status === 'expired' ? 'Deposit expired — please start a new one' : 'Deposit failed — please try again'}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1 w-full">
            {STEPPER_STEPS.map((step, i) => {
                const isActive = i === currentIndex;
                const isDone = i < currentIndex;

                return (
                    <div key={step.key} className="flex-1 flex flex-col items-center gap-1.5">
                        {/* Dot + connector */}
                        <div className="flex items-center w-full">
                            {i > 0 && (
                                <div className={`flex-1 h-0.5 transition-colors duration-500 ${isDone ? 'bg-emerald-500' : 'bg-white/10'
                                    }`} />
                            )}
                            <div className={`w-3 h-3 rounded-full border-2 transition-all duration-500 shrink-0 ${isDone
                                ? 'bg-emerald-500 border-emerald-500'
                                : isActive
                                    ? 'bg-blue-500 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                                    : 'bg-transparent border-white/20'
                                }`} />
                            {i < STEPPER_STEPS.length - 1 && (
                                <div className={`flex-1 h-0.5 transition-colors duration-500 ${isDone ? 'bg-emerald-500' : 'bg-white/10'
                                    }`} />
                            )}
                        </div>
                        {/* Label */}
                        <span className={`text-[9px] font-medium text-center leading-tight transition-colors ${isDone ? 'text-emerald-400' : isActive ? 'text-blue-400' : 'text-gray-600'
                            }`}>
                            {step.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export function DepositDialog({ investorId, walletAddress }: DepositDialogProps) {
    const [copied, setCopied] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [deposit, setDeposit] = useState<RelayDeposit | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const handleCopy = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const initiateDeposit = useCallback(async () => {
        if (!investorId) return;
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
        if (investorId) {
            initiateDeposit();
        }
    }, [investorId, initiateDeposit]);

    // Status Polling
    useEffect(() => {
        if (!investorId || !deposit || deposit.status === 'completed' || deposit.status === 'failed' || deposit.status === 'expired' || deposit.status === 'rejected') {
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

    return (
        <DialogContent className="sm:max-w-lg bg-slate-900 border-white/10 text-white overflow-hidden">
            <DialogHeader>
                <DialogTitle>Deposit USDC</DialogTitle>
                <DialogDescription className="text-gray-400">
                    Send Stellar USDC to the address below with your memo.
                </DialogDescription>
            </DialogHeader>

            {/* Loading State */}
            {loading && !deposit ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p className="text-sm text-gray-400">Preparing deposit…</p>
                </div>

                /* Error State */
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

                /* Ready — Deposit Instructions */
            ) : deposit ? (
                <div className="space-y-5">

                    {/* ── Visual Stepper ── */}
                    <DepositStepper status={deposit.status} />

                    {/* ── Numbered Step Flow ── */}
                    <div className="space-y-4">

                        {/* Step 1: Relay Address + QR */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold shrink-0">1</span>
                                <p className="text-xs font-semibold text-gray-300">Send to this address</p>
                                <span className="text-[10px] text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded ml-auto">Exchange-compatible</span>
                            </div>
                            <div className="flex items-start gap-3 p-3 bg-black/30 rounded-xl border border-white/10">
                                <div className="bg-white rounded-lg p-1.5 shrink-0">
                                    <QRCode value={deposit.treasuryAddress} size={80} />
                                </div>
                                <div className="flex-1 min-w-0 space-y-2">
                                    <p className="text-[11px] font-mono text-gray-300 break-all leading-relaxed">
                                        {deposit.treasuryAddress}
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs border-white/10 hover:bg-white/10 text-gray-300 w-full"
                                        onClick={() => handleCopy(deposit.treasuryAddress, 'addr')}
                                    >
                                        {copied === 'addr' ? <><Check className="w-3 h-3 mr-1.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3 h-3 mr-1.5" /> Copy Address</>}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Step 2: Memo */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold shrink-0">2</span>
                                <p className="text-xs font-semibold text-gray-300">Include this Memo</p>
                            </div>
                            <div className="p-3 bg-red-500/5 rounded-xl border-2 border-red-500/30 space-y-2">
                                <div className="flex items-center gap-2">
                                    <p className="text-lg font-bold font-mono text-red-400 flex-1 tracking-wider">
                                        {deposit.memo}
                                    </p>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 hover:bg-red-500/10 shrink-0"
                                        onClick={() => handleCopy(deposit.memo, 'memo')}
                                    >
                                        {copied === 'memo' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-red-400" />}
                                    </Button>
                                </div>
                                <p className="text-[10px] text-red-300/70">
                                    ⚠ Without the memo, your deposit can't be identified.
                                </p>
                            </div>
                        </div>

                        {/* Step 3: Confirmation */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold shrink-0">3</span>
                                <p className="text-xs font-semibold text-gray-300">Send & wait</p>
                            </div>
                            <p className="text-[11px] text-gray-500 px-1">
                                Funds are auto-detected and forwarded to your wallet within seconds.
                            </p>
                        </div>
                    </div>

                    {/* ── Advanced: Direct Deposit (Collapsible) ── */}
                    <div className="border-t border-white/5 pt-3">
                        <button
                            onClick={() => setAdvancedOpen(!advancedOpen)}
                            className="flex items-center gap-2 w-full text-left group"
                        >
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${advancedOpen ? 'rotate-0' : '-rotate-90'}`} />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-gray-400 transition-colors">
                                Direct to Smart Wallet
                            </span>
                        </button>

                        {advancedOpen && (
                            <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                <p className="text-[10px] text-amber-300/80 flex items-center gap-1.5">
                                    <Shield className="w-3 h-3 text-amber-500 shrink-0" />
                                    Most exchanges don't support contract addresses yet. Use the relay above.
                                </p>

                                <div className="flex items-start gap-3 p-3 bg-black/30 rounded-xl border border-white/5">
                                    <div className="bg-white rounded-lg p-1.5 shrink-0">
                                        <QRCode value={walletAddress} size={64} />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Contract Address</p>
                                        <p className="text-[11px] font-mono text-gray-400 break-all">{walletAddress}</p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs border-white/10 hover:bg-white/10 text-gray-400 w-full"
                                            onClick={() => handleCopy(walletAddress, 'direct')}
                                        >
                                            {copied === 'direct' ? <><Check className="w-3 h-3 mr-1.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3 h-3 mr-1.5" /> Copy Contract Address</>}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </DialogContent>
    );
}
