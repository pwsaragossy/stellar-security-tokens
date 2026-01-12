import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Loader2, Fingerprint } from 'lucide-react';
import { platformAdminsApi } from '@/api/platformAdmins';
import api from '@/api/client';

export function AdminLogin() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await platformAdminsApi.login(email, password);
            if (response.success && response.data) {
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('admin', JSON.stringify(response.data.admin));
                navigate('/admin/dashboard');
            } else {
                setError('Login failed. Please check your credentials.');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handlePasskeyLogin = async () => {
        setError('');
        setPasskeyLoading(true);

        try {
            // Get authentication options
            const optionsResponse = await api.get('/platform-admins/passkey-login');
            const { challenge, rpId, timeout } = optionsResponse.data;

            // Trigger browser passkey authentication
            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: Uint8Array.from(atob(challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                    rpId,
                    timeout,
                    userVerification: 'required',
                }
            }) as PublicKeyCredential;

            if (!credential) {
                throw new Error('Passkey authentication cancelled');
            }

            // Send credential ID to backend
            const loginResponse = await api.post('/platform-admins/passkey-login', {
                credentialId: credential.id
            });

            if (loginResponse.data.success && loginResponse.data.data) {
                localStorage.setItem('token', loginResponse.data.data.token);
                localStorage.setItem('admin', JSON.stringify(loginResponse.data.data.admin));
                navigate('/admin/dashboard');
            } else {
                throw new Error(loginResponse.data.error || 'Passkey authentication failed');
            }
        } catch (err: any) {
            console.error('Passkey login error:', err);
            setError(err.message || 'Passkey login failed. Try password login.');
        } finally {
            setPasskeyLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md glass-panel border-white/5 bg-white/5">
                <CardHeader className="text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-red-600 flex items-center justify-center mb-4">
                        <Shield className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-2xl text-white">Admin Portal</CardTitle>
                    <CardDescription>Platform Administrator Access</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Passkey Login Button */}
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full border-white/10 hover:bg-white/5"
                        onClick={handlePasskeyLogin}
                        disabled={passkeyLoading || loading}
                    >
                        {passkeyLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Authenticating...
                            </>
                        ) : (
                            <>
                                <Fingerprint className="mr-2 h-4 w-4" />
                                Login with Passkey
                            </>
                        )}
                    </Button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-white/10" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-slate-950 px-2 text-muted-foreground">or</span>
                        </div>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@tokenizadora.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="bg-white/5 border-white/10"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="bg-white/5 border-white/10"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-red-600 hover:bg-red-700"
                            disabled={loading || passkeyLoading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In with Password'
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
