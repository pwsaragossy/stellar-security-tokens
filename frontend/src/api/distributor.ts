/**
 * Admin API surface for the singleton YieldDistributor v3 contract.
 *
 * F-004 audit follow-up — exposes pause / resume / 2-step admin rotation
 * for the platform's YieldDistributor. All endpoints require platform-admin
 * auth and are audited via the AdminAction table (F-011 hook).
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
        const response = await api.get('/admin/distributor');
        return response.data;
    },

    /** Pause distribute() calls. */
    pause: async () => {
        const response = await api.post('/admin/distributor/pause');
        return response.data;
    },

    /** Resume a paused distributor. */
    resume: async () => {
        const response = await api.post('/admin/distributor/resume');
        return response.data;
    },

    /** Step 1 — current admin proposes a new admin. */
    proposeAdmin: async (newAdmin: string) => {
        const response = await api.post('/admin/distributor/propose-admin', { newAdmin });
        return response.data;
    },

    /** Step 2 — pending admin accepts ownership. */
    acceptAdmin: async () => {
        const response = await api.post('/admin/distributor/accept-admin');
        return response.data;
    },
};

export default distributorApi;
