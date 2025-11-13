import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { investorApi, tokenApi } from '@/lib/api';
import { Coins, Users, Calendar, Wallet } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function Overview() {
  const [stats, setStats] = useState({
    totalTokens: 0,
    totalInvestors: 0,
    nextPayment: null as string | null,
    treasuryBalance: '0',
  });
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tokensRes, investorsRes] = await Promise.all([
        tokenApi.getAll(),
        investorApi.getAll(),
      ]);

      const totalTokens = tokensRes.data?.reduce((sum: number, token: any) => 
        sum + parseFloat(token.total_supply || 0), 0) || 0;
      
      const totalInvestors = investorsRes.data?.length || 0;

      const nextPaymentDate = new Date();
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      nextPaymentDate.setDate(1);

      setStats({
        totalTokens,
        totalInvestors,
        nextPayment: nextPaymentDate.toLocaleDateString('pt-BR'),
        treasuryBalance: '0', // TODO: Fetch from Stellar
      });

      // Mock chart data
      setChartData([
        { month: 'Jan', tokens: 1000000, investors: 10 },
        { month: 'Fev', tokens: 2000000, investors: 25 },
        { month: 'Mar', tokens: 3500000, investors: 45 },
        { month: 'Abr', tokens: 5000000, investors: 60 },
        { month: 'Mai', tokens: 7500000, investors: 80 },
        { month: 'Jun', tokens: 10000000, investors: 100 },
      ]);
    } catch (error) {
      console.error('Error loading overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Overview</h1>
        <p className="text-muted-foreground">Visão geral do sistema de tokenização</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tokens</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTokens.toLocaleString('pt-BR')}</div>
            <p className="text-xs text-muted-foreground">SIN01 emitidos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Investidores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInvestors}</div>
            <p className="text-xs text-muted-foreground">Investidores cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximo Pagamento</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.nextPayment || 'N/A'}</div>
            <p className="text-xs text-muted-foreground">Pagamento de juros mensal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Treasury</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.treasuryBalance} USDC</div>
            <p className="text-xs text-muted-foreground">Conta distribuidora</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução de Tokens</CardTitle>
            <CardDescription>Total de tokens emitidos ao longo do tempo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="tokens" stroke="#8884d8" name="Tokens" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolução de Investidores</CardTitle>
            <CardDescription>Número de investidores ao longo do tempo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="investors" fill="#82ca9d" name="Investidores" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

