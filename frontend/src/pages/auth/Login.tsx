
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { passkeyClient } from '@/lib/passkey';
import { Building2, User, Fingerprint } from 'lucide-react';
import { authStorage } from '@/utils/authStorage';

export function Login() {
    const [userType, setUserType] = useState<'investor' | 'company'>('investor');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async () => {
        setIsLoading(true);
        setError('');

        try {
            const result = await passkeyClient.discoverLogin();

            // Determine which user type logged in based on response
            const actualUserType = result.data.userType === 'company' ? 'company' : 'investor';
            const user = result.data.user || result.data.investor;

            // Save Session with explicit user type for multi-session support
            authStorage.setToken(result.data.token, actualUserType);
            authStorage.setUser(user, actualUserType);

            console.log('Login successful:', user.email);

            // Redirect based on user type
            if (result.data.userType === 'company') {
                navigate('/company/dashboard');
            } else {
                navigate('/dashboard');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to authenticate');
        } finally {
            setIsLoading(false);
        }
    };



    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-md space-y-8 relative">
                {/* Background Glow Effect */}
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl -z-10 transition-colors duration-500 ${userType === 'investor' ? 'bg-blue-500/20' : 'bg-teal-500/20'}`} />

                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Radox</h1>
                    <p className="text-muted-foreground">Institutional-Grade Digital Asset Platform</p>
                </div>

                <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader>
                        <CardTitle className="text-white">Welcome Back</CardTitle>
                        <CardDescription className="text-slate-400">
                            Sign in with your passkey to continue.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        <Button
                            onClick={handleLogin}
                            className={`w-full h-14 text-white font-semibold shadow-lg transition-all duration-300 ${userType === 'investor'
                                ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400'
                                : 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400'
                                }`}
                            disabled={isLoading}
                        >
                            <Fingerprint className="w-5 h-5 mr-2" />
                            {isLoading ? 'Authenticating...' : 'Login with Passkey'}
                        </Button>

                        {error && (
                            <div className="text-sm text-red-400 bg-red-900/20 p-3 rounded-lg">
                                {error}
                            </div>
                        )}

                        <div className="p-3 bg-slate-800/50 border border-white/5 rounded-lg">
                            <p className="text-xs text-slate-400 text-center">
                                <strong>📱 Tip:</strong> Your device will show available accounts. Select yours and authenticate with biometrics.
                            </p>
                        </div>
                    </CardContent>

                    {/* Registration CTA */}
                    <div className="px-6 pb-6">
                        <Tabs defaultValue="investor" onValueChange={(v) => setUserType(v as 'investor' | 'company')} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-4 bg-white/5">
                                <TabsTrigger value="investor" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                                    <User className="w-3 h-3 mr-1" />
                                    Investor
                                </TabsTrigger>
                                <TabsTrigger value="company" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white text-xs">
                                    <Building2 className="w-3 h-3 mr-1" />
                                    Company
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <div className={`p-4 rounded-lg border transition-colors ${userType === 'investor' ? 'bg-blue-500/5 border-blue-500/20' : 'bg-teal-500/5 border-teal-500/20'}`}>
                            <p className="text-sm text-center text-slate-300 mb-3">
                                {userType === 'investor'
                                    ? "Don't have an investor account?"
                                    : "Need to register your company?"
                                }
                            </p>
                            <Link
                                to={userType === 'investor' ? '/register' : '/company/register'}
                                className={`flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg font-medium text-sm transition-colors ${userType === 'investor'
                                    ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30'
                                    : 'bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 border border-teal-500/30'
                                    }`}
                            >
                                {userType === 'investor' ? (
                                    <>
                                        <User className="w-4 h-4" />
                                        Create Investor Account
                                    </>
                                ) : (
                                    <>
                                        <Building2 className="w-4 h-4" />
                                        Register Company User
                                    </>
                                )}
                            </Link>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
