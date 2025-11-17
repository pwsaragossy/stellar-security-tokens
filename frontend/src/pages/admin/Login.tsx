import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Loading } from '@/components/ui/loading';
import { autoAuthWithMock, isWebAuthnSupported } from '@/utils/autoAuth';
import { AlertCircle, Fingerprint } from 'lucide-react';

export function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { error: showError, success: showSuccess } = useToast();

  const from = (location.state as any)?.from?.pathname || '/admin/dashboard';

  useEffect(() => {
    // Auto-autenticar ao carregar a página
    if (isWebAuthnSupported()) {
      handleAutoAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAutoAuth = async () => {
    try {
      setLoading(true);
      setStatus('Authenticating with Touch ID...');
      
      const result = await autoAuthWithMock('platform_admin');
      
      if (result.token && result.user) {
        login({
          token: result.token,
          platformAdmin: result.user.admin || result.user.platformAdmin,
          role: 'admin' as const,
        });
        showSuccess('Login successful');
        navigate(from, { replace: true });
      } else {
        showError('Login failed');
      }
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
      showError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Admin Login</CardTitle>
          <CardDescription className="text-center">
            Auto-authentication with Touch ID / Face ID
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Restricted access - administrators only
            </p>
          </div>
          
          {loading ? (
            <>
              <Loading size="lg" />
              <p className="text-sm text-muted-foreground text-center">{status}</p>
            </>
          ) : (
            <>
              <Fingerprint className="h-16 w-16 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                {isWebAuthnSupported()
                  ? 'Touch ID authentication will be requested automatically'
                  : 'Passkey authentication is not supported in this browser'}
              </p>
              {!isWebAuthnSupported() && (
                <p className="text-xs text-muted-foreground text-center">
                  Please use a browser that supports WebAuthn (Chrome, Safari, Edge)
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
