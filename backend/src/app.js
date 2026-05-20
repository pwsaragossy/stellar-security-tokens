import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { initSentry, sentryRequestHandler, sentryErrorHandler } from './config/sentry.js';
import investorRoutes from './routes/investorRoutes.js';
import tokenRoutes from './routes/tokenRoutes.js';
import investmentRoutes from './routes/investmentRoutes.js';
import authRoutes from './routes/authRoutes.js';

import companyRoutes from './routes/companyRoutes.js';
import companyUserRoutes from './routes/companyUserRoutes.js';
import platformAdminRoutes from './routes/platformAdminRoutes.js';
import offerRoutes from './routes/offerRoutes.js';
import webauthnRoutes from './routes/webauthnRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import companyPaymentRoutes from './routes/companyPaymentRoutes.js';
import adminTransactionRoutes from './routes/adminTransactionRoutes.js';
import securityRoutes from './routes/securityRoutes.js';
import rampWebhookRoutes from './routes/rampWebhookRoutes.js';
import rampRoutes from './routes/rampRoutes.js';
import { swaggerUi, swaggerSpec } from './config/swagger.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter, authLimiter, apiLimiter, strictLimiter } from './middleware/rateLimit.js';
import logger from './utils/logger.js';
const log = logger.scope('App');
import path from 'path';

// Load env vars if not already loaded
if (!process.env.JWT_SECRET) {
    dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
    dotenv.config();
}

// Initialize Sentry error monitoring (must be before app creation)
initSentry();

const app = express();

// Trust proxies on private networks (Docker internal IPs)
// Handles both Caddy→Backend (1 hop) and Caddy→Nginx→Backend (2 hops)
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for Swagger UI
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:5173'],
        },
    },
}));

// SEP-1: stellar.toml MUST be served with CORS * (before the restrictive global CORS)
import { TomlService } from './services/toml.service.js';
app.options('/.well-known/stellar.toml', cors({ origin: '*' })); // Preflight
app.get('/.well-known/stellar.toml', cors({ origin: '*' }), async (req, res) => {
    try {
        const tomlContent = await TomlService.generateToml();
        res.setHeader('Content-Type', 'text/plain');
        res.send(tomlContent);
    } catch (error) {
        log.error('Error generating stellar.toml:', error);
        res.status(500).send('# Error generating stellar.toml');
    }
});

// CORS: Support multiple origins (comma-separated in FRONTEND_URL)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim());

// In development, also allow common localhost variants
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:5173', 'http://localhost:80', 'http://localhost');
}

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // Check if origin matches any allowed origin (including wildcard subdomains for tunnels)
        const isAllowed = allowedOrigins.some(allowed => {
            // Allow any Cloudflare tunnel in development only (H2 security fix)
            if (process.env.NODE_ENV !== 'production'
                && allowed.includes('trycloudflare.com')
                && origin.includes('trycloudflare.com')) {
                return true;
            }
            return allowed === origin;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            log.warn(`Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(hpp()); // HTTP Parameter Pollution protection
app.use(cookieParser());
app.use(morgan('combined'));

// EtherFuse webhooks MUST be mounted before express.json() — HMAC verification
// requires the raw body for RFC 8785 JCS canonicalization. The route's own
// express.raw() parser scopes to application/json.
if (process.env.ENABLE_ETHERFUSE_ANCHOR === 'true') {
    app.use('/api/webhooks', rampWebhookRoutes);
}

app.use(express.json({ limit: '2mb' })); // Soroban passkey-signed XDRs can be 200-500kb
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Strip error.message / details from 5xx responses in production (H-1)
import { responseSanitizer } from './middleware/responseSanitizer.js';
app.use(responseSanitizer);

// Apply global rate limiting to all routes (100 req/min per IP)
app.use(globalLimiter);

// Sentry request handler (must be first middleware after body parsing)
if (process.env.SENTRY_DSN) {
    app.use(sentryRequestHandler);
}

// Swagger documentation (disabled in production — H1 security fix)
if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Stellar Security Tokens API Docs',
    }));

    // Serve Swagger spec as JSON
    app.get('/api-docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });
}



/**
 * @swagger
 * /health:
 *   get:
 *     summary: Liveness probe — confirms the API process is running
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is alive
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

/**
 * @swagger
 * /ready:
 *   get:
 *     summary: Readiness probe — checks DB and Redis connectivity
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: All dependencies healthy
 *       503:
 *         description: One or more dependencies are down
 */
app.get('/ready', async (req, res) => {
    const checks = { db: false, redis: false };

    // Check Postgres
    try {
        const prisma = (await import('./config/prisma.js')).default;
        await prisma.$queryRaw`SELECT 1`;
        checks.db = true;
    } catch { /* db down */ }

    // Check Redis
    try {
        const { getRedisClient } = await import('./config/redis.js');
        const client = getRedisClient();
        if (client?.isOpen) {
            await client.ping();
            checks.redis = true;
        }
    } catch { /* redis down */ }

    const healthy = checks.db && checks.redis;
    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ready' : 'degraded',
        checks,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

// Auth routes with strict rate limiting (5 req/min - prevents brute force)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/webauthn', authLimiter, webauthnRoutes);

// Standard API routes with moderate rate limiting (30 req/min)
app.use('/api/investors', apiLimiter, investorRoutes);
app.use('/api/tokens', apiLimiter, tokenRoutes);
app.use('/api/investments', apiLimiter, investmentRoutes);
app.use('/api/companies', apiLimiter, companyRoutes);
app.use('/api/company-users', apiLimiter, companyUserRoutes);
app.use('/api/platform-admins', apiLimiter, platformAdminRoutes);

// Payment routes with strict rate limiting (10 req/min - expensive operations)

app.use('/api/company/payments', strictLimiter, companyPaymentRoutes);
app.use('/api/wallets', apiLimiter, walletRoutes);
app.use('/api/security', apiLimiter, securityRoutes);

app.use('/api', apiLimiter, offerRoutes);

// Notification routes
import notificationRoutes from './routes/notificationRoutes.js';
app.use('/api/notifications', apiLimiter, notificationRoutes);

// EtherFuse anchor — BRL/PIX on-ramp routes (investor-facing).
// Webhook receiver is mounted earlier (before express.json) for raw-body HMAC.
if (process.env.ENABLE_ETHERFUSE_ANCHOR === 'true') {
    app.use('/api/ramp', apiLimiter, rampRoutes);
}

// Admin multisig transaction routes (strict limiting for security)
app.use('/api/admin/transactions', strictLimiter, adminTransactionRoutes);

// Admin contract management routes
import contractRoutes from './routes/contractRoutes.js';
app.use('/api/admin/contracts', strictLimiter, contractRoutes);

// Admin MaturitySettlement v2 management routes (F-003 follow-up)
import settlementAdminRoutes from './routes/settlementAdminRoutes.js';
app.use('/api/admin/settlements', strictLimiter, settlementAdminRoutes);

// Admin YieldDistributor v3 management routes (F-004 follow-up — singleton, no offerId)
import distributorAdminRoutes from './routes/distributorAdminRoutes.js';
app.use('/api/admin/distributor', strictLimiter, distributorAdminRoutes);

// Read-only feed of the AdminAction audit log + security anomalies (F-009 follow-up)
import securityEventsRoutes from './routes/securityEventsRoutes.js';
app.use('/api/admin/security-events', strictLimiter, securityEventsRoutes);


app.use(notFoundHandler);

// Sentry error handler (must be before custom error handler)
if (process.env.SENTRY_DSN) {
    app.use(sentryErrorHandler);
}

app.use(errorHandler);

export default app;
