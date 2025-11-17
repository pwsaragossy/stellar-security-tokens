import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { companiesApi } from '@/api/companies';
import { useToast } from '@/contexts/ToastContext';
import { Loading } from '@/components/ui/loading';
import { isValidCNPJ, isValidEmail } from '@/utils/validation';
import { formatCNPJ, formatPhone } from '@/utils/format';
import { getCompanyDebugData } from '@/utils/debugData';
import { Bug } from 'lucide-react';

export function CompanyRegister() {
  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    email: '',
    legal_representative: '',
    address: '',
    phone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim() || formData.name.trim().length < 3) {
      newErrors.name = 'Company name must be at least 3 characters';
    }

    const cleanedCNPJ = formData.cnpj.replace(/\D/g, '');
    if (!isValidCNPJ(cleanedCNPJ)) {
      newErrors.cnpj = 'Invalid CNPJ';
    }

    if (!isValidEmail(formData.email)) {
      newErrors.email = 'Invalid email';
    }

    if (!formData.legal_representative.trim()) {
      newErrors.legal_representative = 'Legal representative is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    const formatted = formatCNPJ(value);
    setFormData({ ...formData, cnpj: formatted });
    if (errors.cnpj) {
      setErrors({ ...errors, cnpj: '' });
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    const formatted = formatPhone(value);
    setFormData({ ...formData, phone: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const cleanedCNPJ = formData.cnpj.replace(/\D/g, '');
      const response = await companiesApi.register({
        name: formData.name.trim(),
        cnpj: cleanedCNPJ,
        email: formData.email.trim(),
        legal_representative: formData.legal_representative.trim(),
        address: formData.address.trim() || undefined,
        phone: formData.phone.replace(/\D/g, '') || undefined,
      });

      if (response.success && response.data) {
        showSuccess('Company registered successfully');
        navigate('/company/register-user', { state: { companyId: response.data.id } });
      } else {
        showError(response.error || 'Error registering company');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Error registering company. Try again.';
      showError(errorMsg);
      
      if (err.response?.status === 409) {
        if (errorMsg.includes('cnpj')) {
          setErrors({ ...errors, cnpj: 'This CNPJ is already registered' });
        } else if (errorMsg.includes('email')) {
          setErrors({ ...errors, email: 'This email is already in use' });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDebugFill = () => {
    const debugData = getCompanyDebugData();
    setFormData(debugData);
    setErrors({});
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="max-w-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Register Company</CardTitle>
          <CardDescription className="text-center">
            Register company account
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
            
            <div className="grid gap-4 grid-cols-2">
              <Input
                label="Company Name"
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: '' });
                }}
                placeholder="Company Name LTDA"
                error={errors.name}
                required
                disabled={loading}
                className="w-48"
              />

              <Input
                label="CNPJ"
                type="text"
                value={formData.cnpj}
                onChange={handleCNPJChange}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                error={errors.cnpj}
                required
                disabled={loading}
                className="w-48"
              />
            </div>

            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
              placeholder="contact@company.com"
              error={errors.email}
              required
              disabled={loading}
              className="w-64"
            />

            <Input
              label="Legal Representative"
              type="text"
              value={formData.legal_representative}
              onChange={(e) => {
                setFormData({ ...formData, legal_representative: e.target.value });
                if (errors.legal_representative) setErrors({ ...errors, legal_representative: '' });
              }}
              placeholder="Full name"
              error={errors.legal_representative}
              required
              disabled={loading}
              className="w-64"
            />

            <div className="grid gap-4 grid-cols-2">
              <Input
                label="Address (Optional)"
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full address"
                disabled={loading}
                className="w-48"
              />

              <Input
                label="Phone (Optional)"
                type="text"
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="(00) 00000-0000"
                maxLength={15}
                disabled={loading}
                className="w-48"
              />
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loading size="sm" className="mr-2" />
                  Registering...
                </>
              ) : (
                'Register Company'
              )}
            </Button>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have account? </span>
              <a
                href="/company/login"
                className="text-primary hover:underline font-medium"
              >
                Login
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
