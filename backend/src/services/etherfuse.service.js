/**
 * EtherFuse FX API client.
 *
 * Thin HTTP wrapper around https://api.sand.etherfuse.com (sandbox) and
 * https://api.etherfuse.com (production). Auth is a plain API key in the
 * Authorization header — NO `Bearer` prefix.
 *
 * Public docs live at docs.etherfuse.com; this client matches the OpenAPI
 * surface present in May 2026. BR-specific request fields (BRL source asset,
 * PIX bank-account schema) are accepted at the wire level but are NOT in the
 * public OpenAPI yet — discover the exact shape via the sandbox probe.
 *
 * Idempotency rules
 *   - Every order, quote, customer, bank-account, and wallet UUID is
 *     CLIENT-GENERATED. Pass the same UUID twice and you get the same record.
 *   - Quotes expire 2 minutes after creation. Create the order promptly.
 *   - `GET /ramp/order/{id}` has a 3–10s indexing delay after `POST /ramp/order`.
 *     Rely on the `order_updated` webhook as primary state source, not polling.
 *
 * Errors
 *   - All non-2xx responses throw `EtherFuseApiError` with `status`, `body`,
 *     and `path`. Caller decides whether to retry / surface to user.
 */
import logger from '../utils/logger.js';

const log = logger.scope('EtherFuseClient');

export class EtherFuseApiError extends Error {
  constructor(message, { status, body, path, method } = {}) {
    super(message);
    this.name = 'EtherFuseApiError';
    this.status = status;
    this.body = body;
    this.path = path;
    this.method = method;
  }
}

function getBaseUrl() {
  return process.env.ETHERFUSE_API_BASE_URL || 'https://api.sand.etherfuse.com';
}

function getApiKey() {
  const key = process.env.ETHERFUSE_API_KEY;
  if (!key) {
    throw new EtherFuseApiError('ETHERFUSE_API_KEY is not set', {
      status: 0,
      path: '(env)',
      method: 'init',
    });
  }
  return key;
}

function redactKey(key) {
  if (!key) return '(none)';
  if (key.length < 12) return '(short)';
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

async function request(method, path, { body, query } = {}) {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();

  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const url = `${baseUrl}${path}${qs}`;

  const headers = {
    Authorization: apiKey, // NOT `Bearer ${apiKey}` — EtherFuse rejects that.
    Accept: 'application/json',
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  log.debug(`${method} ${path}`, { url, apiKey: redactKey(apiKey) });

  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new EtherFuseApiError(`Network error calling EtherFuse: ${err.message}`, {
      status: 0,
      body: { error: err.message },
      path,
      method,
    });
  }

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    log.warn(`EtherFuse ${res.status} ${method} ${path}`, { body: parsed });
    throw new EtherFuseApiError(
      `EtherFuse ${res.status} on ${method} ${path}`,
      { status: res.status, body: parsed, path, method }
    );
  }

  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resources — grouped by REST surface
// ─────────────────────────────────────────────────────────────────────────────

/** Auth + org info. */
export const Auth = {
  /** GET /ramp/me — smoke-test auth + read partnerFeeDefaultBps, etc. */
  async me() {
    return request('GET', '/ramp/me');
  },
};

/** Child organizations / customers under your top-level org. */
export const Organizations = {
  /**
   * POST /ramp/organization
   * Creates a child org (= customer). Pass `id` (UUID you generate) — that
   * becomes the customerId used everywhere downstream.
   *
   * @param {object} payload — see docs for full schema; minimal fields are:
   *   id, displayName, accountType ("personal"|"business"), userInfo (personal only)
   */
  async create(payload) {
    return request('POST', '/ramp/organization', { body: payload });
  },
};

/** Customer-scoped onboarding endpoints. */
export const Customers = {
  /** GET /ramp/customer/{id} — fetch a customer's current state. */
  async get(customerId) {
    return request('GET', `/ramp/customer/${customerId}`);
  },

  /**
   * POST /ramp/customer/{id}/kyc — programmatic KYC submission.
   * In sandbox this auto-approves the customer; production triggers review.
   *
   * Required identity fields (per docs, MX-centric — BR shape probed live):
   *   pubkey, identity.{ id, email, phoneNumber, occupation,
   *                       name.{givenName,familyName}, dateOfBirth,
   *                       address.{street,city,region,postalCode,country},
   *                       idNumbers[] (CURP/RFC for MX, CPF for BR) }
   */
  async submitKyc(customerId, payload) {
    return request('POST', `/ramp/customer/${customerId}/kyc`, { body: payload });
  },

  /**
   * POST /ramp/customer/{id}/kyc/documents — upload selfie / ID images.
   * Optional in sandbox (auto-approved on identity submission); required in production.
   */
  async uploadKycDocuments(customerId, payload) {
    return request('POST', `/ramp/customer/${customerId}/kyc/documents`, { body: payload });
  },

  /** POST /ramp/customer/{id}/bank-account — register a fiat bank account. */
  async registerBankAccount(customerId, payload) {
    return request('POST', `/ramp/customer/${customerId}/bank-account`, { body: payload });
  },

  /** POST /ramp/customer/{id}/wallet — register a wallet under a child-org customer. */
  async registerWallet(customerId, payload) {
    return request('POST', `/ramp/customer/${customerId}/wallet`, { body: payload });
  },

  /** GET /ramp/customer/{id}/kyc — fetch KYC status. */
  async getKycStatus(customerId) {
    return request('GET', `/ramp/customer/${customerId}/kyc`);
  },
};

/** Wallets registered to your top-level org (vs. child customer wallets). */
export const Wallets = {
  /** POST /ramp/wallet — idempotent register/restore. */
  async register(payload) {
    return request('POST', '/ramp/wallet', { body: payload });
  },
};

/** Asset discovery. */
export const Assets = {
  /**
   * GET /ramp/assets?blockchain=&currency=&wallet=
   * All three params are REQUIRED — missing any returns 400.
   * `wallet` is used for trustline / account-existence fee quoting.
   */
  async list({ blockchain, currency, wallet }) {
    return request('GET', '/ramp/assets', {
      query: { blockchain, currency, wallet },
    });
  },
};

/** Pricing. */
export const Quotes = {
  /**
   * POST /ramp/quote — get a fee-inclusive price quote.
   * Quotes expire after 2 minutes. Pass `walletAddress` on Stellar onramps
   * so the fee reflects any one-time onboarding cost for new wallets.
   *
   * @param {object} payload — { quoteId, customerId, blockchain,
   *   quoteAssets:{ type:"onramp"|"offramp"|"swap", sourceAsset, targetAsset },
   *   sourceAmount, walletAddress? }
   */
  async create(payload) {
    return request('POST', '/ramp/quote', { body: payload });
  },
};

/** Orders — the actual ramp transactions. */
export const Orders = {
  /**
   * POST /ramp/order — execute against a quote.
   * @param {object} payload — { orderId, bankAccountId, quoteId,
   *   publicKey | cryptoWalletId, memo?, useAnchor? (Stellar offramp only) }
   */
  async create(payload) {
    return request('POST', '/ramp/order', { body: payload });
  },

  /** GET /ramp/order/{id} — full order state. Subject to 3–10s indexing delay after create. */
  async get(orderId) {
    return request('GET', `/ramp/order/${orderId}`);
  },

  /** POST /ramp/order/{id}/cancel — only valid before `funded`. */
  async cancel(orderId) {
    return request('POST', `/ramp/order/${orderId}/cancel`);
  },

  /**
   * POST /ramp/order/{id}/regenerate_tx — refresh stale tx XDR.
   * Stellar onramp claim transactions go stale when their sequence number drifts.
   */
  async regenerateTx(orderId) {
    return request('POST', `/ramp/order/${orderId}/regenerate_tx`);
  },

  /**
   * POST /ramp/order/fiat_received — SANDBOX ONLY simulator. Marks the order
   * as if the fiat deposit landed, triggering `funded` → `completed` flow.
   * The handler in our rampRoutes.js hard-guards against NODE_ENV=production,
   * but this client method also throws in production for defense in depth.
   */
  async simulateFiatReceived({ orderId, amount }) {
    if (process.env.NODE_ENV === 'production') {
      throw new EtherFuseApiError('fiat_received simulator is sandbox-only', {
        status: 0,
        path: '/ramp/order/fiat_received',
        method: 'POST',
      });
    }
    return request('POST', '/ramp/order/fiat_received', {
      body: { orderId, amount },
    });
  },
};

/** Hosted onboarding (we use programmatic, but the URL helper is occasionally useful). */
export const Onboarding = {
  /** POST /ramp/onboarding-url — generate a presigned URL for hosted KYC. */
  async generateUrl(payload) {
    return request('POST', '/ramp/onboarding-url', { body: payload });
  },
};

/**
 * Legal agreement acceptance (production-only). Sandbox auto-approves KYC
 * without these; production requires all three before the customer is
 * order-eligible. Paths confirmed via Elliot's Regional Starter Pack client —
 * plural `agreements`, NOT singular `agreement`.
 */
export const Agreements = {
  async electronicSignature(presignedUrl) {
    return request('POST', '/ramp/agreements/electronic-signature', { body: { presignedUrl } });
  },
  async termsAndConditions(presignedUrl) {
    return request('POST', '/ramp/agreements/terms-and-conditions', { body: { presignedUrl } });
  },
  async customerAgreement(presignedUrl) {
    return request('POST', '/ramp/agreements/customer-agreement', { body: { presignedUrl } });
  },
  /** Accept all three in sequence (resolves to the final response). */
  async acceptAll(presignedUrl) {
    await Agreements.electronicSignature(presignedUrl);
    await Agreements.termsAndConditions(presignedUrl);
    return Agreements.customerAgreement(presignedUrl);
  },
};

/** Webhook subscription management. */
export const Webhooks = {
  /**
   * POST /ramp/webhook — create a subscription.
   * Response includes a `secret` (base64) returned ONCE — persist it as
   * ETHERFUSE_WEBHOOK_SECRET. Used to verify HMAC-SHA256 X-Signature.
   */
  async create({ url, eventType }) {
    return request('POST', '/ramp/webhook', { body: { url, eventType } });
  },

  /** GET /ramp/webhook — list subscriptions. */
  async list() {
    return request('GET', '/ramp/webhook');
  },

  /** DELETE /ramp/webhook/{id} */
  async remove(webhookId) {
    return request('DELETE', `/ramp/webhook/${webhookId}`);
  },
};

export default {
  Auth,
  Organizations,
  Customers,
  Agreements,
  Wallets,
  Assets,
  Quotes,
  Orders,
  Onboarding,
  Webhooks,
  EtherFuseApiError,
};
