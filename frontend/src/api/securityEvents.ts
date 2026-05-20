/**
 * Admin API surface for the AdminAction audit log + security anomalies (F-009).
 *
 * Read-only feed. All filters optional. The backend caps `limit` at 500.
 */
import { api } from '@/lib/api';

export interface AdminActionRow {
    id: string;
    actorId: number | null;
    actorType: string | null;
    actorRole: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    payloadHash: string | null;
    ip: string | null;
    userAgent: string | null;
    result: string;
    statusCode: number | null;
    createdAt: string;
}

export interface SecurityEventsResponse {
    items: AdminActionRow[];
    total: number;
}

export interface SecurityEventsFilters {
    limit?: number;
    offset?: number;
    actorId?: number;
    targetType?: string;
    targetId?: string;
    result?: 'success' | 'failure' | 'denied' | 'detected';
    actionPrefix?: string;
    from?: string;
    to?: string;
}

function toQuery(filters: SecurityEventsFilters): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== '') {
            params.set(k, String(v));
        }
    }
    const s = params.toString();
    return s ? `?${s}` : '';
}

export const securityEventsApi = {
    list: async (filters: SecurityEventsFilters = {}): Promise<SecurityEventsResponse> => {
        return api.get(`/admin/security-events${toQuery(filters)}`);
    },
};

export default securityEventsApi;
