
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, User, Key, Mail, Shield, Check, Pencil, Save, X, ArrowUpRight, Copy, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { passkeyClient } from '@/lib/passkey';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";

interface WalletStatus {
    hasWallet: boolean;
    walletAddress?: string;
    passkeyRegistered: boolean;
    balances?: {
        xlm: string;
        usdc: string;
    };
    explorer?: string;
}

export function Settings() {
    const [user, setUser] = useState<any>(null);
    const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [resending, setResending] = useState(false);
    const [resendMessage, setResendMessage] = useState<string | null>(null);

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', document: '' });
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        async function fetchSettings() {
            try {
                const userStr = localStorage.getItem('user');
                let storedUser = JSON.parse(userStr || '{}');

                // Fetch fresh user data from API to get current emailVerified status
                if (storedUser.id) {
                    try {
                        const userResponse = await api.get(`/investors/${storedUser.id}`);
                        const freshUser = userResponse.data || userResponse;
                        // Merge fresh data with stored data
                        storedUser = { ...storedUser, ...freshUser };
                        // Update localStorage with fresh data
                        localStorage.setItem('user', JSON.stringify(storedUser));
                    } catch (err) {
                        console.log('Could not fetch fresh user data, using cached');
                    }
                }

                setUser(storedUser);
                setEditForm({ name: storedUser.name || '', document: storedUser.document || '' });

                if (storedUser.id) {
                    try {
                        const response = await api.get(`/investors/${storedUser.id}/wallet-status`);
                        const data = response.data || response;
                        setWalletStatus({
                            hasWallet: data.hasWallet || !!data.contractId,
                            walletAddress: data.contractId || data.walletAddress,
                            passkeyRegistered: data.passkeyRegistered !== false,
                        });
                    } catch {
                        setWalletStatus({
                            hasWallet: false,
                            passkeyRegistered: true,
                        });
                    }
                }
            } catch (err) {
                console.error('Failed to fetch settings:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchSettings();
    }, []);

    const handleResendVerification = async () => {
        if (!user?.email) return;

        setResending(true);
        setResendMessage(null);

        try {
            await api.post('/investors/resend-verification', { email: user.email });
            setResendMessage('Verification email sent! Check your inbox.');
        } catch (err: any) {
            setResendMessage(err.message || 'Failed to send verification email');
        } finally {
            setResending(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!user?.id) return;

        setSaving(true);
        setSaveMessage(null);

        try {
            const response = await api.put(`/investors/${user.id}`, {
                name: editForm.name,
                document: editForm.document,
            });

            const updatedUser = response.data || response;
            const newUser = { ...user, ...updatedUser };
            setUser(newUser);
            localStorage.setItem('user', JSON.stringify(newUser));

            setSaveMessage({ type: 'success', text: 'Profile updated successfully!' });
            setIsEditing(false);
        } catch (err: any) {
            setSaveMessage({ type: 'error', text: err.message || 'Failed to update profile' });
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setEditForm({ name: user?.name || '', document: user?.document || '' });
        setIsEditing(false);
        setSaveMessage(null);
    };

    // Withdrawal State
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [withdrawStep, setWithdrawStep] = useState<'form' | 'review' | 'processing' | 'success'>('form');
    const [withdrawData, setWithdrawData] = useState({ amount: '', destination: '', asset: 'USDC' });
    const [withdrawTx, setWithdrawTx] = useState<{ xdr: string; networkPassphrase: string } | null>(null);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);

    const handleProposeWithdrawal = async () => {
        if (!user?.id || !withdrawData.amount || !withdrawData.destination) return;

        setWithdrawStep('processing');
        setWithdrawError(null);

        try {
            const response = await api.post(`/investors/${user.id}/withdraw/propose`, {
                amount: withdrawData.amount,
                destination: withdrawData.destination,
                assetCode: withdrawData.asset
            });

            const { data } = response;
            setWithdrawTx(data);
            setWithdrawStep('review');
        } catch (err: any) {
            setWithdrawError(err.message || 'Failed to propose withdrawal');
            setWithdrawStep('form');
        }
    };

    const handleSubmitWithdrawal = async () => {
        if (!withdrawTx) return;

        setWithdrawStep('processing');
        setWithdrawError(null);

        try {
            // 1. Sign with Passkey
            // Note: passkeyClient.signTransaction expects XDR string and returns signed XDR string
            const signedXdr = await passkeyClient.signTransaction(withdrawTx.xdr);

            // 2. Submit to backend
            await api.post('/investors/withdraw/submit', { signedXdr });

            setWithdrawStep('success');
            // Refresh wallet status
            const statusResponse = await api.get(`/investors/${user.id}/wallet-status`);
            const statusData = statusResponse.data || statusResponse;
            setWalletStatus({
                hasWallet: statusData.hasWallet || !!statusData.contractId,
                walletAddress: statusData.contractId || statusData.walletAddress,
                passkeyRegistered: statusData.passkeyRegistered !== false,
                balances: statusData.balances,
                explorer: statusData.explorer,
            });
        } catch (err: any) {
            console.error('Withdrawal failed:', err);
            setWithdrawError(err.message || 'Failed to process withdrawal');
            // If checking fails, we might stay on review or go back to form
            // But usually signing failure means we stay directly on processing/review or error state
            // Let's go back to review to retry
            setWithdrawStep('review');
        }
    };

    const resetWithdrawal = () => {
        setWithdrawOpen(false);
        setWithdrawStep('form');
        setWithdrawData({ amount: '', destination: '', asset: 'USDC' });
        setWithdrawTx(null);
        setWithdrawError(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {/* Account Information */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <User className="w-5 h-5" />
                                Account Information
                            </CardTitle>
                            <CardDescription>Your personal details</CardDescription>
                        </div>
                        {!isEditing ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsEditing(true)}
                                className="border-white/10"
                            >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                            </Button>
                        ) : (
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancelEdit}
                                    className="border-white/10"
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleSaveProfile}
                                    disabled={saving}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save
                                </Button>
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {saveMessage && (
                        <div className={`p-3 rounded-lg text-sm ${saveMessage.type === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                            {saveMessage.text}
                        </div>
                    )}

                    {isEditing ? (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="bg-white/5 border-white/10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    value={user?.email || ''}
                                    disabled
                                    className="bg-white/5 border-white/10 opacity-50"
                                />
                                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="document">Document</Label>
                                <Input
                                    id="document"
                                    value={editForm.document}
                                    onChange={(e) => setEditForm({ ...editForm, document: e.target.value })}
                                    className="bg-white/5 border-white/10"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>KYC Status</Label>
                                <div className="pt-2">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${user?.kycStatus === 'approved'
                                        ? 'bg-emerald-400/10 text-emerald-400'
                                        : 'bg-yellow-400/10 text-yellow-400'
                                        }`}>
                                        {user?.kycStatus === 'approved' && <Check className="w-3 h-3" />}
                                        {user?.kycStatus || 'pending'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Name</p>
                                <p className="font-medium text-white">{user?.name || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Email</p>
                                <p className="font-medium text-white">{user?.email || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Document</p>
                                <p className="font-medium text-white">{user?.document || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">KYC Status</p>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${user?.kycStatus === 'approved'
                                    ? 'bg-emerald-400/10 text-emerald-400'
                                    : 'bg-yellow-400/10 text-yellow-400'
                                    }`}>
                                    {user?.kycStatus === 'approved' && <Check className="w-3 h-3" />}
                                    {user?.kycStatus || 'pending'}
                                </span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Email Verification */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5" />
                        Email Verification
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Status</p>
                            <span className={`inline-flex items-center gap-1 text-sm ${user?.emailVerified ? 'text-emerald-400' : 'text-yellow-400'
                                }`}>
                                {user?.emailVerified ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Verified
                                    </>
                                ) : 'Pending verification'}
                            </span>
                        </div>
                        {!user?.emailVerified && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleResendVerification}
                                disabled={resending}
                                className="border-white/10"
                            >
                                {resending ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : null}
                                Resend Email
                            </Button>
                        )}
                    </div>
                    {resendMessage && (
                        <p className={`text-sm ${resendMessage.includes('sent') ? 'text-emerald-400' : 'text-red-400'}`}>
                            {resendMessage}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Connected Wallet & Security */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Key className="w-5 h-5" />
                        Connected Wallet & Security
                    </CardTitle>
                    <CardDescription>Your blockchain wallet and authentication</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Security Method */}
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium text-white">Passkey Authentication</p>
                            <p className="text-sm text-muted-foreground">
                                {walletStatus?.passkeyRegistered ? 'Active and secured by device biometric' : 'Not registered'}
                            </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs ${walletStatus?.passkeyRegistered
                            ? 'bg-emerald-400/10 text-emerald-400'
                            : 'bg-red-400/10 text-red-400'
                            }`}>
                            {walletStatus?.passkeyRegistered ? 'Active' : 'Inactive'}
                        </span>
                    </div>

                    {/* Wallet Details */}
                    {walletStatus?.walletAddress && (
                        <div className="space-y-4 pt-4 border-t border-white/10">
                            <div className="flex items-end justify-between">
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                            <p className="text-xs text-muted-foreground mb-1">USDC Balance</p>
                                            <p className="text-lg font-semibold text-white">
                                                ${Number(walletStatus.balances?.usdc || 0).toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                            <p className="text-xs text-muted-foreground mb-1">XLM Balance</p>
                                            <p className="text-lg font-semibold text-white">
                                                {Number(walletStatus.balances?.xlm || 0).toFixed(4)} XLM
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-14 px-4 border-white/10 flex flex-col items-center justify-center gap-1"
                                        onClick={() => window.open(walletStatus.explorer, '_blank')}
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        <span className="text-xs">Explorer</span>
                                    </Button>
                                    <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                                        <DialogTrigger asChild>
                                            <Button
                                                size="sm"
                                                className="h-14 px-6 bg-blue-600 hover:bg-blue-700 flex flex-col items-center justify-center gap-1"
                                                onClick={() => setWithdrawStep('form')}
                                            >
                                                <ArrowUpRight className="w-4 h-4" />
                                                <span className="text-xs">Withdraw</span>
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-md bg-slate-900 border-white/10 text-white">
                                            <DialogHeader>
                                                <DialogTitle>Withdraw Funds</DialogTitle>
                                                <DialogDescription>
                                                    Send assets from your wallet to another Stellar address.
                                                </DialogDescription>
                                            </DialogHeader>

                                            {withdrawStep === 'form' && (
                                                <div className="space-y-4 py-4">
                                                    <div className="space-y-2">
                                                        <Label>Asset</Label>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant={withdrawData.asset === 'USDC' ? 'default' : 'outline'}
                                                                onClick={() => setWithdrawData({ ...withdrawData, asset: 'USDC' })}
                                                                className={withdrawData.asset === 'USDC' ? 'bg-blue-600' : 'border-white/10'}
                                                            >
                                                                USDC
                                                            </Button>
                                                            <Button
                                                                variant={withdrawData.asset === 'XLM' ? 'default' : 'outline'}
                                                                onClick={() => setWithdrawData({ ...withdrawData, asset: 'XLM' })}
                                                                className={withdrawData.asset === 'XLM' ? 'bg-blue-600' : 'border-white/10'}
                                                            >
                                                                XLM
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="amount">Amount</Label>
                                                        <Input
                                                            id="amount"
                                                            type="number"
                                                            placeholder="0.00"
                                                            value={withdrawData.amount}
                                                            onChange={(e) => setWithdrawData({ ...withdrawData, amount: e.target.value })}
                                                            className="bg-white/5 border-white/10"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="destination">Destination Address</Label>
                                                        <Input
                                                            id="destination"
                                                            placeholder="G..."
                                                            value={withdrawData.destination}
                                                            onChange={(e) => setWithdrawData({ ...withdrawData, destination: e.target.value })}
                                                            className="bg-white/5 border-white/10"
                                                        />
                                                        <p className="text-xs text-gray-400">Ensure the address accepts {withdrawData.asset}.</p>
                                                    </div>
                                                    {withdrawError && (
                                                        <p className="text-sm text-red-400">{withdrawError}</p>
                                                    )}
                                                </div>
                                            )}

                                            {withdrawStep === 'review' && (
                                                <div className="space-y-4 py-4">
                                                    <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-2">
                                                        <div className="flex justify-between">
                                                            <span className="text-sm text-gray-400">Asset</span>
                                                            <span className="font-medium">{withdrawData.asset}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-sm text-gray-400">Amount</span>
                                                            <span className="font-medium text-lg">{withdrawData.amount}</span>
                                                        </div>
                                                        <div className="pt-2 border-t border-white/10">
                                                            <span className="text-sm text-gray-400 block mb-1">Destination</span>
                                                            <span className="text-xs font-mono break-all text-gray-300">{withdrawData.destination}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 p-3 bg-blue-500/10 text-blue-400 rounded-lg text-sm">
                                                        <Shield className="w-4 h-4" />
                                                        You will be asked to sign with your Passkey.
                                                    </div>
                                                    {withdrawError && (
                                                        <p className="text-sm text-red-400">{withdrawError}</p>
                                                    )}
                                                </div>
                                            )}

                                            {withdrawStep === 'processing' && (
                                                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                                                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                                    <p className="text-center text-gray-400">Processing withdrawal...</p>
                                                </div>
                                            )}

                                            {withdrawStep === 'success' && (
                                                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                                                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                        <Check className="w-6 h-6 text-emerald-400" />
                                                    </div>
                                                    <div className="text-center">
                                                        <h3 className="font-medium text-lg">Withdrawal Successful</h3>
                                                        <p className="text-sm text-gray-400">Your funds have been sent.</p>
                                                    </div>
                                                </div>
                                            )}

                                            <DialogFooter className="gap-2 sm:gap-0">
                                                {withdrawStep === 'form' && (
                                                    <>
                                                        <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
                                                        <Button onClick={handleProposeWithdrawal} disabled={!withdrawData.amount || !withdrawData.destination}>Review</Button>
                                                    </>
                                                )}
                                                {withdrawStep === 'review' && (
                                                    <>
                                                        <Button variant="ghost" onClick={() => setWithdrawStep('form')}>Back</Button>
                                                        <Button onClick={handleSubmitWithdrawal} className="bg-blue-600 hover:bg-blue-700">Confirm & Sign</Button>
                                                    </>
                                                )}
                                                {withdrawStep === 'success' && (
                                                    <Button onClick={resetWithdrawal} className="w-full">Close</Button>
                                                )}
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>

                            <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <p className="text-sm font-medium text-white">Deposit Address</p>
                                        <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">Network: Stellar Testnet</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 p-3 bg-black/40 rounded-lg border border-white/5">
                                        <p className="text-xs font-mono text-gray-300 break-all">{walletStatus.walletAddress}</p>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 hover:bg-white/10"
                                            onClick={() => navigator.clipboard.writeText(walletStatus.walletAddress!)}
                                        >
                                            <span className="sr-only">Copy</span>
                                            <Copy className="w-4 h-4 text-gray-400" />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Send USDC or XLM only to this address. Assets sent on other networks will be lost.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
