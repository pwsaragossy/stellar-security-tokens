import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/api/client';
import { CheckCircle2, XCircle, Fingerprint } from 'lucide-react';
import { isPasskeySupported, createCompanyUserPasskeyWallet } from '@/utils/passkeyWallet';

type VerificationState = 'verifying' | 'success' | 'error' | 'creating_wallet' | 'wallet_created';

export function CompanyVerifyEmail() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<VerificationState>('verifying');
  const [error, setError] = useState<string>('');
  const [userData, setUserData] = useState<{
    id: number;
    name: string;
    email: string;
  } | null>(null);
  const [contractId, setContractId] = useState<string>('');

  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();

  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else {
      setState('error');
      setError('Verification token not found in URL');
    }
  }, [token]);

  const verifyEmail = async (verificationToken: string) => {
    try {
      setState('verifying');
      const response = await api.post('/company-users/verify-email', {
        token: verificationToken,
      });

      if (response.data.success) {
        setUserData({
          id: response.data.data.id,
          name: response.data.data.name,
          email: response.data.data.email,
        });
        setState('success');
        showSuccess('Email verified successfully!');
      } else {
        setState('error');
        setError(response.data.error || 'Email verification failed');
      }
    } catch (err: any) {
      setState('error');
      setError(err.response?.data?.error || err.message || 'Email verification failed');
      showError(err.response?.data?.error || 'Email verification failed');
    }
  };

  const handleCreateWallet = async () => {
    if (!userData || !isPasskeySupported()) {
      showError('Cannot create wallet - missing data or unsupported browser');
      return;
    }

    try {
      setState('creating_wallet');

      const result = await createCompanyUserPasskeyWallet(
        userData.id,
        userData.email,
        userData.name
      );

      setContractId(result.contractId);
      setState('wallet_created');
      showSuccess('Wallet created successfully!');
    } catch (err: any) {
      setState('success'); // Go back to success state to allow retry
      showError(err.message || 'Failed to create wallet');
    }
  };

  const handleGoToLogin = () => {
    navigate('/company/login');
  };

  const handleGoToDashboard = () => {
    navigate('/company/dashboard');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {state === 'verifying' && 'Verifying Email...'}
            {state === 'success' && 'Email Verified!'}
            {state === 'error' && 'Verification Failed'}
            {state === 'creating_wallet' && 'Creating Wallet...'}
            {state === 'wallet_created' && 'Wallet Created!'}
          </CardTitle>
          <CardDescription className="text-center">
            {state === 'verifying' && 'Please wait while we verify your email address'}
            {state === 'success' && 'Your email has been verified. Create your passkey wallet.'}
            {state === 'error' && 'There was a problem verifying your email'}
            {state === 'creating_wallet' && 'Creating your Stellar smart wallet with passkey...'}
            {state === 'wallet_created' && 'Your wallet is ready to use!'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col items-center space-y-4">
          {state === 'verifying' && (
            <Loading size="lg" />
          )}

          {state === 'success' && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <p className="text-sm text-center text-muted-foreground">
                {userData?.name}, your email has been verified.
              </p>

              {isPasskeySupported() ? (
                <div className="w-full space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Next step:</strong> Create your passkey wallet to manage your company's tokens.
                      This uses your device's biometric authentication (Face ID / Touch ID).
                    </p>
                  </div>

                  <Button onClick={handleCreateWallet} className="w-full" size="lg">
                    <Fingerprint className="mr-2 h-5 w-5" />
                    Create Passkey Wallet
                  </Button>
                </div>
              ) : (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Your browser does not support passkey authentication.
                    Please use Chrome, Safari, or Edge on a device with biometric support.
                  </p>
                </div>
              )}
            </>
          )}

          {state === 'error' && (
            <>
              <XCircle className="h-16 w-16 text-red-500" />
              <p className="text-sm text-center text-destructive">
                {error}
              </p>
              <Button onClick={handleGoToLogin} variant="outline">
                Go to Login
              </Button>
            </>
          )}

          {state === 'creating_wallet' && (
            <>
              <Loading size="lg" />
              <p className="text-sm text-center text-muted-foreground">
                Please complete the biometric authentication on your device...
              </p>
            </>
          )}

          {state === 'wallet_created' && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              
              <div className="w-full space-y-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                    Your wallet address:
                  </p>
                  <code className="block text-xs bg-background p-2 rounded border break-all">
                    {contractId}
                  </code>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Important:</strong> Your wallet is secured by your device's biometrics.
                    No password or seed phrase needed!
                  </p>
                </div>

                <Button onClick={handleGoToDashboard} className="w-full" size="lg">
                  Go to Dashboard
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


