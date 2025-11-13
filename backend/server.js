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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { startPaymentScheduler } from './services/paymentScheduler.js';

dotenv.config();

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

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
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
});

export default app;

