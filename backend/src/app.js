import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply global rate limiting to all routes (100 req/min per IP)
app.use(globalLimiter);

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

app.use('/api', apiLimiter, offerRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
