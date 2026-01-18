
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, User, Mail, Check, Pencil, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';

export function Settings() {
    const [user, setUser] = useState<any>(null);
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
                const storedUser = authStorage.getUser<any>('investor') || {};

                if (storedUser.id) {
                    try {
                        const userResponse = await api.get(`/investors/${storedUser.id}`);
                        const freshUser = userResponse.data || userResponse;
                        const updatedUser = { ...storedUser, ...freshUser };
                        authStorage.setUser(updatedUser, 'investor');
                        setUser(updatedUser);
                        setEditForm({ name: updatedUser.name || '', document: updatedUser.document || '' });
                        return;
                    } catch (err) {
                        console.log('Could not fetch fresh user data, using cached');
                    }
                }

                setUser(storedUser);
                setEditForm({ name: storedUser.name || '', document: storedUser.document || '' });
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
            authStorage.setUser(newUser, 'investor');

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
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-2xl">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">Manage your account and preferences</p>
            </div>

            {/* Account Information */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-1">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <User className="w-5 h-5 text-[hsl(43_45%_55%)]" />
                                Account Information
                            </CardTitle>
                            <CardDescription>Your personal details</CardDescription>
                        </div>
                        {!isEditing ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsEditing(true)}
                                className="rounded-xl"
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
                                    className="rounded-xl"
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleSaveProfile}
                                    disabled={saving}
                                    className="bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_50%)] text-white rounded-xl"
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
                        <div className={`p-3 rounded-xl text-sm ${saveMessage.type === 'success'
                            ? 'bg-[hsl(160_60%_40%/0.1)] text-[hsl(160_60%_40%)] border border-[hsl(160_60%_40%/0.2)]'
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
                                    className="bg-muted/30 border-border/50 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    value={user?.email || ''}
                                    disabled
                                    className="bg-muted/30 border-border/50 rounded-xl opacity-50"
                                />
                                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="document">Document</Label>
                                <Input
                                    id="document"
                                    value={editForm.document}
                                    onChange={(e) => setEditForm({ ...editForm, document: e.target.value })}
                                    className="bg-muted/30 border-border/50 rounded-xl"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>KYC Status</Label>
                                <div className="pt-2">
                                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${user?.kycStatus === 'approved'
                                        ? 'bg-[hsl(160_60%_40%/0.15)] text-[hsl(160_60%_40%)] border-[hsl(160_60%_40%/0.3)]'
                                        : 'bg-[hsl(35_90%_50%/0.15)] text-[hsl(35_90%_50%)] border-[hsl(35_90%_50%/0.3)]'
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
                                <p className="font-medium">{user?.name || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Email</p>
                                <p className="font-medium">{user?.email || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Document</p>
                                <p className="font-medium">{user?.document || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">KYC Status</p>
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${user?.kycStatus === 'approved'
                                    ? 'bg-[hsl(160_60%_40%/0.15)] text-[hsl(160_60%_40%)] border-[hsl(160_60%_40%/0.3)]'
                                    : 'bg-[hsl(35_90%_50%/0.15)] text-[hsl(35_90%_50%)] border-[hsl(35_90%_50%/0.3)]'
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
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-2">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Mail className="w-5 h-5 text-[hsl(43_45%_55%)]" />
                        Email Verification
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Status</p>
                            <span className={`inline-flex items-center gap-1 text-sm ${user?.emailVerified ? 'text-[hsl(160_60%_40%)]' : 'text-[hsl(35_90%_50%)]'
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
                                className="rounded-xl"
                            >
                                {resending ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : null}
                                Resend Email
                            </Button>
                        )}
                    </div>
                    {resendMessage && (
                        <p className={`text-sm ${resendMessage.includes('sent') ? 'text-[hsl(160_60%_40%)]' : 'text-red-400'}`}>
                            {resendMessage}
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
