
import { useParams, useNavigate } from 'react-router-dom';
import { useOffer } from '@/hooks/useOffer';
import { InvestmentDialog } from '@/components/invest/InvestmentDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, Calendar, FileText, TrendingUp, Loader2, AlertCircle,
    DollarSign, ExternalLink, ShieldCheck, Clock, Building2,
    Hash, CheckCircle2, Copy, ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

/* ─── Labels ─── */
const PAYMENT_LABELS: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Semi-Annual',
    annual: 'Annual',
    bullet: 'Bullet (At Maturity)',
};

const COLLATERAL_LABELS: Record<string, string> = {
    real_estate: 'Real Estate',
    vehicle: 'Vehicle',
    receivables: 'Receivables',
    other: 'Other',
};

/* ─── Helpers ─── */
function truncateAddress(addr: string, chars = 6) {
    if (!addr || addr.length <= chars * 2 + 3) return addr;
    return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function formatCurrency(value: number) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
}

function maskCnpj(cnpj: string) {
    if (!cnpj || cnpj.length < 14) return cnpj;
    const digits = cnpj.replace(/\D/g, '');
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.***/****.${digits.slice(-2)}`;
}

function ordinalDay(day: number) {
    if (day >= 11 && day <= 13) return `${day}th`;
    const suffix = ['th', 'st', 'nd', 'rd'][day % 10] || 'th';
    return `${day}${suffix}`;
}

/* ─── Detail row (key-value) ─── */
function DetailRow({ label, value, mono, copyable }: {
    label: string; value: React.ReactNode; mono?: boolean; copyable?: string;
}) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        if (copyable) {
            navigator.clipboard.writeText(copyable);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };
    return (
        <div className="flex justify-between items-center py-2.5">
            <span className="text-muted-foreground text-sm">{label}</span>
            <div className="flex items-center gap-2">
                <span className={`text-sm ${mono ? 'font-mono text-[hsl(43_45%_55%)]' : 'font-medium text-white'}`}>
                    {value}
                </span>
                {copyable && (
                    <button onClick={handleCopy} className="text-muted-foreground hover:text-[hsl(43_45%_55%)] transition-colors">
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ─── Divider with label ─── */
function SectionDivider({ label, icon }: { label: string; icon: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 pt-8 pb-4">
            <span className="text-muted-foreground/50">{icon}</span>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</h3>
            <div className="flex-1 h-px bg-white/8" />
        </div>
    );
}

/* ═══════════════════════════════════════ */
/* MAIN COMPONENT                         */
/* ═══════════════════════════════════════ */
export function OfferDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { offer, loading, error } = useOffer(id);
    const [tokenDetailsOpen, setTokenDetailsOpen] = useState(false);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(43_45%_55%)]" />
                    <p className="text-muted-foreground text-sm">Loading offer details...</p>
                </div>
            </div>
        );
    }

    if (error || !offer) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4 animate-fade-in">
                    <div className="p-4 rounded-2xl bg-red-500/10">
                        <AlertCircle className="w-10 h-10 text-red-400" />
                    </div>
                    <p className="text-lg font-medium">Offer not found</p>
                    <Button variant="outline" onClick={() => navigate('/market')} className="rounded-xl">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Marketplace
                    </Button>
                </div>
            </div>
        );
    }

    /* ─── Derived values ─── */
    const unitPrice = offer.unit_price || 1;
    const totalSupply = offer.total_supply || 0;
    const totalRaise = totalSupply * unitPrice;
    const tokensSold = offer.tokens_sold ?? 0;
    const remainingTokens = totalSupply - tokensSold;
    const supplyPercent = totalSupply > 0 ? Math.min((tokensSold / totalSupply) * 100, 100) : 0;
    const paymentLabel = PAYMENT_LABELS[offer.payment_type || ''] || offer.payment_type || '—';
    const legalDocs = offer.legal_documents
        ? Object.entries(offer.legal_documents).filter(([, v]) => v && (typeof v === 'object'))
        : [];
    const offerRules = offer.offer_rules || {};
    const company = offer.company;
    const token = offer.token;
    const hasCollateral = offer.offer_type === 'collateral' && (offer.collateral_description || offer.collateral_value);
    const stellarExplorerBase = 'https://stellar.expert/explorer/testnet';

    // Maturity cutoff
    const cutoffDate = offer.investment_cutoff_date ? new Date(offer.investment_cutoff_date) : null;
    const isPastCutoff = cutoffDate ? new Date() >= cutoffDate : false;
    const daysUntilCutoff = cutoffDate ? Math.ceil((cutoffDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
    const isNearCutoff = daysUntilCutoff !== null && daysUntilCutoff > 0 && daysUntilCutoff <= 30;

    return (
        <div className="animate-fade-in max-w-2xl mx-auto pb-12">

            {/* ═══ BACK ═══ */}
            <Button
                variant="ghost"
                className="text-muted-foreground hover:text-white pl-0 mb-6"
                onClick={() => navigate('/market')}
            >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Marketplace
            </Button>

            {/* ═══ HERO ═══ */}
            <div className="space-y-3 animate-fade-in-up mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{offer.offer_name}</h1>

                {/* Issuer — inline */}
                {company?.name && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                        <span className="font-medium">{company.name}</span>
                        {company.kycStatus === 'approved' && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Verified
                            </Badge>
                        )}
                    </div>
                )}

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                    <Badge className="bg-[hsl(43_45%_55%/0.15)] text-[hsl(43_45%_55%)] border border-[hsl(43_45%_55%/0.3)]">
                        {offer.offer_type === 'sale' ? 'Equity Sale' : 'Debt / Collateral'}
                    </Badge>
                    <Badge className="bg-muted text-muted-foreground border border-white/10 capitalize">
                        {offer.status.replace('_', ' ')}
                    </Badge>
                    {offer.collateral_ltv && (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            <ShieldCheck className="h-3 w-3 mr-1" /> LTV {Number(offer.collateral_ltv).toFixed(0)}%
                        </Badge>
                    )}
                </div>
            </div>

            {/* ═══ KEY STATS BAR ═══ */}
            <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4 mb-2 animate-fade-in-up animate-delay-1">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {[
                        { icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'APY', value: (() => { const rate = offer.investor_rate ?? offer.annual_interest_rate; return rate ? `${parseFloat(rate.toString())}%` : 'N/A'; })(), accent: true },
                        { icon: <DollarSign className="h-3.5 w-3.5" />, label: 'Price', value: `$${unitPrice}` },
                        { icon: <Calendar className="h-3.5 w-3.5" />, label: 'Maturity', value: offer.maturity_date ? new Date(offer.maturity_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Perpetual' },
                        { icon: <DollarSign className="h-3.5 w-3.5" />, label: 'Raise', value: formatCurrency(totalRaise) },
                        { icon: <Clock className="h-3.5 w-3.5" />, label: 'Payout', value: paymentLabel },
                    ].map((s) => (
                        <div key={s.label} className="text-center sm:text-left">
                            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-muted-foreground mb-1">
                                {s.icon}
                                <span className="text-[11px] uppercase tracking-wider">{s.label}</span>
                            </div>
                            <div className={`text-base sm:text-lg font-bold ${s.accent ? 'text-emerald-400' : ''}`}>
                                {s.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Supply progress */}
                {totalSupply > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/8">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                            <span>{supplyPercent.toFixed(0)}% subscribed</span>
                            <span>{remainingTokens.toLocaleString()} tokens remaining</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2">
                            <div
                                className="h-2 rounded-full transition-all duration-700 ease-out"
                                style={{
                                    width: `${supplyPercent}%`,
                                    background: supplyPercent >= 90
                                        ? 'hsl(0 70% 55%)'
                                        : supplyPercent >= 60
                                            ? 'hsl(43 45% 55%)'
                                            : 'hsl(160 60% 40%)',
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ INVEST CTA ═══ */}
            <div className="my-6 animate-fade-in-up animate-delay-1">
                {isPastCutoff ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                        <p className="text-sm text-red-400">
                            This offer is no longer accepting investments — it is too close to maturity.
                        </p>
                    </div>
                ) : (
                    <>
                        <InvestmentDialog
                            offer={offer}
                            trigger={
                                <Button className="w-full h-12 text-base font-semibold bg-[hsl(160_60%_40%)] hover:bg-[hsl(160_60%_35%)] text-white rounded-xl shadow-lg shadow-[hsl(160_60%_40%/0.15)] transition-all active:scale-[0.98]">
                                    Invest Now
                                </Button>
                            }
                        />
                        {isNearCutoff && (
                            <p className="text-xs text-amber-400 text-center mt-2">
                                ⏳ Investment window closes in {daysUntilCutoff} days
                            </p>
                        )}
                        <p className="text-xs text-center text-muted-foreground/50 mt-2">
                            Settlement via USDC on Stellar Network
                        </p>
                    </>
                )}
            </div>

            {/* ═══ DESCRIPTION ═══ */}
            {offer.description && (
                <>
                    <SectionDivider label="Overview" icon={<FileText className="h-3.5 w-3.5" />} />
                    <p className="text-muted-foreground text-[15px] leading-relaxed whitespace-pre-line">
                        {offer.description}
                    </p>
                </>
            )}

            {/* ═══ TERMS GRID (merged Investment Rules + Investment Terms) ═══ */}
            <SectionDivider label="Terms" icon={<TrendingUp className="h-3.5 w-3.5" />} />
            <div className="grid sm:grid-cols-2 gap-x-10 divide-y divide-white/8 sm:divide-y-0">
                <div className="divide-y divide-white/8">
                    {(offer.investor_rate || offer.annual_interest_rate) && (
                        <DetailRow label="Interest Rate" value={`${parseFloat((offer.investor_rate ?? offer.annual_interest_rate ?? 0).toString())}% APY`} />
                    )}
                    <DetailRow label="Payment Schedule" value={paymentLabel} />
                    {offer.maturity_date && (
                        <DetailRow label="Maturity Date" value={new Date(offer.maturity_date).toLocaleDateString()} />
                    )}
                    {offer.payment_day && (
                        <DetailRow label="Payment Day" value={`${ordinalDay(offer.payment_day)} of period`} />
                    )}
                </div>
                <div className="divide-y divide-white/8">
                    <DetailRow label="Unit Price" value={`$${unitPrice} USDC`} />
                    <DetailRow label="Total Supply" value={`${parseFloat(totalSupply.toString()).toLocaleString()} tokens`} />
                    {offerRules.min_investment && (
                        <DetailRow label="Min Investment" value={`$${Number(offerRules.min_investment).toLocaleString()} USDC`} />
                    )}
                    {offerRules.max_investment && (
                        <DetailRow label="Max Investment" value={`$${Number(offerRules.max_investment).toLocaleString()} USDC`} />
                    )}
                    {offer.bullet_payment_amount && (
                        <DetailRow label="Bullet Payment" value={`$${Number(offer.bullet_payment_amount).toLocaleString()}`} />
                    )}
                </div>
            </div>

            {/* ═══ COLLATERAL & SECURITY ═══ */}
            {hasCollateral && (
                <>
                    <SectionDivider label="Collateral & Security" icon={<ShieldCheck className="h-3.5 w-3.5" />} />

                    {/* LTV bar */}
                    {offer.collateral_ltv && offer.collateral_value && (
                        <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4 mb-4">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-muted-foreground">Loan-to-Value Ratio</span>
                                <span className="font-semibold text-[hsl(43_45%_55%)]">{Number(offer.collateral_ltv).toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-white/5 rounded-full h-2.5">
                                <div
                                    className="h-2.5 rounded-full transition-all duration-500"
                                    style={{
                                        width: `${Math.min(Number(offer.collateral_ltv), 100)}%`,
                                        background: Number(offer.collateral_ltv) <= 60
                                            ? 'hsl(160 60% 40%)'
                                            : Number(offer.collateral_ltv) <= 80
                                                ? 'hsl(43 45% 55%)'
                                                : 'hsl(0 70% 55%)',
                                    }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                                <span>Collateral: ${Number(offer.collateral_value).toLocaleString()}</span>
                                <span>Loan: {formatCurrency(totalRaise)}</span>
                            </div>
                        </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-x-10 divide-y divide-white/8 sm:divide-y-0">
                        <div className="divide-y divide-white/8">
                            {offer.collateral_type && (
                                <DetailRow label="Collateral Type" value={COLLATERAL_LABELS[offer.collateral_type] || offer.collateral_type} />
                            )}
                            {offer.collateral_value && (
                                <DetailRow label="Collateral Value" value={`$${Number(offer.collateral_value).toLocaleString()}`} />
                            )}
                        </div>
                    </div>

                    {offer.collateral_description && (
                        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                            {offer.collateral_description}
                        </p>
                    )}
                </>
            )}

            {/* ═══ ISSUER ═══ */}
            {company && (
                <>
                    <SectionDivider label="Issuer" icon={<Building2 className="h-3.5 w-3.5" />} />
                    <div className="grid sm:grid-cols-2 gap-x-10 divide-y divide-white/8 sm:divide-y-0">
                        <div className="divide-y divide-white/8">
                            <DetailRow label="Company" value={company.name} />
                            {company.cnpj && <DetailRow label="CNPJ" value={maskCnpj(company.cnpj)} />}
                            {company.legalRepresentative && <DetailRow label="Legal Rep." value={company.legalRepresentative} />}
                        </div>
                        <div className="divide-y divide-white/8">
                            {company.email && <DetailRow label="Contact" value={company.email} />}
                            {company.phone && <DetailRow label="Phone" value={company.phone} />}
                            {company.createdAt && <DetailRow label="Registered" value={new Date(company.createdAt).toLocaleDateString()} />}
                        </div>
                    </div>
                </>
            )}

            {/* ═══ LEGAL DOCUMENTS ═══ */}
            {legalDocs.length > 0 && (
                <>
                    <SectionDivider label="Documents" icon={<FileText className="h-3.5 w-3.5" />} />
                    <div className="space-y-2">
                        {legalDocs.map(([key, doc]) => {
                            const docObj = doc as { hash?: string; url?: string; fileName?: string };
                            const docUrl = docObj.url || (docObj.hash ? `https://ipfs.io/ipfs/${docObj.hash}` : null);
                            const docName = docObj.fileName || key.replace(/_/g, ' ');
                            return (
                                <a
                                    key={key}
                                    href={docUrl || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-[hsl(43_45%_55%/0.1)]">
                                            <FileText className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                                        </div>
                                        <span className="text-sm font-medium capitalize">{docName}</span>
                                    </div>
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[hsl(43_45%_55%)] transition-colors" />
                                </a>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ═══ TOKEN DETAILS (collapsible) ═══ */}
            {token && (
                <>
                    <SectionDivider label="On-Chain" icon={<Hash className="h-3.5 w-3.5" />} />

                    {/* Stellar Expert asset link — always visible */}
                    {token.issuerPublicKey && (
                        <a
                            href={`${stellarExplorerBase}/asset/${offer.asset_code}-${token.issuerPublicKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/8 transition-colors group mb-3"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-[hsl(43_45%_55%/0.1)]">
                                    <ExternalLink className="h-4 w-4 text-[hsl(43_45%_55%)]" />
                                </div>
                                <div>
                                    <span className="text-sm font-medium">View on Stellar Expert</span>
                                    <p className="text-[11px] text-muted-foreground">Token metadata, IPFS documents & on-chain activity</p>
                                </div>
                            </div>
                            <span className="font-mono text-xs text-muted-foreground group-hover:text-[hsl(43_45%_55%)] transition-colors">
                                {offer.asset_code}
                            </span>
                        </a>
                    )}

                    <button
                        onClick={() => setTokenDetailsOpen(!tokenDetailsOpen)}
                        className="w-full flex items-center justify-between py-2 text-sm text-muted-foreground hover:text-white transition-colors"
                    >
                        <span>Token details & blockchain data</span>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${tokenDetailsOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {tokenDetailsOpen && (
                        <div className="divide-y divide-white/8 animate-fade-in">
                            <DetailRow label="Asset Code" value={offer.asset_code} mono />

                            {token.issuerPublicKey && (
                                <DetailRow
                                    label="Issuer Account"
                                    value={
                                        <a href={`${stellarExplorerBase}/account/${token.issuerPublicKey}`} target="_blank" rel="noopener noreferrer" className="hover:text-[hsl(43_45%_55%)] transition-colors flex items-center gap-1">
                                            {truncateAddress(token.issuerPublicKey)}
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    }
                                    mono
                                    copyable={token.issuerPublicKey}
                                />
                            )}

                            {token.sacContractId && (
                                <DetailRow
                                    label="SAC Contract"
                                    value={
                                        <a href={`${stellarExplorerBase}/contract/${token.sacContractId}`} target="_blank" rel="noopener noreferrer" className="hover:text-[hsl(43_45%_55%)] transition-colors flex items-center gap-1">
                                            {truncateAddress(token.sacContractId)}
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    }
                                    mono
                                    copyable={token.sacContractId}
                                />
                            )}

                            {token.issuanceTransactionHash && (
                                <DetailRow
                                    label="Issuance Tx"
                                    value={
                                        <a href={`${stellarExplorerBase}/tx/${token.issuanceTransactionHash}`} target="_blank" rel="noopener noreferrer" className="hover:text-[hsl(43_45%_55%)] transition-colors flex items-center gap-1">
                                            {truncateAddress(token.issuanceTransactionHash)}
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    }
                                    mono
                                    copyable={token.issuanceTransactionHash}
                                />
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ═══ RISK DISCLOSURE ═══ */}
            <div className="mt-10 flex items-start gap-3 text-muted-foreground/40">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed">
                    Digital assets involve risk and may not be suitable for all investors.
                    Past performance does not guarantee future results. Review all legal
                    documents before investing. Your investment is not FDIC insured and
                    may lose value.
                </p>
            </div>
        </div>
    );
}
