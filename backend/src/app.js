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

app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
        timestamp: new Date().toISOString(),
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/investors', investorRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/company-users', companyUserRoutes);
app.use('/api/platform-admins', platformAdminRoutes);
app.use('/api/webauthn', webauthnRoutes);

app.use('/api', offerRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
