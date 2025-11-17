import { useEffect, useState } from 'react';
import { InvestorLayout } from '@/components/layout/InvestorLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Coins, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { investorsApi } from '@/api/investors';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Skeleton } from '@/components/ui/loading';
import { formatCurrency } from '@/utils/format';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function InvestorDashboard() {
  const { user } = useAuth();
  const { error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalOffersInvested: 0,
    totalInvested: 0,
    totalInterestReceived: 0,
    totalPayments: 0,
  });
  const [recentOffers, setRecentOffers] = useState<any[]>([]);
  const [recentInvestments, setRecentInvestments] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!user?.investor?.id) return;

    try {
      setLoading(true);
      const [metricsRes, portfolioRes] = await Promise.all([
        investorsApi.getMetrics(user.investor.id),
        investorsApi.getPortfolio(user.investor.id),
      ]);

      if (metricsRes.success && metricsRes.data) {
        setMetrics({
          totalOffersInvested: metricsRes.data.totalOffersInvested || 0,
          totalInvested: parseFloat(metricsRes.data.totalInvested || '0'),
          totalInterestReceived: parseFloat(metricsRes.data.totalInterestReceived || '0'),
          totalPayments: metricsRes.data.totalPayments || 0,
        });
      }

      if (portfolioRes.success && portfolioRes.data) {
        setRecentOffers((portfolioRes.data.offers || []).slice(0, 3));
      }

      // Mock recent investments for now
      setRecentInvestments([]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      showError('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <InvestorLayout>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </InvestorLayout>
    );
  }

  return (
    <InvestorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu portfólio de investimentos</p>
        </div>

        {/* Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ofertas Investidas</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalOffersInvested}</div>
              <p className="text-xs text-muted-foreground">
                <Link to="/investor/portfolio" className="hover:underline">
                  Ver portfólio
                </Link>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Investido</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.totalInvested)}</div>
              <p className="text-xs text-muted-foreground">Em tokens RWA</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Juros Recebidos</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(metrics.totalInterestReceived)}
              </div>
              <p className="text-xs text-muted-foreground">
                <Link to="/investor/payments" className="hover:underline">
                  Ver histórico
                </Link>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pagamentos Recebidos</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalPayments}</div>
              <p className="text-xs text-muted-foreground">Total de pagamentos</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Offers */}
        {recentOffers.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Suas Ofertas Investidas</CardTitle>
                  <CardDescription>Últimas ofertas em que você investiu</CardDescription>
                </div>
                <Link to="/investor/portfolio">
                  <Button variant="outline">Ver todas</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentOffers.map((offer) => (
                  <div
                    key={offer.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <h3 className="font-semibold">{offer.offer_name || offer.asset_code}</h3>
                      <p className="text-sm text-muted-foreground">
                        Asset: {offer.asset_code}
                      </p>
                    </div>
                    <Link to={`/investor/balance/${offer.asset_code}`}>
                      <Button variant="outline" size="sm">Ver Detalhes</Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Investments */}
        {recentInvestments.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Investimentos Recentes</CardTitle>
                  <CardDescription>Últimos investimentos realizados</CardDescription>
                </div>
                <Link to="/investor/investments">
                  <Button variant="outline">Ver todos</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentInvestments.map((investment) => (
                  <div
                    key={investment.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{investment.asset_code}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(investment.usdc_amount)}
                      </p>
                    </div>
                    <Link to={`/investor/investments/${investment.id}/status`}>
                      <Button variant="outline" size="sm">Ver Status</Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty States */}
        {recentOffers.length === 0 && recentInvestments.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">Você ainda não possui investimentos</p>
                <Link to="/investor/offers">
                  <Button>Explorar Ofertas</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </InvestorLayout>
  );
}
