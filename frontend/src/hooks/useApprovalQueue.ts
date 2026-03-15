import { useState, useEffect, useCallback, useMemo } from 'react';
import { platformAdminsApi } from '@/api/platformAdmins';
import { offersApi } from '@/api/offers';
import { api } from '@/lib/api';
import type { Investor } from '@/api/platformAdmins';
import type { Offer } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────

export type ApprovalType = 'investor' | 'company' | 'offer' | 'issuance' | 'token' | 'multisig';

export interface ApprovalItem {
    id: string;            // composite: `${type}-${originalId}`
    originalId: number;
    type: ApprovalType;
    label: string;
    subtitle: string;
    status: string;        // raw status from source entity
    normalizedStatus: 'pending' | 'in_progress' | 'resolved';
    createdAt: string;
    raw: any;              // original entity for detail panel
}

export interface ApprovalCounts {
    all: number;
    investor: number;
    company: number;
    offer: number;
    issuance: number;
    token: number;
    multisig: number;
}

// ─── Status normalization ─────────────────────────────────────────────────

function normalizeStatus(type: ApprovalType, status: string): ApprovalItem['normalizedStatus'] {
    const pendingStatuses: Record<ApprovalType, string[]> = {
        investor: ['pending'],
        company: ['pending'],
        offer: ['pending_review', 'under_review'],
        issuance: ['needs_issue', 'needs_verify'],
        token: ['locked'],
        multisig: ['pending'],
    };

    const inProgressStatuses: Record<ApprovalType, string[]> = {
        investor: [],
        company: [],
        offer: [],
        issuance: ['issuing'],
        token: [],
        multisig: ['partially_signed', 'ready'],
    };

    if (pendingStatuses[type]?.includes(status)) return 'pending';
    if (inProgressStatuses[type]?.includes(status)) return 'in_progress';
    return 'resolved';
}

// ─── Normalizers per domain ───────────────────────────────────────────────

function normalizeInvestors(investors: Investor[]): ApprovalItem[] {
    return investors
        .filter((i) => i.status === 'pending')
        .map((inv) => ({
            id: `investor-${inv.id}`,
            originalId: inv.id,
            type: 'investor' as ApprovalType,
            label: inv.name,
            subtitle: inv.email,
            status: inv.status,
            normalizedStatus: normalizeStatus('investor', inv.status),
            createdAt: inv.createdAt,
            raw: inv,
        }));
}

function normalizeCompanies(companies: any[]): ApprovalItem[] {
    return companies
        .filter((c) => c.status === 'pending')
        .map((co) => ({
            id: `company-${co.id}`,
            originalId: co.id,
            type: 'company' as ApprovalType,
            label: co.name,
            subtitle: co.cnpj || co.email || '',
            status: co.status,
            normalizedStatus: normalizeStatus('company', co.status),
            createdAt: co.createdAt || co.created_at || '',
            raw: co,
        }));
}

function normalizeOffers(offers: Offer[]): ApprovalItem[] {
    return offers
        .filter((o) => ['pending_review', 'under_review'].includes(o.status))
        .map((offer) => ({
            id: `offer-${offer.id}`,
            originalId: offer.id,
            type: 'offer' as ApprovalType,
            label: offer.offer_name,
            subtitle: `${offer.asset_code} · ${offer.offer_type}`,
            status: offer.status,
            normalizedStatus: normalizeStatus('offer', offer.status),
            createdAt: offer.created_at,
            raw: offer,
        }));
}

function normalizeTokens(offers: Offer[]): ApprovalItem[] {
    return offers
        .filter((o) => o.isTokenLocked === true && o.status === 'active')
        .map((offer) => ({
            id: `token-${offer.id}`,
            originalId: offer.id,
            type: 'token' as ApprovalType,
            label: offer.asset_code,
            subtitle: `${offer.offer_name} · Locked`,
            status: 'locked',
            normalizedStatus: normalizeStatus('token', 'locked'),
            createdAt: offer.created_at,
            raw: offer,
        }));
}

function normalizeMultisig(transactions: any[]): ApprovalItem[] {
    const items: ApprovalItem[] = [];
    const maturityGroups = new Map<string, any[]>();

    for (const tx of transactions) {
        // Group maturity_clawback by batchGroupId
        if (tx.operationType === 'maturity_clawback' && tx.metadata?.batchGroupId) {
            const groupId = tx.metadata.batchGroupId;
            if (!maturityGroups.has(groupId)) maturityGroups.set(groupId, []);
            maturityGroups.get(groupId)!.push(tx);
            continue;
        }

        // Normal multisig items
        let label = tx.operationType?.replace(/_/g, ' ') || `Tx #${tx.id}`;
        let subtitle = tx.description || `${tx.signatureStatus?.collected || 0}/${tx.thresholdRequired} signatures`;
        if (tx.operationType === 'treasury_payment' && tx.metadata?.subtype === 'deposit_relay') {
            label = `💱 Relay: ${tx.metadata.investorName || 'Investor'}`;
            subtitle = `${tx.metadata.amount || '?'} ${tx.metadata.assetCode || 'USDC'} → smart wallet`;
        }
        items.push({
            id: `multisig-${tx.id}`,
            originalId: tx.id,
            type: 'multisig' as ApprovalType,
            label,
            subtitle,
            status: tx.status,
            normalizedStatus: normalizeStatus('multisig', tx.status),
            createdAt: tx.createdAt,
            raw: tx,
        });
    }

    // Add grouped maturity items
    for (const [groupId, txs] of maturityGroups) {
        const assetCode = txs[0]?.metadata?.assetCode || 'Token';
        const offerId = txs[0]?.metadata?.offerId;
        const totalInvestors = txs.reduce((sum, tx) =>
            sum + (tx.metadata?.breakdown?.length || 0), 0
        );

        // Use the worst status across batches for the group
        const statuses = txs.map(tx => tx.status);
        const groupStatus = statuses.includes('pending') ? 'pending'
            : statuses.includes('partially_signed') ? 'partially_signed'
            : statuses.every(s => s === 'ready') ? 'ready'
            : 'pending';

        items.push({
            id: `multisig-maturity-${groupId}`,
            originalId: txs[0].id,  // First TX for primary action
            type: 'multisig' as ApprovalType,
            label: `🔥 Maturity: ${assetCode} (${txs.length} batch${txs.length > 1 ? 'es' : ''})`,
            subtitle: `${totalInvestors} investors · Offer #${offerId}`,
            status: groupStatus,
            normalizedStatus: normalizeStatus('multisig', groupStatus),
            createdAt: txs[0].createdAt,
            raw: {
                // Expose all batch TXs for the detail panel
                ...txs[0],
                isMaturityGroup: true,
                batchGroupId: groupId,
                batchTransactions: txs,
                batchCount: txs.length,
                totalInvestors,
            },
        });
    }

    return items;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useApprovalQueue() {
    const [items, setItems] = useState<ApprovalItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [investorsRes, companiesRes, offersRes, txRes] = await Promise.allSettled([
                platformAdminsApi.getInvestors(),
                api.get('/platform-admins/companies?status=pending'),
                offersApi.getAllAdmin(),
                api.get('/admin/transactions/pending'),
            ]);

            const merged: ApprovalItem[] = [];

            // Investors
            if (investorsRes.status === 'fulfilled' && investorsRes.value?.data) {
                merged.push(...normalizeInvestors(investorsRes.value.data));
            }

            // Companies
            if (companiesRes.status === 'fulfilled') {
                const data = companiesRes.value?.data || companiesRes.value;
                merged.push(...normalizeCompanies(data || []));
            }

            // Pending multisig TXs
            if (txRes.status === 'fulfilled') {
                const txData = txRes.value?.data?.transactions || txRes.value?.transactions || [];
                merged.push(...normalizeMultisig(txData));
            }

            // Offers: pending review + token locks
            if (offersRes.status === 'fulfilled' && offersRes.value?.data) {
                const allOffers = offersRes.value.data;
                merged.push(...normalizeOffers(allOffers));
                merged.push(...normalizeTokens(allOffers));
            }

            // Sort: pending first, then by creation date (oldest first within group)
            merged.sort((a, b) => {
                const order = { pending: 0, in_progress: 1, resolved: 2 };
                const statusDiff = order[a.normalizedStatus] - order[b.normalizedStatus];
                if (statusDiff !== 0) return statusDiff;
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            });

            setItems(merged);
        } catch (err: any) {
            setError(err.message || 'Failed to load approvals');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const counts = useMemo<ApprovalCounts>(() => {
        const c: ApprovalCounts = { all: 0, investor: 0, company: 0, offer: 0, issuance: 0, token: 0, multisig: 0 };
        for (const item of items) {
            if (item.normalizedStatus !== 'resolved') {
                c.all++;
                c[item.type]++;
            }
        }
        return c;
    }, [items]);

    return { items, counts, loading, error, refresh: fetchAll };
}
