
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passkeyClient } from '@/lib/passkey';
import { api } from '@/lib/api';

export function Register() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        document: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            // 1. Create Passkey AND Deploy Smart Wallet (Client-side via Launchtube)
            const { credentialId, publicKey, contractId } = await passkeyClient.register(formData.name);

            // 2. Send to Backend (just stores the data, wallet already deployed)
            const response = await api.post('/investors/register', {
                ...formData,
                credentialId,
                publicKey,
                contractId // Wallet contract ID from client-side deployment
            });

            if (!response.success) {
                throw new Error(response.message || 'Registration failed');
            }

            // 3. Store token for later use (after email verification)
            if (response.data && response.data.token) {
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('user', JSON.stringify(response.data.investor));
                localStorage.setItem('userType', 'investor');
            }

            // Redirect to success page (not dashboard - user needs to verify email first)
            navigate('/registration-success');

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to register');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-md space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl -z-10" />

                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Join Stellar Tokens</h1>
                    <p className="text-muted-foreground">Create your Smart Wallet in seconds</p>
                </div>

                <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-white">Create Account</CardTitle>
                        <CardDescription className="text-slate-400">
                            Enter your details. You will need to create a Passkey next.
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleRegister}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-slate-200">Full Name</Label>
                                <Input
                                    id="name"
                                    placeholder="John Doe"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="bg-slate-950 border-slate-800 text-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-slate-200">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="john@example.com"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    className="bg-slate-950 border-slate-800 text-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="document" className="text-slate-200">CPF / Document ID</Label>
                                <Input
                                    id="document"
                                    placeholder="000.000.000-00"
                                    value={formData.document}
                                    onChange={handleChange}
                                    required
                                    className="bg-slate-950 border-slate-800 text-white"
                                />
                            </div>

                            {error && (
                                <div className="text-sm text-red-400 bg-red-900/20 p-2 rounded">
                                    {error}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-4">
                            <Button
                                type="submit"
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/20"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Creating Wallet...' : 'Create Smart Wallet'}
                            </Button>
                            <p className="text-xs text-center text-slate-500">
                                Already have an account? <a href="/login" className="text-blue-400 hover:underline">Log in</a>
                            </p>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
