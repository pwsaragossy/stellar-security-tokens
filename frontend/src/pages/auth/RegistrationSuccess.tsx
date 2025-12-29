
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { passkeyClient } from '@/lib/passkey';
import { api } from '@/lib/api';

export function RegistrationSuccess() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleVerifyLogin = async () => {
        setIsLoading(true);
        setError('');
        try {
            // Force a login attempt to verify the passkey was saved correctly
            const { credentialId, signature, clientDataJSON, authenticatorData } = await passkeyClient.login();

            // Verify with backend
            const response = await api.post('/auth/login', {
                credentialId,
                signature,
                clientDataJSON,
                authenticatorData
            });

            if (!response.success) {
                throw new Error(response.message || 'Verification failed');
            }

            // If successful, store session and redirect based on user type
            if (response.data && response.data.token) {
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('user', JSON.stringify(response.data.user));
                localStorage.setItem('userType', response.data.userType);

                if (response.data.userType === 'company') {
                    // Check status for company
                    if (response.data.user.status === 'pending') {
                        navigate('/company/pending-approval');
                    } else {
                        navigate('/company/dashboard');
                    }
                } else {
                    navigate('/dashboard');
                }
            }

        } catch (err: any) {
            console.error("Verification failed", err);
            setError("We couldn't verify your passkey. It seems it wasn't saved correctly. Please try again or re-register.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-lg space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/10 rounded-full blur-3xl -z-10" />

                <div className="text-center space-y-2">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-green-500/20 rounded-full">
                            <CheckCircle2 className="w-10 h-10 text-green-400" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Account Created!</h1>
                    <p className="text-muted-foreground">Now, let's verify everything works.</p>
                </div>

                <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-white">One Last Step: The Practice Run</CardTitle>
                        <CardDescription className="text-slate-400">
                            We need to confirm your device successfully saved your Passkey before you can access your account.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-teal-500/10 border border-teal-500/30 rounded-lg flex gap-3">
                            <ShieldCheck className="w-6 h-6 text-teal-400 flex-shrink-0" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-teal-200">Why are we doing this?</p>
                                <p className="text-xs text-teal-200/70">
                                    If your passkey wasn't saved securely (e.g. you are in Incognito mode or cancelled the prompt),
                                    you would lose access to your funds later. We check this NOW to keep you safe.
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded flex items-start gap-2 text-red-200 text-sm">
                                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button
                            onClick={handleVerifyLogin}
                            disabled={isLoading}
                            className="w-full bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 h-12 text-lg"
                        >
                            {isLoading ? 'Verifying Key...' : (
                                <span className="flex items-center gap-2">
                                    Verify & Log In <ArrowRight className="w-5 h-5" />
                                </span>
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
