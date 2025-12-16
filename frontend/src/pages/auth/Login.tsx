
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { passkeyClient } from '@/lib/passkey';

export function Login() {
    const [email, setEmail] = useState('');
    const [userType, setUserType] = useState<'investor' | 'company'>('investor');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            // Authenticate with Passkey
            const result = await passkeyClient.login(email, userType);

            // Save Session
            localStorage.setItem('token', result.data.token);
            const user = result.data.user || result.data.investor;
            localStorage.setItem('user', JSON.stringify(user));
            localStorage.setItem('userType', userType);

            console.log('Login successful:', user.email);

            // Redirect to Dashboard
            navigate('/dashboard');

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
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl -z-10" />

                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Stellar Tokens</h1>
                    <p className="text-muted-foreground">Institutional-Grade Security Token Platform</p>
                </div>

                <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-white">Welcome Back</CardTitle>
                        <CardDescription className="text-slate-400">
                            Select your role and connect your Smart Wallet.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <Tabs defaultValue="investor" onValueChange={(v) => setUserType(v as 'investor' | 'company')} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-6 bg-white/5">
                                <TabsTrigger value="investor">Investor</TabsTrigger>
                                <TabsTrigger value="company">Company</TabsTrigger>
                            </TabsList>

                            <form onSubmit={handleLogin}>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Input
                                            type="email"
                                            placeholder={userType === 'investor' ? "investor@example.com" : "company@domain.com"}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            className="bg-white/5 border-white/10 focus:border-blue-500/50"
                                        />
                                    </div>
                                    {error && (
                                        <div className="text-sm text-red-400 bg-red-900/20 p-2 rounded">
                                            {error}
                                        </div>
                                    )}
                                    <Button
                                        type="submit"
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/20"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? 'Connecting...' : `Connect ${userType === 'investor' ? 'Investor' : 'Company'} Wallet`}
                                    </Button>
                                </div>
                            </form>
                        </Tabs>
                    </CardContent>
                    <div className="px-6 pb-6 text-center">
                        <p className="text-sm text-slate-400">
                            Not a user?{' '}
                            <Link to="/register" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                                Sign Up here
                            </Link>
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    );
}
