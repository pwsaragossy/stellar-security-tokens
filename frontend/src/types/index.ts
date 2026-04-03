// User Types
export interface Investor {
  id: number;
  name: string;
  email: string;
  document: string;
  stellar_contract_id?: string;
  kyc_status: 'pending' | 'approved' | 'rejected';
  password_hash?: string;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: number;
  name: string;
  cnpj: string;
  email: string;
  legal_representative: string;
  address?: string;
  phone?: string;
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  kyc_status: 'pending' | 'approved' | 'rejected';
  kyc_documents: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CompanyUser {
  id: number;
  company_id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  is_active: boolean;
  created_at: string;
}

export interface PlatformAdmin {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'super_admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Offer Types
export interface LegalDocument {
  hash: string;
  url: string;
  fileName?: string;
  uploadedAt?: string;
}

export interface Offer {
  id: number;
  company_id: number;
  requested_by: number;
  asset_code: string;
  offer_name: string;
  description: string;
  total_supply: string;
  annual_interest_rate?: number;
  investor_rate?: number;
  offer_type: 'collateral' | 'sale';
  offer_rules: Record<string, any>;
  status: 'pending_review' | 'under_review' | 'approved' | 'rejected' | 'active' | 'paused' | 'closed' | 'matured';
  rejection_reason?: string;
  reviewed_by?: number;
  reviewed_at?: string;
  legal_documents: {
    contract?: LegalDocument;
    terms?: LegalDocument;
    prospectus?: LegalDocument;
    kyc?: LegalDocument;
    other?: LegalDocument;
  };
  due_diligence_notes?: string;
  token?: Token;
  company?: Company;
  created_at: string;
  updated_at: string;
  maturity_date?: string;
  payment_type?: string;
  // Token Lifecycle
  isTokenLocked?: boolean;
  tokenUnlockedAt?: string;
  // Soroban contracts
  sorobanContractId?: string;
  soroban_contract_id?: string;
  sorobanSettlementContractId?: string;
  soroban_settlement_contract_id?: string;
  // Payment lifecycle
  paymentDueStatus?: string;
  payment_due_status?: string;
  lastPaymentDate?: string;
  last_payment_date?: string;
}

// Token Types
export interface Token {
  id: number;
  assetCode: string;
  issuerPublicKey: string;
  totalSupply: string;
  description?: string;
  annualInterestRate?: number;
  offerId?: number;
  issuedBy?: number;
  sacContractId?: string;
  issuanceTransactionHash?: string;
  createdAt: string;
  updatedAt: string;
  offer?: Offer;
}

// Investment Types
export interface Investment {
  id: number;
  investor_id: number;
  offer_id?: number;
  asset_code: string;
  usdc_amount: string;
  token_amount: string;
  status: 'pending_payment' | 'payment_received' | 'distributed' | 'failed';
  usdc_payment_hash?: string;
  distribution_tx_hash?: string;
  memo?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface TokenDistribution {
  id: number;
  investor_id: number;
  asset_code: string;
  amount: string;
  transaction_hash: string;
  usdc_payment_hash?: string;
  offer_id?: number;
  memo?: string;
  created_at: string;
}

export interface InterestPayment {
  id: number;
  investor_id: number;
  asset_code: string;
  token_balance: string;
  interest_rate: string;
  interest_amount: string;
  usdc_amount: string;
  transaction_hash: string;
  payment_date: string;
  status: 'pending' | 'completed' | 'failed';
  offer_id?: number;
  email_sent: boolean;
  created_at: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  mfaRequired?: boolean;
  pagination?: {
    limit: number;
    offset: number;
    count?: number;
  };
}

export interface LoginResponse {
  token: string;
  investor?: Investor;
  company?: Company;
  companyUser?: CompanyUser;
  platformAdmin?: PlatformAdmin;
  role: 'investor' | 'company' | 'admin';
}

// Form Types
export interface RegisterInvestorForm {
  name: string;
  email: string;
  document: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterCompanyForm {
  name: string;
  cnpj: string;
  email: string;
  legal_representative: string;
  address?: string;
  phone?: string;
}

export interface CreateOfferForm {
  asset_code: string;
  offer_name: string;
  description: string;
  total_supply: string;
  annual_interest_rate?: number;
  offer_type: 'collateral' | 'sale';
  offer_rules: Record<string, any>;
  legal_documents: {
    contract?: File;
    terms?: File;
    prospectus?: File;
    kyc?: File;
    other?: File[];
  };
}

export interface InvestmentForm {
  offer_id: number;
  usdc_amount: string;
}

