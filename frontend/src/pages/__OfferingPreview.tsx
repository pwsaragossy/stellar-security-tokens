// TEMPORARY preview harness — renders the real OfferingShowcase with mock data
// inside a Signal shell, so the auth-gated component can be viewed at
// /__preview/offering. Delete this file and its route before merging.
import { PieChart, ArrowLeftRight, Settings, Wallet, Store } from 'lucide-react';
import type { Offer } from '@/hooks/useOffers';
import { OfferingShowcase } from '@/components/invest/OfferingShowcase';

const MOCK: Offer[] = [
    {
        id: 1,
        offer_name: 'Helios Solar Credit III',
        description:
            'A senior secured note funding three operating solar plants under 15-year power-purchase agreements. Quarterly coupons are paid from contracted energy revenue; principal is collateralized by the underlying assets at a 65% loan-to-value.',
        total_supply: 24000,
        unit_price: 100,
        annual_interest_rate: 11.5,
        investor_rate: 11.5,
        offer_type: 'collateral',
        status: 'active',
        asset_code: 'HSC3',
        collateral_type: 'Senior secured debt',
        collateral_ltv: 65,
        collateral_description: '4.2 MW solar portfolio · Bahia, BR',
        payment_type: 'quarterly',
        maturity_date: '2027-06-30',
        tokens_sold: 9120,
        company: { name: 'Helios Energy S.A.' },
    },
    {
        id: 2,
        offer_name: 'Aurora Logistics Equity',
        description:
            'Tokenized equity in a regional freight operator expanding its fleet across the southeast corridor.',
        total_supply: 100000,
        unit_price: 50,
        investor_rate: 18,
        offer_type: 'sale',
        status: 'active',
        asset_code: 'AURA',
        payment_type: 'annual',
        tokens_sold: 42000,
        company: { name: 'Aurora Freight Co' },
    },
];

const NAV = [
    { label: 'Marketplace', icon: Store, on: true },
    { label: 'Portfolio', icon: PieChart },
    { label: 'Transactions', icon: ArrowLeftRight },
    { label: 'Wallet', icon: Wallet },
    { label: 'Settings', icon: Settings },
];

export function OfferingPreview() {
    return (
        <div className="flex min-h-screen bg-[#0e0f11]">
            <aside className="hidden w-64 flex-col border-r border-[#1b1d21] bg-[#0e0f11] md:flex">
                <div className="p-6">
                    <h2 className="flex items-center gap-2 text-xl font-bold tracking-tighter text-white">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c6f24e] text-sm font-bold text-[#0e0f11]">R</div>
                        Radox
                    </h2>
                </div>
                <nav className="flex-1 space-y-1 px-4">
                    {NAV.map((n) => (
                        <div
                            key={n.label}
                            className={
                                'flex items-center gap-3 rounded-md px-3 py-2 text-sm ' +
                                (n.on ? 'bg-[#16181b] text-white' : 'text-[#8a8f98]')
                            }
                        >
                            <n.icon className="h-4 w-4" />
                            {n.label}
                        </div>
                    ))}
                </nav>
            </aside>
            <main className="flex flex-1 flex-col">
                <header className="flex h-16 items-center justify-between border-b border-[#1b1d21] bg-[#0e0f11] px-6">
                    <h1 className="text-lg font-semibold text-white">Marketplace</h1>
                    <div className="flex items-center gap-2 rounded-md border border-white/5 px-2.5 py-1 font-mono text-xs text-[#8a8f98]">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        GCQP…G5VX5
                    </div>
                </header>
                <div className="flex-1 overflow-auto p-6">
                    <OfferingShowcase offers={MOCK} loading={false} error={null} onInvest={() => {}} />
                </div>
            </main>
        </div>
    );
}
