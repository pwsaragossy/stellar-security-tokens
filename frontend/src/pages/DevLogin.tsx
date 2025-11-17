import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Loading } from '@/components/ui/loading';
import { devLoginMock } from '@/utils/devLogin';
import { User, Building2, Shield } from 'lucide-react';

type AccountType = 'investor' | 'company_user' | 'platform_admin';

const ACCOUNT_CONFIG = {
  investor: {
    title: 'Investor Portal',
    description: 'Portfolio management, investments, interest payments',
    icon: User,
    color: 'blue',
    redirectPath: '/investor/dashboard',
  },
  company_user: {
    title: 'Company Portal',
    description: 'Create offers, manage tokens, track investments',
    icon: Building2,
    color: 'purple',
    redirectPath: '/company/dashboard',
  },
  platform_admin: {
    title: 'Admin Portal',
    description: 'Platform management, offer review, payment processing',
    icon: Shield,
    color: 'red',
    redirectPath: '/admin/dashboard',
  },
};

export function DevLogin() {
  const [loading, setLoading] = useState<AccountType | null>(null);
  const [status, setStatus] = useState<string>('');
  const navigate = useNavigate();
  const { login } = useAuth();
  const { error: showError, success: showSuccess } = useToast();

  const handleLogin = async (accountType: AccountType) => {
    try {
      setLoading(accountType);
      setStatus(`Logging in to ${ACCOUNT_CONFIG[accountType].title}...`);

      const result = await devLoginMock(accountType);

      if (result.token && result.user) {
        // O backend retorna: { token, investor/company/admin, role }
        const loginData: any = {
          token: result.token,
          role: result.user.role as 'investor' | 'company' | 'admin',
        };

        // Adicionar dados do usuário baseado no tipo
        if (result.user.investor) {
          loginData.investor = result.user.investor;
        } else if (result.user.company) {
          loginData.company = result.user.company;
        } else if (result.user.admin) {
          loginData.platformAdmin = result.user.admin;
        }

        login(loginData);
        showSuccess(`Logged in as ${ACCOUNT_CONFIG[accountType].title}`);
        navigate(ACCOUNT_CONFIG[accountType].redirectPath, { replace: true });
      } else {
        showError('Login failed: Invalid response');
      }
    } catch (err: any) {
      console.error('[DevLogin] Error:', err);
      const errorMessage = err.message || err.response?.data?.error || 'Authentication failed';
      setStatus(`Error: ${errorMessage}`);
      showError(errorMessage);
    } finally {
      setLoading(null);
      setStatus('');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Stellar Security Tokens</h1>
          <p className="text-muted-foreground">Dev Environment - Quick Access</p>
        </div>

        {loading ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loading size="lg" />
              <p className="text-sm text-muted-foreground text-center">{status}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {Object.entries(ACCOUNT_CONFIG).map(([type, config]) => {
              const accountType = type as AccountType;
              const Icon = config.icon;

              return (
                <Card key={type} className="text-center hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div
                      className={`mx-auto mb-4 p-4 rounded-full w-fit ${
                        config.color === 'blue'
                          ? 'bg-blue-100 dark:bg-blue-900/20'
                          : config.color === 'purple'
                          ? 'bg-purple-100 dark:bg-purple-900/20'
                          : 'bg-red-100 dark:bg-red-900/20'
                      }`}
                    >
                      <Icon
                        className={`h-10 w-10 ${
                          config.color === 'blue'
                            ? 'text-blue-600 dark:text-blue-400'
                            : config.color === 'purple'
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      />
                    </div>
                    <CardTitle className="text-xl">{config.title}</CardTitle>
                    <CardDescription className="mt-2">{config.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => handleLogin(accountType)}
                      disabled={!!loading}
                      size="lg"
                    >
                      Login
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
