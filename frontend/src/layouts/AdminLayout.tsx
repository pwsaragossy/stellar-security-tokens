import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, DollarSign, Shield, Wallet, AlertTriangle, Building2, FileText, Siren, Coins, Info, CheckCircle2, ClipboardCheck, Loader2, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/NotificationBell';
import { MobileSidebar, MenuToggleButton, useMobileSidebar } from '@/components/MobileSidebar';
import { useEffect } from 'react';
import { authStorage } from '@/utils/authStorage';
import { useAuthRefresh } from '@/hooks/useAuthRefresh';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

const PAGE_DESCRIPTIONS: Record<string, { title: string, description: string, keyFeatures: string[] }> = {
    '/admin/approvals': {
        title: 'Approvals Hub',
        description: 'Unified queue for all pending approvals across the platform.',
        keyFeatures: [
            'Review investor KYC, company onboarding, and offer submissions',
            'Unlock tokens and sign multi-signature transactions',
            'Split-pane detail view with type-specific context',
            'Real-time counts across all 5 approval domains'
        ]
    },
    '/admin/dashboard': {
        title: 'Admin Dashboard',
        description: 'Real-time overview of platform activity and key performance indicators.',
        keyFeatures: [
            'Total revenue and investment volume metrics',
            'Live fundraising progress for active campaigns',
            'Revenue breakdown by source',
            'User growth and retention statistics'
        ]
    },
    '/admin/users': {
        title: 'Investor Management',
        description: 'Manage individual investor accounts and their compliance status.',
        keyFeatures: [
            'Approve or reject KYC submissions',
            'View investor portfolio and transaction history',
            'Manage investor account flags and restrictions',
            'Update investor profile information'
        ]
    },
    '/admin/companies': {
        title: 'Company Management',
        description: 'Manage and approve corporate issuers on the platform.',
        keyFeatures: [
            'Verify company registration and legal documents',
            'Approve companies to issue tokens',
            'Monitor company-specific activity',
            'Manage platform-issuer relationships'
        ]
    },
    '/admin/tokens': {
        title: 'Token Catalog',
        description: 'Central registry of all tokens issued on the platform.',
        keyFeatures: [
            'Monitor total supply and circulating tokens',
            'View asset metadata and contract IDs',
            'Track token holder distribution',
            'Audit token issuance and lifecycle'
        ]
    },
    '/admin/offers': {
        title: 'Offer Management',
        description: 'Manage approved offerings (STOs) and fundraising campaigns. New offer approvals are in the Approvals tab.',
        keyFeatures: [
            'Track approved, active, and completed offers',
            'Monitor fundraising progress in real-time',
            'Pause or resume offerings if necessary',
            'Finalize or cancel completed campaigns'
        ]
    },
    '/admin/contracts': {
        title: 'Contract Management',
        description: 'Manage deployed Soroban sale contracts and their on-chain state.',
        keyFeatures: [
            'View on-chain balance, active status, and contract version',
            'Pause/resume sales, update prices, deposit tokens',
            'Freeze buyers, withdraw funds, extend TTL',
            'Emergency drain and WASM upgrade with confirmation guards'
        ]
    },

    '/admin/wallets': {
        title: 'Platform Wallets',
        description: 'Monitor balances and status of platform-controlled Stellar accounts.',
        keyFeatures: [
            'View Treasury, Distributor, and Fee account balances',
            'Verify account flags (Auth Required, Revokable)',
            'Monitor XLM reserves for transaction fees',
            'Audit internal fund movements'
        ]
    },

    '/admin/fees': {
        title: 'Fee Configuration',
        description: 'Manage global fee structures for platform services.',
        keyFeatures: [
            'Set flat fees or percentages for issuances',
            'Configure secondary market transaction fees',
            'Enable or disable specific fee types',
            'Apply changes globally across the platform'
        ]
    },
    '/admin/defaults': {
        title: 'Default Cases',
        description: 'Manage default system behaviors and fallback parameters.',
        keyFeatures: [
            'Configure default compliance settings',
            'Manage template data for new issuances',
            'Set fallback values for system-wide triggers',
            'Ensure consistency across new platform entities'
        ]
    },
    '/admin/compliance': {
        title: 'Token Compliance',
        description: 'Enforce regulatory rules and asset controls.',
        keyFeatures: [
            'Manage whitelists and authorization rules',
            'Execute clawbacks for restricted assets',
            'Set account flags (Auth Required, Revokable, Clawback Enabled)',
            'Ensure FATF/AML compliance across transfers'
        ]
    },
    '/admin/emergency': {
        title: 'Emergency Controls',
        description: 'Safety switches and high-level intervention tools.',
        keyFeatures: [
            'Freeze specific user wallets or asset codes',
            'Halt platform-wide trading or distributions',
            'Recover from technical incidents or security breaches',
            'Revoke authorization for compromised accounts'
        ]
    },

}

function PageInfo({ path }: { path: string }) {
    const info = PAGE_DESCRIPTIONS[path];
    if (!info) return null;

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-full">
                    <Info className="w-4 h-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-slate-900 border-white/10 text-white">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Info className="w-5 h-5 text-blue-400" />
                        </div>
                        <DialogTitle className="text-xl font-bold">{info.title}</DialogTitle>
                    </div>
                    <DialogDescription className="text-slate-400 text-base">
                        {info.description}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Key Functionalities</h4>
                        <div className="grid gap-2">
                            {info.keyFeatures.map((feature, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-white/5 border border-white/5">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                                    <span className="text-sm text-slate-300">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isOpen, open, close } = useMobileSidebar();
    const { isLoading, isAuthenticated } = useAuthRefresh('admin');

    // Auth guard - redirect to admin login only after refresh attempt completes
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            navigate('/admin/login', { replace: true });
        }
    }, [isLoading, isAuthenticated, navigate]);

    // Close mobile sidebar on route change
    useEffect(() => {
        close();
    }, [location.pathname]);

    // Show loading while restoring session
    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
        );
    }

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
        { id: 'approvals', label: 'Approvals', icon: ClipboardCheck, path: '/admin/approvals' },
        { id: 'users', label: 'Investors', icon: Users, path: '/admin/users' },
        { id: 'companies', label: 'Companies', icon: Building2, path: '/admin/companies' },
        { id: 'tokens', label: 'Tokens', icon: Coins, path: '/admin/tokens' },
        { id: 'offers', label: 'Offers', icon: FileText, path: '/admin/offers' },
        { id: 'contracts', label: 'Contracts', icon: Box, path: '/admin/contracts' },

        { id: 'wallets', label: 'Wallets', icon: Wallet, path: '/admin/wallets' },

        { id: 'fees', label: 'Fee Configuration', icon: DollarSign, path: '/admin/fees' },
        { id: 'defaults', label: 'Default Cases', icon: AlertTriangle, path: '/admin/defaults' },
        { id: 'compliance', label: 'Token Compliance', icon: Shield, path: '/admin/compliance' },
        { id: 'emergency', label: 'Emergency Controls', icon: Siren, path: '/admin/emergency' },

    ];

    const isActive = (path: string) => location.pathname === path;

    const handleLogout = () => {
        // Only clear admin session, preserve other user sessions
        authStorage.clear('admin');
        navigate('/admin/login');
    };

    // Shared sidebar content
    const SidebarContent = () => (
        <>
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
                <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-card/50 backdrop-blur-sm relative z-30">
                    <div className="flex items-center gap-3">
                        <MenuToggleButton onClick={open} />
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-semibold text-white">
                                {navItems.find(item => isActive(item.path))?.label || 'Admin Dashboard'}
                            </h1>
                            <PageInfo path={location.pathname} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-4">
                        <NotificationBell />
                        <div className="text-sm text-muted-foreground hidden sm:block">
                            Role: <span className="text-red-400">Platform Admin</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-500 to-orange-500" />
                    </div>
                </header>

                <div className="flex-1 p-4 md:p-6 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

