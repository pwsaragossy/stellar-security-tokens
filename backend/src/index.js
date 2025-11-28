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
import { startPaymentScheduler } from './services/paymentScheduler.js';
import { getPaymentMonitor } from './services/PaymentMonitor.service.js';
import { initDistributionQueue } from './services/distributionQueue.service.js';

import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

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

// Process-level error handlers to prevent crashes from unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  // Suppress specific Redis/Bull initialization errors that are expected
  let shouldSuppress = false;

  if (reason instanceof Error) {
    const errorMessage = reason.message || '';
    const errorCode = reason.code || '';

    // Check for AggregateError (common with Redis connection errors)
    if (reason.constructor.name === 'AggregateError' || reason.name === 'AggregateError') {
      // Check if any error in the errors array has ECONNREFUSED
      if (reason.errors && Array.isArray(reason.errors)) {
        const hasECONNREFUSED = reason.errors.some(err =>
          err && (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED'))
        );
        if (hasECONNREFUSED) {
          shouldSuppress = true;
        }
      }
      // Also check the main error code
      if (errorCode === 'ECONNREFUSED') {
        shouldSuppress = true;
      }
    }

    // These errors occur during Bull initialization when Redis isn't ready yet
    // They're handled by Bull's error handlers, so we can suppress them here
    if (errorMessage.includes('enableOfflineQueue') ||
      errorMessage.includes('Stream isn\'t writeable') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorCode === 'ECONNREFUSED') {
      shouldSuppress = true;
    }
  }

  if (shouldSuppress) {
    // These are expected during initialization and handled by Bull's error handlers
    return;
  }

  console.error('[UNHANDLED REJECTION] Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);
  // Log error details for debugging
  if (reason instanceof Error) {
    console.error('Error stack:', reason.stack);
  }
  // Don't exit - allow server to continue running
  // In production, you might want to log to an error tracking service
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION] Uncaught Exception:', error);
  console.error('Error stack:', error.stack);
  // For uncaught exceptions, we should exit gracefully
  // But log first to help with debugging
  // In production, you might want to log to an error tracking service before exiting
  process.exit(1);
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  // Iniciar agendamento automático de pagamentos
  const enableAutoPayments = process.env.ENABLE_AUTO_PAYMENTS !== 'false';
  if (enableAutoPayments) {
    try {
      const assetCode = process.env.ASSET_CODE || 'SIN01';
      startPaymentScheduler(assetCode);
      console.log(`Automatic payment scheduler enabled for asset: ${assetCode}`);
      console.log('Payments will be processed automatically on the 1st of each month at 00:00 UTC');
    } catch (error) {
      console.error('Failed to start payment scheduler:', error.message);
      console.warn('Automatic payments will not be scheduled. You can process payments manually via POST /api/payments/process');
    }
  } else {
    console.log('Automatic payment scheduler is disabled (ENABLE_AUTO_PAYMENTS=false)');
    console.log('You can process payments manually via POST /api/payments/process');
  }

  // Iniciar monitoramento de pagamentos USDC em tempo real
  const enablePaymentMonitoring = process.env.ENABLE_PAYMENT_MONITORING !== 'false';
  if (enablePaymentMonitoring) {
    try {
      const paymentMonitor = getPaymentMonitor();
      await paymentMonitor.start();
      console.log('Payment monitoring enabled - USDC payments will be processed automatically');
    } catch (error) {
      console.error('Failed to start payment monitoring:', error.message);
      console.warn('Payment monitoring disabled. Investments will require manual verification.');
    }
  } else {
    console.log('Payment monitoring is disabled (ENABLE_PAYMENT_MONITORING=false)');
  }

  // Inicializar fila de distribuição de tokens (com retry automático)
  const enableDistributionQueue = process.env.ENABLE_DISTRIBUTION_QUEUE !== 'false';
  if (enableDistributionQueue) {
    try {
      const queue = initDistributionQueue();
      if (queue) {
        console.log('Distribution queue enabled - token distributions will be processed with automatic retry');
      } else {
        console.warn('Distribution queue disabled - Redis not available. Distributions will be processed synchronously.');
      }
    } catch (error) {
      console.error('Failed to initialize distribution queue:', error.message);
      console.warn('Distribution queue disabled. Distributions will be processed synchronously.');
    }
  } else {
    console.log('Distribution queue is disabled (ENABLE_DISTRIBUTION_QUEUE=false)');
  }
});

export default app;

