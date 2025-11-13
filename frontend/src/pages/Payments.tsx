import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { investorApi } from '@/lib/api';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface Payment {
  id: number;
  investor_id: number;
  asset_code: string;
  token_balance: string;
  interest_amount: string;
  usdc_amount: string;
  transaction_hash: string;
  payment_date: string;
  status: string;
  email_sent: boolean;
}

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const investors = await investorApi.getAll();
      const allPayments: Payment[] = [];
      
      for (const investor of investors.data || []) {
        try {
          const response = await investorApi.getPayments(investor.id);
          if (response.data?.payments) {
            allPayments.push(...response.data.payments);
          }
        } catch (error) {
          console.error(`Error loading payments for investor ${investor.id}:`, error);
        }
      }
      
      setPayments(allPayments.sort((a, b) => 
        new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
      ));
    } catch (error) {
      console.error('Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    try {
      const investors = await investorApi.getAll();
      const approvedInvestors = investors.data?.filter((inv: any) => 
        inv.kyc_status === 'approved' && inv.stellar_public_key
      ) || [];

      const previewData = {
        totalInvestors: approvedInvestors.length,
        estimatedPayments: approvedInvestors.length,
        estimatedTotalUSDC: 0, // Would need to calculate based on balances
      };

      setPreview(previewData);
    } catch (error) {
      console.error('Error generating preview:', error);
    }
  };

  const handleProcessMonthly = async () => {
    if (!confirm('Tem certeza que deseja executar o pagamento mensal de juros?')) {
      return;
    }

    try {
      setProcessing(true);
      // Note: This endpoint needs to be created in the backend
      // For now, we'll show an alert
      alert('Funcionalidade de pagamento mensal será implementada no backend. Use o serviço PaymentService.processMonthlyInterestPayments()');
      
      // Uncomment when backend endpoint is ready:
      // const response = await paymentApi.processMonthly();
      // alert(`Pagamento processado com sucesso! ${response.data.paymentsProcessed} pagamentos realizados.`);
      // await loadPayments();
    } catch (error: any) {
      alert(`Erro ao processar pagamento: ${error.response?.data?.error || error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pagamentos</h1>
        <p className="text-muted-foreground">Gerenciar pagamentos de juros mensais</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Executar Pagamento Mensal</CardTitle>
            <CardDescription>Processar pagamento de juros para todos os investidores</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={handlePreview} variant="outline">
                Preview
              </Button>
              <Button onClick={handleProcessMonthly} disabled={processing}>
                {processing ? 'Processando...' : 'Executar Pagamento Mensal'}
              </Button>
            </div>
            {preview && (
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">Preview do Pagamento</h3>
                <ul className="text-sm space-y-1">
                  <li>Investidores elegíveis: {preview.totalInvestors}</li>
                  <li>Pagamentos estimados: {preview.estimatedPayments}</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estatísticas</CardTitle>
            <CardDescription>Resumo de pagamentos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Total de Pagamentos:</span>
                <span className="font-bold">{payments.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Pago:</span>
                <span className="font-bold">
                  {payments.reduce((sum, p) => sum + parseFloat(p.usdc_amount || '0'), 0).toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span>Emails Enviados:</span>
                <span className="font-bold">
                  {payments.filter(p => p.email_sent).length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Histórico de Pagamentos</CardTitle>
            <CardDescription>Últimos pagamentos de juros realizados</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-muted-foreground">Nenhum pagamento registrado ainda.</p>
            ) : (
              <div className="space-y-4">
                {payments.slice(0, 20).map((payment, index) => (
                  <div
                    key={payment.id || index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      {payment.status === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                      )}
                      <div>
                        <h3 className="font-semibold">Investidor #{payment.investor_id}</h3>
                        <p className="text-sm text-muted-foreground">
                          Data: {new Date(payment.payment_date).toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {payment.transaction_hash}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{payment.usdc_amount} USDC</p>
                      <p className="text-sm text-muted-foreground">
                        {payment.email_sent ? 'Email enviado' : 'Email pendente'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

