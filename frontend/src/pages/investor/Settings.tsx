
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, User, Key, Mail, Shield, Check, Pencil, Save, X } from 'lucide-react';
import { api } from '@/lib/api';

interface WalletStatus {
    hasWallet: boolean;
    walletAddress?: string;
    passkeyRegistered: boolean;
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

            {/* Connected Passkeys */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Key className="w-5 h-5" />
                        Connected Passkeys
                    </CardTitle>
                    <CardDescription>Your registered authentication methods</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium text-white">Passkey Wallet</p>
                            <p className="text-sm text-muted-foreground">
                                {walletStatus?.passkeyRegistered ? 'Active and connected' : 'Not registered'}
                            </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs ${walletStatus?.passkeyRegistered
                            ? 'bg-emerald-400/10 text-emerald-400'
                            : 'bg-red-400/10 text-red-400'
                            }`}>
                            {walletStatus?.passkeyRegistered ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    {walletStatus?.walletAddress && (
                        <div className="mt-4 p-3 rounded-lg bg-white/5">
                            <p className="text-xs text-muted-foreground mb-1">Wallet Contract ID</p>
                            <p className="text-xs font-mono text-white break-all">{walletStatus.walletAddress}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
