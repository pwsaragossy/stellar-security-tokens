/**
 * @swagger
 * tags:
 *   name: SecurityEvents
 *   description: Read-only admin view of the AdminAction audit log + anomaly events (F-009 follow-up)
 */
import { Router } from 'express';
import { requirePlatformAdmin } from '../middleware/authorize.js';
import { listRecentActions } from '../services/adminAuditLog.service.js';
import logger from '../utils/logger.js';

const log = logger.scope('SecurityEventsRoutes');

const router = Router();

router.use(requirePlatformAdmin);

/**
 * @swagger
 * /api/admin/security-events:
 *   get:
 *     summary: List recent AdminAction rows (denials, successes, anomalies).
 *     description: |
 *       Read-only feed of the immutable admin_actions table. Filters:
 *       actorId, targetType/targetId, result, actionPrefix (e.g.
 *       "SECURITY_ANOMALY"), from/to.
 *     tags: [SecurityEvents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 500 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, minimum: 0 }
 *       - in: query
 *         name: actorId
 *         schema: { type: integer }
 *       - in: query
 *         name: targetType
 *         schema: { type: string }
 *       - in: query
 *         name: targetId
 *         schema: { type: string }
 *       - in: query
 *         name: result
 *         schema: { type: string, enum: [success, failure, denied, detected] }
 *       - in: query
 *         name: actionPrefix
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: { items, total }
 */
router.get('/', async (req, res, next) => {
    try {
        const out = await listRecentActions({
            limit: req.query.limit,
            offset: req.query.offset,
            actorId: req.query.actorId ? parseInt(req.query.actorId, 10) : null,
            targetType: req.query.targetType ?? null,
            targetId: req.query.targetId ?? null,
            result: req.query.result ?? null,
            actionPrefix: req.query.actionPrefix ?? null,
            from: req.query.from ?? null,
            to: req.query.to ?? null,
        });
        res.json(out);
    } catch (err) {
        log.error('list failed:', err?.message ?? String(err));
        next(err);
    }
});

export default router;
