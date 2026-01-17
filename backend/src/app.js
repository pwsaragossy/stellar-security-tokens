import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import dotenv from 'dotenv';
import investorRoutes from './routes/investorRoutes.js';
import tokenRoutes from './routes/tokenRoutes.js';
import investmentRoutes from './routes/investmentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import companyUserRoutes from './routes/companyUserRoutes.js';
import platformAdminRoutes from './routes/platformAdminRoutes.js';
import offerRoutes from './routes/offerRoutes.js';
import webauthnRoutes from './routes/webauthnRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import companyPaymentRoutes from './routes/companyPaymentRoutes.js';
import adminTransactionRoutes from './routes/adminTransactionRoutes.js';
import { swaggerUi, swaggerSpec } from './config/swagger.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter, authLimiter, apiLimiter, strictLimiter } from './middleware/rateLimit.js';
import path from 'path';

// Load env vars if not already loaded
if (!process.env.JWT_SECRET) {
    dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
    // Fallback to local .env if parent not found or for other vars
    dotenv.config();
}

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
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(hpp()); // HTTP Parameter Pollution protection
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply global rate limiting to all routes (100 req/min per IP)
app.use(globalLimiter);

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
app.get('/.well-known/stellar.toml', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const issuerKey = process.env.STELLAR_ISSUER_PUBLIC_KEY || '';
    const tomlContent = `ACCOUNTS=[
"${issuerKey}"
]

VERSION="2.0.0"
`;
    res.send(tomlContent);
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
app.use('/api/payments', strictLimiter, paymentRoutes);
app.use('/api/company/payments', strictLimiter, companyPaymentRoutes);
app.use('/api/wallets', apiLimiter, walletRoutes);

app.use('/api', apiLimiter, offerRoutes);

// Notification routes
import notificationRoutes from './routes/notificationRoutes.js';
app.use('/api/notifications', apiLimiter, notificationRoutes);

// Admin multisig transaction routes (strict limiting for security)
app.use('/api/admin/transactions', strictLimiter, adminTransactionRoutes);


app.use(notFoundHandler);
app.use(errorHandler);

export default app;
