import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Loader2, Wallet } from 'lucide-react';
import { platformAdminsApi } from '@/api/platformAdmins';
import { authStorage } from '@/utils/authStorage';
import { connectFreighter, signTransactionWithFreighter } from '@/lib/freighter';

export function AdminLogin() {
    const navigate = useNavigate();
    const [freighterLoading, setFreighterLoading] = useState(false);
    const [error, setError] = useState('');

    const handleFreighterLogin = async () => {
        setError('');
        setFreighterLoading(true);

        try {
            // 1. Connect to Freighter and get the active public key
            const device = await connectFreighter();
            const publicKey = device.publicKey;

            // 2. Request a challenge transaction XDR from the backend
            const challengeResponse = await platformAdminsApi.freighterChallenge(publicKey);
            if (!challengeResponse.success || !challengeResponse.data) {
                throw new Error(challengeResponse.error || 'Failed to get challenge');
            }

            // 3. Sign the challenge transaction with Freighter
            const { challengeXdr, networkPassphrase } = challengeResponse.data;
            const { signedXdr } = await signTransactionWithFreighter(
                challengeXdr,
                networkPassphrase
            );

            // 4. Verify the signed transaction on the backend and get JWT
            const verifyResponse = await platformAdminsApi.freighterVerify(publicKey, signedXdr);
            if (!verifyResponse.success || !verifyResponse.data) {
                throw new Error(verifyResponse.error || 'Freighter verification failed');
            }

            // 5. Store session and navigate
            authStorage.setToken(verifyResponse.data.token, 'admin');
            authStorage.setUser(verifyResponse.data.admin, 'admin');
            navigate('/admin/dashboard');
        } catch (err: any) {
            console.error('Freighter login error:', err);
            setError(err.response?.data?.error || err.message || 'Freighter login failed.');
        } finally {
            setFreighterLoading(false);
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

                    <Button
                        type="button"
                        className="w-full bg-red-600 hover:bg-red-700"
                        onClick={handleFreighterLogin}
                        disabled={freighterLoading}
                    >
                        {freighterLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Connecting to Freighter...
                            </>
                        ) : (
                            <>
                                <Wallet className="mr-2 h-4 w-4" />
                                Sign in with Freighter
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
