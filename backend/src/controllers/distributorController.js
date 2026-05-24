/**
 * DistributorController — Admin endpoints for the YieldDistributor v3 singleton.
 *
 * audit follow-up — operator-facing pause / resume / 2-step admin
 * rotation for the platform's singleton YieldDistributor contract. Unlike
 * settlement contracts (per-offer), YieldDistributor is a single contract
 * shared across all offers, so the URL is platform-scoped — no offerId.
 *
 * Pattern mirrors SettlementController. All requirePlatformAdmin-gated;
 * audit log emitted automatically via authorize.js attachAdminAuditHook.
 */
import { YieldDistributorService } from '../services/yieldDistributor.service.js';
import { TransactionManager } from '../services/transactionManager.service.js';
import logger from '../utils/logger.js';

const log = logger.scope('DistributorCtrl');

const STELLAR_G_ADDRESS = /^G[A-Z2-7]{55}$/;

/**
 * Map a downstream error into a stable HTTP response.
 * - Soroban contract errors → 400 with the parsed code.
 * - Soroban auth failures on accept-admin → 400 NotPendingAdmin.
 * - Everything else preserved.
 */
function mapServiceError(err) {
    if (err?.status) return err;

    const parsed = YieldDistributorService.parseContractError(err);
    if (parsed.code !== 'Unknown') {
        const e = new Error(parsed.message);
        e.status = 400;
        e.code = parsed.code;
        return e;
    }

    const msg = err?.message ?? '';
    if (/InvalidAction|require_auth|authentication|auth.*failed/i.test(msg)) {
        const e = new Error('Auth failed — only the proposed admin can accept this role. Switch wallets and try again.');
        e.status = 400;
        e.code = 'NotPendingAdmin';
        return e;
    }

    return err;
}

export class DistributorController {

    /**
     * GET /api/admin/distributor
     *
     * Aggregated on-chain view of the singleton YieldDistributor.
     * Returns deployed=false if YIELD_DISTRIBUTOR_CONTRACT_ID is unset
     * (200, not 404 — the env is the deployment marker).
     */
    static async status(req, res, next) {
        try {
            let contractId;
            try {
                contractId = YieldDistributorService.getContractId();
            } catch {
                return res.json({
                    deployed: false,
                    contractId: null,
                    paused: null,
                    admin: null,
                    pendingAdmin: null,
                    version: null,
                    v3Ready: false,
                });
            }

            const [paused, admin, pendingAdmin, version] = await Promise.all([
                YieldDistributorService.getPaused().catch(() => null),
                YieldDistributorService.getActiveAdmin().catch(() => null),
                YieldDistributorService.getPendingAdmin().catch(() => null),
                YieldDistributorService.getVersion().catch(() => 2),
            ]);

            res.json({
                deployed: true,
                contractId,
                paused: paused ?? false,
                admin,
                pendingAdmin,
                version,
                v3Ready: (version ?? 2) >= 3,
            });
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /** POST /api/admin/distributor/pause */
    static async pause(req, res, next) {
        try {
            const built = await YieldDistributorService.buildPauseXdr();
            const submitted = await TransactionManager.submit({
                xdr: built.xdr,
                signingRole: 'ISSUER',
                operationType: 'distributor_pause',
                metadata: { contractId: built.contractId },
                description: 'Pause YieldDistributor singleton',
                initiatorId: req.user?.id,
            });
            log.info(`[pause] actor=${req.user?.id}`);
            res.status(202).json(submitted);
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /** POST /api/admin/distributor/resume */
    static async resume(req, res, next) {
        try {
            const built = await YieldDistributorService.buildResumeXdr();
            const submitted = await TransactionManager.submit({
                xdr: built.xdr,
                signingRole: 'ISSUER',
                operationType: 'distributor_resume',
                metadata: { contractId: built.contractId },
                description: 'Resume YieldDistributor singleton',
                initiatorId: req.user?.id,
            });
            log.info(`[resume] actor=${req.user?.id}`);
            res.status(202).json(submitted);
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /** POST /api/admin/distributor/propose-admin   body: { newAdmin: "G..." } */
    static async proposeAdmin(req, res, next) {
        try {
            const { newAdmin } = req.body ?? {};
            if (typeof newAdmin !== 'string' || !STELLAR_G_ADDRESS.test(newAdmin)) {
                const err = new Error('newAdmin must be a 56-char Stellar account address starting with G');
                err.status = 400;
                throw err;
            }

            const built = await YieldDistributorService.buildProposeAdminXdr(newAdmin);
            const submitted = await TransactionManager.submit({
                xdr: built.xdr,
                signingRole: 'ISSUER',
                operationType: 'distributor_propose_admin',
                metadata: { contractId: built.contractId, newAdmin },
                description: `Propose ${newAdmin.slice(0, 8)}… as new YieldDistributor admin`,
                initiatorId: req.user?.id,
            });
            log.info(`[proposeAdmin] newAdmin=${newAdmin.slice(0, 8)}… actor=${req.user?.id}`);
            res.status(202).json(submitted);
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /** POST /api/admin/distributor/accept-admin */
    static async acceptAdmin(req, res, next) {
        try {
            const pending = await YieldDistributorService.getPendingAdmin();
            if (!pending || typeof pending !== 'string' || !STELLAR_G_ADDRESS.test(pending)) {
                const err = new Error('No pending admin proposal exists — call propose_admin first');
                err.status = 400;
                err.code = 'NoPendingAdmin';
                throw err;
            }

            const built = await YieldDistributorService.buildAcceptAdminXdr(pending);
            const submitted = await TransactionManager.submit({
                xdr: built.xdr,
                signingRole: 'PENDING_ADMIN',
                operationType: 'distributor_accept_admin',
                metadata: { contractId: built.contractId, pendingAdmin: pending },
                description: 'Accept YieldDistributor admin role',
                initiatorId: req.user?.id,
            });
            log.info(`[acceptAdmin] pending=${pending.slice(0, 8)}… actor=${req.user?.id}`);
            res.status(202).json(submitted);
        } catch (err) {
            next(mapServiceError(err));
        }
    }
}
