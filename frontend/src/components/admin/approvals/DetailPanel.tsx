import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    CheckCircle,
    XCircle,
    Wallet,
    Rocket,
    DollarSign,
    Clock,
    Lock,
    Fingerprint,
    Send,
    Loader2,
    AlertTriangle,
} from 'lucide-react';
import type { ApprovalItem } from '@/hooks/useApprovalQueue';
import { TYPE_CONFIG, STATUS_BADGE, timeAgo } from './constants';
import { InvestorDetail } from './details/InvestorDetail';
import { CompanyDetail } from './details/CompanyDetail';
import { OfferDetail } from './details/OfferDetail';
import { IssuanceDetail } from './details/IssuanceDetail';
import { TokenDetail } from './details/TokenDetail';
import { MultisigDetail } from './details/MultisigDetail';

interface DetailPanelProps {
    item: ApprovalItem;
    actionLoading: boolean;
    isSigning: boolean;
    freighterConnected: boolean;
    freighterPublicKey: string;
    systemWallets: Array<{ name: string; publicKey: string }>;
    onConnectFreighter: () => Promise<any>;
    onApproveInvestor: () => void;
    onRejectInvestor: () => void;
    onSponsorInvestor: () => void;
    onApproveCompany: () => void;
    onRejectCompany: () => void;
    onSponsorCompany: () => void;
    onApproveOffer: (investorRate?: number) => void;
    onRejectOffer: () => void;
    onIssueToken: () => void;
    onVerifyIssuance: () => void;
    onUnlockToken: () => void;
    onSignMultisig: () => void;
    onSubmitMultisig: () => void;
    onRejectMultisig: () => void;
}

export function DetailPanel({
    item,
    actionLoading,
    isSigning,
    freighterConnected,
    freighterPublicKey,
    systemWallets,
    onApproveInvestor,
    onRejectInvestor,
    onSponsorInvestor,
    onApproveCompany,
    onRejectCompany,
    onSponsorCompany,
    onApproveOffer,
    onRejectOffer,
    onIssueToken,
    onVerifyIssuance,
    onUnlockToken,
    onConnectFreighter,
    onSignMultisig,
    onSubmitMultisig,
    onRejectMultisig,
}: DetailPanelProps) {
    const cfg = TYPE_CONFIG[item.type];
    const Icon = cfg.icon;

    // Platform fee state for offer review (default 2%)
    const annualRate = parseFloat(item.raw?.annual_interest_rate || item.raw?.annualInterestRate || 0);
    const [platformFee, setPlatformFee] = useState(2);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-white/[0.04] ${cfg.color}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <h2 className="text-lg font-semibold text-white">{item.label}</h2>
                    <p className="text-sm text-zinc-500">
                        {cfg.label} · {item.status.replace(/_/g, ' ')} · {timeAgo(item.createdAt)}
                    </p>
                </div>
                <Badge variant="outline" className={STATUS_BADGE[item.normalizedStatus]}>
                    {item.normalizedStatus === 'in_progress' ? 'in progress' : item.normalizedStatus}
                </Badge>
            </div>

            {/* Body — type-specific */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {item.type === 'investor' && <InvestorDetail raw={item.raw} />}
                {item.type === 'company' && <CompanyDetail raw={item.raw} />}
                {item.type === 'offer' && (
                    <OfferDetail
                        raw={item.raw}
                        platformFee={platformFee}
                        onPlatformFeeChange={setPlatformFee}
                    />
                )}
                {item.type === 'issuance' && <IssuanceDetail raw={item.raw} />}
                {item.type === 'token' && <TokenDetail raw={item.raw} />}
                {item.type === 'multisig' && <MultisigDetail raw={item.raw} />}
            </div>

            {/* Actions footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] space-y-2">
                {item.type === 'investor' && (
                    <div className="flex gap-2">
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                            disabled={actionLoading}
                            onClick={onApproveInvestor}
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                        </Button>
                        <Button
                            variant="destructive"
                            className="flex-1"
                            disabled={actionLoading}
                            onClick={onRejectInvestor}
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </Button>
                        <Button variant="outline" disabled={actionLoading} onClick={onSponsorInvestor}>
                            <Wallet className="w-4 h-4 mr-2" />
                            Sponsor
                        </Button>
                    </div>
                )}

                {item.type === 'company' && (
                    <div className="flex gap-2">
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                            disabled={actionLoading}
                            onClick={onApproveCompany}
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve
                        </Button>
                        <Button
                            variant="destructive"
                            className="flex-1"
                            disabled={actionLoading}
                            onClick={onRejectCompany}
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </Button>
                        {item.raw.stellarContractId && (
                            <Button variant="outline" disabled={actionLoading} onClick={onSponsorCompany}>
                                <Wallet className="w-4 h-4 mr-2" />
                                Sponsor
                            </Button>
                        )}
                    </div>
                )}

                {item.type === 'offer' && (
                    <div className="flex gap-2">
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                            disabled={actionLoading}
                            onClick={() => {
                                const investorRate = Math.max(0, annualRate - platformFee);
                                onApproveOffer(investorRate);
                            }}
                        >
                            <Rocket className="w-4 h-4 mr-2" />
                            Approve & Issue
                        </Button>
                        <Button
                            variant="destructive"
                            className="flex-1"
                            disabled={actionLoading}
                            onClick={onRejectOffer}
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                        </Button>
                    </div>
                )}

                {item.type === 'issuance' && (
                    <div className="space-y-2">
                        {item.raw.issuanceStep === 'issue' && (
                            <>
                                {/* Required signer key hint */}
                                {(() => {
                                    const issuer = systemWallets.find(w => w.name === 'Issuer');
                                    const distributor = systemWallets.find(w => w.name === 'Distributor');
                                    const requiredKeys = [issuer, distributor].filter(Boolean) as typeof systemWallets;
                                    const isKeyMatch = requiredKeys.some(w => w.publicKey === freighterPublicKey);
                                    const matchedWallet = requiredKeys.find(w => w.publicKey === freighterPublicKey);

                                    return requiredKeys.length > 0 ? (
                                        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${!freighterPublicKey
                                            ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                                            : isKeyMatch
                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                                            }`}>
                                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                            <div>
                                                {!freighterPublicKey ? (
                                                    <p>Connect Freighter with one of the required keys:</p>
                                                ) : isKeyMatch ? (
                                                    <p>Connected as <strong>{matchedWallet?.name}</strong> ✓</p>
                                                ) : (
                                                    <p>Wrong key connected. Switch Freighter to:</p>
                                                )}
                                                {(!freighterPublicKey || !isKeyMatch) && (
                                                    <div className="mt-1 space-y-0.5">
                                                        {requiredKeys.map(w => (
                                                            <p key={w.publicKey} className="font-mono">
                                                                {w.name}: {w.publicKey.slice(0, 4)}…{w.publicKey.slice(-4)}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : null;
                                })()}
                                <Button
                                    className="w-full bg-blue-600 hover:bg-blue-500"
                                    disabled={actionLoading}
                                    onClick={onIssueToken}
                                >
                                    <DollarSign className="w-4 h-4 mr-2" />
                                    Issue Token on Stellar
                                </Button>
                            </>
                        )}
                        {item.raw.issuanceStep === 'issuing' && (
                            <Button
                                className="w-full bg-blue-600/50 cursor-not-allowed"
                                disabled
                            >
                                <Clock className="w-4 h-4 mr-2 animate-pulse" />
                                Issuing... (pending MultiSig)
                            </Button>
                        )}
                        {item.raw.issuanceStep === 'verify' && (
                            <Button
                                className="w-full bg-emerald-600 hover:bg-emerald-500"
                                disabled={actionLoading}
                                onClick={onVerifyIssuance}
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Verify & Enable Launch
                            </Button>
                        )}
                    </div>
                )}

                {item.type === 'token' && (
                    <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-500"
                        disabled={actionLoading}
                        onClick={onUnlockToken}
                    >
                        <Lock className="w-4 h-4 mr-2" />
                        Unlock Token for Trading
                    </Button>
                )}

                {item.type === 'multisig' && (() => {
                    const collected = item.raw.collectedSignatures || {};
                    const allSigners: string[] = item.raw.requiredSigners || [];
                    const remaining = allSigners.filter((s: string) => !collected[s]);
                    const roles: Record<string, string> = item.raw.metadata?.signerRoles || {};
                    const keyMatches = freighterConnected && remaining.includes(freighterPublicKey);
                    const alreadySigned = freighterConnected && allSigners.includes(freighterPublicKey) && !remaining.includes(freighterPublicKey);
                    const signedCount = Object.keys(collected).length;
                    const totalRequired = item.raw.thresholdRequired || allSigners.length;

                    return (
                        <div className="space-y-3">
                            {/* ── Signing Progress ── */}
                            <div className="px-3 py-2.5 bg-zinc-900/50 rounded-lg border border-zinc-700/30">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Signing Progress</span>
                                    <span className="text-xs text-zinc-400 font-mono">{signedCount}/{totalRequired}</span>
                                </div>
                                {/* Progress bar */}
                                <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-3 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500 ease-out"
                                        style={{
                                            width: `${(signedCount / totalRequired) * 100}%`,
                                            background: signedCount >= totalRequired
                                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                                : 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                                        }}
                                    />
                                </div>
                                {/* Per-signer status rows */}
                                <div className="space-y-1.5">
                                    {allSigners.map((signer: string) => {
                                        const isSigned = !!collected[signer];
                                        const isYourTurn = freighterPublicKey === signer && !isSigned;
                                        const roleName = roles[signer] || 'Signer';
                                        const shortKey = `${signer.slice(0, 4)}…${signer.slice(-4)}`;

                                        return (
                                            <div
                                                key={signer}
                                                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${isYourTurn
                                                    ? 'bg-purple-500/15 border border-purple-500/30'
                                                    : isSigned
                                                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                                                        : 'bg-zinc-800/50 border border-zinc-700/20'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {isSigned ? (
                                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                                    ) : isYourTurn ? (
                                                        <Fingerprint className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                                                    ) : (
                                                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                                                    )}
                                                    <span className={isSigned ? 'text-emerald-300' : isYourTurn ? 'text-purple-300 font-medium' : 'text-zinc-400'}>
                                                        {roleName}
                                                    </span>
                                                    <span className="text-zinc-600 font-mono">{shortKey}</span>
                                                </div>
                                                <span className={`text-[10px] font-medium uppercase tracking-wider ${isSigned ? 'text-emerald-500' : isYourTurn ? 'text-purple-400' : 'text-zinc-600'
                                                    }`}>
                                                    {isSigned ? 'Signed' : isYourTurn ? 'Your turn' : 'Pending'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Freighter Status ── */}
                            <div className="flex items-center justify-between text-xs px-3 py-2 bg-zinc-900/50 rounded-lg border border-zinc-700/30">
                                <span className="text-zinc-500">Freighter</span>
                                {freighterConnected ? (
                                    <span className={`flex items-center gap-1.5 ${keyMatches ? 'text-emerald-400' : alreadySigned ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${keyMatches ? 'bg-emerald-400' : alreadySigned ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                                        {freighterPublicKey ? `${freighterPublicKey.slice(0, 4)}…${freighterPublicKey.slice(-4)}` : 'Connected'}
                                    </span>
                                ) : (
                                    <button onClick={onConnectFreighter} className="text-yellow-400 hover:text-yellow-300 underline cursor-pointer">
                                        Not connected — click to connect
                                    </button>
                                )}
                            </div>

                            {/* Key mismatch hint */}
                            {freighterConnected && !keyMatches && !alreadySigned && remaining.length > 0 && (
                                <div className="text-xs px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300">
                                    ⚠️ Switch Freighter to:{' '}
                                    <span className="font-mono font-semibold">
                                        {remaining.map((k: string) => `${roles[k] || 'Signer'} (${k.slice(0, 4)}…${k.slice(-4)})`).join(', ')}
                                    </span>
                                </div>
                            )}
                            {alreadySigned && remaining.length > 0 && (
                                <div className="text-xs px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300">
                                    ✓ Signed with this key. Switch to{' '}
                                    <span className="font-semibold">
                                        {remaining.map((k: string) => roles[k] || k.slice(0, 4) + '…' + k.slice(-4)).join(', ')}
                                    </span>{' '}
                                    to continue.
                                </div>
                            )}

                            {/* ── Action Buttons ── */}
                            {item.raw.status === 'ready' ? (
                                <Button
                                    className="w-full bg-emerald-600 hover:bg-emerald-500"
                                    disabled={actionLoading}
                                    onClick={onSubmitMultisig}
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    Submit to Stellar
                                </Button>
                            ) : (
                                <Button
                                    className={`w-full ${!freighterConnected ? 'bg-purple-600 hover:bg-purple-500' : keyMatches ? 'bg-purple-600 hover:bg-purple-500' : 'bg-zinc-700 cursor-not-allowed opacity-60'}`}
                                    disabled={freighterConnected ? (!keyMatches || actionLoading || isSigning) : false}
                                    onClick={!freighterConnected ? onConnectFreighter : onSignMultisig}
                                >
                                    {isSigning ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Fingerprint className="w-4 h-4 mr-2" />
                                    )}
                                    {!freighterConnected
                                        ? 'Connect Freighter First'
                                        : keyMatches
                                            ? `Sign as ${roles[freighterPublicKey] || 'Signer'}`
                                            : alreadySigned && remaining.length > 0
                                                ? `Switch to ${roles[remaining[0]] || 'Signer'}`
                                                : remaining.length === 0
                                                    ? 'All Signed'
                                                    : `Switch key to sign as ${roles[remaining[0]] || 'Signer'}`
                                    }
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                className="w-full text-red-400 border-red-500/30 hover:bg-red-500/10"
                                disabled={actionLoading}
                                onClick={onRejectMultisig}
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Reject Transaction
                            </Button>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
