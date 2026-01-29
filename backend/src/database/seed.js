import { Investor } from '../models/Investor.js';
import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const seedData = async () => {
  try {
    console.log('🌱 Seeding database with TEST ACCOUNTS...');

    // ---------------------------------------------------------
    // 1. TEST INVESTOR
    // REQUIRED: Email must match authRoutes.js check
    // ---------------------------------------------------------
    console.log('\n--- Seeding Test Investor ---');
    const investorEmail = 'test-investor@stellar-tokens.local'; // Fixed email for Test Login
    const investorKey = process.env.TEST_INVESTOR_PUBLIC_KEY; // From .env

    if (!investorKey) {
      console.warn('⚠️  WARNING: TEST_INVESTOR_PUBLIC_KEY not found in .env. Using mock G-address.');
    }

    const investorData = {
      name: 'Test Investor',
      email: investorEmail,
      document: '11122233344',
      kycStatus: 'approved',
      // Use real key from .env or fallback to valid G-address
      stellarContractId: investorKey || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      passkeyCredentialId: 'mock-passkey-investor',
      emailVerified: true
    };

    const existingInvestor = await Investor.findByEmail(investorData.email);
    if (!existingInvestor) {
      await Investor.create(investorData);
      console.log(`✓ Created: ${investorData.email}`);
    } else {
      console.log(`- Exists: ${investorData.email}`);
    }

    // ---------------------------------------------------------
    // 2. TEST PLATFORM ADMIN
    // REQUIRED: Email must match authRoutes.js check
    // ---------------------------------------------------------
    console.log('\n--- Seeding Test Admin ---');
    const adminEmail = 'admin@stellar-tokens.local'; // Fixed email for Test Login
    const adminPassword = 'admin123456';

    // Use Issuer Key for Admin (standard pattern)
    const adminKey = process.env.ISSUER_PUBLIC_KEY;

    const existingAdmin = await prisma.platformAdmin.findUnique({ where: { email: adminEmail } });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await prisma.platformAdmin.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: 'Test Admin',
          role: 'super_admin',
          isActive: true,
          stellarPublicKey: adminKey || null
        }
      });
      console.log(`✓ Created: ${adminEmail} / ${adminPassword}`);
    } else {
      console.log(`- Exists: ${adminEmail}`);
    }

    // ---------------------------------------------------------
    // 3. TEST COMPANY
    // REQUIRED: Email must match authRoutes.js check
    // ---------------------------------------------------------
    console.log('\n--- Seeding Test Company ---');
    const companyEmail = 'contact@test-company.local';
    const userEmail = 'admin-test-company@stellar-tokens.local'; // Fixed email for Test Login
    const companyPassword = 'password123';
    const companyKey = process.env.TEST_COMPANY_PUBLIC_KEY;

    const existingCompany = await prisma.company.findUnique({ where: { email: companyEmail } });

    if (!existingCompany) {
      const company = await prisma.company.create({
        data: {
          name: 'Test Company LLC',
          email: companyEmail,
          cnpj: '00.111.222/0001-33',
          status: 'approved',
          kycStatus: 'approved',
          phone: '5511999999999',
          address: 'Crypto Valley, 1',
          emailVerified: true,
          stellarPublicKey: companyKey || null,
          // If company has its own contract/wallet, add here if schema supports
          stellarContractId: companyKey || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
        }
      });

      const userHash = await bcrypt.hash(companyPassword, 10);

      // Company User needs to match the test login email
      const user = await prisma.companyUser.create({
        data: {
          companyId: company.id,
          email: userEmail,
          name: 'Test Company Admin',
          passwordHash: userHash,
          role: 'admin',
          isActive: true,
          emailVerified: true,
          stellarPublicKey: companyKey || null
        }
      });
      console.log(`✓ Created Company: ${company.name}`);
      console.log(`✓ Created Company User: ${userEmail} / ${companyPassword}`);
    } else {
      console.log(`- Exists: ${companyEmail}`);
    }

    console.log('\n✅ Seeding completed! Test accounts are ready.');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

seedData();
