import { InvestmentCalculator } from '@/components/InvestmentCalculator';
import { InvestorOnboarding } from '@/components/InvestorOnboarding';
import { InvestorPortal } from '@/components/InvestorPortal';
import { useState } from 'react';
import { Calculator, UserPlus, Wallet } from 'lucide-react';

export function Landing() {
  const [activeSection, setActiveSection] = useState<'calculator' | 'onboarding' | 'portal'>('calculator');

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Stellar Security Tokens</h1>
            <nav className="flex gap-4">
              <button
                onClick={() => setActiveSection('calculator')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  activeSection === 'calculator'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                }`}
              >
                <Calculator className="h-4 w-4 inline mr-2" />
                Calculadora
              </button>
              <button
                onClick={() => setActiveSection('onboarding')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  activeSection === 'onboarding'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                }`}
              >
                <UserPlus className="h-4 w-4 inline mr-2" />
                Investir
              </button>
              <button
                onClick={() => setActiveSection('portal')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  activeSection === 'portal'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                }`}
              >
                <Wallet className="h-4 w-4 inline mr-2" />
                Portal
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            Tokenização de Security Tokens no Stellar
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Invista em tokens SIN01 e receba juros mensais de 10% a.a. com segurança blockchain
          </p>
        </div>

        {/* Active Section */}
        <div className="max-w-6xl mx-auto">
          {activeSection === 'calculator' && (
            <div>
              <h3 className="text-2xl font-semibold mb-6 text-center">
                Calcule seus Retornos Potenciais
              </h3>
              <InvestmentCalculator />
            </div>
          )}

          {activeSection === 'onboarding' && (
            <div>
              <h3 className="text-2xl font-semibold mb-6 text-center">
                Comece a Investir Agora
              </h3>
              <InvestorOnboarding />
            </div>
          )}

          {activeSection === 'portal' && (
            <div>
              <h3 className="text-2xl font-semibold mb-6 text-center">
                Acesse seu Portal de Investidor
              </h3>
              <InvestorPortal />
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-6 py-12 bg-card">
        <h3 className="text-2xl font-semibold mb-8 text-center">Por que investir em SIN01?</h3>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="text-center p-6">
            <div className="text-3xl font-bold text-primary mb-2">10% a.a.</div>
            <p className="text-muted-foreground">Taxa de juros anual garantida</p>
          </div>
          <div className="text-center p-6">
            <div className="text-3xl font-bold text-primary mb-2">Mensal</div>
            <p className="text-muted-foreground">Pagamentos de juros mensais</p>
          </div>
          <div className="text-center p-6">
            <div className="text-3xl font-bold text-primary mb-2">Blockchain</div>
            <p className="text-muted-foreground">Segurança e transparência do Stellar</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card mt-12">
        <div className="container mx-auto px-6 py-8">
          <p className="text-center text-muted-foreground">
            © 2024 Stellar Security Tokens. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

