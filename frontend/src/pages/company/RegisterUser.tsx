import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { companyUsersApi } from '@/api/companyUsers';
import { useToast } from '@/contexts/ToastContext';
import { Loading } from '@/components/ui/loading';
import { isValidEmail, isStrongPassword } from '@/utils/validation';
import { getCompanyUserDebugData } from '@/utils/debugData';
import { registerPasskey, isWebAuthnSupported } from '@/utils/webauthn';
import { Bug, Fingerprint, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

export function CompanyRegisterUser() {
  const location = useLocation();
  const companyId = (location.state as any)?.companyId;
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    role: 'user' as 'user' | 'admin',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredUserId, setRegisteredUserId] = useState<number | null>(null);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();

  useEffect(() => {
    if (!companyId) {
      navigate('/company/register');
    }
  }, [companyId, navigate]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!isValidEmail(formData.email)) {
      newErrors.email = 'Invalid email';
    }

    if (!isStrongPassword(formData.password)) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.name.trim() || formData.name.trim().length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !companyId) {
      return;
    }

    try {
      setLoading(true);
      const response = await companyUsersApi.register({
        company_id: companyId,
        email: formData.email.trim(),
        name: formData.name.trim(),
        password: formData.password,
        role: formData.role,
      });

      if (response.success && response.data) {
        setRegisteredUserId(response.data.id);
        setShowSuccessModal(true);
        showSuccess('User created successfully');
      } else {
        showError(response.error || 'Error creating user');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Error creating user. Try again.';
      showError(errorMsg);
      
      if (err.response?.status === 409) {
        setErrors({ ...errors, email: 'This email is already in use' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDebugFill = () => {
    const debugData = getCompanyUserDebugData();
    setFormData(debugData);
    setErrors({});
  };

  const handleRegisterPasskey = async () => {
    if (!registeredUserId || !formData.email) {
      showError('Missing user information');
      return;
    }

    if (!isWebAuthnSupported()) {
      showError('Passkey authentication is not supported in this browser');
      return;
    }

    try {
      setRegisteringPasskey(true);
      await registerPasskey('company_user', formData.email, registeredUserId, 'Primary Device');
      setPasskeyRegistered(true);
      showSuccess('Passkey registered successfully! You can now login with Touch ID / Face ID.');
    } catch (err: any) {
      showError(err.message || 'Failed to register passkey');
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    navigate('/company/login');
  };

  if (!companyId) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create Company User</CardTitle>
          <CardDescription className="text-center">
            Create first user for company portal access
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
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
              placeholder="user@company.com"
              error={errors.email}
              required
              disabled={loading}
              className="w-64"
            />

            <Input
              label="Full Name"
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
              placeholder="Full name"
              error={errors.name}
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

            <Select
              value={formData.role}
              onValueChange={(value: string) => setFormData({ ...formData, role: value as 'user' | 'admin' })}
              disabled={loading}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loading size="sm" className="mr-2" />
                  Creating user...
                </>
              ) : (
                'Create User'
              )}
            </Button>

            <div className="text-center text-sm">
              <a
                href="/company/register"
                className="text-primary hover:underline font-medium"
              >
                Back to company registration
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>

      <Modal
        isOpen={showSuccessModal}
        onClose={handleCloseModal}
        title="User Created"
        showCloseButton={false}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-medium">User created successfully</p>
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

