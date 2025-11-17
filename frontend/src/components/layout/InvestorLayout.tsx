import { InvestorSidebar } from './InvestorSidebar';
import { InvestorHeader } from './InvestorHeader';

export function InvestorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <InvestorSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <InvestorHeader />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

