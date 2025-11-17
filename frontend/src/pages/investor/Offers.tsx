import { InvestorLayout } from '@/components/layout/InvestorLayout';
import { EmptyState } from '@/components/ui/empty-state';

export function InvestorOffers() {
  return (
    <InvestorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Ofertas Disponíveis</h1>
          <p className="text-muted-foreground">Explore oportunidades de investimento em RWA</p>
        </div>
        <EmptyState
          title="Nenhuma oferta disponível no momento"
          description="Volte em breve para novas oportunidades"
        />
      </div>
    </InvestorLayout>
  );
}

