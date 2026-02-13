import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import dotenv from 'dotenv';
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
import { swaggerUi, swaggerSpec } from './config/swagger.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter, authLimiter, apiLimiter, strictLimiter } from './middleware/rateLimit.js';
import path from 'path';

// Load env vars if not already loaded
if (!process.env.JWT_SECRET) {
    dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
    dotenv.config();
}

// Initialize Sentry error monitoring (must be before app creation)
initSentry();

const app = express();

// Trust first proxy (nginx) - needed for rate limiting behind reverse proxy
app.set('trust proxy', 1);

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
            if (allowed.includes('trycloudflare.com') && origin.includes('trycloudflare.com')) {
                return true; // Allow any cloudflare tunnel
            }
            return allowed === origin;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(hpp()); // HTTP Parameter Pollution protection
app.use(morgan('combined'));
app.use(express.json({ limit: '100kb' })); // Limit body size to prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Apply global rate limiting to all routes (100 req/min per IP)
app.use(globalLimiter);

// Sentry request handler (must be first middleware after body parsing)
if (process.env.SENTRY_DSN) {
    app.use(sentryRequestHandler);
}

// Swagger documentation
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

// Serve stellar.toml for domain verification
import { TomlService } from './services/toml.service.js';
app.get('/.well-known/stellar.toml', async (req, res) => {
    try {
        const tomlContent = await TomlService.generateToml();
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(tomlContent);
    } catch (error) {
        console.error('Error generating stellar.toml:', error);
        res.status(500).send('# Error generating stellar.toml');
    }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: API is running
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
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

// Admin multisig transaction routes (strict limiting for security)
app.use('/api/admin/transactions', strictLimiter, adminTransactionRoutes);


app.use(notFoundHandler);

// Sentry error handler (must be before custom error handler)
if (process.env.SENTRY_DSN) {
    app.use(sentryErrorHandler);
}

app.use(errorHandler);

export default app;
