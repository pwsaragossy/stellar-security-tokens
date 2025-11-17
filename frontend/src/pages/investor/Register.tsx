import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { investorsApi } from '@/api/investors';
import { useToast } from '@/contexts/ToastContext';
import { Loading } from '@/components/ui/loading';
import { isValidCPF, isValidEmail, isStrongPassword } from '@/utils/validation';
import { formatCPF } from '@/utils/format';
import { getInvestorDebugData } from '@/utils/debugData';
import { registerPasskey, isWebAuthnSupported } from '@/utils/webauthn';
import { Copy, CheckCircle2, Bug, Fingerprint } from 'lucide-react';

export function InvestorRegister() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    document: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredData, setRegisteredData] = useState<{ stellarPublicKey: string; name: string; userId?: number } | null>(null);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim() || formData.name.trim().length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }

    if (!isValidEmail(formData.email)) {
      newErrors.email = 'Invalid email';
    }

    const cleanedCPF = formData.document.replace(/\D/g, '');
    if (!isValidCPF(cleanedCPF)) {
      newErrors.document = 'Invalid CPF';
    }

    if (!isStrongPassword(formData.password)) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    const formatted = formatCPF(value);
    setFormData({ ...formData, document: formatted });
    if (errors.document) {
      setErrors({ ...errors, document: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const cleanedCPF = formData.document.replace(/\D/g, '');
      const response = await investorsApi.register({
        name: formData.name.trim(),
        email: formData.email.trim(),
        document: cleanedCPF,
        password: formData.password,
      });

      if (response.success && response.data) {
        setRegisteredData({
          stellarPublicKey: response.data.stellar_public_key || '',
          name: response.data.name,
          userId: response.data.id,
        });
        setShowSuccessModal(true);
        showSuccess('Account created successfully');
      } else {
        showError(response.error || 'Error creating account');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Error creating account. Try again.';
      showError(errorMsg);
      
      // Handle specific errors
      if (err.response?.status === 409) {
        if (errorMsg.includes('email')) {
          setErrors({ ...errors, email: 'This email is already in use' });
        } else if (errorMsg.includes('document')) {
          setErrors({ ...errors, document: 'This CPF is already registered' });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccess('Chave copiada para a área de transferência!');
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    navigate('/investor/login');
  };

  const handleDebugFill = () => {
    const debugData = getInvestorDebugData();
    setFormData(debugData);
    setErrors({});
  };

  const handleRegisterPasskey = async () => {
    if (!registeredData?.userId || !formData.email) {
      showError('Missing user information');
      return;
    }

    if (!isWebAuthnSupported()) {
      showError('Passkey authentication is not supported in this browser');
      return;
    }

    try {
      setRegisteringPasskey(true);
      await registerPasskey('investor', formData.email, registeredData.userId, 'Primary Device');
      setPasskeyRegistered(true);
      showSuccess('Passkey registered successfully! You can now login with Touch ID / Face ID.');
    } catch (err: any) {
      showError(err.message || 'Failed to register passkey');
    } finally {
      setRegisteringPasskey(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="max-w-md">
          <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Investor Registration</CardTitle>
          <CardDescription className="text-center">
            Create investor account
          </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4 flex flex-col items-center">
              <Button
                type="button"
                variant="outline"
                onClick={handleDebugFill}
                className="mb-2"
                disabled={loading}
              >
                <Bug className="mr-2 h-4 w-4" />
                Fill Debug Data
              </Button>
              
              <Input
                label="Full Name"
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: '' });
                }}
                placeholder="John Doe"
                error={errors.name}
                required
                disabled={loading}
                className="w-64"
              />

              <Input
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (errors.email) setErrors({ ...errors, email: '' });
                }}
                placeholder="email@example.com"
                error={errors.email}
                required
                disabled={loading}
                className="w-64"
              />

              <Input
                label="CPF"
                type="text"
                value={formData.document}
                onChange={handleDocumentChange}
                placeholder="000.000.000-00"
                maxLength={14}
                error={errors.document}
                required
                disabled={loading}
                className="w-64"
              />

              <div className="relative">
                <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  if (errors.password) setErrors({ ...errors, password: '' });
                }}
                placeholder="Min 6 characters"
                  error={errors.password}
                  required
                  disabled={loading}
                  className="w-64"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-9 text-sm text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <Input
                label="Confirm Password"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData({ ...formData, confirmPassword: e.target.value });
                  if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                }}
                placeholder="Re-enter password"
                error={errors.confirmPassword}
                required
                disabled={loading}
                className="w-64"
              />

              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                  <Loading size="sm" className="mr-2" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
              </Button>

              <div className="text-center text-sm">
                <span className="text-muted-foreground">Already have account? </span>
                <a
                  href="/investor/login"
                  className="text-primary hover:underline font-medium"
                >
                  Login
                </a>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={showSuccessModal}
        onClose={handleCloseModal}
        title="Account Created"
        showCloseButton={false}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-medium">Account created successfully</p>
          </div>

          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">Stellar Public Key:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-background p-2 rounded border break-all">
                  {registeredData?.stellarPublicKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(registeredData?.stellarPublicKey || '')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>Important:</strong> Save your public key securely. 
                Required for investments.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="warning">KYC Status: Pending</Badge>
              <p className="text-xs text-muted-foreground">
                KYC review pending
              </p>
            </div>
          </div>

          {isWebAuthnSupported() && (
            <div className="space-y-2">
              {!passkeyRegistered ? (
                <Button
                  onClick={handleRegisterPasskey}
                  disabled={registeringPasskey}
                  variant="outline"
                >
                  {registeringPasskey ? (
                    <>
                      <Loading size="sm" className="mr-2" />
                      Registering Passkey...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="mr-2 h-4 w-4" />
                      Register Passkey (Touch ID / Face ID)
                    </>
                  )}
                </Button>
              ) : (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Passkey registered successfully
                  </p>
                </div>
              )}
            </div>
          )}

          <Button onClick={handleCloseModal}>
            Go to Login
          </Button>
        </div>
      </Modal>
    </>
  );
}
