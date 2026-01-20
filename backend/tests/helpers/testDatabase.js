/**
 * Setup e teardown do banco de dados de teste para integration tests usando Prisma
 */

import prisma from '../../src/config/prisma.js';
import bcrypt from 'bcrypt';

/**
 * Limpa todas as tabelas do banco de testes usando Prisma
 */
export const cleanDatabase = async () => {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

  try {
    if (isTestEnv) {
      console.log('[testDatabase] Starting database cleanup...');
    }

    // Use Prisma transaction to delete all data in correct order
    await prisma.$transaction(async (tx) => {
      // Delete in dependency order to avoid foreign key violations
      await tx.interestPayment.deleteMany({});
      await tx.tokenDistribution.deleteMany({});
      await tx.investment.deleteMany({});
      await tx.offer.deleteMany({});
      await tx.feeLog.deleteMany({});
      // We don't delete systemConfig here because many tests rely on the initial setup
      // and it doesn't change much between tests.
      await tx.multiSigTransaction.deleteMany({});
      await tx.companyUserWebauthnCredential.deleteMany({});
      await tx.platformAdminWebauthnCredential.deleteMany({});
      await tx.investorWebauthnCredential.deleteMany({});
      await tx.companyUser.deleteMany({});
      await tx.platformAdmin.deleteMany({});
      await tx.company.deleteMany({});
      await tx.investor.deleteMany({});
      await tx.token.deleteMany({});
    });

    // Reset sequences using raw SQL (Prisma doesn't have direct sequence reset)
    const sequences = await prisma.$queryRaw`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name
    `;

    for (const seq of sequences) {
      try {
        await prisma.$executeRawUnsafe(`ALTER SEQUENCE ${seq.sequence_name} RESTART WITH 1`);
        if (isTestEnv) {
          const checkResult = await prisma.$queryRawUnsafe(`SELECT last_value FROM ${seq.sequence_name}`);
          console.log(`[testDatabase] Reset sequence ${seq.sequence_name} to ${checkResult[0].last_value}`);
        }
      } catch (e) {
        if (isTestEnv) {
          console.warn(`[testDatabase] Failed to reset sequence ${seq.sequence_name}:`, e.message);
        }
      }
    }

    // Verification
    if (isTestEnv) {
      try {
        const investorsCount = await prisma.investor.count();
        const tokensCount = await prisma.token.count();
        const investorsSeq = await prisma.$queryRawUnsafe("SELECT last_value FROM investors_id_seq");
        const tokensSeq = await prisma.$queryRawUnsafe("SELECT last_value FROM tokens_id_seq");

        const invVal = String(investorsSeq[0].last_value);
        const tokVal = String(tokensSeq[0].last_value);

        console.log(`[testDatabase] Cleanup verification:`);
        console.log(`  - Investors: ${investorsCount} rows, sequence: ${invVal}`);
        console.log(`  - Tokens: ${tokensCount} rows, sequence: ${tokVal}`);

        if (investorsCount > 0 || tokensCount > 0) {
          console.warn('[testDatabase] WARNING: Data still exists after cleanup!');
        }
        if (invVal !== '1' || tokVal !== '1') {
          console.warn('[testDatabase] WARNING: Sequences not reset correctly!');
        }
      } catch (e) {
        if (isTestEnv) {
          console.log('[testDatabase] Could not verify cleanup (this is OK if tables are new):', e.message);
        }
      }
    }

    if (isTestEnv) {
      console.log('[testDatabase] Database cleanup completed');
    }
  } catch (error) {
    console.error('[testDatabase] Error cleaning database:', error);
    throw error;
  }
};

/**
 * Cria dados de teste básicos no banco usando Prisma
 */
export const seedTestData = async () => {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

  try {
    // Smart wallet contract IDs (56 characters, starting with C for contract)
    const stellarContractId = 'C' + 'CONTRACT12345678901234567890123456789012345678901234567890123'.substring(0, 55);
    const issuerStellarKey = 'G' + 'ISSUER12345678901234567890123456789012345678901234567890123456'.substring(0, 55);

    // Usar email e document únicos baseados em timestamp + random para evitar conflitos
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const uniqueEmail = `test-${timestamp}-${random}@example.com`;
    const uniqueDocument = `${(timestamp + random) % 100000000000}`.padStart(11, '0'); // 11 dígitos

    if (isTestEnv) {
      console.log(`[testDatabase] Seeding test data with email: ${uniqueEmail}, document: ${uniqueDocument}`);
    }

    // Mock passkey data for testing
    const mockPasskeyCredentialId = `mock-credential-${timestamp}`;
    const mockPasskeyPublicKey = Buffer.from('mock-public-key-data-for-testing');

    // Create investor with passkey fields (REQUIRED)
    const investor = await prisma.investor.create({
      data: {
        name: 'Test Investor',
        email: uniqueEmail,
        document: uniqueDocument,
        stellarContractId,  // Smart wallet address
        passkeyCredentialId: mockPasskeyCredentialId,
        passkeyPublicKey: mockPasskeyPublicKey,
        kycStatus: 'approved',
        emailVerified: true,
        passwordHash: null, // Passkey-only, no password
      },
    });

    // Create or get token 'TEST01' (generic test token)
    const token = await prisma.token.upsert({
      where: { assetCode: 'TEST01' },
      update: {
        issuerPublicKey: issuerStellarKey,
        totalSupply: 1000,
        description: 'Test Token',
      },
      create: {
        assetCode: 'TEST01',
        issuerPublicKey: issuerStellarKey,
        totalSupply: 1000,
        description: 'Test Token',
      },
    });

    // Create platform admin for compliance tests
    const admin = await prisma.platformAdmin.create({
      data: {
        name: 'Test Admin',
        email: `admin-${timestamp}@example.com`,
        role: 'admin',
        isActive: true,
        passwordHash: 'dummy-hash',
      },
    });

    // Create test company
    const company = await prisma.company.create({
      data: {
        name: `Test Company ${timestamp}`,
        email: `company-${timestamp}@example.com`,
        cnpj: `${timestamp}`.slice(-14).padStart(14, '0'),
        legalRepresentative: 'Test Representative',
        status: 'approved',
      },
    });

    // Create test company user
    const companyUser = await prisma.companyUser.create({
      data: {
        companyId: company.id,
        name: 'Test Company Admin',
        email: `cu-${timestamp}@example.com`,
        role: 'admin',
        passkeyCredentialId: `test-cu-${timestamp}`,
      },
    });

    return {
      investor,
      token,
      admin,
      company,
      companyUser,
    };
  } catch (error) {
    console.error('Error seeding test data:', error);
    throw error;
  }
};

/**
 * Setup antes de cada teste de integração
 */
export const setupTestDatabase = async () => {
  await cleanDatabase();
  return await seedTestData();
};

/**
 * Teardown após cada teste de integração
 */
export const teardownTestDatabase = async () => {
  await cleanDatabase();
};

export class TestDatabase {
  static async setup() {
    await setupTestDatabase();
  }

  static async cleanup() {
    await cleanDatabase();
  }
}
