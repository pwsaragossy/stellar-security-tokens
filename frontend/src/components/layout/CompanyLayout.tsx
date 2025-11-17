import { CompanySidebar } from './CompanySidebar';
import { CompanyHeader } from './CompanyHeader';

export function CompanyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <CompanySidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <CompanyHeader />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

