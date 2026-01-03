import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, BarChart3, Settings, LogOut, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/NotificationBell';
import { useEffect, useState } from 'react';
import { companiesApi } from '@/api/companies';
import type { Company } from '@/types';

export function CompanyLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [company, setCompany] = useState<Company | null>(null);

    // Auth guard - redirect to login if no token
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login', { replace: true });
        }
    }, [navigate]);

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/company/dashboard' },
        { id: 'offers', label: 'My Offers', icon: FileText, path: '/company/offers' },
        { id: 'reports', label: 'Reports', icon: BarChart3, path: '/company/reports' },
        { id: 'settings', label: 'Settings', icon: Settings, path: '/company/settings' },
    ];

    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

    useEffect(() => {
        const fetchCompany = async () => {
            try {
                const response = await companiesApi.getProfile();
                if (response.success && response.data) {
                    setCompany(response.data);
                }
            } catch (error) {
                console.error('Failed to fetch company profile:', error);
            }
        };
        fetchCompany();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');
        navigate('/login');
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'approved': return 'text-emerald-400';
            case 'pending': return 'text-yellow-400';
            case 'rejected': return 'text-red-400';
            case 'suspended': return 'text-orange-400';
            default: return 'text-muted-foreground';
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/5 bg-card/50 backdrop-blur-xl hidden md:flex flex-col">
                <div className="p-6">
                    <h2 className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center">
                            <Building2 className="w-4 h-4" />
                        </div>
                        Company
                    </h2>
                    {company && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                            {company.name}
                        </p>
                    )}
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
                        {navItems.find(item => isActive(item.path))?.label || 'Company Dashboard'}
                    </h1>
                    <div className="flex items-center gap-4">
                        <NotificationBell />
                        <div className="text-sm text-muted-foreground">
                            Status: <span className={getStatusColor(company?.status)}>{company?.status || 'Loading...'}</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-500" />
                    </div>
                </header>

                <div className="flex-1 p-6 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
