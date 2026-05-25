/**
 * SettlementController — Admin endpoints for MaturitySettlement v2 contract management.
 *
 * v2 wires the new contract functions — pause, resume,
 * propose_admin, accept_admin, and read-only queries — through HTTP so
 * operators have the <30-min incident-containment lever Caroline's class
 * defines as the standard.
 *
 * Pattern: validate → resolve contract → SorobanSettlementService.build*Xdr
 * → TransactionManager.submit() → 202. The TransactionManager handles
 * single-sign vs multisig routing via KeyManager threshold map.
 * All requirePlatformAdmin-gated; audit log emitted automatically via
 * authorize.js attachAdminAuditHook.
 */
import prisma from '../config/prisma.js';
import { SorobanSettlementService } from '../services/sorobanSettlement.service.js';
import { TransactionManager } from '../services/transactionManager.service.js';
import { GRACE_PERIOD_DAYS } from '../services/companyPayment.service.js';
import { NotificationService } from '../services/notification.service.js';
import { EmailService } from '../services/email.service.js';
import logger from '../utils/logger.js';

const log = logger.scope('SettlementCtrl');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Strict Stellar account-key regex (G... addresses only). */
const STELLAR_G_ADDRESS = /^G[A-Z2-7]{55}$/;

/** Resolve offerId param → offer record. Throws 404 if not found. */
async function resolveOffer(offerIdParam) {
    const id = parseInt(offerIdParam, 10);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('Invalid offerId');
        err.status = 400;
        throw err;
    }
    const offer = await prisma.offer.findUnique({ where: { id } });
    if (!offer) {
        const err = new Error('Offer not found');
        err.status = 404;
        throw err;
    }
    return offer;
}

/** Require that the offer has a deployed settlement contract. */
function requireDeployedContract(offer) {
    if (!offer.sorobanSettlementContractId) {
        const err = new Error('Offer has no deployed settlement contract');
        err.status = 400;
        throw err;
    }
}

/**
 * Map a downstream error (Soroban auth, contract-error code, etc.) into a stable
 * HTTP response. Preserves err.status if already set; otherwise infers 400 for
 * known contract codes and 500 for everything else.
 */
function mapServiceError(err) {
    if (err?.status) return err;

    const parsed = SorobanSettlementService.parseContractError(err);
    if (parsed.code !== 'Unknown') {
        const e = new Error(parsed.message);
        e.status = 400;
        e.code = parsed.code;
        return e;
    }

    // Soroban auth failures (wrong signer) — detect by message substring.
    const msg = err?.message ?? '';
    if (/InvalidAction|require_auth|authentication|auth.*failed/i.test(msg)) {
        const e = new Error('Auth failed — only the proposed admin can accept this role. Switch wallets and try again.');
        e.status = 400;
        e.code = 'NotPendingAdmin';
        return e;
    }

    return err;
}

export class SettlementController {

    /**
     * GET /api/admin/settlements/:offerId
     *
     * Aggregated read of on-chain settlement state in a single round-trip.
     * Returns {deployed:false} for offers without a deployed contract (200, not 404)
     * so the UI can render a "Deploy Contract" CTA without a special-case.
     */
    static async status(req, res, next) {
        try {
            const offer = await resolveOffer(req.params.offerId);

            if (!offer.sorobanSettlementContractId) {
                return res.json({
                    offerId: offer.id,
                    deployed: false,
                    contractId: null,
                    paused: null,
                    admin: null,
                    pendingAdmin: null,
                    balance: null,
                    version: null,
                    v2Ready: false,
                    maturityDate: offer.maturityDate,
                });
            }

            const [paused, admin, pendingAdmin, balance, version] = await Promise.all([
                SorobanSettlementService.getPaused(offer.id).catch(() => null),
                SorobanSettlementService.getActiveAdmin(offer.id).catch(() => null),
                SorobanSettlementService.getPendingAdmin(offer.id).catch(() => null),
                SorobanSettlementService.getContractBalance(offer.id).catch(() => null),
                SorobanSettlementService.getVersion(offer.id).catch(() => 1),
            ]);

            res.json({
                offerId: offer.id,
                deployed: true,
                contractId: offer.sorobanSettlementContractId,
                paused: paused ?? false,
                admin,
                pendingAdmin,
                balance,
                version,
                v2Ready: version >= 2,
                maturityDate: offer.maturityDate,
            });
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /** POST /api/admin/settlements/:offerId/pause */
    static async pause(req, res, next) {
        try {
            const offer = await resolveOffer(req.params.offerId);
            requireDeployedContract(offer);

            const built = await SorobanSettlementService.buildPauseXdr(offer.id);
            const submitted = await TransactionManager.submit({
                xdr: built.xdr,
                signingRole: 'ISSUER',
                operationType: 'settlement_pause',
                metadata: { offerId: offer.id, contractId: offer.sorobanSettlementContractId },
                description: `Pause settlement contract for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            log.info(`[pause] offer=${offer.id} actor=${req.user?.id}`);
            res.status(202).json(submitted);
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /** POST /api/admin/settlements/:offerId/resume */
    static async resume(req, res, next) {
        try {
            const offer = await resolveOffer(req.params.offerId);
            requireDeployedContract(offer);

            const built = await SorobanSettlementService.buildResumeXdr(offer.id);
            const submitted = await TransactionManager.submit({
                xdr: built.xdr,
                signingRole: 'ISSUER',
                operationType: 'settlement_resume',
                metadata: { offerId: offer.id, contractId: offer.sorobanSettlementContractId },
                description: `Resume settlement contract for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            log.info(`[resume] offer=${offer.id} actor=${req.user?.id}`);
            res.status(202).json(submitted);
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /**
     * POST /api/admin/settlements/:offerId/propose-admin
     * Body: { newAdmin: "G..." }
     */
    static async proposeAdmin(req, res, next) {
        try {
            const offer = await resolveOffer(req.params.offerId);
            requireDeployedContract(offer);

            const { newAdmin } = req.body ?? {};
            if (typeof newAdmin !== 'string' || !STELLAR_G_ADDRESS.test(newAdmin)) {
                const err = new Error('newAdmin must be a 56-char Stellar account address starting with G');
                err.status = 400;
                throw err;
            }

            const built = await SorobanSettlementService.buildProposeAdminXdr(offer.id, newAdmin);
            const submitted = await TransactionManager.submit({
                xdr: built.xdr,
                signingRole: 'ISSUER',
                operationType: 'settlement_propose_admin',
                metadata: {
                    offerId: offer.id,
                    contractId: offer.sorobanSettlementContractId,
                    newAdmin,
                },
                description: `Propose ${newAdmin.slice(0, 8)}… as new settlement admin for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            log.info(`[proposeAdmin] offer=${offer.id} newAdmin=${newAdmin.slice(0, 8)}… actor=${req.user?.id}`);
            res.status(202).json(submitted);
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /**
     * POST /api/admin/settlements/:offerId/mark-defaulted
     *
     * Admin formally declares an offer as defaulted. This is a DB-only,
     * non-on-chain operation — it unblocks the collateral distribution flow
     * (DefaultCases) by setting status='defaulted'. The on-chain settlement
     * contract is unaffected; collateral distribution remains a separate
     * admin-signed flow.
     *
     * Body: { confirm_asset_code: 'ABC123' } — must equal offer.assetCode.
     *
     * Guards:
     *   - offerType === 'collateral' (sale offers have no default flow)
     *   - maturityDate present and in the past
     *   - daysSinceMaturity > GRACE_PERIOD_DAYS (10)
     *   - status not already 'defaulted' (idempotent: returns 200 with current state)
     *   - sorobanSettlementContractId deployed (collateral distribution needs it)
     *   - typed confirmation matches assetCode (prevents fat-finger from drain)
     *
     * Side effects (atomic):
     *   - status = 'defaulted', paymentDueStatus = 'defaulted', clear requires_settlement_deploy
     *   - notify each distributed investor (in-app + email — best effort)
     *   - audit log via requirePlatformAdmin attachAdminAuditHook
     */
    static async markDefaulted(req, res, next) {
        try {
            const offer = await resolveOffer(req.params.offerId);

            // Idempotent: already defaulted → 200 with current state
            if (offer.status === 'defaulted') {
                return res.status(200).json({
                    success: true,
                    alreadyDefaulted: true,
                    offerId: offer.id,
                    status: offer.status,
                    paymentDueStatus: offer.paymentDueStatus,
                    message: 'Offer already marked as defaulted',
                });
            }

            // Guard: only collateral offers have default flow
            if (offer.offerType !== 'collateral') {
                const err = new Error('Default declaration is only available for collateral (debt) offers');
                err.status = 400;
                err.code = 'NotCollateralOffer';
                throw err;
            }

            // Guard: must have a maturityDate
            if (!offer.maturityDate) {
                const err = new Error('Offer has no maturity date — default does not apply');
                err.status = 400;
                err.code = 'NoMaturityDate';
                throw err;
            }

            // Guard: maturity must be in the past + grace period elapsed
            const now = new Date();
            const daysSinceMaturity = Math.floor((now - new Date(offer.maturityDate)) / DAY_MS);
            if (daysSinceMaturity <= GRACE_PERIOD_DAYS) {
                const err = new Error(
                    `Grace period not yet elapsed: ${daysSinceMaturity} day(s) since maturity, ` +
                    `must be > ${GRACE_PERIOD_DAYS}. Wait ${GRACE_PERIOD_DAYS - daysSinceMaturity + 1} more day(s).`
                );
                err.status = 400;
                err.code = 'GracePeriodActive';
                throw err;
            }

            // Guard: settlement contract must be deployed (collateral distribution depends on it)
            if (!offer.sorobanSettlementContractId) {
                const err = new Error(
                    'Cannot mark as defaulted: settlement contract not deployed. ' +
                    'Deploy it via POST /api/admin/offers/:id/deploy-settlement first.'
                );
                err.status = 400;
                err.code = 'SettlementNotDeployed';
                throw err;
            }

            // Guard: typed confirmation — must match assetCode exactly (case-sensitive)
            const { confirm_asset_code } = req.body ?? {};
            if (typeof confirm_asset_code !== 'string' || confirm_asset_code !== offer.assetCode) {
                const err = new Error(
                    `Typed confirmation does not match. Provide confirm_asset_code="${offer.assetCode}" to proceed.`
                );
                err.status = 400;
                err.code = 'ConfirmationMismatch';
                throw err;
            }

            // Atomic update: status + paymentDueStatus + clear marker
            const currentRules = typeof offer.offerRules === 'string'
                ? JSON.parse(offer.offerRules)
                : offer.offerRules || {};
            const { requires_settlement_deploy: _drop, ...cleanRules } = currentRules;
            const updated = await prisma.offer.update({
                where: { id: offer.id },
                data: {
                    status: 'defaulted',
                    paymentDueStatus: 'defaulted',
                    offerRules: cleanRules,
                },
            });

            log.warn(`[markDefaulted] Offer ${offer.id} (${offer.assetCode}) DECLARED DEFAULTED by admin=${req.user?.userId} after ${daysSinceMaturity} days past maturity`);

            // Notify investors — best effort, do not fail the request if notifications fail
            const distributedInvestments = await prisma.investment.findMany({
                where: { offerId: offer.id, status: 'distributed' },
                include: { investor: true },
            });

            const investorIds = new Set(distributedInvestments.map(inv => inv.investorId));
            for (const investorId of investorIds) {
                const investor = distributedInvestments.find(inv => inv.investorId === investorId)?.investor;
                if (!investor) continue;

                try {
                    await NotificationService.createNotification(
                        investorId,
                        'investor',
                        'error',
                        `Offer Defaulted: ${offer.offerName || offer.assetCode}`,
                        `The issuer of "${offer.offerName || offer.assetCode}" did not return your principal at maturity. ` +
                        `An admin has declared the offer defaulted. Collateral distribution will follow.`,
                        '/investor/portfolio',
                    );
                } catch (notifErr) {
                    log.warn(`[markDefaulted] Failed to notify investor ${investorId}: ${notifErr.message}`);
                }

                if (investor.email) {
                    try {
                        await EmailService.sendAdminAlert?.(investor.email, investor.name, {
                            title: `Offer Defaulted: ${offer.assetCode}`,
                            message: `The issuer of "${offer.offerName || offer.assetCode}" did not return your principal at maturity. ` +
                                `An admin has formally declared the offer defaulted. Collateral distribution will follow.`,
                            actionUrl: '/investor/portfolio',
                            actionLabel: 'View Portfolio',
                            severity: 'error',
                        });
                    } catch (emailErr) {
                        log.warn(`[markDefaulted] Failed to email investor ${investorId}: ${emailErr.message}`);
                    }
                }
            }

            return res.status(200).json({
                success: true,
                offerId: updated.id,
                assetCode: updated.assetCode,
                status: updated.status,
                paymentDueStatus: updated.paymentDueStatus,
                daysSinceMaturity,
                investorsNotified: investorIds.size,
                message: 'Offer marked as defaulted. Collateral distribution flow unblocked in DefaultCases.',
            });
        } catch (err) {
            next(mapServiceError(err));
        }
    }

    /**
     * POST /api/admin/settlements/:offerId/accept-admin
     *
     * The pending admin signs. We read the pending admin from chain to ensure
     * the TX source matches (otherwise Soroban auth fails opaquely).
     */
    static async acceptAdmin(req, res, next) {
        try {
            const offer = await resolveOffer(req.params.offerId);
            requireDeployedContract(offer);

            const pending = await SorobanSettlementService.getPendingAdmin(offer.id);
            if (!pending || typeof pending !== 'string' || !STELLAR_G_ADDRESS.test(pending)) {
                const err = new Error('No pending admin proposal exists for this contract — call propose_admin first');
                err.status = 400;
                err.code = 'NoPendingAdmin';
                throw err;
            }

            const built = await SorobanSettlementService.buildAcceptAdminXdr(offer.id, pending);
            const submitted = await TransactionManager.submit({
                xdr: built.xdr,
                // Pending admin signs — TransactionManager treats this as a Freighter flow
                // when the source is not a known server-side keypair. Routing handled there.
                signingRole: 'PENDING_ADMIN',
                operationType: 'settlement_accept_admin',
                metadata: {
                    offerId: offer.id,
                    contractId: offer.sorobanSettlementContractId,
                    pendingAdmin: pending,
                },
                description: `Accept settlement admin role for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            log.info(`[acceptAdmin] offer=${offer.id} pending=${pending.slice(0, 8)}… actor=${req.user?.id}`);
            res.status(202).json(submitted);
        } catch (err) {
            next(mapServiceError(err));
        }
    }
}
