/**
 * Dados de teste reutilizáveis para todos os testes
 */

export const mockInvestor = {
  id: 1,
  name: 'João Silva',
  email: 'joao@example.com',
  document: '12345678900',
  stellar_public_key: 'GABC1234567890123456789012345678901234567890123456',
  kyc_status: 'approved',
  created_at: new Date('2024-01-15T10:30:00.000Z'),
  updated_at: new Date('2024-01-15T10:30:00.000Z'),
};

export const mockInvestorPending = {
  id: 2,
  name: 'Maria Santos',
  email: 'maria@example.com',
  document: '98765432100',
  stellar_public_key: 'GDEF9876543210987654321098765432109876543210987654',
  kyc_status: 'pending',
  created_at: new Date('2024-01-16T10:30:00.000Z'),
  updated_at: new Date('2024-01-16T10:30:00.000Z'),
};

export const mockToken = {
  id: 1,
  asset_code: 'TEST01',
  issuer_public_key: 'GXYZ7890123456789012345678901234567890123456789012',
  total_supply: '1000.0000000',
  description: 'Sunset Income Note - Security token backed by rental income',
  created_at: new Date('2024-01-15T10:30:00.000Z'),
  updated_at: new Date('2024-01-15T10:30:00.000Z'),
};

export const mockTokenDistribution = {
  id: 1,
  investor_id: 1,
  asset_code: 'TEST01',
  amount: '100.0000000',
  transaction_hash: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567',
  created_at: new Date('2024-01-15T11:00:00.000Z'),
};

export const mockInterestPayment = {
  id: 1,
  investor_id: 1,
  asset_code: 'TEST01',
  token_balance: '100.0000000',
  interest_rate: '10.0000000',
  interest_amount: '0.8333333',
  usdc_amount: '0.8333333',
  transaction_hash: 'def456ghi789jkl012mno345pqr678stu901vwx234yz567abc123',
  payment_date: '2024-02-01',
  status: 'completed',
  email_sent: true,
  email_sent_at: new Date('2024-02-01T00:05:00.000Z'),
  retry_count: 0,
  error_message: null,
  created_at: new Date('2024-02-01T00:00:00.000Z'),
};

export const mockStellarAccount = {
  accountId: () => 'GABC1234567890123456789012345678901234567890123456',
  sequenceNumber: () => '123456789',
  balances: [
    {
      asset_type: 'native',
      balance: '1000.0000000',
    },
    {
      asset_type: 'credit_alphanum4',
      asset_code: 'TEST01',
      asset_issuer: 'GXYZ7890123456789012345678901234567890123456789012',
      balance: '100.0000000',
      is_authorized: true,
      is_authorized_to_maintain_liabilities: false,
    },
  ],
  flags: {
    authRequired: () => true,
    authRevocable: () => true,
    authImmutable: () => false,
    authClawbackEnabled: () => true,
  },
};

export const mockStellarTransaction = {
  hash: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567',
  ledger: 12345,
  result: {
    xdr: 'mock_xdr_string',
  },
};

export const mockKeypair = {
  publicKey: () => 'GABC1234567890123456789012345678901234567890123456',
  secret: () => 'SABC123456789012345678901234567890123456789012345678901234567',
};

export const mockJWTToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJqb2FvQGV4YW1wbGUuY29tIiwicm9sZSI6ImludmVzdG9yIiwiaWF0IjoxNzA1MzI0MDAwfQ.mock_signature';

import dotenv from 'dotenv';
import path from 'path';
// Load .env but DO NOT override env vars already set by test scripts.
// The test scripts set DATABASE_URL to stellar_tokens_test — dotenv must not overwrite it.
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: false });

import prisma from '../../src/config/prisma.js';
import { generateToken } from '../../src/middleware/auth.js';

export class TestData {
  static async createCompany(data = {}) {
    return await prisma.company.create({
      data: {
        name: 'Test Company',
        cnpj: '12345678901234',
        email: 'company@test.com',
        legalRepresentative: 'John Doe',
        status: 'approved',
        kycStatus: 'approved',
        ...data,
      },
    });
  }

  static async createCompanyUser(companyId, data = {}) {
    return await prisma.companyUser.create({
      data: {
        companyId,
        email: `user_${Date.now()}@company.com`,
        passwordHash: 'hashed_password',
        name: 'Test User',
        ...data,
      },
    });
  }

  static async createPlatformAdmin(data = {}) {
    return await prisma.platformAdmin.create({
      data: {
        name: 'Admin User',
        email: `admin_${Date.now()}@platform.com`,
        passwordHash: 'hashed_password',
        ...data,
      },
    });
  }

  static generateToken(userId, role, companyId = null) {
    const payload = {
      userId,
      role,
      email: 'test@example.com', // Dummy email
    };
    if (companyId) {
      payload.companyId = companyId;
    }
    return generateToken(payload);
  }
}

