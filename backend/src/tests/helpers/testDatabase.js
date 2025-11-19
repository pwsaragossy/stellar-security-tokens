/**
 * Setup e teardown do banco de dados de teste para integration tests usando Prisma
 */

import prisma from './../config/prisma.js';
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
        
        console.log(`[testDatabase] Cleanup verification:`);
        console.log(`  - Investors: ${investorsCount} rows, sequence: ${investorsSeq[0].last_value}`);
        console.log(`  - Tokens: ${tokensCount} rows, sequence: ${tokensSeq[0].last_value}`);
        
        if (investorsCount > 0 || tokensCount > 0) {
          console.warn('[testDatabase] WARNING: Data still exists after cleanup!');
        }
        if (investorsSeq[0].last_value !== '1' || tokensSeq[0].last_value !== '1') {
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
    // Chaves Stellar válidas: 56 caracteres, começando com G seguido de 55 caracteres alfanuméricos
    const investorStellarKey = 'G' + 'TEST1234567890123456789012345678901234567890123456789012345'.substring(0, 55);
    const issuerStellarKey = 'G' + 'ISSUER12345678901234567890123456789012345678901234567890123456'.substring(0, 55);
    
    // Usar email e document únicos baseados em timestamp + random para evitar conflitos
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const uniqueEmail = `test-${timestamp}-${random}@example.com`;
    const uniqueDocument = `${(timestamp + random) % 100000000000}`.padStart(11, '0'); // 11 dígitos
    
    if (isTestEnv) {
      console.log(`[testDatabase] Seeding test data with email: ${uniqueEmail}, document: ${uniqueDocument}`);
    }
    
    // Hash password for test investor
    const passwordHash = await bcrypt.hash('testpassword', 10);

    // Create investor (using unique email and document)
    const investor = await prisma.investor.create({
      data: {
        name: 'Test Investor',
        email: uniqueEmail,
        document: uniqueDocument,
        stellarPublicKey: investorStellarKey,
        kycStatus: 'approved',
        passwordHash,
      },
    });

    // Create or get token 'SIN01'
    const token = await prisma.token.upsert({
      where: { assetCode: 'SIN01' },
      update: {
        issuerPublicKey: issuerStellarKey,
        totalSupply: 1000,
        description: 'Test Token',
      },
      create: {
        assetCode: 'SIN01',
        issuerPublicKey: issuerStellarKey,
        totalSupply: 1000,
        description: 'Test Token',
      },
    });

    return {
      investor,
      token,
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
