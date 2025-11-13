import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calculator, TrendingUp } from 'lucide-react';

const ANNUAL_INTEREST_RATE = 10.0;
const MONTHLY_INTEREST_RATE = ANNUAL_INTEREST_RATE / 12 / 100;
const EXCHANGE_RATE = 1.0; // 1 USDC = 1 SIN01 token

export function InvestmentCalculator() {
  const [investmentAmount, setInvestmentAmount] = useState<string>('');
  const [investmentPeriod, setInvestmentPeriod] = useState<number>(12); // meses

  const calculateResults = () => {
    const amount = parseFloat(investmentAmount);
    if (!amount || amount <= 0) {
      return null;
    }

    const tokens = amount * EXCHANGE_RATE;
    const monthlyInterest = tokens * MONTHLY_INTEREST_RATE;
    const totalInterest = monthlyInterest * investmentPeriod;
    const totalValue = tokens + totalInterest;

    return {
      tokens,
      monthlyInterest,
      totalInterest,
      totalValue,
      annualReturn: (totalInterest / tokens) * 100,
    };
  };

  const results = calculateResults();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          <CardTitle>Calculadora de Investimento</CardTitle>
        </div>
        <CardDescription>
          Calcule seus retornos potenciais com tokens SIN01
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium mb-2">
              Valor do Investimento (USDC)
            </label>
            <input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={investmentAmount}
              onChange={(e) => setInvestmentAmount(e.target.value)}
              placeholder="Ex: 1000"
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="period" className="block text-sm font-medium mb-2">
              Período de Investimento (meses)
            </label>
            <select
              id="period"
              value={investmentPeriod}
              onChange={(e) => setInvestmentPeriod(parseInt(e.target.value))}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
              <option value={24}>24 meses</option>
              <option value={36}>36 meses</option>
            </select>
          </div>
        </div>

        {results && (
          <div className="space-y-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">Projeção de Retornos</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tokens Recebidos</p>
                <p className="text-2xl font-bold">{results.tokens.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} SIN01</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Juros Mensais</p>
                <p className="text-2xl font-bold text-green-600">
                  {results.monthlyInterest.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} USDC
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Total de Juros ({investmentPeriod} meses)</p>
                <p className="text-xl font-semibold text-green-600">
                  {results.totalInterest.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} USDC
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-xl font-semibold">
                  {results.totalValue.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} SIN01
                </p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Retorno Anualizado Estimado</span>
                <span className="text-lg font-bold text-primary">
                  {results.annualReturn.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="text-xs text-muted-foreground pt-2">
              * Taxa de juros: {ANNUAL_INTEREST_RATE}% a.a. ({MONTHLY_INTEREST_RATE * 100}% ao mês)
              <br />
              * Valores são estimativas e podem variar
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

