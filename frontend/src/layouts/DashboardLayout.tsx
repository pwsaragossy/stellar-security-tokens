import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, PieChart, ArrowLeftRight, Settings, LogOut, Wallet, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { NotificationBell } from '@/components/NotificationBell';
import { MobileSidebar, MenuToggleButton, useMobileSidebar } from '@/components/MobileSidebar';
import { authStorage } from '@/utils/authStorage';

export function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isOpen, open, close } = useMobileSidebar();

    // Auth guard - redirect to login if no token
    useEffect(() => {
        if (!authStorage.isAuthenticated('investor')) {
            navigate('/login', { replace: true });
        }
    }, [navigate]);

    // Close mobile sidebar on route change
    useEffect(() => {
        close();
    }, [location.pathname]);

    const navItems = [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/dashboard' },
        { id: 'portfolio', label: 'My Portfolio', icon: PieChart, path: '/portfolio' },
        { id: 'market', label: 'Marketplace', icon: Store, path: '/market' },
        { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, path: '/transactions' },
        { id: 'wallet', label: 'Wallet', icon: Wallet, path: '/wallet' },
        { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
    ];

    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

    const handleLogout = () => {
        // Only clear investor session, preserve other user sessions
        authStorage.clear('investor');
        navigate('/login');
    };

    // Shared sidebar content
    const SidebarContent = () => (
        <>
            <div className="p-6">
                <h2 className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">S</div>
                    Stellar
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
                    Disconnect
                </Button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-slate-950 flex">
            {/* Desktop Sidebar */}
            <aside className="w-64 border-r border-white/5 bg-card/50 backdrop-blur-xl hidden md:flex flex-col">
                <SidebarContent />
            </aside>

            {/* Mobile Sidebar */}
            <MobileSidebar isOpen={isOpen} onClose={close}>
                <SidebarContent />
            </MobileSidebar>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-card/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <MenuToggleButton onClick={open} />
                        <h1 className="text-lg font-semibold text-white">
                            {navItems.find(item => isActive(item.path))?.label || 'Dashboard'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 md:gap-4">
                        <NotificationBell />
                        <div className="text-sm text-muted-foreground hidden sm:block">
                            {authStorage.getUser<any>('investor')?.email === 'test-investor@stellar-tokens.local' && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_LOGIN === 'true') ? (
                                <>Connected: <span className="text-emerald-400">Dev Investor (Auto-sign)</span></>
                            ) : (
                                <>Connected: <span className="text-emerald-400">Passkey Wallet</span></>
                            )}
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500" />
                    </div>
                </header>

                <div className="flex-1 p-4 md:p-6 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

