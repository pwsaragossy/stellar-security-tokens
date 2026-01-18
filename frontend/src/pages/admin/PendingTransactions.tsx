import { useState, useEffect, useCallback } from 'react';
import {
    Clock,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
    RefreshCw,
    FileSignature,
    Send,
    ChevronRight,
    Usb,
    Wallet
} from 'lucide-react';
import { LedgerConnect } from '../../components/admin/LedgerConnect';
import { FreighterConnect } from '../../components/admin/FreighterConnect';
import { useLedger } from '../../hooks/useLedger';
import { useFreighter } from '../../hooks/useFreighter';
import { api } from '../../lib/api';

type SigningMethod = 'ledger' | 'freighter';

interface PendingTransaction {
    id: number;
    operationType: string;
    description: string | null;
    status: string;
    requiredSigners: string[];
    thresholdRequired: number;
    collectedSignatures: Record<string, string>;
    metadata: Record<string, any>;
    expiresAt: string;
    createdAt: string;
    initiator?: {
        id: number;
        name: string;
        email: string;
    };
    signatureStatus?: {
        collected: number;
        required: number;
        remainingSigners: string[];
        isReady: boolean;
        isExpired: boolean;
    };
}

interface Stats {
    pending: number;
    executed: number;
    failed: number;
    expired: number;
    total: number;
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    partially_signed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    ready: 'bg-green-500/20 text-green-400 border-green-500/30',
    submitted: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    executed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    expired: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const OP_TYPE_LABELS: Record<string, string> = {
    token_issue: 'Token Issuance',
    token_distribute: 'Token Distribution',
    freeze_account: 'Account Freeze',
    clawback: 'Token Clawback',
    treasury_payment: 'Treasury Payment',
    trustline_auth: 'Trustline Authorization',
    account_setup: 'Account Setup',
    other: 'Other',
};

export function PendingTransactions() {
    const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedTx, setSelectedTx] = useState<PendingTransaction | null>(null);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [signingMethod, setSigningMethod] = useState<SigningMethod>('ledger');

    const { device: ledgerDevice, signTransaction: ledgerSign, isSigning: isLedgerSigning } = useLedger();
    const { device: freighterDevice, signTransaction: freighterSign, isSigning: isFreighterSigning } = useFreighter();

    // Determine active device and signing function based on selected method
    const activeDevice = signingMethod === 'ledger' ? ledgerDevice : freighterDevice;
    const isSigning = signingMethod === 'ledger' ? isLedgerSigning : isFreighterSigning;

    const fetchTransactions = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/admin/transactions/pending');
            if (response.success) {
                setTransactions(response.data.transactions);
                setStats(response.data.stats);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch transactions');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    const handleSign = async (tx: PendingTransaction) => {
        if (!activeDevice) {
            setError(signingMethod === 'ledger'
                ? 'Please connect your Ledger device first'
                : 'Please enter your secret key first');
            return;
        }

        setActionLoading(tx.id);
        try {
            // Get XDR for signing
            const xdrResponse = await api.get(`/admin/transactions/${tx.id}/xdr`);
            if (!xdrResponse.success) {
                throw new Error('Failed to get transaction XDR');
            }

            const { xdr, networkPassphrase } = xdrResponse.data;

            // Sign with selected method
            const signFn = signingMethod === 'ledger' ? ledgerSign : freighterSign;
            const signResult = await signFn(xdr, networkPassphrase);
            if (!signResult) {
                throw new Error('Signing was cancelled or failed');
            }

            // Submit signature to backend
            const submitResponse = await api.post(`/admin/transactions/${tx.id}/sign`, {
                publicKey: signResult.publicKey,
                signature: signResult.signature,
            });

            if (submitResponse.success) {
                await fetchTransactions();
                setSelectedTx(null);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to sign transaction');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSubmit = async (txId: number) => {
        setActionLoading(txId);
        try {
            const response = await api.post(`/admin/transactions/${txId}/submit`, {});
            if (response.success) {
                await fetchTransactions();
                setSelectedTx(null);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to submit transaction');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (txId: number) => {
        if (!confirm('Are you sure you want to reject this transaction?')) return;

        setActionLoading(txId);
        try {
            const response = await api.post(`/admin/transactions/${txId}/reject`, {
                reason: 'Rejected by admin',
            });
            if (response.success) {
                await fetchTransactions();
                setSelectedTx(null);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to reject transaction');
        } finally {
            setActionLoading(null);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const getTimeRemaining = (expiresAt: string) => {
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return 'Expired';
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Pending Transactions</h1>
                    <p className="text-zinc-400 mt-1">
                        Manage transactions requiring Ledger signatures
                    </p>
                </div>
                <button
                    onClick={fetchTransactions}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                        <p className="text-sm text-zinc-400">Pending</p>
                        <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
                    </div>
                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                        <p className="text-sm text-zinc-400">Executed</p>
                        <p className="text-2xl font-bold text-emerald-400">{stats.executed}</p>
                    </div>
                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                        <p className="text-sm text-zinc-400">Failed</p>
                        <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
                    </div>
                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                        <p className="text-sm text-zinc-400">Expired</p>
                        <p className="text-2xl font-bold text-zinc-400">{stats.expired}</p>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                        <p className="text-red-300">{error}</p>
                        <button
                            onClick={() => setError(null)}
                            className="ml-auto text-red-400 hover:text-red-300"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Transaction List */}
                <div className="lg:col-span-2 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-8 text-center">
                            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-white">All Clear</h3>
                            <p className="text-zinc-400 mt-1">No pending transactions requiring signatures</p>
                        </div>
                    ) : (
                        transactions.map((tx) => (
                            <div
                                key={tx.id}
                                onClick={() => setSelectedTx(tx)}
                                className={`bg-zinc-800/50 border rounded-lg p-4 cursor-pointer transition-all hover:bg-zinc-800 ${selectedTx?.id === tx.id
                                    ? 'border-blue-500'
                                    : 'border-zinc-700/50'
                                    }`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${STATUS_COLORS[tx.status]}`}>
                                                {tx.status.replace('_', ' ').toUpperCase()}
                                            </span>
                                            <span className="text-sm text-zinc-400">
                                                #{tx.id}
                                            </span>
                                        </div>
                                        <h3 className="font-medium text-white">
                                            {OP_TYPE_LABELS[tx.operationType] || tx.operationType}
                                        </h3>
                                        {tx.description && (
                                            <p className="text-sm text-zinc-400 mt-1">{tx.description}</p>
                                        )}
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-zinc-500" />
                                </div>

                                <div className="flex items-center gap-4 mt-3 text-sm">
                                    <div className="flex items-center gap-1 text-zinc-400">
                                        <FileSignature className="w-4 h-4" />
                                        {tx.signatureStatus?.collected || 0}/{tx.thresholdRequired} signatures
                                    </div>
                                    <div className="flex items-center gap-1 text-zinc-400">
                                        <Clock className="w-4 h-4" />
                                        {getTimeRemaining(tx.expiresAt)}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    {/* Signing Method Tabs */}
                    <div className="bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-1">
                        <div className="flex">
                            <button
                                onClick={() => setSigningMethod('ledger')}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${signingMethod === 'ledger'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                <Usb className="w-4 h-4" />
                                Ledger
                            </button>
                            <button
                                onClick={() => setSigningMethod('freighter')}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${signingMethod === 'freighter'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                <Wallet className="w-4 h-4" />
                                Freighter
                            </button>
                        </div>
                    </div>

                    {/* Connection Component (based on selected method) */}
                    {signingMethod === 'ledger' ? (
                        <LedgerConnect onConnected={() => fetchTransactions()} />
                    ) : (
                        <FreighterConnect onConnected={() => fetchTransactions()} />
                    )}

                    {/* Selected Transaction Details */}
                    {selectedTx && (
                        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                            <h3 className="font-medium text-white mb-4">Transaction Details</h3>

                            <div className="space-y-3 text-sm">
                                <div>
                                    <p className="text-zinc-400">Operation</p>
                                    <p className="text-white">{OP_TYPE_LABELS[selectedTx.operationType]}</p>
                                </div>

                                <div>
                                    <p className="text-zinc-400">Status</p>
                                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${STATUS_COLORS[selectedTx.status]}`}>
                                        {selectedTx.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                </div>

                                <div>
                                    <p className="text-zinc-400">Signatures</p>
                                    <p className="text-white">
                                        {selectedTx.signatureStatus?.collected || 0} of {selectedTx.thresholdRequired} required
                                    </p>
                                </div>

                                <div>
                                    <p className="text-zinc-400">Created</p>
                                    <p className="text-white">{formatDate(selectedTx.createdAt)}</p>
                                </div>

                                <div>
                                    <p className="text-zinc-400">Expires</p>
                                    <p className="text-white">{formatDate(selectedTx.expiresAt)}</p>
                                </div>

                                {selectedTx.initiator && (
                                    <div>
                                        <p className="text-zinc-400">Initiated By</p>
                                        <p className="text-white">{selectedTx.initiator.name}</p>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="mt-4 pt-4 border-t border-zinc-700 space-y-2">
                                {selectedTx.status === 'ready' ? (
                                    <button
                                        onClick={() => handleSubmit(selectedTx.id)}
                                        disabled={actionLoading === selectedTx.id}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-600 text-white rounded-lg transition-colors"
                                    >
                                        {actionLoading === selectedTx.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                        Submit to Stellar
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleSign(selectedTx)}
                                        disabled={!activeDevice || actionLoading === selectedTx.id || isSigning}
                                        className={`w-full flex items-center justify-center gap-2 px-4 py-2 ${signingMethod === 'ledger' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'} disabled:bg-zinc-600 text-white rounded-lg transition-colors`}
                                    >
                                        {actionLoading === selectedTx.id || isSigning ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : signingMethod === 'ledger' ? (
                                            <Usb className="w-4 h-4" />
                                        ) : (
                                            <Wallet className="w-4 h-4" />
                                        )}
                                        {activeDevice
                                            ? (signingMethod === 'ledger' ? 'Sign with Ledger' : 'Sign with Freighter')
                                            : (signingMethod === 'ledger' ? 'Connect Ledger First' : 'Connect Freighter First')}
                                    </button>
                                )}

                                <button
                                    onClick={() => handleReject(selectedTx.id)}
                                    disabled={actionLoading === selectedTx.id}
                                    className="w-full px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
                                >
                                    Reject Transaction
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default PendingTransactions;
