/**
 * Per-investor daily cap enforcement.
 *
 * Caroline's class emphasized "limites operacionais" as a defense layer
 * for compromised credentials — even if an attacker has the passkey,
 * a daily cap bounds the blast radius.
 *
 * The cap lives at `Investor.dailyCapUsd` (Decimal, nullable). NULL = no
 * cap (back-compat default for existing investors). Set via the admin's
 * PATCH /api/admin/investors/:id endpoint.
 *
 * This middleware should be mounted on fund-moving routes (POST
 * /api/investments/purchase, etc) AFTER authenticateToken. It reads the
 * investor's cap, sums their approved investments in the trailing 24h,
 * and rejects with 403 + DAILY_CAP_EXCEEDED if the requested amount
 * would push them over.
 *
 * Fail-open on database errors — better to allow an investment than
 * block legitimate flow because Prisma hiccupped. The audit log captures
 * the attempt either way.
 */
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const log = logger.scope('DailyCapCheck');

/**
 * Resolve the requested amount from the request body. Default extraction:
 *   - req.body.amountUsd (preferred)
 *   - req.body.amount    (fallback)
 * Override via the `amountExtractor` option for routes that put the amount elsewhere.
 *
 * Returns a positive number, or null if no amount could be resolved (in
 * which case the check is skipped — middleware fails open).
 */
function defaultAmountExtractor(req) {
    const raw = req.body?.amountUsd ?? req.body?.amount;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

/**
 * Express middleware factory. Returns a middleware that 403-rejects
 * when the investor's 24h-trailing total + the current request would
 * exceed `Investor.dailyCapUsd`.
 *
 * @param {object} options
 * @param {(req: import('express').Request) => number | null} [options.amountExtractor]
 * @returns {import('express').RequestHandler}
 */
export function dailyCapCheck({ amountExtractor = defaultAmountExtractor } = {}) {
    return async (req, res, next) => {
        try {
            const investorId = req.user?.userId;
            const userType = req.user?.userType;

            // Only enforce for investor users — other roles (company, admin) are out of scope.
            if (userType !== 'investor' || !Number.isInteger(investorId)) {
                return next();
            }

            const investor = await prisma.investor.findUnique({
                where: { id: investorId },
                select: { dailyCapUsd: true },
            });

            // No cap set → unbounded (back-compat default).
            if (!investor?.dailyCapUsd) return next();

            const requestAmount = amountExtractor(req);
            // No identifiable amount → skip (middleware shouldn't gate flows it doesn't understand).
            if (requestAmount == null) return next();

            const cap = Number(investor.dailyCapUsd);
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Sum approved investments in the trailing 24h.
            // The exact "approved" set depends on the platform's investment-status
            // model. Conservative default: include any investment row that isn't
            // explicitly cancelled / failed. Tighten in a follow-up if needed.
            const agg = await prisma.investment.aggregate({
                where: {
                    investorId,
                    createdAt: { gte: twentyFourHoursAgo },
                    status: { notIn: ['cancelled', 'failed', 'rejected'] },
                },
                _sum: { amountUsd: true },
            });

            const trailing = Number(agg._sum.amountUsd ?? 0);
            const projected = trailing + requestAmount;

            if (projected > cap) {
                log.warn(
                    `[cap-exceeded] investor=${investorId} 24h=${trailing} req=${requestAmount} cap=${cap}`,
                );
                return res.status(403).json({
                    error: `Daily cap exceeded. Trailing 24h total $${trailing.toFixed(2)} + requested $${requestAmount.toFixed(2)} > cap $${cap.toFixed(2)}.`,
                    code: 'DAILY_CAP_EXCEEDED',
                    capUsd: cap,
                    trailing24hUsd: trailing,
                    requestedUsd: requestAmount,
                });
            }

            return next();
        } catch (err) {
            // Fail-open on DB errors so a Prisma hiccup doesn't block trading.
            log.error('DailyCap check failed (fail-open):', err?.message ?? String(err));
            return next();
        }
    };
}

export default dailyCapCheck;
