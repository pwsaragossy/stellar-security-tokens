import { useState } from 'react';
import type { Offer } from '@/hooks/useOffers';
import { ShieldCheck, FileText, ArrowRight, Clock, Inbox } from 'lucide-react';

/**
 * Signal direction — single-offering deal page.
 *
 * The portal runs with 1 (max 2) live offerings, so the surface is a deal
 * page, not a grid: narrative + collateral on the left, a sticky terms card
 * on the right. Presentational only — data comes from the parent.
 *
 * Colours are inline Signal hex (this project is Tailwind v4 without a wired
 * @theme, so `bg-primary`-style token classes are NOT generated — see
 * Design/B2B_BAAS_CONSISTENCY_AUDIT.md). They mirror the index.css
 * Signal token values: #0E0F11 bg · #131517 card · #16181B panel · #C6F24E signal.
 */

const PAYMENT_LABELS: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Semi-annual',
    annual: 'Annual',
    bullet: 'Bullet',
};

function money(n: number): string {
    if (!Number.isFinite(n)) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${Math.round(n).toLocaleString()}`;
}

function formatDate(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface Props {
    offers: Offer[];
    loading: boolean;
    error: string | null;
    onInvest: (id: number) => void;
    kycPending?: boolean;
}

export function OfferingShowcase({ offers, loading, error, onInvest, kycPending }: Props) {
    const [active, setActive] = useState(0);

    if (loading) return <ShowcaseSkeleton />;

    if (error) {
        return (
            <Shell>
                <div className="rounded-xl border border-[#3a2326] bg-[#1a1214] p-8 text-center text-sm text-[#e8a0a0]">
                    Couldn't load offerings. {error}
                </div>
            </Shell>
        );
    }

    if (!offers.length) {
        return (
            <Shell>
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[#262a30] py-20 text-center">
                    <div className="rounded-2xl bg-[#16181b] p-5">
                        <Inbox className="h-9 w-9 text-[#5a6069]" strokeWidth={1.5} />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-lg font-medium text-[#e7e8ea]">No open offerings</p>
                        <p className="text-sm text-[#8a8f98]">New investment opportunities will appear here.</p>
                    </div>
                </div>
            </Shell>
        );
    }

    const safeActive = Math.min(active, offers.length - 1);
    const offer = offers[safeActive];

    return (
        <Shell>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b7079]">
                Offerings · {offers.length} open
            </p>

            {kycPending && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#3a3216] bg-[#1c1809] p-4">
                    <div className="rounded-lg bg-[#2a2410] p-2">
                        <Clock className="h-4 w-4 text-[#e0b341]" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-[#e0b341]">Account under review</p>
                        <p className="mt-0.5 text-[13px] text-[#b8a468]">
                            You can review this offering, but you can't invest until your KYC is approved.
                        </p>
                    </div>
                </div>
            )}

            {offers.length > 1 && (
                <div className="mt-5 flex flex-wrap gap-2">
                    {offers.map((o, i) => (
                        <button
                            key={o.id}
                            onClick={() => setActive(i)}
                            className={
                                'rounded-lg border px-3.5 py-1.5 text-[13px] transition-colors ' +
                                (i === safeActive
                                    ? 'border-[#c6f24e] bg-[#c6f24e] font-semibold text-[#0e0f11]'
                                    : 'border-[#24272c] bg-[#16181b] text-[#8a8f98] hover:text-[#e7e8ea]')
                            }
                        >
                            {o.offer_name}
                        </button>
                    ))}
                </div>
            )}

            <DealView offer={offer} onInvest={onInvest} disabledInvest={kycPending} />
        </Shell>
    );
}

function DealView({
    offer,
    onInvest,
    disabledInvest,
}: {
    offer: Offer;
    onInvest: (id: number) => void;
    disabledInvest?: boolean;
}) {
    const isDebt = offer.offer_type === 'collateral';
    const unitPrice = offer.unit_price ?? 1;
    const totalRaise = (offer.total_supply || 0) * unitPrice;
    const raised = (offer.tokens_sold ?? 0) * unitPrice;
    const pct = totalRaise > 0 ? Math.min(100, Math.round((raised / totalRaise) * 100)) : 0;
    const rate = offer.investor_rate ?? offer.annual_interest_rate;
    const payout = PAYMENT_LABELS[offer.payment_type || ''] || offer.payment_type;
    const ltv = offer.collateral_ltv != null ? Number(offer.collateral_ltv) : undefined;
    const cover = offer.collateral_photos?.find((p) => p.url)?.url;
    const legalDoc = offer.legal_documents
        ? Object.values(offer.legal_documents).find((d) => d?.url)
        : undefined;

    const highlights: { t: string; d: string }[] = [];
    if (isDebt) {
        highlights.push({
            t: 'Senior secured',
            d: ltv != null
                ? `First lien on the underlying collateral, ${ltv.toFixed(0)}% loan-to-value.`
                : 'Backed by a first lien on the underlying collateral.',
        });
    } else {
        highlights.push({
            t: 'Equity participation',
            d: `Tokenized equity in ${offer.company?.name || 'the issuer'}.`,
        });
    }
    if (payout) highlights.push({ t: `${payout} distributions`, d: 'Paid to holders on a fixed schedule.' });
    highlights.push({ t: 'On-chain settlement', d: 'Issued and settled automatically on Stellar.' });

    const terms: { k: string; v: string }[] = [
        { k: 'Unit price', v: money(unitPrice) },
        { k: 'Total raise', v: money(totalRaise) },
    ];
    if (offer.maturity_date || isDebt) terms.push({ k: 'Maturity', v: formatDate(offer.maturity_date) });
    if (ltv != null) terms.push({ k: 'Loan-to-value', v: `${ltv.toFixed(0)}%` });
    if (payout) terms.push({ k: 'Payout', v: payout });

    return (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1.55fr_1fr]">
            {/* Left: narrative */}
            <div>
                <span className="inline-block rounded-md border border-[#25282d] bg-[#1a1d20] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.03em] text-[#9ca3ac]">
                    {isDebt ? offer.collateral_type || 'Senior secured debt' : 'Equity offering'}
                </span>
                <h1 className="mt-3 text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-white">
                    {offer.offer_name}
                </h1>
                <p className="mt-1.5 text-[13px] text-[#6b7079]">
                    {offer.company?.name || 'Issuer'} · issued &amp; settled on Stellar
                </p>

                <div className="relative mt-5 h-[150px] overflow-hidden rounded-xl border border-[#20242a]">
                    {cover ? (
                        <img src={cover} alt={offer.offer_name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                        <div className="h-full w-full bg-[#16181b]" />
                    )}
                    {(offer.collateral_description || isDebt) && (
                        <div className="absolute bottom-3 left-3.5 z-[1] text-[11.5px] tracking-[0.02em] text-[#8fa39a]">
                            Collateral
                            <span className="block text-[14.5px] font-semibold text-[#e7f0ea]">
                                {offer.collateral_description || offer.collateral_type || 'Secured by underlying assets'}
                            </span>
                        </div>
                    )}
                </div>

                {offer.description && (
                    <p className="mt-5 text-[13.5px] leading-[1.65] text-[#a4abb3]">{offer.description}</p>
                )}

                <div className="mt-5 flex flex-col gap-2.5">
                    {highlights.map((h) => (
                        <div key={h.t} className="flex items-start gap-2.5 text-[13.5px] leading-[1.5] text-[#c2c7cd]">
                            <span className="mt-1 text-[11px] text-[#6b7079]">●</span>
                            <span>
                                <span className="font-semibold text-white">{h.t}</span> — {h.d}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: terms */}
            <div className="self-start rounded-2xl border border-[#1f2329] bg-[#131517] p-[22px]">
                <div className="text-[44px] font-semibold leading-none tracking-[-0.02em] text-[#c6f24e] tabular-nums">
                    {rate != null ? `${parseFloat(String(rate))}%` : '—'}
                </div>
                <p className="mt-1.5 text-[12px] text-[#7d838b]">
                    {isDebt ? `target annual yield${payout ? ` · ${payout.toLowerCase()} coupon` : ''}` : 'target annual return'}
                </p>

                <div className="mt-[18px] flex flex-col">
                    {terms.map((t) => (
                        <div
                            key={t.k}
                            className="flex items-center justify-between border-b border-[#1d2025] py-[11px] text-sm last:border-b-0"
                        >
                            <span className="text-[#7d838b]">{t.k}</span>
                            <span className="font-medium text-[#e7e8ea] tabular-nums">{t.v}</span>
                        </div>
                    ))}
                </div>

                {totalRaise > 0 && (
                    <div className="mt-3.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#1f2329]">
                            <div className="h-full rounded-full bg-[#c6f24e]" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1.5 text-[12px] text-[#7d838b] tabular-nums">
                            {pct}% subscribed · {money(raised)} of {money(totalRaise)}
                        </p>
                    </div>
                )}

                <button
                    onClick={() => onInvest(offer.id)}
                    disabled={disabledInvest}
                    className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[9px] bg-[#c6f24e] py-3 text-sm font-semibold text-[#0e0f11] transition-colors hover:bg-[#d2f56e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c6f24e]/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {disabledInvest ? 'Awaiting KYC approval' : 'Review & invest'}
                    {!disabledInvest && <ArrowRight className="h-4 w-4" />}
                </button>

                {legalDoc?.url ? (
                    <a
                        href={legalDoc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-[9px] border border-[#2a2e34] py-2.5 text-[13px] text-[#c2c7cd] transition-colors hover:border-[#3a3e44] hover:text-white"
                    >
                        <FileText className="h-3.5 w-3.5" /> View term sheet
                    </a>
                ) : (
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[#5a6069]">
                        <ShieldCheck className="h-3.5 w-3.5" /> Audited security token on Stellar
                    </p>
                )}
            </div>
        </div>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="mx-auto max-w-5xl">{children}</div>;
}

function ShowcaseSkeleton() {
    return (
        <Shell>
            <div className="h-3 w-48 animate-pulse rounded bg-[#16181b]" />
            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1.55fr_1fr]">
                <div>
                    <div className="h-5 w-32 animate-pulse rounded bg-[#16181b]" />
                    <div className="mt-3 h-8 w-2/3 animate-pulse rounded bg-[#16181b]" />
                    <div className="mt-5 h-[150px] w-full animate-pulse rounded-xl bg-[#16181b]" />
                    <div className="mt-5 h-16 w-full animate-pulse rounded bg-[#16181b]" />
                </div>
                <div className="h-[320px] animate-pulse rounded-2xl bg-[#131517]" />
            </div>
        </Shell>
    );
}
