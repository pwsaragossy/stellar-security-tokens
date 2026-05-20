/**
 * AddressDisplay — Address-poisoning-safe rendering of Stellar addresses /
 * contract IDs / tx hashes.
 *
 * Address-poisoning attacks (Caroline Cardoso, Stellar 37º, May 2026):
 *   An attacker vanity-generates a `G…` whose first-N and last-M chars match
 *   a target address. A truncated display (`GABC…WXYZ`) is visually
 *   indistinguishable from the real thing. The mitigation is that the FULL
 *   address must always be available on demand — not buried behind a copy
 *   button you have to paste somewhere else to read.
 *
 * This component renders the truncated form by default, shows the full
 * address in a hover tooltip (Radix), and optionally renders a copy button
 * and / or a Stellar Expert link.
 *
 * The component is the canonical address display going forward. Replace
 * inline `slice(0, N)…slice(-M)` patterns site by site.
 */
import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Copy, ExternalLink, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddressDisplayProps {
    /** The full address / contract ID / tx hash. Required. */
    value: string | null | undefined;

    /** Truncation widths as `[leading, trailing]`. Defaults to [6, 4]. */
    truncate?: [number, number];

    /** Show a copy-to-clipboard button next to the truncated form. */
    showCopy?: boolean;

    /** Render as a link to Stellar Expert (testnet / mainnet — defaults to testnet). */
    linkToExplorer?: boolean;

    /** Network for the explorer link. Defaults to 'testnet'. */
    network?: 'testnet' | 'mainnet';

    /** Kind of value — controls explorer URL path. Defaults to 'auto' (heuristic). */
    kind?: 'account' | 'contract' | 'tx' | 'auto';

    /** Side for the tooltip. Default 'top'. */
    side?: 'top' | 'right' | 'bottom' | 'left';

    /** Extra classes for the truncated text element. */
    className?: string;

    /** Render a placeholder when value is null/empty. Defaults to '—'. */
    placeholder?: string;
}

function detectKind(v: string): 'account' | 'contract' | 'tx' {
    if (!v) return 'tx';
    if (v.length === 56 && v.startsWith('G')) return 'account';
    if (v.length === 56 && v.startsWith('C')) return 'contract';
    return 'tx';
}

function buildExplorerUrl(v: string, kind: 'account' | 'contract' | 'tx', network: 'testnet' | 'mainnet') {
    const base = `https://stellar.expert/explorer/${network === 'mainnet' ? 'public' : 'testnet'}`;
    if (kind === 'account') return `${base}/account/${v}`;
    if (kind === 'contract') return `${base}/contract/${v}`;
    return `${base}/tx/${v}`;
}

function truncateString(v: string, [lead, trail]: [number, number]) {
    if (v.length <= lead + trail + 1) return v;
    return `${v.slice(0, lead)}…${v.slice(-trail)}`;
}

export function AddressDisplay({
    value,
    truncate = [6, 4],
    showCopy = false,
    linkToExplorer = false,
    network = 'testnet',
    kind = 'auto',
    side = 'top',
    className,
    placeholder = '—',
}: AddressDisplayProps) {
    const [copied, setCopied] = React.useState(false);

    if (!value) {
        return <span className={cn('text-zinc-500', className)}>{placeholder}</span>;
    }

    const resolvedKind = kind === 'auto' ? detectKind(value) : kind;
    const truncated = truncateString(value, truncate);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // clipboard API can fail in non-HTTPS dev — silently ignore
        }
    };

    return (
        <span className="inline-flex items-center gap-1.5 font-mono">
            <TooltipPrimitive.Provider delayDuration={200}>
                <TooltipPrimitive.Root>
                    <TooltipPrimitive.Trigger asChild>
                        <span
                            className={cn(
                                'cursor-help underline decoration-dotted decoration-zinc-500/40 underline-offset-2',
                                className,
                            )}
                            tabIndex={0}
                            aria-label={`Full value: ${value}`}
                        >
                            {truncated}
                        </span>
                    </TooltipPrimitive.Trigger>
                    <TooltipPrimitive.Portal>
                        <TooltipPrimitive.Content
                            side={side}
                            sideOffset={5}
                            className={cn(
                                'z-50 max-w-md overflow-hidden rounded-lg bg-slate-800 border border-white/10 px-3 py-2 shadow-xl',
                                'animate-in fade-in-0 zoom-in-95',
                                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
                            )}
                        >
                            <code className="text-[11px] text-slate-200 font-mono break-all leading-relaxed">{value}</code>
                            <TooltipPrimitive.Arrow className="fill-slate-800" />
                        </TooltipPrimitive.Content>
                    </TooltipPrimitive.Portal>
                </TooltipPrimitive.Root>
            </TooltipPrimitive.Provider>

            {showCopy && (
                <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center justify-center w-5 h-5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
                    aria-label="Copy full address"
                >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
            )}

            {linkToExplorer && (
                <a
                    href={buildExplorerUrl(value, resolvedKind, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-5 h-5 rounded text-zinc-400 hover:text-blue-400 hover:bg-white/[0.06] transition-colors"
                    aria-label="View on Stellar Expert"
                >
                    <ExternalLink className="w-3 h-3" />
                </a>
            )}
        </span>
    );
}

export default AddressDisplay;
