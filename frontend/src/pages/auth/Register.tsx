
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passkeyClient } from '@/lib/passkey';
import { api } from '@/lib/api';
import { ShieldAlert, Cloud, Smartphone, Key } from 'lucide-react';

type Ecosystem = 'icloud' | 'google' | 'other';

export function Register() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        document: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [passkeyAcknowledged, setPasskeyAcknowledged] = useState(false);
    const [ecosystem, setEcosystem] = useState<Ecosystem | null>(null);
    const navigate = useNavigate();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passkeyAcknowledged) {
            setError('Please acknowledge that you understand how Passkeys work');
            return;
        }
        if (!ecosystem) {
            setError('Please select where you will save your passkey');
            return;
        }
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
                // DO NOT store token yet - force them to login on the success page to prove they have the key
                // localStorage.setItem('token', response.data.token);
                // localStorage.setItem('user', JSON.stringify(response.data.investor));
                // localStorage.setItem('userType', 'investor');
            }

            // Redirect to verify-access page
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
                            Enter your details. You will create a Passkey to secure your wallet.
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

                            {/* Ecosystem Selector (Mental Trigger) */}
                            <div className="space-y-3 pt-2">
                                <Label className="text-slate-200">Where will you save your Passkey?</Label>
                                <div className="grid grid-cols-1 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEcosystem('icloud')}
                                        className={`p-3 rounded-lg border flex items-center gap-3 transition-all text-left ${ecosystem === 'icloud'
                                                ? 'bg-blue-500/20 border-blue-500 text-white'
                                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}
                                    >
                                        <Cloud className="w-5 h-5" />
                                        <div>
                                            <p className="text-sm font-medium">iCloud Keychain</p>
                                            <p className="text-xs opacity-70">For iPhone, iPad, Mac users</p>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setEcosystem('google')}
                                        className={`p-3 rounded-lg border flex items-center gap-3 transition-all text-left ${ecosystem === 'google'
                                                ? 'bg-blue-500/20 border-blue-500 text-white'
                                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}
                                    >
                                        <Smartphone className="w-5 h-5" />
                                        <div>
                                            <p className="text-sm font-medium">Google Password Manager</p>
                                            <p className="text-xs opacity-70">For Android & Chrome users</p>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setEcosystem('other')}
                                        className={`p-3 rounded-lg border flex items-center gap-3 transition-all text-left ${ecosystem === 'other'
                                                ? 'bg-blue-500/20 border-blue-500 text-white'
                                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}
                                    >
                                        <Key className="w-5 h-5" />
                                        <div>
                                            <p className="text-sm font-medium">Other / Hardware Key</p>
                                            <p className="text-xs opacity-70">YubiKey, 1Password, etc</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Passkey Disclaimer */}
                            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-3">
                                <div className="flex items-start gap-3">
                                    <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-200/90">
                                        <p className="font-semibold mb-1">What is a Passkey?</p>
                                        <p className="text-amber-200/70 text-xs leading-relaxed">
                                            A Passkey uses your device's biometrics (Face ID, Touch ID, or fingerprint) to secure your wallet.
                                            It's stored on your device and synced via your cloud account (iCloud, Google).
                                        </p>
                                    </div>
                                </div>
                                <div className="border-t border-amber-500/20 pt-3">
                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={passkeyAcknowledged}
                                            onChange={(e) => setPasskeyAcknowledged(e.target.checked)}
                                            className="mt-1 w-4 h-4 rounded border-amber-500/50 bg-transparent text-amber-500 focus:ring-amber-500/50"
                                        />
                                        <span className="text-xs text-amber-200/80 group-hover:text-amber-200 transition-colors">
                                            <strong>I understand</strong> that my Passkey is my only way to access my wallet.
                                            If I lose access to all my synced devices, I will not be able to recover my account.
                                        </span>
                                    </label>
                                </div>
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
                                className={`w-full text-white font-semibold shadow-lg transition-all ${passkeyAcknowledged
                                    ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
                                    : 'bg-slate-700 cursor-not-allowed opacity-60'
                                    }`}
                                disabled={isLoading || !passkeyAcknowledged}
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

