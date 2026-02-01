import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { HELP_CONTENT } from '@/constants/help-content';
import { Button } from '@/components/ui/button';
import { Fingerprint, Loader2, CheckCircle, XCircle, Shield } from 'lucide-react';
import api from '@/api/client';

export function AdminSettings() {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleRegisterPasskey = async () => {
        setLoading(true);
        setStatus('idle');
        setMessage('');

        try {
            // Step 1: Get registration options
            const optionsResponse = await api.post('/platform-admins/passkey/register/options');
            const { options, challenge } = optionsResponse.data;

            // Step 2: Trigger browser passkey creation
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: Uint8Array.from(atob(challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                    rp: {
                        name: 'Stellar Security Tokens',
                        id: options.rp?.id || 'localhost'
                    },
                    user: {
                        id: Uint8Array.from(atob(options.user.id), c => c.charCodeAt(0)),
                        name: options.user.name,
                        displayName: options.user.displayName
                    },
                    pubKeyCredParams: options.pubKeyCredParams || [
                        { type: 'public-key', alg: -7 },
                        { type: 'public-key', alg: -257 }
                    ],
                    timeout: options.timeout || 60000,
                    attestation: 'none',
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required',
                        residentKey: 'required',
                        requireResidentKey: true
                    }
                }
            }) as PublicKeyCredential;

            if (!credential) {
                throw new Error('Passkey creation cancelled');
            }

            // Step 3: Prepare credential for backend (using base64url encoding)
            const attestationResponse = credential.response as AuthenticatorAttestationResponse;

            // Helper to convert ArrayBuffer to base64url
            const toBase64url = (buffer: ArrayBuffer): string => {
                const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            };

            const credentialData = {
                id: credential.id,
                rawId: toBase64url(credential.rawId),
                type: credential.type,
                response: {
                    clientDataJSON: toBase64url(attestationResponse.clientDataJSON),
                    attestationObject: toBase64url(attestationResponse.attestationObject),
                }
            };

            // Step 4: Send to backend
            const registerResponse = await api.post('/platform-admins/passkey/register', {
                credential: credentialData,
                challenge,
                deviceName: navigator.userAgent.includes('Mac') ? 'MacBook' : 'Device'
            });

            if (registerResponse.data.success) {
                setStatus('success');
                setMessage('Passkey registered! You can now login with passkey.');
            } else {
                throw new Error(registerResponse.data.error || 'Registration failed');
            }
        } catch (error: any) {
            console.error('Passkey registration error:', error);
            setStatus('error');
            setMessage(error.message || 'Failed to register passkey');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Admin Settings</h1>
                <p className="text-muted-foreground">Manage your admin account security</p>
            </div>

            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Fingerprint className="w-5 h-5 text-red-400" />
                        Passkey Authentication
                        <InfoTooltip content={HELP_CONTENT.adminSettings.passkeyRegistration.content} side="right" />
                    </CardTitle>
                    <CardDescription>
                        Register a passkey for passwordless login. This uses your device's biometric (Face ID, Touch ID) or PIN.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {status === 'success' && (
                        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                            <span className="text-emerald-400">{message}</span>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-center gap-2 p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                            <XCircle className="w-5 h-5 text-red-400" />
                            <span className="text-red-400">{message}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-500/10 rounded-lg">
                                <Shield className="w-6 h-6 text-red-400" />
                            </div>
                            <div>
                                <p className="font-medium text-white">Register New Passkey</p>
                                <p className="text-sm text-muted-foreground">Use Face ID, Touch ID, or device PIN</p>
                            </div>
                        </div>
                        <Button
                            onClick={handleRegisterPasskey}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Registering...
                                </>
                            ) : (
                                <>
                                    <Fingerprint className="w-4 h-4 mr-2" />
                                    Register Passkey
                                </>
                            )}
                        </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        After registering, you can use the "Login with Passkey" option on the admin login page.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
