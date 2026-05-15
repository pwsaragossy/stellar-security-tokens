/**
 * Investor-facing ramp REST routes.
 *
 * All endpoints require an authenticated investor (passkey-bound JWT).
 *
 *   GET    /api/ramp/readiness                — readiness gate (UI uses this to render KYC vs deposit)
 *   POST   /api/ramp/kyc                      — submit/update KYC + provision EtherFuse customer
 *   POST   /api/ramp/bank-accounts            — register PIX bank account
 *   GET    /api/ramp/bank-accounts            — list active bank accounts
 *   DELETE /api/ramp/bank-accounts/:id        — soft-delete a bank account
 *   POST   /api/ramp/quotes                   — BRL → TESOURO quote
 *   POST   /api/ramp/orders                   — execute a quote, returns PIX deposit instructions
 *   GET    /api/ramp/orders                   — list orders (most recent first)
 *   GET    /api/ramp/orders/:id               — single order detail
 *   POST   /api/ramp/dev/fiat-received/:id    — sandbox-only PIX simulator (404 in production)
 *
 * Mounted in src/app.js under the ENABLE_ETHERFUSE_ANCHOR feature flag, AFTER
 * the global express.json() (these are JSON bodies, not raw — only the webhook
 * receiver needs raw).
 */
import express from 'express';

import { authenticateToken } from '../middleware/auth.js';
import { requireInvestor } from '../middleware/authorize.js';
import {
  getReadiness,
  submitKyc,
  createBankAccount,
  listBankAccounts,
  deleteBankAccount,
  createQuote,
  createOrder,
  listOrders,
  getOrder,
  simulateFiatReceived,
} from '../controllers/rampController.js';

const router = express.Router();

// All routes require an authenticated investor.
router.use(authenticateToken, requireInvestor);

router.get('/readiness', getReadiness);

router.post('/kyc', submitKyc);

router.post('/bank-accounts', createBankAccount);
router.get('/bank-accounts', listBankAccounts);
router.delete('/bank-accounts/:id', deleteBankAccount);

router.post('/quotes', createQuote);

router.post('/orders', createOrder);
router.get('/orders', listOrders);
router.get('/orders/:id', getOrder);

// Sandbox-only — handler returns 404 in production.
router.post('/dev/fiat-received/:orderId', simulateFiatReceived);

export default router;
