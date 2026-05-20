/**
 * Admin API surface for the singleton YieldDistributor v3 contract.
 *
 * F-004 audit follow-up — exposes pause / resume / 2-step admin rotation
 * for the platform's YieldDistributor. All endpoints require platform-admin
 * auth and are audited via the AdminAction table (F-011 hook).
 *
 * Uses the fetch-wrapper client at `@/lib/api` (NOT the axios client at
 * `@/api/client`). The fetch wrapper returns the parsed JSON body directly —
 * there is no `response.data` envelope here. Both `get(endpoint)` and
 * `post(endpoint, data)` require the second arg on POST.
 */
import { api } from '@/lib/api';

export interface DistributorStatus {
    deployed: boolean;
    contractId: string | null;
    paused: boolean | null;
    admin: string | null;
    pendingAdmin: string | null;
    version: number | null;
    v3Ready: boolean;
}

export const distributorApi = {
    /** Aggregated on-chain status for the singleton YieldDistributor. */
    getStatus: async (): Promise<DistributorStatus> => {
        return api.get('/admin/distributor');
    },

    /** Pause distribute() calls. */
    pause: async () => {
        return api.post('/admin/distributor/pause', {});
    },

    /** Resume a paused distributor. */
    resume: async () => {
        return api.post('/admin/distributor/resume', {});
    },

    /** Step 1 — current admin proposes a new admin. */
    proposeAdmin: async (newAdmin: string) => {
        return api.post('/admin/distributor/propose-admin', { newAdmin });
    },

    /** Step 2 — pending admin accepts ownership. */
    acceptAdmin: async () => {
        return api.post('/admin/distributor/accept-admin', {});
    },
};

export default distributorApi;
