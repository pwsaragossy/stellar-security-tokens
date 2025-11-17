import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, TrendingUp, FileText, DollarSign, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navigation = [
  { name: 'Dashboard', href: '/investor/dashboard', icon: LayoutDashboard },
  { name: 'Meu Portfólio', href: '/investor/portfolio', icon: Wallet },
  { name: 'Ofertas Disponíveis', href: '/investor/offers', icon: TrendingUp },
  { name: 'Meus Investimentos', href: '/investor/investments', icon: FileText },
  { name: 'Histórico de Pagamentos', href: '/investor/payments', icon: DollarSign },
  { name: 'Perfil', href: '/investor/profile', icon: User },
];

export function InvestorSidebar() {
  const location = useLocation();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/investor/login';
  };

  return (
    <div className="flex h-screen w-64 flex-col bg-card border-r">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold text-primary">Investor Portal</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </div>
  );
}

