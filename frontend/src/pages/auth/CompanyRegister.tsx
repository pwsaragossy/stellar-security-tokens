import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passkeyClient } from '@/lib/passkey';
import { api } from '@/lib/api';
import { Building2, Globe, ShieldAlert } from 'lucide-react';

type Country = 'USA' | 'BRASIL';

export function CompanyRegister() {
    const [country, setCountry] = useState<Country | null>(null);
    const [formData, setFormData] = useState({
        companyName: '',
        email: '',
        legalRepresentative: '',
        taxId: '', // CNPJ for Brasil, EIN for USA
        address: '',
        phone: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [passkeyAcknowledged, setPasskeyAcknowledged] = useState(false);
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
        setIsLoading(true);
        setError('');

        try {
            if (!country) {
                throw new Error('Please select a country');
            }

            // Validate tax ID format
            const cleanTaxId = formData.taxId.replace(/\D/g, '');
            if (country === 'BRASIL' && cleanTaxId.length !== 14) {
                throw new Error('CNPJ must have 14 digits');
            }
            if (country === 'USA' && cleanTaxId.length !== 9) {
                throw new Error('EIN must have 9 digits');
            }

            // 1. Create Passkey AND Deploy Smart Wallet (Client-side via Launchtube)
            const { credentialId, publicKey, contractId } = await passkeyClient.register(formData.companyName);

            // 2. Send to Backend (register company with passkey)
            const response = await api.post('/companies/register', {
                name: formData.companyName,
                email: formData.email,
                legal_representative: formData.legalRepresentative,
                country,
                tax_id: cleanTaxId,
                tax_id_type: country === 'BRASIL' ? 'CNPJ' : 'EIN',
                address: formData.address || undefined,
                phone: formData.phone || undefined,
                credentialId,
                publicKey,
                contractId,
            });

            if (!response.success) {
                throw new Error(response.error || 'Registration failed');
            }

            // Redirect to pending approval page (not dashboard)
            navigate('/company/pending-approval');

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to register');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-lg space-y-8 relative">
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

                <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-white">Company Account</CardTitle>
                        <CardDescription className="text-slate-400">
                            Fill in your company details to create an account. After registration, your account will be reviewed by our team.
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleRegister}>
                        <CardContent className="space-y-4">
                            {/* Country Selection */}
                            <div className="space-y-2">
                                <Label className="text-slate-200 flex items-center gap-2">
                                    <Globe className="w-4 h-4" />
                                    Country *
                                </Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setCountry('USA')}
                                        className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${country === 'USA'
                                            ? 'border-teal-500 bg-teal-500/20 text-white'
                                            : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                                            }`}
                                    >
                                        <span className="text-2xl">🇺🇸</span>
                                        <span className="font-medium">United States</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCountry('BRASIL')}
                                        className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${country === 'BRASIL'
                                            ? 'border-teal-500 bg-teal-500/20 text-white'
                                            : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                                            }`}
                                    >
                                        <span className="text-2xl">🇧🇷</span>
                                        <span className="font-medium">Brasil</span>
                                    </button>
                                </div>
                            </div>

                            {/* Only show other fields after country is selected */}
                            {country && (
                                <>
                                    {/* Company Name */}
                                    <div className="space-y-2">
                                        <Label htmlFor="companyName" className="text-slate-200">Company Name *</Label>
                                        <Input
                                            id="companyName"
                                            placeholder={country === 'BRASIL' ? 'Empresa ABC Ltda' : 'ABC Construction Inc.'}
                                            value={formData.companyName}
                                            onChange={handleChange}
                                            required
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>

                                    {/* Tax ID */}
                                    <div className="space-y-2">
                                        <Label htmlFor="taxId" className="text-slate-200">
                                            {country === 'BRASIL' ? 'CNPJ *' : 'EIN (Employer Identification Number) *'}
                                        </Label>
                                        <Input
                                            id="taxId"
                                            placeholder={country === 'BRASIL' ? '00.000.000/0000-00' : '00-0000000'}
                                            value={formData.taxId}
                                            onChange={handleChange}
                                            required
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                        <p className="text-xs text-slate-500">
                                            {country === 'BRASIL'
                                                ? 'Cadastro Nacional da Pessoa Jurídica (14 digits)'
                                                : 'Federal tax identification number (9 digits)'}
                                        </p>
                                    </div>

                                    {/* Email */}
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-slate-200">Corporate Email *</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="contact@company.com"
                                            value={formData.email}
                                            onChange={handleChange}
                                            required
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>

                                    {/* Legal Representative */}
                                    <div className="space-y-2">
                                        <Label htmlFor="legalRepresentative" className="text-slate-200">Legal Representative *</Label>
                                        <Input
                                            id="legalRepresentative"
                                            placeholder="Full name of the legal representative"
                                            value={formData.legalRepresentative}
                                            onChange={handleChange}
                                            required
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>

                                    {/* Address (optional) */}
                                    <div className="space-y-2">
                                        <Label htmlFor="address" className="text-slate-200">Address</Label>
                                        <Input
                                            id="address"
                                            placeholder="Company address (optional)"
                                            value={formData.address}
                                            onChange={handleChange}
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>

                                    {/* Phone (optional) */}
                                    <div className="space-y-2">
                                        <Label htmlFor="phone" className="text-slate-200">Phone</Label>
                                        <Input
                                            id="phone"
                                            placeholder={country === 'USA' ? '+1 (000) 000-0000' : '(00) 00000-0000'}
                                            value={formData.phone}
                                            onChange={handleChange}
                                            className="bg-slate-950 border-slate-800 text-white"
                                        />
                                    </div>

                                    {error && (
                                        <div className="text-sm text-red-400 bg-red-900/20 p-2 rounded">
                                            {error}
                                        </div>
                                    )}

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
                                </>
                            )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-4">
                            <Button
                                type="submit"
                                className={`w-full text-white font-semibold shadow-lg transition-all ${passkeyAcknowledged && country
                                        ? 'bg-teal-600 hover:bg-teal-500 shadow-teal-900/20'
                                        : 'bg-slate-700 cursor-not-allowed opacity-60'
                                    }`}
                                disabled={isLoading || !country || !passkeyAcknowledged}
                            >
                                {isLoading ? 'Creating Account...' : 'Register Company'}
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
