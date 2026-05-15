/**
 * EtherFuse fiat ramp API client.
 *
 * Mirrors the conventions in investors.ts: axios envelopes via the shared
 * `client`, ApiResponse<T> wrappers, kebab-case URL paths.
 *
 * Architecture note: Path A — TESOURO delivers directly to the investor's
 * Soroban C-address. No claim transactions, no custodial keys. Backend
 * enforces a readiness gate on every endpoint (KYC approved + active bank
 * account); the same gate is exposed via /api/ramp/readiness for the UI.
 */
import api from './client';
import type { ApiResponse } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the Prisma models the backend returns.
// ─────────────────────────────────────────────────────────────────────────────

export type RampOrderStatus =
  | 'created'
  | 'funded'
  | 'completed'
  | 'finalized'
  | 'failed'
  | 'refunded'
  | 'canceled'
  | 'expired';

export type RampWalletKycStatus =
  | 'not_started'
  | 'proposed'
  | 'approved'
  | 'approved_chain_deploying'
  | 'rejected';

export type RampBankAccountStatus =
  | 'pending'
  | 'awaiting_deposit_verification'
  | 'active'
  | 'inactive';

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';

export type ReadinessBlockedReason =
  | null
  | 'missing_fields'
  | 'customer_not_provisioned'
  | 'kyc_pending'
  | 'kyc_rejected'
  | 'no_active_bank_account';

export interface RampReadiness {
  isReady: boolean;
  blockedReason: ReadinessBlockedReason;
  missingFields: string[];
  /** True when backend points at EtherFuse sandbox — enables testnet-only UI affordances. */
  sandbox: boolean;
  /**
   * True when `ENABLE_OFFRAMP=true` on the backend. The off-ramp routes are
   * unmounted otherwise, so the WithdrawDialog hides the PIX destination
   * entirely. Per memory: never read `import.meta.env` for feature flags —
   * the production frontend is a static build, this MUST come from the API.
   */
  offrampEnabled: boolean;
  customer: null | {
    etherfuseCustomerId: string;
    kycStatus: RampWalletKycStatus;
    kycRejectionReason: string | null;
  };
  wallet: null | { kycStatus: RampWalletKycStatus; publicKey: string };
  bankAccounts: Array<{
    id: number;
    etherfuseBankAccountId: string;
    status: RampBankAccountStatus;
    abbrPixKey: string | null;
    isDefault: boolean;
  }>;
}

export interface RampBankAccount {
  id: number;
  etherfuseBankAccountId: string;
  label: string | null;
  pixKey: string;
  pixKeyType: PixKeyType;
  abbrPixKey: string | null;
  status: RampBankAccountStatus;
  isDefault: boolean;
  createdAt: string;
}

export interface RampQuote {
  id: number;
  etherfuseQuoteId: string;
  orderType: 'onramp' | 'offramp';
  sourceAsset: string;
  targetAsset: string;
  sourceAmount: string;
  destinationAmount: string | null;
  feeBps: number | null;
  feeAmount: string | null;
  exchangeRate: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface RampOrder {
  id: number;
  etherfuseOrderId: string;
  orderType: 'onramp' | 'offramp';
  status: RampOrderStatus;
  amountInFiat: string | null;
  amountInTokens: string | null;
  sourceAsset: string | null;
  targetAsset: string | null;
  pixInstructions: PixInstructions | null;
  pixExpiresAt: string | null;
  confirmedTxSignature: string | null;
  statusPage: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  fundedAt: string | null;
  completedAt: string | null;
}

/**
 * Shape of `pixInstructions` returned from POST /api/ramp/orders.
 *
 * Canonical BR/PIX field names confirmed via Elliot's Regional Starter Pack
 * client (src/lib/anchors/etherfuse/client.ts): `depositPixCode`,
 * `depositPixKey`, `depositPixKeyType`, `beneficiary`. Legacy MX/BR field
 * names retained as defensive fallbacks.
 */
export interface PixInstructions {
  // BR/PIX (canonical)
  depositPixCode?: string;
  depositPixKey?: string;
  depositPixKeyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp' | string;
  beneficiary?: string;
  // Generic
  depositAmount?: string | number;
  depositBankName?: string;
  depositAccountHolder?: string;
  // Fallbacks / legacy
  depositClabe?: string;
  brcode?: string;
  qrCode?: string;
  dynamicKey?: string;
  expiresAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export const rampApi = {
  /** Read the readiness gate. Frontend polls this to render the right state. */
  getReadiness: async (): Promise<ApiResponse<RampReadiness>> => {
    const res = await api.get('/ramp/readiness');
    return res.data;
  },

  /** Submit full KYC in one shot (provisions EtherFuse customer + KYC submission). */
  submitKyc: async (fields: {
    givenName: string;
    familyName: string;
    dateOfBirth: string; // YYYY-MM-DD
    phone: string;
    occupation: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    region: string;
    postalCode: string;
    country?: string;
  }): Promise<ApiResponse<{ submission: unknown; readiness: RampReadiness }>> => {
    const res = await api.post('/ramp/kyc', fields);
    return res.data;
  },

  /** Register a PIX bank account. */
  createBankAccount: async (data: {
    pixKey: string;
    pixKeyType: PixKeyType;
    label?: string;
    makeDefault?: boolean;
  }): Promise<ApiResponse<RampBankAccount>> => {
    const res = await api.post('/ramp/bank-accounts', data);
    return res.data;
  },

  listBankAccounts: async (): Promise<ApiResponse<RampBankAccount[]>> => {
    const res = await api.get('/ramp/bank-accounts');
    return res.data;
  },

  deleteBankAccount: async (id: number): Promise<void> => {
    await api.delete(`/ramp/bank-accounts/${id}`);
  },

  /** BRL → TESOURO quote. Returns expires_at; quotes are short-lived (2 min on EtherFuse). */
  createQuote: async (sourceAmount: string | number): Promise<ApiResponse<{ quote: RampQuote; etherfuseResponse: unknown }>> => {
    const res = await api.post('/ramp/quotes', { sourceAmount: String(sourceAmount) });
    return res.data;
  },

  createOrder: async (data: {
    quoteId: number;
    bankAccountId: number;
    memo?: string;
  }): Promise<ApiResponse<{ order: RampOrder; etherfuseResponse: unknown }>> => {
    const res = await api.post('/ramp/orders', data);
    return res.data;
  },

  listOrders: async (limit = 50): Promise<ApiResponse<RampOrder[]>> => {
    const res = await api.get('/ramp/orders', { params: { limit } });
    return res.data;
  },

  getOrder: async (id: number): Promise<ApiResponse<RampOrder>> => {
    const res = await api.get(`/ramp/orders/${id}`);
    return res.data;
  },

  /** Sandbox-only: simulate the PIX deposit. 404 in production. */
  simulateFiatReceived: async (orderId: number): Promise<ApiResponse<unknown>> => {
    const res = await api.post(`/ramp/dev/fiat-received/${orderId}`);
    return res.data;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Off-ramp (Tokens → BRL via PIX, EtherFuse Anchor Mode)
  //
  // These endpoints only exist when ENABLE_OFFRAMP=true on the backend. Check
  // `readiness.offrampEnabled` before showing the off-ramp UI; the routes 404
  // otherwise. See plans/we-have-just-made-fancy-token.md for the full flow.
  // ───────────────────────────────────────────────────────────────────────────

  /** Off-ramp quote: TESOURO|USDC → BRL. */
  createOfframpQuote: async (data: {
    sourceAsset: 'TESOURO' | 'USDC';
    sourceAmount: string | number;
  }): Promise<ApiResponse<{ quote: RampQuote; etherfuseResponse: unknown }>> => {
    const res = await api.post('/ramp/offramp/quotes', {
      sourceAsset: data.sourceAsset,
      sourceAmount: String(data.sourceAmount),
    });
    return res.data;
  },

  /** Execute an off-ramp quote — creates the EtherFuse order in Anchor Mode. */
  createOfframpOrder: async (data: {
    quoteId: number;
    bankAccountId: number;
  }): Promise<ApiResponse<{ order: RampOrder; etherfuseResponse: unknown }>> => {
    const res = await api.post('/ramp/offramp/orders', data);
    return res.data;
  },

  /**
   * Build the unsigned SAC transfer XDR with Memo.hash for an off-ramp order.
   * The investor's passkey signs the returned XDR; the signed envelope goes
   * to submitOfframpTx.
   */
  prepareOfframpTx: async (orderId: number): Promise<ApiResponse<{
    xdr: string;
    networkPassphrase: string;
    walletId: string;
  }>> => {
    const res = await api.post(`/ramp/offramp/orders/${orderId}/prepare-tx`);
    return res.data;
  },

  /** Submit the passkey-signed XDR. Status flips to `created → funded` on webhook. */
  submitOfframpTx: async (
    orderId: number,
    signedXdr: string
  ): Promise<ApiResponse<{ hash: string; status: string }>> => {
    const res = await api.post(`/ramp/offramp/orders/${orderId}/submit-tx`, { signedXdr });
    return res.data;
  },

  /** Cancel an off-ramp order. Only valid while status=created. */
  cancelOfframpOrder: async (orderId: number): Promise<ApiResponse<{ ok: true }>> => {
    const res = await api.post(`/ramp/offramp/orders/${orderId}/cancel`);
    return res.data;
  },
};

export default rampApi;
