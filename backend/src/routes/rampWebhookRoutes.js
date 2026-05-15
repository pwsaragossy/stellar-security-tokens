/**
 * EtherFuse webhook route.
 *
 *   POST /api/webhooks/etherfuse
 *
 * Mounted BEFORE the global express.json() middleware in src/index.js, so the
 * raw body is available for HMAC verification. The route registers its own
 * express.raw() parser scoped to application/json.
 *
 * No auth middleware — EtherFuse authenticates via X-Signature HMAC. The
 * handler returns 401 if the signature is missing or invalid.
 */
import express from 'express';

import { handleWebhook } from '../controllers/rampWebhookController.js';

const router = express.Router();

router.post(
  '/etherfuse',
  express.raw({ type: 'application/json', limit: '1mb' }),
  handleWebhook
);

export default router;
