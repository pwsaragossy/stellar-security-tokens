import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { investorApi } from '@/lib/api';
import { UserPlus, Wallet, CheckCircle2, Loader2 } from 'lucide-react';

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
}

export function InvestorOnboarding() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    document: '',
    stellarPublicKey: '',
  });
  const [investorData, setInvestorData] = useState<any>(null);

  const steps: OnboardingStep[] = [
    {
      id: 1,
      title: 'Dados KYC',
      description: 'Preencha seus dados pessoais',
      completed: step > 1,
    },
    {
      id: 2,
      title: 'Carteira Stellar',
      description: 'Conecte ou crie uma carteira',
      completed: step > 2,
    },
    {
      id: 3,
      title: 'Aprovar Trustline',
      description: 'Aprove o token SIN01',
      completed: step > 3,
    },
    {
      id: 4,
      title: 'Comprar Tokens',
      description: 'Faça seu primeiro investimento',
      completed: step > 4,
    },
  ];

  const handleKYCSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await investorApi.register({
        name: formData.name,
        email: formData.email,
        document: formData.document,
      });
      setInvestorData(response.data);
      setFormData({ ...formData, stellarPublicKey: response.data.stellarPublicKey });
      setStep(2);
    } catch (error: any) {
      alert(`Erro ao registrar: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWallet = async () => {
    try {
      const freighter = (window as any).freighterApi;
      if (!freighter) {
        alert('Freighter não está instalado. Por favor, instale a extensão Freighter.');
        return;
      }

      const isConnected = await freighter.isConnected();
      if (!isConnected) {
        await freighter.connect();
      }

      const publicKey = await freighter.getPublicKey();
      setFormData({ ...formData, stellarPublicKey: publicKey });
      setStep(3);
    } catch (error: any) {
      alert(`Erro ao conectar carteira: ${error.message}`);
    }
  };

  const handleApproveTrustline = async () => {
    try {
      setLoading(true);
      if (!investorData?.id) {
        alert('Investidor não registrado');
        return;
      }

      await investorApi.whitelist(investorData.id);
      setStep(4);
    } catch (error: any) {
      alert(`Erro ao aprovar trustline: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseTokens = async () => {
    try {
      setLoading(true);
      const amount = prompt('Digite o valor em USDC que deseja investir:');
      if (!amount || parseFloat(amount) <= 0) {
        return;
      }

      // TODO: Implementar compra real com Freighter
      alert('Funcionalidade de compra será implementada com assinatura via Freighter');
    } catch (error: any) {
      alert(`Erro ao comprar tokens: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          <CardTitle>Onboarding de Investidor</CardTitle>
        </div>
        <CardDescription>
          Complete o processo de cadastro e comece a investir
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Steps */}
        <div className="flex justify-between items-center">
          {steps.map((s, index) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                    s.completed
                      ? 'bg-primary text-primary-foreground border-primary'
                      : step === s.id
                      ? 'border-primary bg-background'
                      : 'border-muted bg-background'
                  }`}
                >
                  {s.completed ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span>{s.id}</span>
                  )}
                </div>
                <p className="text-xs mt-2 text-center max-w-[100px]">{s.title}</p>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 ${
                    s.completed ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {step === 1 && (
            <form onSubmit={handleKYCSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-2">
                  Nome Completo
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              <div>
                <label htmlFor="document" className="block text-sm font-medium mb-2">
                  CPF/CNPJ
                </label>
                <input
                  id="document"
                  type="text"
                  required
                  value={formData.document}
                  onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                  className="px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  'Próximo: Conectar Carteira'
                )}
              </Button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm mb-2">
                  <strong>Carteira criada:</strong> {formData.stellarPublicKey || 'Não disponível'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Uma nova carteira Stellar foi criada para você. Guarde suas chaves com segurança.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Conectar com Freighter Wallet</p>
                <p className="text-xs text-muted-foreground">
                  Se você já tem uma carteira Freighter, conecte-a para usar suas próprias chaves.
                </p>
                <Button
                  onClick={handleConnectWallet}
                  variant="outline"
                  className=""
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Conectar Freighter Wallet
                </Button>
              </div>

              <Button onClick={() => setStep(3)}>
                Continuar sem Freighter
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm mb-2">
                  <strong>Carteira:</strong> {formData.stellarPublicKey}
                </p>
                <p className="text-xs text-muted-foreground">
                  Para receber tokens SIN01, você precisa aprovar a trustline.
                </p>
              </div>

              <Button
                onClick={handleApproveTrustline}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Aprovando...
                  </>
                ) : (
                  'Aprovar Trustline SIN01'
                )}
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                  ✓ Onboarding Completo!
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  Você está pronto para investir em tokens SIN01.
                </p>
              </div>

              <Button
                onClick={handlePurchaseTokens}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  'Comprar Tokens SIN01'
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

