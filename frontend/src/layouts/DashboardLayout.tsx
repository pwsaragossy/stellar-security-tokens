import { Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PieChart, ArrowLeftRight, Settings, LogOut, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { NotificationBell } from '@/components/NotificationBell';

export function DashboardLayout() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');

    // Auth guard - redirect to login if no token
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login', { replace: true });
        }
    }, [navigate]);

    const navItems = [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/dashboard' },
        { id: 'portfolio', label: 'My Portfolio', icon: PieChart, path: '/portfolio' },
        { id: 'market', label: 'Marketplace', icon: Wallet, path: '/market' },
        { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, path: '/transactions' },
        { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
    ];

    const handleLogout = () => {
        // Clear all session data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-950 flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/5 bg-card/50 backdrop-blur-xl hidden md:flex flex-col">
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
                                activeTab === item.id && "bg-white/10 text-white"
                            )}
                            onClick={() => {
                                setActiveTab(item.id);
                                navigate(item.path);
                            }}
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
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
                    <h1 className="text-lg font-semibold text-white">
                        {navItems.find(item => item.id === activeTab)?.label || 'Dashboard'}
                    </h1>
                    <div className="flex items-center gap-4">
                        <NotificationBell />
                        <div className="text-sm text-muted-foreground">
                            Connected: <span className="text-emerald-400">Passkey Wallet</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500" />
                    </div>
                </header>

                <div className="flex-1 p-6 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
