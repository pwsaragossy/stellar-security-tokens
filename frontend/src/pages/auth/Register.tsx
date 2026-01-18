
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passkeyClient } from '@/lib/passkey';
import { api } from '@/lib/api';
import { ShieldAlert, Cloud, Smartphone, Key, Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { authStorage } from '@/utils/authStorage';

type Ecosystem = 'icloud' | 'google' | 'other';
type Step = 'email' | 'code' | 'details';

export function Register() {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [registrationToken, setRegistrationToken] = useState('');
    const [formData, setFormData] = useState({ name: '', document: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [passkeyAcknowledged, setPasskeyAcknowledged] = useState(false);
    const [ecosystem, setEcosystem] = useState<Ecosystem | null>(null);
    const [resendCooldown, setResendCooldown] = useState(0);
    const navigate = useNavigate();
    const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    // Step 1: Send verification code
    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const response = await api.post('/investors/initiate-registration', { email });
            if (!response.success) {
                throw new Error(response.error || 'Failed to send verification code');
            }
            setStep('code');
            setResendCooldown(60);
        } catch (err: any) {
            setError(err.message || 'Failed to send verification code');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2: Verify code
    const handleVerifyCode = async () => {
        const fullCode = code.join('');
        if (fullCode.length !== 6) return; // Silently return if incomplete

        setIsLoading(true);
        setError('');

        try {
            const response = await api.post('/investors/verify-email-code', { email, code: fullCode });
            if (!response.success) {
                throw new Error(response.error || 'Invalid verification code');
            }
            setRegistrationToken(response.data.registrationToken);
            setStep('details');
        } catch (err: any) {
            setError(err.message || 'Invalid verification code');
        } finally {
            setIsLoading(false);
        }
    };

    // Handle code input
    const handleCodeChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return; // Only digits

        // Clear any previous error when user starts typing
        if (error) setError('');

        const newCode = [...code];

        // Handle multi-character paste (paste into single input)
        if (value.length > 1) {
            // Distribute characters across inputs starting from current index
            const chars = value.replace(/\D/g, '').slice(0, 6 - index);
            for (let i = 0; i < chars.length; i++) {
                if (index + i < 6) {
                    newCode[index + i] = chars[i];
                }
            }
            setCode(newCode);
            // Focus last filled or next empty
            const nextIndex = Math.min(index + chars.length, 5);
            codeInputRefs.current[nextIndex]?.focus();
            // Auto-submit if all filled
            if (newCode.every(c => c)) {
                setTimeout(handleVerifyCode, 100);
            }
            return;
        }

        newCode[index] = value.slice(-1); // Only last character for single input
        setCode(newCode);

        // Auto-focus next input
        if (value && index < 5) {
            codeInputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when complete
        if (newCode.every(c => c) && newCode.join('').length === 6) {
            setTimeout(handleVerifyCode, 100);
        }
    };

    // Handle paste event for the entire code section
    const handleCodePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pastedData.length === 0) return;

        // Clear error on paste
        if (error) setError('');

        const newCode = [...code];
        for (let i = 0; i < pastedData.length; i++) {
            newCode[i] = pastedData[i];
        }
        setCode(newCode);

        // Focus appropriate input
        const focusIndex = Math.min(pastedData.length, 5);
        codeInputRefs.current[focusIndex]?.focus();

        // Auto-submit if complete
        if (pastedData.length === 6) {
            setTimeout(handleVerifyCode, 100);
        }
    };

    const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            codeInputRefs.current[index - 1]?.focus();
        }
    };

    // Resend code
    const handleResendCode = async () => {
        if (resendCooldown > 0) return;

        setIsLoading(true);
        setError('');

        try {
            await api.post('/investors/resend-code', { email });
            setResendCooldown(60);
            setCode(['', '', '', '', '', '']);
        } catch (err: any) {
            setError(err.message || 'Failed to resend code');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 3: Complete registration
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
            // 1. Create Passkey AND Deploy Smart Wallet (Client-side via passkey-kit + Launchtube)
            const { credentialId, contractId } = await passkeyClient.register(formData.name);

            // 2. Send to Backend with registrationToken (contains verified email)
            // Note: publicKey is no longer needed - wallet is already deployed by passkey-kit
            const response = await api.post('/investors/register', {
                ...formData,
                registrationToken,
                credentialId,
                contractId
            });

            if (!response.success) {
                throw new Error(response.error || response.message || 'Registration failed');
            }

            // 3. Store token and redirect to success page
            if (response.data?.token) {
                authStorage.setToken(response.data.token, 'investor');
                authStorage.setUser(response.data.investor, 'investor');
            }

            navigate('/registration-success');

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to register');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 1: Email Entry
    if (step === 'email') {
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
                            <CardTitle className="text-white flex items-center gap-2">
                                <Mail className="w-5 h-5" />
                                Verify Your Email
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                Step 1 of 3: We'll send you a verification code
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleSendCode}>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-slate-200">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="john@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="bg-slate-950 border-slate-800 text-white"
                                        autoFocus
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
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg"
                                    disabled={isLoading || !email}
                                >
                                    {isLoading ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                                    ) : (
                                        'Send Verification Code'
                                    )}
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

    // Step 2: Code Verification
    if (step === 'code') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
                <div className="w-full max-w-md space-y-8 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl -z-10" />

                    <div className="text-center space-y-2">
                        <h1 className="text-3xl font-bold tracking-tighter text-white">Check Your Email</h1>
                        <p className="text-muted-foreground">We sent a code to <span className="text-blue-400">{email}</span></p>
                    </div>

                    <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-xl">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-green-400" />
                                Enter Verification Code
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                Step 2 of 3: Enter the 6-digit code from your email
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                                {code.map((digit, index) => (
                                    <Input
                                        key={index}
                                        ref={el => { codeInputRefs.current[index] = el; }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={digit}
                                        onChange={(e) => handleCodeChange(index, e.target.value)}
                                        onKeyDown={(e) => handleCodeKeyDown(index, e)}
                                        onPaste={handleCodePaste}
                                        className="w-12 h-14 text-center text-2xl font-bold bg-slate-950 border-slate-700 text-white focus:border-blue-500"
                                        autoFocus={index === 0}
                                    />
                                ))}
                            </div>

                            {error && (
                                <div className="text-sm text-red-400 bg-red-900/20 p-2 rounded text-center">
                                    {error}
                                </div>
                            )}

                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={handleResendCode}
                                    disabled={resendCooldown > 0 || isLoading}
                                    className="text-sm text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                                </button>
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-4">
                            <Button
                                onClick={handleVerifyCode}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg"
                                disabled={isLoading || code.some(c => !c)}
                            >
                                {isLoading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                                ) : (
                                    'Verify Code'
                                )}
                            </Button>
                            <button
                                type="button"
                                onClick={() => { setStep('email'); setError(''); }}
                                className="text-sm text-slate-400 hover:text-white flex items-center justify-center gap-1"
                            >
                                <ArrowLeft className="w-4 h-4" /> Use a different email
                            </button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        );
    }

    // Step 3: Details + Passkey
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-md space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl -z-10" />

                <div className="text-center space-y-2">
                    <div className="flex justify-center mb-2">
                        <div className="p-2 bg-green-500/20 rounded-full">
                            <CheckCircle2 className="w-6 h-6 text-green-400" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Email Verified!</h1>
                    <p className="text-muted-foreground">Now create your secure wallet</p>
                </div>

                <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-white">Complete Your Profile</CardTitle>
                        <CardDescription className="text-slate-400">
                            Step 3 of 3: Enter your details and create a Passkey
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleRegister}>
                        <CardContent className="space-y-4">
                            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
                                <Mail className="w-5 h-5 text-green-400 flex-shrink-0" />
                                <span className="text-sm text-green-200">{email}</span>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-slate-200">Full Name</Label>
                                <Input
                                    id="name"
                                    placeholder="John Doe"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                                    onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                                    required
                                    className="bg-slate-950 border-slate-800 text-white"
                                />
                            </div>

                            {/* Ecosystem Selector */}
                            <div className="space-y-3 pt-2">
                                <Label className="text-slate-200">Where will you save your Passkey?</Label>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { id: 'icloud', icon: Cloud, label: 'iCloud Keychain', sub: 'For iPhone, iPad, Mac users' },
                                        { id: 'google', icon: Smartphone, label: 'Google Password Manager', sub: 'For Android & Chrome users' },
                                        { id: 'other', icon: Key, label: 'Other / Hardware Key', sub: 'YubiKey, 1Password, etc' },
                                    ].map(({ id, icon: Icon, label, sub }) => (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setEcosystem(id as Ecosystem)}
                                            className={`p-3 rounded-lg border flex items-center gap-3 transition-all text-left ${ecosystem === id
                                                ? 'bg-blue-500/20 border-blue-500 text-white'
                                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                                                }`}
                                        >
                                            <Icon className="w-5 h-5" />
                                            <div>
                                                <p className="text-sm font-medium">{label}</p>
                                                <p className="text-xs opacity-70">{sub}</p>
                                            </div>
                                        </button>
                                    ))}
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
                                            It's stored on your device and synced via your cloud account.
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
                                {isLoading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating Wallet...</>
                                ) : (
                                    'Create Smart Wallet'
                                )}
                            </Button>
                            <button
                                type="button"
                                onClick={() => { setStep('email'); setError(''); setRegistrationToken(''); }}
                                className="text-sm text-slate-400 hover:text-white flex items-center justify-center gap-1"
                            >
                                <ArrowLeft className="w-4 h-4" /> Start over
                            </button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}

