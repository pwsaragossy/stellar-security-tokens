import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { PieChart, ArrowLeftRight, Settings, LogOut, LogIn, Wallet, Store, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { Investor } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { NotificationBell } from '@/components/NotificationBell';
import { MobileSidebar, MenuToggleButton, useMobileSidebar } from '@/components/MobileSidebar';
import { authStorage } from '@/utils/authStorage';
import { passkeyClient } from '@/lib/passkey';
import { useAuthRefresh } from '@/hooks/useAuthRefresh';
import { DepositTracker } from '@/components/wallet/DepositTracker';
// RampOrderTracker was a floating widget; ramps now surface inside the
// NotificationBell dropdown for a unified notification surface.
import { Identicon } from '@/components/Identicon';

export function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isOpen, open, close } = useMobileSidebar();
    const { isLoading, isAuthenticated } = useAuthRefresh('investor');
    const isGuest = !isAuthenticated;

    // No hard redirect: guests can browse the shell + Marketplace. Private
    // routes are wrapped in RequireInvestorAuth (App.tsx) and render a
    // SignInGate; the backend stays fully gated regardless.

    // Close mobile sidebar on route change
    useEffect(() => {
        close();
    }, [location.pathname]);

    // Show loading while restoring session
    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#0e0f11] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#c6f24e]" />
            </div>
        );
    }

    const navItems = [
        { id: 'market', label: 'Marketplace', icon: Store, path: '/market' },
        { id: 'portfolio', label: 'My Portfolio', icon: PieChart, path: '/portfolio' },
        { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, path: '/transactions' },
        { id: 'wallet', label: 'Wallet', icon: Wallet, path: '/wallet' },
        { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
    ];

    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

    const investor = authStorage.getUser<Investor>('investor');
    const contractId = investor?.stellarContractId;
    const truncatedAddress = contractId ? `${contractId.slice(0, 6)}…${contractId.slice(-4)}` : null;
    const identiconSeed = contractId ?? sessionStorage.getItem('radox_passkey_credential');

    const copyAddress = async () => {
        if (!contractId) return;
        try {
            await navigator.clipboard.writeText(contractId);
            toast.success('Wallet address copied');
        } catch {
            toast.error('Could not copy to clipboard');
        }
    };

    const handleLogout = () => {
        // Only clear investor session, preserve other user sessions
        authStorage.clear('investor');
        passkeyClient.reset(); // Clear cached passkey credential
        navigate('/login');
    };

    // Shared sidebar content
    const SidebarContent = () => (
        <>
            <div className="p-6">
                <h2 className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#c6f24e] flex items-center justify-center text-[#0e0f11] font-bold text-sm">R</div>
                    Radox
                </h2>
            </div>

            <nav className="flex-1 px-4 space-y-2">
                {navItems.map((item) => (
                    <Button
                        key={item.id}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-3 text-[#8a8f98] hover:text-white hover:bg-[#16181b]",
                            isActive(item.path) && "bg-[#16181b] text-white"
                        )}
                        onClick={() => navigate(item.path)}
                    >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                    </Button>
                ))}
            </nav>

            <div className="p-4 border-t border-white/5">
                {isGuest ? (
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-[#8a8f98] hover:text-white hover:bg-[#16181b]"
                        onClick={() => navigate('/login')}
                    >
                        <LogIn className="w-4 h-4" />
                        Sign in
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-900/10"
                        onClick={handleLogout}
                    >
                        <LogOut className="w-4 h-4" />
                        Disconnect
                    </Button>
                )}
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-[#0e0f11] flex">
            {/* Desktop Sidebar */}
            <aside className="w-64 border-r border-[#1b1d21] bg-[#0e0f11] hidden md:flex flex-col">
                <SidebarContent />
            </aside>

            {/* Mobile Sidebar */}
            <MobileSidebar isOpen={isOpen} onClose={close}>
                <SidebarContent />
            </MobileSidebar>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <header className="h-16 border-b border-[#1b1d21] flex items-center justify-between px-4 md:px-6 bg-[#0e0f11] relative z-30">
                    <div className="flex items-center gap-3">
                        <MenuToggleButton onClick={open} />
                        <h1 className="text-lg font-semibold text-white">
                            {navItems.find(item => isActive(item.path))?.label || 'Dashboard'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 md:gap-4">
                        {isGuest ? (
                            <button
                                onClick={() => navigate('/login')}
                                className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                Sign in
                            </button>
                        ) : (
                            <>
                                <NotificationBell />
                                {truncatedAddress ? (
                                    <button
                                        onClick={copyAddress}
                                        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-xs text-muted-foreground hover:text-white hover:bg-white/5 border border-white/5 transition"
                                        title={contractId}
                                        aria-label="Copy wallet address"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                                        {truncatedAddress}
                                        <Copy className="w-3 h-3 opacity-50" />
                                    </button>
                                ) : (
                                    <div className="hidden sm:block text-xs text-muted-foreground italic">Wallet not deployed</div>
                                )}
                                <Identicon seed={identiconSeed} />
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 p-4 md:p-6 overflow-auto">
                    <Outlet />
                    {/* DepositTracker polls gated endpoints — authed users only (guests would 401 → redirect) */}
                    {!isGuest && <DepositTracker />}
                </div>
            </main>
        </div>
    );
}

