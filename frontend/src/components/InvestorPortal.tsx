import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { investorApi } from '@/lib/api';
import { connectFreighter, checkFreighterInstalled } from '@/lib/freighter';
import { Wallet, LogOut, TrendingUp, History, DollarSign } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function InvestorPortal() {
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string>('');
  const [investorData, setInvestorData] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (checkFreighterInstalled()) {
      try {
        const pk = await connectFreighter();
        setPublicKey(pk);
        setConnected(true);
        await loadInvestorData(pk);
      } catch (error) {
        console.error('Not connected to Freighter');
      }
    }
  };

  const loadInvestorData = async (stellarPublicKey: string) => {
    try {
      setLoading(true);
      const investors = await investorApi.getAll();
      const investor = investors.data?.find((inv: any) => 
        inv.stellar_public_key === stellarPublicKey
      );

      if (investor) {
        setInvestorData(investor);
        const balanceRes = await investorApi.getBalance(investor.id);
        setBalance(balanceRes.data);
        
        const paymentsRes = await investorApi.getPayments(investor.id);
        setPayments(paymentsRes.data?.payments || []);
      }
    } catch (error) {
      console.error('Error loading investor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const pk = await connectFreighter();
      setPublicKey(pk);
      setConnected(true);
      await loadInvestorData(pk);
    } catch (error: any) {
      alert(`Erro ao conectar: ${error.message}`);
    }
  };

  const handleDisconnect = () => {
    setConnected(false);
    setPublicKey('');
    setInvestorData(null);
    setBalance(null);
    setPayments([]);
  };

  const handleSellTokens = async () => {
    if (!connected || !investorData) {
      alert('Conecte sua carteira primeiro');
      return;
    }

    const amount = prompt('Quantos tokens SIN01 você deseja vender?');
    if (!amount || parseFloat(amount) <= 0) {
      return;
    }

    // TODO: Implementar venda no mercado secundário
    alert('Funcionalidade de venda será implementada com assinatura via Freighter');
  };

  const chartData = payments.slice(0, 12).reverse().map((payment) => ({
    date: new Date(payment.payment_date).toLocaleDateString('pt-BR', { month: 'short' }),
    amount: parseFloat(payment.usdc_amount || 0),
  }));

  if (!connected) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            <CardTitle>Portal do Investidor</CardTitle>
          </div>
          <CardDescription>
            Conecte sua carteira Freighter para acessar seu dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!checkFreighterInstalled() ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Você precisa instalar a extensão Freighter Wallet para continuar.
              </p>
              <Button
                onClick={() => window.open('https://freighter.app', '_blank')}
                className=""
              >
                Instalar Freighter Wallet
              </Button>
            </div>
          ) : (
            <Button onClick={handleConnect}>
              <Wallet className="mr-2 h-4 w-4" />
              Conectar Freighter Wallet
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Portal do Investidor</CardTitle>
              <CardDescription>
                {investorData?.name || 'Investidor'} - {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleDisconnect}>
              <LogOut className="mr-2 h-4 w-4" />
              Desconectar
            </Button>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p>Carregando dados...</p>
        </div>
      ) : (
        <>
          {/* Balance Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo de Tokens</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {balance?.balance?.balance || '0'} SIN01
                </div>
                <p className="text-xs text-muted-foreground">
                  {balance?.summary?.totalTokensReceived || '0'} tokens recebidos no total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Juros Recebidos</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {balance?.summary?.totalInterestReceived?.toFixed(2) || '0.00'} USDC
                </div>
                <p className="text-xs text-muted-foreground">
                  {balance?.summary?.interestPaymentCount || 0} pagamentos recebidos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Distribuições</CardTitle>
                <History className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {balance?.summary?.distributionCount || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Investimentos realizados
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Pagamentos de Juros</CardTitle>
                <CardDescription>Últimos 12 pagamentos mensais</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#8884d8" 
                      name="Juros (USDC)" 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Payment History */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Pagamentos</CardTitle>
              <CardDescription>Últimos pagamentos de juros recebidos</CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum pagamento registrado ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {payments.slice(0, 10).map((payment, index) => (
                    <div
                      key={payment.id || index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {new Date(payment.payment_date).toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {payment.transaction_hash?.slice(0, 16)}...
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">
                          +{payment.usdc_amount} USDC
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {payment.email_sent ? 'Email enviado' : 'Pendente'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sell Tokens */}
          <Card>
            <CardHeader>
              <CardTitle>Mercado Secundário</CardTitle>
              <CardDescription>Venda seus tokens SIN01</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleSellTokens} variant="outline">
                Vender Tokens SIN01
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                * Funcionalidade de mercado secundário em desenvolvimento
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

