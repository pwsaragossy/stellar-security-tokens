import {
    Users,
    Building2,
    FileText,
    Lock,
    Fingerprint,
} from 'lucide-react';
import type { ApprovalType } from '@/hooks/useApprovalQueue';

// ─── Design tokens ────────────────────────────────────────────────────────

export const TYPE_CONFIG: Record<ApprovalType, { icon: typeof Users; label: string; color: string; badgeCls: string }> = {
    investor: {
        icon: Users,
        label: 'Investors',
        color: 'text-teal-400',
        badgeCls: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    },
    company: {
        icon: Building2,
        label: 'Companies',
        color: 'text-slate-300',
        badgeCls: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    },
    offer: {
        icon: FileText,
        label: 'Offers',
        color: 'text-amber-400',
        badgeCls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    },
    issuance: {
        icon: Lock,
        label: 'Issuance',
        color: 'text-blue-400',
        badgeCls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
    multisig: {
        icon: Fingerprint,
        label: 'Signatures',
        color: 'text-purple-400',
        badgeCls: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    },
};

export const STATUS_BADGE: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

// ─── Helpers ──────────────────────────────────────────────────────────────

export function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

export function timeRemaining(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m left`;
}
