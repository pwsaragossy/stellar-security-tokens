import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, DollarSign, Shield, Wallet, AlertTriangle, Settings, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/NotificationBell';
import { useEffect } from 'react';

export function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();

    // Auth guard - redirect to admin login if no token
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/admin/login', { replace: true });
        }
    }, [navigate]);

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
        { id: 'users', label: 'Investors', icon: Users, path: '/admin/users' },
        { id: 'companies', label: 'Companies', icon: Building2, path: '/admin/companies' },
        { id: 'wallets', label: 'Wallets', icon: Wallet, path: '/admin/wallets' },
        { id: 'fees', label: 'Fee Configuration', icon: DollarSign, path: '/admin/fees' },
        { id: 'defaults', label: 'Default Cases', icon: AlertTriangle, path: '/admin/defaults' },
        { id: 'settings', label: 'Settings', icon: Settings, path: '/admin/settings' },
    ];

    const isActive = (path: string) => location.pathname === path;

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('admin');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');
        navigate('/admin/login');
    };

    return (
        <div className="min-h-screen bg-slate-950 flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/5 bg-card/50 backdrop-blur-xl hidden md:flex flex-col">
                <div className="p-6">
                    <h2 className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                            <Shield className="w-4 h-4" />
                        </div>
                        Admin Panel
                    </h2>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    {navItems.map((item) => (
                        <Button
                            key={item.id}
                            variant="ghost"
                            className={cn(
                                "w-full justify-start gap-3 text-muted-foreground hover:text-white hover:bg-white/5",
                                isActive(item.path) && "bg-white/10 text-white"
                            )}
                            onClick={() => navigate(item.path)}
                        >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                        </Button>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/5">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-900/10"
                        onClick={handleLogout}
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
                    <h1 className="text-lg font-semibold text-white">
                        {navItems.find(item => isActive(item.path))?.label || 'Admin Dashboard'}
                    </h1>
                    <div className="flex items-center gap-4">
                        <NotificationBell />
                        <div className="text-sm text-muted-foreground">
                            Role: <span className="text-red-400">Platform Admin</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-500 to-orange-500" />
                    </div>
                </header>

                <div className="flex-1 p-6 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
