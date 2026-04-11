
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, User, Mail, Check, Copy, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';

export function Settings() {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [resending, setResending] = useState(false);
    const [resendMessage, setResendMessage] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

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
                        return;
                    } catch (err) {
                        console.log('Could not fetch fresh user data, using cached');
                    }
                }

                setUser(storedUser);
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

            {/* Account Information - Read Only */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-1">
                <CardHeader>
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <User className="w-5 h-5 text-[hsl(43_45%_55%)]" />
                            Account Information
                        </CardTitle>
                        <CardDescription>Your verified personal details</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
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
                            <p className="font-medium font-mono">{user?.document || 'N/A'}</p>
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
                    <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                        🔒 Your KYC data is verified and cannot be changed. Contact support if you need to update your information.
                    </p>
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

            {/* Security section hidden for MVP - multi-device passkey management coming later
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-3">
                ...
            </Card>
            */}

            {/* Wallet Recovery */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-4">
                <CardHeader>
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-[hsl(43_45%_55%)]" />
                            Wallet Recovery
                        </CardTitle>
                        <CardDescription>Your on-chain identity and backup information</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Contract ID */}
                    {user?.stellarContractId && (
                        <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Wallet Contract ID</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-3 py-2 rounded-xl bg-muted/30 border border-border/50 text-xs font-mono break-all">
                                    {user.stellarContractId}
                                </code>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl shrink-0"
                                    onClick={() => {
                                        navigator.clipboard.writeText(user.stellarContractId);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }}
                                >
                                    {copied ? (
                                        <CheckCircle2 className="w-4 h-4 text-[hsl(160_60%_40%)]" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                            <a
                                href={`https://stellar.expert/explorer/testnet/contract/${user.stellarContractId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[hsl(43_45%_55%)] hover:underline"
                            >
                                View on Stellar Expert <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    )}

                    {/* Recovery info */}
                    <div className="space-y-3 pt-2 border-t border-border/50">
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/20">
                            <span className="text-lg">🔑</span>
                            <div>
                                <p className="text-sm font-medium">Passkey Sync</p>
                                <p className="text-xs text-muted-foreground">
                                    Your passkey is synced across your devices via iCloud Keychain (Apple) or Google Password Manager.
                                    Signing into a new device with the same account restores access automatically.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/20">
                            <span className="text-lg">🛟</span>
                            <div>
                                <p className="text-sm font-medium">Emergency Recovery</p>
                                <p className="text-xs text-muted-foreground">
                                    If you lose access to all devices, contact our support team at{' '}
                                    <a href="mailto:support@radox.net" className="text-[hsl(43_45%_55%)] hover:underline">support@radox.net</a>.
                                    After identity verification, we can assist with account recovery.
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        🔐 Your passkey's private key never leaves your device's secure enclave. Radox cannot access it.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

