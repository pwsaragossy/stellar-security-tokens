import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, CheckCircle, Circle } from 'lucide-react';
import { DetailRow, DetailSection } from '../shared';
import { timeRemaining } from '../constants';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export function MultisigDetail({ raw }: { raw: any }) {
    const [reconciling, setReconciling] = useState(false);

    const OP_LABELS: Record<string, string> = {
        token_issue: 'Token Issuance',
        token_distribute: 'Token Distribution',
        freeze_account: 'Account Freeze',
        clawback: 'Token Clawback',
        treasury_payment: 'Treasury Withdrawal',
        dividend_distribution: 'Dividend Distribution',
        opex_withdrawal: 'OpEx Withdrawal',
        trustline_auth: 'Trustline Authorization',
        account_setup: 'Account Setup',
        sac_deploy: 'SAC Deployment',
        unlock_token: 'Unlock Token',
        maturity_clawback: '🔥 Bullet Maturity',
    };

    const handleReconcile = async () => {
        setReconciling(true);
        try {
            const offerId = raw.metadata?.offerId;
            if (!offerId) { toast.error('No offer ID found'); return; }
            const res = await api.post(`/admin/offers/${offerId}/reconcile-chain`, {});
            if (res.success) {
                toast.success(res.message || 'On-chain data reconciled');
            } else {
                toast.error(res.error || 'Reconciliation failed');
            }
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Reconciliation failed');
        } finally {
            setReconciling(false);
        }
    };

    return (
        <>
            <DetailSection title="Transaction Info">
                <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Operation" value={
                        raw.operationType === 'treasury_payment' && raw.metadata?.subtype === 'deposit_relay'
                            ? '💱 Deposit Relay'
                            : (OP_LABELS[raw.operationType] || raw.operationType)
                    } />
                    <DetailRow label="Status" value={raw.status?.replace(/_/g, ' ')} />
                    <DetailRow label="Created" value={new Date(raw.createdAt).toLocaleString()} />
                    <DetailRow
                        label="Expires"
                        value={
                            <span className={new Date(raw.expiresAt) < new Date() ? 'text-red-400' : 'text-white'}>
                                {timeRemaining(raw.expiresAt)}
                            </span>
                        }
                    />
                </div>
            </DetailSection>


            {raw.initiator && (
                <DetailSection title="Initiated By">
                    <div className="grid grid-cols-2 gap-4">
                        <DetailRow label="Name" value={raw.initiator.name} />
                        <DetailRow label="Email" value={raw.initiator.email} />
                    </div>
                </DetailSection>
            )}

            {raw.metadata && (() => {
                const displayKeys = Object.keys(raw.metadata).filter(k => k !== 'signerRoles');
                if (displayKeys.length === 0) return null;
                return (
                    <DetailSection title="Operation Context">
                        {raw.operationType === 'token_issue' && (
                            <div className="grid grid-cols-2 gap-4">
                                <DetailRow label="Asset" value={raw.metadata.assetCode} />
                                <DetailRow label="Supply" value={raw.metadata.totalSupply} />
                                {raw.metadata.offerId && <DetailRow label="Offer ID" value={raw.metadata.offerId} />}
                            </div>
                        )}
                        {raw.operationType === 'token_distribute' && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <DetailRow label="Investor" value={raw.metadata.investorName || '—'} />
                                    <DetailRow label="Email" value={raw.metadata.investorEmail || '—'} />
                                    <DetailRow label="Tokens" value={
                                        <span className="text-emerald-400 font-semibold">
                                            {raw.metadata.amount} {raw.metadata.assetCode}
                                        </span>
                                    } />
                                    <DetailRow label="USDC Paid" value={
                                        raw.metadata.usdcAmount
                                            ? <span className="text-blue-400 font-semibold">{raw.metadata.usdcAmount} USDC</span>
                                            : '—'
                                    } />
                                    {raw.metadata.offerName && (
                                        <DetailRow label="Offer" value={raw.metadata.offerName} />
                                    )}
                                    {raw.metadata.investmentId && (
                                        <DetailRow label="Investment ID" value={`#${raw.metadata.investmentId}`} />
                                    )}
                                </div>
                                <DetailRow
                                    label="Wallet"
                                    value={
                                        raw.metadata.investorPublicKey ? (
                                            <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded break-all">
                                                {raw.metadata.investorPublicKey}
                                            </code>
                                        ) : '—'
                                    }
                                />
                                {raw.metadata.usdcPaymentHash && (
                                    <DetailRow
                                        label="USDC TX"
                                        value={
                                            <a
                                                href={`https://stellar.expert/explorer/testnet/tx/${raw.metadata.usdcPaymentHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-400 hover:text-blue-300 underline font-mono break-all"
                                            >
                                                {raw.metadata.usdcPaymentHash}
                                            </a>
                                        }
                                    />
                                )}
                            </>
                        )}
                        {raw.operationType === 'sac_deploy' && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                    <DetailRow label="Asset" value={raw.metadata.assetCode} />
                                    {raw.metadata.sacContractId && (
                                        <DetailRow
                                            label="Contract ID"
                                            value={
                                                <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded break-all">
                                                    {raw.metadata.sacContractId}
                                                </code>
                                            }
                                        />
                                    )}
                                </div>
                                {raw.metadata.chainAction === 'token_distribute' && (
                                    <>
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg space-y-1">
                                            <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                                                ⛓️ Chained Distribution — will auto-queue after signing
                                            </p>
                                            <p className="text-[11px] text-amber-200/70">
                                                This SAC contract must be deployed before the tokens can be distributed via Soroban.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {raw.metadata.investorName && (
                                                <DetailRow label="Investor" value={raw.metadata.investorName} />
                                            )}
                                            {raw.metadata.investorEmail && (
                                                <DetailRow label="Email" value={raw.metadata.investorEmail} />
                                            )}
                                            <DetailRow label="Tokens" value={
                                                <span className="text-emerald-400 font-semibold">
                                                    {raw.metadata.amount} {raw.metadata.assetCode}
                                                </span>
                                            } />
                                            {raw.metadata.usdcAmount && (
                                                <DetailRow label="USDC Paid" value={
                                                    <span className="text-blue-400 font-semibold">{raw.metadata.usdcAmount} USDC</span>
                                                } />
                                            )}
                                            {raw.metadata.offerName && (
                                                <DetailRow label="Offer" value={raw.metadata.offerName} />
                                            )}
                                            {raw.metadata.investmentId && (
                                                <DetailRow label="Investment" value={`#${raw.metadata.investmentId}`} />
                                            )}
                                        </div>
                                        <DetailRow
                                            label="Destination Wallet"
                                            value={
                                                raw.metadata.investorPublicKey ? (
                                                    <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded break-all">
                                                        {raw.metadata.investorPublicKey}
                                                    </code>
                                                ) : '—'
                                            }
                                        />
                                        {raw.metadata.usdcPaymentHash && (
                                            <DetailRow
                                                label="USDC TX"
                                                value={
                                                    <a
                                                        href={`https://stellar.expert/explorer/testnet/tx/${raw.metadata.usdcPaymentHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-400 hover:text-blue-300 underline font-mono break-all"
                                                    >
                                                        {raw.metadata.usdcPaymentHash}
                                                    </a>
                                                }
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                        {raw.operationType === 'treasury_payment' && (
                            raw.metadata?.subtype === 'deposit_relay' ? (
                                <>
                                    <div className="p-3 bg-blue-500/10 border border-blue-500/25 rounded-lg space-y-1 mb-3">
                                        <p className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                                            💱 Investor Deposit Relay
                                        </p>
                                        <p className="text-[11px] text-blue-200/70">
                                            Forwarding deposited funds from Treasury to the investor's smart wallet.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <DetailRow label="Investor" value={raw.metadata.investorName || '—'} />
                                        <DetailRow label="Email" value={raw.metadata.investorEmail || '—'} />
                                        <DetailRow label="Amount" value={
                                            <span className="text-blue-400 font-semibold">
                                                {raw.metadata.amount} {raw.metadata.assetCode}
                                            </span>
                                        } />
                                        {raw.metadata.depositMemo && (
                                            <DetailRow label="Deposit Memo" value={
                                                <code className="text-xs text-zinc-300 bg-black/30 px-2 py-0.5 rounded">
                                                    {raw.metadata.depositMemo}
                                                </code>
                                            } />
                                        )}
                                        {raw.metadata.depositId && (
                                            <DetailRow label="Deposit ID" value={`#${raw.metadata.depositId}`} />
                                        )}
                                    </div>
                                    <DetailRow
                                        label="Destination"
                                        value={
                                            raw.metadata.destination ? (
                                                <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded break-all">
                                                    {raw.metadata.destination}
                                                </code>
                                            ) : '—'
                                        }
                                    />
                                </>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <DetailRow label="Destination" value={
                                        raw.metadata.destination ? (
                                            <code className="text-xs text-zinc-300 bg-black/30 px-2 py-1 rounded break-all">
                                                {raw.metadata.destination}
                                            </code>
                                        ) : '—'
                                    } />
                                    <DetailRow
                                        label="Amount"
                                        value={`${raw.metadata.amount} ${raw.metadata.assetCode || ''}`}
                                    />
                                </div>
                            )
                        )}
                        {raw.operationType === 'dividend_distribution' && (
                            <div className="grid grid-cols-2 gap-4">
                                <DetailRow label="Batch Size" value={`${raw.metadata.operationCount} payments`} />
                                <DetailRow label="Asset" value={raw.metadata.assetCode} />
                            </div>
                        )}
                        {raw.operationType === 'maturity_clawback' && (
                            <>
                                <div className="p-3 bg-orange-500/10 border border-orange-500/25 rounded-lg space-y-1 mb-3">
                                    <p className="text-xs font-semibold text-orange-300 flex items-center gap-1.5">
                                        🔥 Bullet Maturity — Pay + Clawback
                                    </p>
                                    <p className="text-[11px] text-orange-200/70">
                                        This transaction pays investors their principal + interest and claws back their security tokens atomically.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <DetailRow label="Asset" value={raw.metadata.assetCode || '—'} />
                                    <DetailRow label="Offer" value={raw.metadata.offerName || `#${raw.metadata.offerId}`} />
                                    {raw.metadata.breakdown && (
                                        <DetailRow label="Investors" value={`${raw.metadata.breakdown.length} in this batch`} />
                                    )}
                                    {raw.metadata.batch && (
                                        <DetailRow label="Batch" value={`#${raw.metadata.batch}`} />
                                    )}
                                </div>
                                {/* Batch Group info */}
                                {raw.isMaturityGroup && raw.batchTransactions && (
                                    <div className="mt-3 space-y-2">
                                        <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
                                            Batch Breakdown ({raw.batchCount} batches · {raw.totalInvestors} investors)
                                        </p>
                                        {raw.batchTransactions.map((tx: any, i: number) => {
                                            const collected = Object.keys(tx.collectedSignatures || {}).length;
                                            const total = tx.thresholdRequired || 2;
                                            const isDone = collected >= total;
                                            return (
                                                <div
                                                    key={tx.id}
                                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${
                                                        isDone
                                                            ? 'bg-emerald-500/10 border-emerald-500/20'
                                                            : 'bg-zinc-800/50 border-zinc-700/20'
                                                    }`}
                                                >
                                                    {isDone ? (
                                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                    ) : (
                                                        <Circle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                                    )}
                                                    <span className={isDone ? 'text-emerald-300' : 'text-zinc-400'}>
                                                        Batch {i + 1}
                                                    </span>
                                                    <span className="text-zinc-600">
                                                        {tx.metadata?.breakdown?.length || '?'} investors
                                                    </span>
                                                    <span className="ml-auto text-zinc-600 font-mono">
                                                        {collected}/{total} sigs
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                        {!['treasury_payment', 'dividend_distribution', 'token_issue', 'token_distribute', 'sac_deploy', 'maturity_clawback'].includes(raw.operationType) && displayKeys.length > 0 && (
                            <pre className="text-xs text-blue-300 bg-black/30 p-2 rounded overflow-x-auto">
                                {JSON.stringify(
                                    Object.fromEntries(displayKeys.map(k => [k, raw.metadata[k]])),
                                    null, 2
                                )}
                            </pre>
                        )}
                    </DetailSection>
                );
            })()}

            {/* On-chain reconciliation button (maturity operations) */}
            {(raw.operationType === 'maturity_clawback' || raw.isMaturityGroup) && raw.metadata?.offerId && (
                <DetailSection title="On-Chain Reconciliation">
                    <p className="text-xs text-zinc-500 mb-3">
                        Sync the database with on-chain state. Use this after admin signing to verify all payments and clawbacks were applied correctly.
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReconcile}
                        disabled={reconciling}
                        className="w-full text-zinc-300 border-zinc-600 hover:bg-zinc-800"
                    >
                        {reconciling ? (
                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                        ) : (
                            <RefreshCw className="w-3.5 h-3.5 mr-2" />
                        )}
                        {reconciling ? 'Reconciling...' : 'Reconcile On-Chain Data'}
                    </Button>
                </DetailSection>
            )}
        </>
    );
}
