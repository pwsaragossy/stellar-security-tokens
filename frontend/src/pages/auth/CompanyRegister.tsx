import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passkeyClient } from '@/lib/passkey';
import { api } from '@/lib/api';
import { Building2, Globe, ShieldAlert, Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';

type Country = 'USA' | 'BRASIL';
type Step = 'email' | 'code' | 'details';

export function CompanyRegister() {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [registrationToken, setRegistrationToken] = useState('');
    const [country, setCountry] = useState<Country | null>(null);
    const [formData, setFormData] = useState({
        companyName: '',
        legalRepresentative: '',
        taxId: '',
        address: '',
        phone: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [passkeyAcknowledged, setPasskeyAcknowledged] = useState(false);
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

    // Pre-initialize SmartAccountKit when entering details step.
    // CompanyRegister triggers passkey creation on form submit,
    // so pre-warm here to keep navigator.credentials.create()
    // within Chrome's transient activation window.
    useEffect(() => {
        if (step === 'details') {
            passkeyClient.init().catch(err => {
                console.error('Failed to pre-init passkey client:', err);
            });
        }
    }, [step]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    // Step 1: Send verification code
    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const response = await api.post('/companies/initiate-registration', { email });
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
        if (fullCode.length !== 6) return;

        setIsLoading(true);
        setError('');

        try {
            const response = await api.post('/companies/verify-email-code', { email, code: fullCode });
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
        if (!/^\d*$/.test(value)) return;

        if (error) setError('');

        const newCode = [...code];

        if (value.length > 1) {
            const chars = value.replace(/\D/g, '').slice(0, 6 - index);
            for (let i = 0; i < chars.length; i++) {
                if (index + i < 6) {
                    newCode[index + i] = chars[i];
                }
            }
            setCode(newCode);
            const nextIndex = Math.min(index + chars.length, 5);
            codeInputRefs.current[nextIndex]?.focus();
            if (newCode.every(c => c)) {
                setTimeout(handleVerifyCode, 100);
            }
            return;
        }

        newCode[index] = value.slice(-1);
        setCode(newCode);

        if (value && index < 5) {
            codeInputRefs.current[index + 1]?.focus();
        }

        if (newCode.every(c => c) && newCode.join('').length === 6) {
            setTimeout(handleVerifyCode, 100);
        }
    };

    const handleCodePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pastedData.length === 0) return;

        if (error) setError('');

        const newCode = [...code];
        for (let i = 0; i < pastedData.length; i++) {
            newCode[i] = pastedData[i];
        }
        setCode(newCode);

        const focusIndex = Math.min(pastedData.length, 5);
        codeInputRefs.current[focusIndex]?.focus();

        if (pastedData.length === 6) {
            setTimeout(handleVerifyCode, 100);
        }
    };

    const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            codeInputRefs.current[index - 1]?.focus();
        }
    };

    const handleResendCode = async () => {
        if (resendCooldown > 0) return;

        setIsLoading(true);
        setError('');

        try {
            await api.post('/companies/resend-code', { email });
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
        if (!formData.companyName.trim()) {
            setError('Company name is required');
            return;
        }
        setIsLoading(true);
        setError('');

        try {
            // Clean tax ID if provided
            const cleanTaxId = formData.taxId ? formData.taxId.replace(/\D/g, '') : undefined;

            // 1. Create Passkey AND Deploy Smart Wallet
            const { credentialId, contractId, publicKey } = await passkeyClient.register(formData.companyName);

            // 2. Send to Backend with registrationToken. publicKey is stored so
            // logins can be verified server-side (not just credentialId lookup).
            const response = await api.post('/companies/register', {
                name: formData.companyName,
                legal_representative: formData.legalRepresentative || undefined,
                country: country || undefined,
                tax_id: cleanTaxId || undefined,
                tax_id_type: country === 'BRASIL' ? 'CNPJ' : country === 'USA' ? 'EIN' : undefined,
                address: formData.address || undefined,
                phone: formData.phone || undefined,
                registrationToken,
                credentialId,
                contractId,
                publicKey,
            });

            if (!response.success) {
                throw new Error(response.error || 'Registration failed');
            }

            navigate('/company/pending-approval');

        } catch (err: any) {
            console.error(err);
            // NotAllowedError = user dismissed or didn't interact with the passkey popup
            if (err.name === 'NotAllowedError' || err.code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY' || err.message?.includes('cancelled') || err.message?.includes('timed out')) {
                setError('The security prompt was closed before completing. Please try again and follow the popup that appears on your screen.');
            } else {
                setError(err.message || 'Failed to register');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Step 1: Email Entry
    if (step === 'email') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
                <div className="w-full max-w-md space-y-8 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/20 rounded-full blur-3xl -z-10" />

                    <div className="text-center space-y-2">
                        <div className="flex justify-center mb-4">
                            <div className="p-3 bg-teal-500/20 rounded-xl">
                                <Building2 className="w-8 h-8 text-teal-400" />
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tighter text-white">Company Registration</h1>
                        <p className="text-muted-foreground">Register your company on the platform</p>
                    </div>

                    <Card className="border-slate-800 bg-slate-900/90">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Mail className="w-5 h-5" />
                                Verify Corporate Email
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                Step 1 of 3: We'll send you a verification code
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleSendCode}>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-slate-200">Corporate Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="contact@company.com"
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
                                    className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold shadow-lg"
                                    disabled={isLoading || !email}
                                >
                                    {isLoading ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                                    ) : (
                                        'Send Verification Code'
                                    )}
                                </Button>
                                <p className="text-xs text-center text-slate-500">
                                    Already have an account? <a href="/login" className="text-teal-400 hover:underline">Log in</a>
                                </p>
                                <p className="text-xs text-center text-slate-500">
                                    Are you an investor? <a href="/register" className="text-blue-400 hover:underline">Register as investor</a>
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
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/20 rounded-full blur-3xl -z-10" />

                    <div className="text-center space-y-2">
                        <h1 className="text-3xl font-bold tracking-tighter text-white">Check Your Email</h1>
                        <p className="text-muted-foreground">We sent a code to <span className="text-teal-400">{email}</span></p>
                    </div>

                    <Card className="border-slate-800 bg-slate-900/90">
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
                                        className="w-12 h-14 text-center text-2xl font-bold bg-slate-950 border-slate-700 text-white focus:border-teal-500"
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
                                    className="text-sm text-teal-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                                </button>
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-4">
                            <Button
                                onClick={handleVerifyCode}
                                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold shadow-lg"
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
            <div className="w-full max-w-lg space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/20 rounded-full blur-3xl -z-10" />

                <div className="text-center space-y-2">
                    <div className="flex justify-center mb-2">
                        <div className="p-2 bg-green-500/20 rounded-full">
                            <CheckCircle2 className="w-6 h-6 text-green-400" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter text-white">Email Verified!</h1>
                    <p className="text-muted-foreground">Now complete your company registration</p>
                </div>

                <Card className="border-slate-800 bg-slate-900/90">
                    <CardHeader>
                        <CardTitle className="text-white">Company Details</CardTitle>
                        <CardDescription className="text-slate-400">
                            Step 3 of 3: Enter your company name and create a Passkey
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleRegister}>
                        <CardContent className="space-y-4">
                            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
                                <Mail className="w-5 h-5 text-green-400 flex-shrink-0" />
                                <span className="text-sm text-green-200">{email}</span>
                            </div>

                            {/* Company Name - Required */}
                            <div className="space-y-2">
                                <Label htmlFor="companyName" className="text-slate-200">Company Name *</Label>
                                <Input
                                    id="companyName"
                                    placeholder="Your Company Name"
                                    value={formData.companyName}
                                    onChange={handleChange}
                                    required
                                    className="bg-slate-950 border-slate-800 text-white"
                                    autoFocus
                                />
                            </div>

                            {/* Optional Details - Collapsible */}
                            <details className="group">
                                <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300 flex items-center gap-2">
                                    <span className="text-xs">▶</span>
                                    <span className="group-open:hidden">Show additional details (optional)</span>
                                    <span className="hidden group-open:inline">Hide additional details</span>
                                </summary>
                                <div className="mt-4 space-y-4 pt-4 border-t border-slate-800">
                                    {/* Country Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-200 flex items-center gap-2">
                                            <Globe className="w-4 h-4" />
                                            Country
                                        </Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setCountry('USA')}
                                                className={`p-3 rounded-lg border transition-all flex items-center justify-center gap-2 ${country === 'USA'
                                                    ? 'border-teal-500 bg-teal-500/20 text-white'
                                                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                                                    }`}
                                            >
                                                <span>🇺🇸</span>
                                                <span className="text-sm">USA</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCountry('BRASIL')}
                                                className={`p-3 rounded-lg border transition-all flex items-center justify-center gap-2 ${country === 'BRASIL'
                                                    ? 'border-teal-500 bg-teal-500/20 text-white'
                                                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                                                    }`}
                                            >
                                                <span>🇧🇷</span>
                                                <span className="text-sm">Brasil</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tax ID */}
                                    <div className="space-y-2">
                                        <Label htmlFor="taxId" className="text-slate-200">
                                            {country === 'BRASIL' ? 'CNPJ' : country === 'USA' ? 'EIN' : 'Tax ID'}
                                        </Label>
                                        <Input
                                            id="taxId"
                                            placeholder={country === 'BRASIL' ? '00.000.000/0000-00' : country === 'USA' ? '00-0000000' : 'Tax identification number'}
                                            value={formData.taxId}
                                            onChange={handleChange}
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>

                                    {/* Legal Representative */}
                                    <div className="space-y-2">
                                        <Label htmlFor="legalRepresentative" className="text-slate-200">Legal Representative</Label>
                                        <Input
                                            id="legalRepresentative"
                                            placeholder="Full name"
                                            value={formData.legalRepresentative}
                                            onChange={handleChange}
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>

                                    {/* Address */}
                                    <div className="space-y-2">
                                        <Label htmlFor="address" className="text-slate-200">Address</Label>
                                        <Input
                                            id="address"
                                            placeholder="Company address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>

                                    {/* Phone */}
                                    <div className="space-y-2">
                                        <Label htmlFor="phone" className="text-slate-200">Phone</Label>
                                        <Input
                                            id="phone"
                                            placeholder="Phone number"
                                            value={formData.phone}
                                            onChange={handleChange}
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>
                                </div>
                            </details>

                            {/* Passkey Disclaimer */}
                            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-3">
                                <div className="flex items-start gap-3">
                                    <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-200/90">
                                        <p className="font-semibold mb-1">What is a Passkey?</p>
                                        <p className="text-amber-200/70 text-xs leading-relaxed">
                                            A Passkey uses your device's biometrics (Face ID, Touch ID, or fingerprint) to secure your company's wallet.
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
                                            <strong>I understand</strong> that this Passkey is the only way to access our company's wallet.
                                            If we lose access to all synced devices, we will not be able to recover the account.
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
                                    ? 'bg-teal-600 hover:bg-teal-500 shadow-teal-900/20'
                                    : 'bg-slate-700 cursor-not-allowed opacity-60'
                                    }`}
                                disabled={isLoading || !passkeyAcknowledged}
                            >
                                {isLoading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating Account...</>
                                ) : (
                                    'Register Company'
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
