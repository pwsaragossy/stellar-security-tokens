/**
 * Investor-facing ramp REST routes.
 *
 * All endpoints require an authenticated investor (passkey-bound JWT).
 *
 *   GET    /api/ramp/readiness                       — readiness gate (UI uses this to render KYC vs deposit)
 *   POST   /api/ramp/kyc                             — submit/update KYC + provision EtherFuse customer
 *   POST   /api/ramp/bank-accounts                   — register PIX bank account
 *   GET    /api/ramp/bank-accounts                   — list active bank accounts
 *   DELETE /api/ramp/bank-accounts/:id               — soft-delete a bank account
 *   POST   /api/ramp/quotes                          — BRL → TESOURO quote (on-ramp)
 *   POST   /api/ramp/orders                          — execute on-ramp quote, returns PIX deposit instructions
 *   GET    /api/ramp/orders                          — list orders (most recent first)
 *   GET    /api/ramp/orders/:id                      — single order detail (on-ramp + off-ramp)
 *   POST   /api/ramp/dev/fiat-received/:id           — sandbox-only PIX simulator (404 in production)
 *
 *   Off-ramp (ENABLE_OFFRAMP=true only — routes 404 when disabled):
 *   POST   /api/ramp/offramp/quotes                  — TESOURO|USDC → BRL quote
 *   POST   /api/ramp/offramp/orders                  — execute off-ramp quote (Anchor Mode)
 *   POST   /api/ramp/offramp/orders/:id/prepare-tx   — build unsigned SAC transfer XDR + Memo.hash
 *   POST   /api/ramp/offramp/orders/:id/submit-tx    — submit passkey-signed XDR
 *   POST   /api/ramp/offramp/orders/:id/cancel       — cancel an order in `created` state
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
  createOfframpQuote,
  createOfframpOrder,
  prepareOfframpTx,
  submitOfframpTx,
  cancelOfframpOrder,
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

// ─── Off-ramp routes (feature-flagged) ───────────────────────────────────────
//
// Mounted only when ENABLE_OFFRAMP=true. Default off until the Phase 0 sandbox
// probe (per plans/we-have-just-made-fancy-token.md) confirms EtherFuse's
// anchor monitor detects SAC-sourced credits. When disabled, the entire
// /offramp/* surface returns the default 404 from Express.
if (process.env.ENABLE_OFFRAMP === 'true') {
  router.post('/offramp/quotes', createOfframpQuote);
  router.post('/offramp/orders', createOfframpOrder);
  router.post('/offramp/orders/:id/prepare-tx', prepareOfframpTx);
  router.post('/offramp/orders/:id/submit-tx', submitOfframpTx);
  router.post('/offramp/orders/:id/cancel', cancelOfframpOrder);
}

export default router;
