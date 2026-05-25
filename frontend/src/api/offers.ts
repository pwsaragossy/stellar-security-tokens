import api from './client';
import type { ApiResponse, Offer } from '@/types';

export const offersApi = {
  getAll: async (params?: {
    company_id?: number;
    status?: string;
    offer_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Offer[]>> => {
    // Determine endpoint based on context or params
    // If company_id is provided, it might be an admin or public view
    // But for "my company offers", we should use getCompanyOffers
    const response = await api.get('/offers', { params });
    return response.data;
  },

  // Admin: get all offers across all companies
  getAllAdmin: async (params?: {
    status?: string;
    company_id?: number;
  }): Promise<ApiResponse<Offer[]>> => {
    const response = await api.get('/admin/offers', { params });
    return response.data;
  },

  getCompanyOffers: async (): Promise<ApiResponse<Offer[]>> => {
    const response = await api.get('/companies/offers');
    return response.data;
  },

  getActive: async (params?: {
    offer_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Offer[]>> => {
    const response = await api.get('/offers/active', { params });
    return response.data;
  },

  getById: async (id: number): Promise<ApiResponse<Offer>> => {
    const response = await api.get(`/offers/${id}`);
    return response.data;
  },

  create: async (data: {
    asset_code: string;
    offer_name: string;
    description: string;
    total_supply: string;
    unit_price?: string;
    annual_interest_rate?: number;
    payment_type?: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'bullet';
    payment_day?: number;
    maturity_date?: string; // Required for bullet payments
    offer_type: 'collateral' | 'sale';
    offer_rules: Record<string, any>;
    legal_documents?: Record<string, any>; // Metadata if any, but files passed separately
    contract?: File;
    terms?: File;
    prospectus?: File;
    other_docs?: File[];
    // Phase 2: Asset Intelligence
    rental_yield_rate?: number;
    value_growth_rate?: number;
    latitude?: number;
    longitude?: number;
    location_address?: string;
    asset_metadata?: Record<string, any>;
    // Phase 3
    asset_stage?: string;
  }): Promise<ApiResponse<Offer>> => {
    const formData = new FormData();

    // Append simple fields
    formData.append('asset_code', data.asset_code);
    formData.append('offer_name', data.offer_name);
    formData.append('description', data.description);
    formData.append('total_supply', data.total_supply);

    // Default unit_price to 1 if not provided, but CreateOffer will provide it
    // If interface includes unit_price (we need to update interface above first/same time? No, TS ignores extra props in formData usually, but we should update type too)
    // Actually the interface IS defined above in 'data' arg.
    if ((data as any).unit_price) {
      formData.append('unit_price', (data as any).unit_price);
    }

    formData.append('offer_type', data.offer_type);

    if (data.annual_interest_rate !== undefined) {
      formData.append('annual_interest_rate', data.annual_interest_rate.toString());
    }

    if (data.payment_type !== undefined) {
      formData.append('payment_type', data.payment_type);
    }

    if (data.payment_day !== undefined) {
      formData.append('payment_day', data.payment_day.toString());
    }

    if (data.maturity_date !== undefined) {
      formData.append('maturity_date', data.maturity_date);
    }

    // Append complex objects as JSON strings
    formData.append('offer_rules', JSON.stringify(data.offer_rules));

    // Append files
    if (data.contract) formData.append('contract', data.contract);
    if (data.terms) formData.append('terms', data.terms);
    if (data.prospectus) formData.append('prospectus', data.prospectus);

    // Phase 2: Asset Intelligence fields
    if (data.rental_yield_rate !== undefined) {
      formData.append('rental_yield_rate', data.rental_yield_rate.toString());
    }
    if (data.value_growth_rate !== undefined) {
      formData.append('value_growth_rate', data.value_growth_rate.toString());
    }
    if (data.latitude !== undefined) {
      formData.append('latitude', data.latitude.toString());
    }
    if (data.longitude !== undefined) {
      formData.append('longitude', data.longitude.toString());
    }
    if (data.location_address) {
      formData.append('location_address', data.location_address);
    }
    if (data.asset_metadata && Object.keys(data.asset_metadata).length > 0) {
      formData.append('asset_metadata', JSON.stringify(data.asset_metadata));
    }
    // Phase 3: Asset lifecycle stage
    if (data.asset_stage) {
      formData.append('asset_stage', data.asset_stage);
    }

    // Allow appending custom extra fields if needed for test
    if (data.legal_documents) {
      formData.append('legal_documents', JSON.stringify(data.legal_documents));
    }

    // Note: When sending FormData, browser sets Content-Type to multipart/form-data correctly
    // We pass the formData directly to the API client which should handle it.
    // However, our ApiClient sets 'Content-Type': 'application/json' by default.
    // We need to ensure api.post handles FormData correctly (usually by NOT setting Content-Type so browser sets boundary).

    // Checking ApiClient implementation in frontend/src/lib/api.ts...
    // The current implementation sets 'Content-Type': 'application/json'. 
    // We need to modify api.post to check if body is FormData.

    const response = await api.post('/companies/offers', formData);
    return response.data;
  },

  update: async (id: number, data: Partial<Offer>): Promise<ApiResponse<Offer>> => {
    const response = await api.put(`/companies/offers/${id}`, data);
    return response.data;
  },

  review: async (
    id: number,
    data: {
      status: 'approved' | 'rejected' | 'under_review';
      rejection_reason?: string;
      due_diligence_notes?: string;
      investor_rate?: number;
    }
  ): Promise<ApiResponse> => {
    const response = await api.put(`/admin/offers/${id}/review`, data);
    return response.data;
  },

  addDueDiligenceNotes: async (id: number, notes: string): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${id}/due-diligence`, { notes });
    return response.data;
  },

  issueToken: async (id: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${id}/issue`);
    return response.data;
  },

  verifyIssuance: async (id: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${id}/verify`);
    return response.data;
  },

  activate: async (id: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${id}/activate`);
    return response.data;
  },

  getInvestors: async (id: number): Promise<ApiResponse> => {
    const response = await api.get(`/companies/offers/${id}/investors`);
    return response.data;
  },

  // Platform Admin: Unlock token for DEX trading
  unlockToken: async (offerId: number): Promise<ApiResponse> => {
    const response = await api.post(`/platform-admins/offers/${offerId}/unlock-token`, { confirm: true });
    return response.data;
  },

  // ─── Settlement Contract (MaturitySettlement Soroban) ───

  /** Deploy settlement contract for a debt offer */
  deploySettlement: async (offerId: number, maxFeeBps = 500): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${offerId}/deploy-settlement`, { max_fee_bps: maxFeeBps });
    return response.data;
  },

  /** Build deposit TX (company USDC → contract) */
  buildSettlementDeposit: async (offerId: number, amount: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${offerId}/settlement-deposit`, { amount });
    return response.data;
  },

  /** Execute full settlement (multi-batch, returns XDRs) */
  executeSettlement: async (offerId: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/offers/${offerId}/settle`);
    return response.data;
  },

  /** Check settlement contract balance and status */
  getSettlementStatus: async (offerId: number): Promise<ApiResponse<{
    offerId: number;
    offerType: string;
    offerStatus: string;
    settlementContractId: string | null;
    contractBalance: number | null;
    maturityDate: string | null;
    hasSettlementContract: boolean;
  }>> => {
    const response = await api.get(`/admin/offers/${offerId}/settlement-status`);
    return response.data;
  },

  // ─── Settlement Admin ───
  // Aggregated status + circuit-breaker (pause/resume) + 2-step admin rotation.

  /** Aggregated on-chain status for the settlement contract (single round-trip). */
  getSettlementStatusV2: async (offerId: number): Promise<{
    offerId: number;
    deployed: boolean;
    contractId: string | null;
    paused: boolean | null;
    admin: string | null;
    pendingAdmin: string | null;
    balance: number | null;
    version: number | null;
    v2Ready: boolean;
    maturityDate: string | null;
  }> => {
    const response = await api.get(`/admin/settlements/${offerId}`);
    return response.data;
  },

  /** Pause the settlement contract (blocks deposit/settle/withdraw/refund). */
  pauseSettlement: async (offerId: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/settlements/${offerId}/pause`);
    return response.data;
  },

  /** Resume a paused settlement contract. */
  resumeSettlement: async (offerId: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/settlements/${offerId}/resume`);
    return response.data;
  },

  /** Step 1: current admin proposes a new admin. */
  proposeSettlementAdmin: async (offerId: number, newAdmin: string): Promise<ApiResponse> => {
    const response = await api.post(`/admin/settlements/${offerId}/propose-admin`, { newAdmin });
    return response.data;
  },

  /** Step 2: pending admin accepts ownership. */
  acceptSettlementAdmin: async (offerId: number): Promise<ApiResponse> => {
    const response = await api.post(`/admin/settlements/${offerId}/accept-admin`);
    return response.data;
  },

  /**
   * Formally declare a collateral offer as defaulted.
   * Requires typed confirmation: confirmAssetCode must exactly match offer.assetCode.
   * Idempotent: returns {alreadyDefaulted: true} if already in defaulted state.
   */
  markDefaulted: async (offerId: number, confirmAssetCode: string): Promise<{
    success: boolean;
    alreadyDefaulted?: boolean;
    offerId: number;
    assetCode?: string;
    status: string;
    paymentDueStatus: string;
    daysSinceMaturity?: number;
    investorsNotified?: number;
    message: string;
  }> => {
    const response = await api.post(`/admin/settlements/${offerId}/mark-defaulted`, {
      confirm_asset_code: confirmAssetCode,
    });
    return response.data;
  },
};

