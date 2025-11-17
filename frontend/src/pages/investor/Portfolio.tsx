import { InvestorLayout } from '@/components/layout/InvestorLayout';
import { EmptyState } from '@/components/ui/empty-state';

export function InvestorPortfolio() {
  return (
    <InvestorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Meu Portfólio</h1>
          <p className="text-muted-foreground">Gerencie seus investimentos em ofertas RWA</p>
        </div>
        <EmptyState
          title="Você ainda não possui investimentos"
          description="Comece investindo em ofertas disponíveis"
          action={{
            label: "Explorar Ofertas",
            onClick: () => window.location.href = '/investor/offers'
          }}
        />
      </div>
    </InvestorLayout>
  );
}

