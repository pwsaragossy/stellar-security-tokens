import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { investorApi } from '@/lib/api';
import { CheckCircle2, XCircle, Clock, Eye } from 'lucide-react';

interface Investor {
  id: number;
  name: string;
  email: string;
  document: string;
  stellar_public_key: string | null;
  kyc_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export function Investors() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);
  const [balance, setBalance] = useState<any>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    loadInvestors();
  }, []);

  const loadInvestors = async () => {
    try {
      setLoading(true);
      const response = await investorApi.getAll();
      setInvestors(response.data || []);
    } catch (error) {
      console.error('Error loading investors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWhitelist = async (investorId: number) => {
    try {
      await investorApi.whitelist(investorId);
      await loadInvestors();
      alert('Investidor aprovado com sucesso!');
    } catch (error: any) {
      alert(`Erro ao aprovar investidor: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleViewBalance = async (investor: Investor) => {
    if (!investor.stellar_public_key) {
      alert('Investidor não possui chave Stellar configurada');
      return;
    }

    try {
      setLoadingBalance(true);
      setSelectedInvestor(investor);
      const response = await investorApi.getBalance(investor.id);
      setBalance(response.data);
    } catch (error: any) {
      alert(`Erro ao carregar saldo: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoadingBalance(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Aprovado';
      case 'rejected':
        return 'Rejeitado';
      default:
        return 'Pendente';
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Investidores</h1>
        <p className="text-muted-foreground">Gerenciar investidores e status KYC</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Lista de Investidores</CardTitle>
            <CardDescription>{investors.length} investidores cadastrados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {investors.map((investor) => (
                <div
                  key={investor.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(investor.kyc_status)}
                    <div>
                      <h3 className="font-semibold">{investor.name}</h3>
                      <p className="text-sm text-muted-foreground">{investor.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Status: {getStatusLabel(investor.kyc_status)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewBalance(investor)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Saldo
                    </Button>
                    {investor.kyc_status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => handleWhitelist(investor.id)}
                      >
                        Aprovar Whitelist
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {selectedInvestor && balance && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Saldo - {selectedInvestor.name}</CardTitle>
              <CardDescription>Informações de saldo e histórico</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingBalance ? (
                <div>Carregando...</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Saldo de Tokens</h3>
                    <p className="text-2xl font-bold">{balance.balance?.balance || '0'} SIN01</p>
                    <p className="text-sm text-muted-foreground">
                      Autorizado: {balance.balance?.isAuthorized ? 'Sim' : 'Não'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Resumo</h3>
                    <ul className="space-y-1 text-sm">
                      <li>Total de Tokens Recebidos: {balance.summary?.totalTokensReceived || '0'}</li>
                      <li>Total de Juros Recebidos: {balance.summary?.totalInterestReceived || '0'} USDC</li>
                      <li>Distribuições: {balance.summary?.distributionCount || 0}</li>
                      <li>Pagamentos de Juros: {balance.summary?.interestPaymentCount || 0}</li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

