import { Building2, FileText, Coins, ScrollText, Users } from 'lucide-react';
import { useAdminNavigation } from '@/hooks/useAdminNavigation';

type AdminTab = 'offers' | 'contracts' | 'tokens' | 'companies' | 'users';

interface RelatedItem {
    tab: AdminTab;
    id: number | string;
    label: string;
    sublabel?: string;
}

interface RelatedEntitiesProps {
    items: RelatedItem[];
}

const TAB_ICONS: Record<AdminTab, typeof Building2> = {
    companies: Building2,
    offers: FileText,
    tokens: Coins,
    contracts: ScrollText,
    users: Users,
};

const TAB_LABELS: Record<AdminTab, string> = {
    companies: 'Company',
    offers: 'Offer',
    tokens: 'Token',
    contracts: 'Contract',
    users: 'Investor',
};

export function RelatedEntities({ items }: RelatedEntitiesProps) {
    const { navigateTo } = useAdminNavigation();

    if (items.length === 0) return null;

    return (
        <div className="space-y-2">
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Related
            </h4>
            <div className="flex flex-wrap gap-2">
                {items.map((item) => {
                    const Icon = TAB_ICONS[item.tab];
                    return (
                        <button
                            key={`${item.tab}-${item.id}`}
                            onClick={() => navigateTo(item.tab, item.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                                bg-white/[0.04] border border-white/[0.08] text-zinc-300
                                hover:bg-white/[0.08] hover:border-white/[0.15] hover:text-white
                                transition-all duration-150 group"
                            title={`View ${TAB_LABELS[item.tab]}: ${item.label}`}
                        >
                            <Icon className="w-3 h-3 text-zinc-500 group-hover:text-blue-400 transition-colors" />
                            <span className="truncate max-w-[180px]">{item.label}</span>
                            {item.sublabel && (
                                <span className="text-zinc-500 font-mono text-[10px]">{item.sublabel}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
