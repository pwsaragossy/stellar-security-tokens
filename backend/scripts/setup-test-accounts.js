#!/usr/bin/env node
/**
 * Test Account Setup Script
 * 
 * Creates test accounts for autonomous testing without passkey authentication.
 * These accounts use classic Stellar keypairs (G... addresses with secret keys)
 * stored in .env, allowing the backend to sign transactions on their behalf.
 * 
 * Usage:
 *   node scripts/setup-test-accounts.js
 *   node scripts/setup-test-accounts.js --generate-tokens
 * 
 * This script:
 *   1. Generates Stellar keypairs for test investor/company if not in .env
 *   2. Funds them on testnet via Friendbot
 *   3. Creates trustlines for USDC and test tokens
 *   4. Seeds test users in the database
 *   5. Optionally outputs valid JWT tokens for API testing
 */

import { Keypair, Horizon, Asset, TransactionBuilder, Operation, Networks } from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import prisma from '../src/config/prisma.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const USDC_ISSUER = process.env.USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-change-in-production';

const server = new Horizon.Server(HORIZON_URL);

// Test account configuration
const TEST_ACCOUNTS = {
    investor: {
        name: 'Test Investor',
        email: 'test-investor@stellar-tokens.local',
        document: '000.000.000-00',
        envSecretKey: 'TEST_INVESTOR_SECRET_KEY',
        envPublicKey: 'TEST_INVESTOR_PUBLIC_KEY',
    },
    company: {
        name: 'Test Company Ltd',
        email: 'test-company@stellar-tokens.local',
        cnpj: '00.000.000/0001-00',
        envSecretKey: 'TEST_COMPANY_SECRET_KEY',
        envPublicKey: 'TEST_COMPANY_PUBLIC_KEY',
    },
    admin: {
        name: 'Test Admin',
        email: 'admin@stellar-tokens.local',
        role: 'super_admin',
    },
};

async function fundWithFriendbot(publicKey) {
    try {
        console.log(`  Funding ${publicKey.substring(0, 10)}... via Friendbot`);
        const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
        if (!response.ok) {
            const text = await response.text();
            // Already funded is not an error
            if (text.includes('createAccountAlreadyExist')) {
                console.log(`  Account already exists, skipping friendbot`);
                return true;
            }
            throw new Error(`Friendbot error: ${text}`);
        }
        console.log(`  ✓ Funded successfully`);
        return true;
    } catch (error) {
        console.error(`  ✗ Friendbot error:`, error.message);
        return false;
    }
}

async function createTrustline(keypair, asset) {
    try {
        const account = await server.loadAccount(keypair.publicKey());

        // Check if trustline already exists
        const hasTrustline = account.balances.some(
            b => b.asset_type !== 'native' &&
                b.asset_code === asset.code &&
                b.asset_issuer === asset.issuer
        );

        if (hasTrustline) {
            console.log(`  Trustline for ${asset.code} already exists`);
            return true;
        }

        const tx = new TransactionBuilder(account, {
            fee: '100',
            networkPassphrase: Networks.TESTNET,
        })
            .addOperation(Operation.changeTrust({ asset }))
            .setTimeout(30)
            .build();

        tx.sign(keypair);
        await server.submitTransaction(tx);
        console.log(`  ✓ Created trustline for ${asset.code}`);
        return true;
    } catch (error) {
        console.error(`  ✗ Trustline error:`, error.message);
        return false;
    }
}

function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

async function setupTestInvestor(secretKey, publicKey) {
    console.log('\n📧 Setting up Test Investor...');

    const keypair = Keypair.fromSecret(secretKey);

    // Fund account
    await fundWithFriendbot(publicKey);

    // Create USDC trustline
    const usdcAsset = new Asset('USDC', USDC_ISSUER);
    await createTrustline(keypair, usdcAsset);

    // Upsert in database
    // Note: Investor model only has stellarContractId, not stellarPublicKey
    const investor = await prisma.investor.upsert({
        where: { email: TEST_ACCOUNTS.investor.email },
        update: {
            stellarContractId: publicKey, // Use G... address as contract ID for classic account
            kycStatus: 'approved',
        },
        create: {
            name: TEST_ACCOUNTS.investor.name,
            email: TEST_ACCOUNTS.investor.email,
            document: TEST_ACCOUNTS.investor.document,
            stellarContractId: publicKey,
            passkeyCredentialId: `test-investor-${Date.now()}`, // Placeholder
            kycStatus: 'approved',
        },
    });

    console.log(`  ✓ Investor created/updated: ID ${investor.id}`);

    // Generate JWT
    const token = generateToken({
        userId: investor.id,
        email: investor.email,
        userType: 'investor',
        role: 'investor',
    });

    return { investor, token, keypair };
}

async function setupTestCompany(secretKey, publicKey) {
    console.log('\n🏢 Setting up Test Company...');

    const keypair = Keypair.fromSecret(secretKey);

    // Fund account
    await fundWithFriendbot(publicKey);

    // Create USDC trustline
    const usdcAsset = new Asset('USDC', USDC_ISSUER);
    await createTrustline(keypair, usdcAsset);

    // Upsert company
    const company = await prisma.company.upsert({
        where: { email: TEST_ACCOUNTS.company.email },
        update: {
            stellarPublicKey: publicKey,
            stellarContractId: publicKey,
            status: 'approved',
            kycStatus: 'approved',
        },
        create: {
            name: TEST_ACCOUNTS.company.name,
            email: TEST_ACCOUNTS.company.email,
            cnpj: TEST_ACCOUNTS.company.cnpj,
            legalRepresentative: 'Test Legal Rep',
            stellarPublicKey: publicKey,
            stellarContractId: publicKey,
            passkeyCredentialId: `test-company-${Date.now()}`,
            status: 'approved',
            kycStatus: 'approved',
        },
    });

    // Create or get company user
    let companyUser = await prisma.companyUser.findFirst({
        where: { companyId: company.id },
    });

    if (!companyUser) {
        companyUser = await prisma.companyUser.create({
            data: {
                companyId: company.id,
                name: 'Test Company Admin',
                email: `admin-${TEST_ACCOUNTS.company.email}`,
                stellarPublicKey: publicKey,
                stellarContractId: publicKey,
                passkeyCredentialId: `test-company-user-${Date.now()}`,
                role: 'admin',
            },
        });
    }

    console.log(`  ✓ Company created/updated: ID ${company.id}`);
    console.log(`  ✓ Company User: ID ${companyUser.id}`);

    // Generate JWT for company user
    const token = generateToken({
        userId: companyUser.id,
        email: companyUser.email,
        userType: 'company',
        role: 'admin',
        companyId: company.id,
    });

    return { company, companyUser, token, keypair };
}

async function setupTestAdmin() {
    console.log('\n🛡️  Setting up Test Admin...');

    // Admin doesn't need Stellar account - just database entry
    const admin = await prisma.platformAdmin.upsert({
        where: { email: TEST_ACCOUNTS.admin.email },
        update: {
            isActive: true,
        },
        create: {
            name: TEST_ACCOUNTS.admin.name,
            email: TEST_ACCOUNTS.admin.email,
            passwordHash: 'not-used-for-test-login',
            role: TEST_ACCOUNTS.admin.role,
            isActive: true,
        },
    });

    console.log(`  ✓ Admin created/updated: ID ${admin.id}`);

    // Generate JWT
    const token = generateToken({
        userId: admin.id,
        email: admin.email,
        userType: 'platform_admin',
        role: 'platform_admin',
    });

    return { admin, token };
}

function appendToEnvFile(key, value) {
    const envPath = path.join(__dirname, '..', '..', '.env');
    const line = `${key}=${value}\n`;

    // Check if key already exists
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        if (content.includes(`${key}=`)) {
            console.log(`  ${key} already in .env`);
            return;
        }
    }

    fs.appendFileSync(envPath, line);
    console.log(`  ✓ Added ${key} to .env`);
}

async function main() {
    const generateTokens = process.argv.includes('--generate-tokens');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('              TEST ACCOUNT SETUP SCRIPT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Network: ${HORIZON_URL}`);

    // Get or generate test keypairs
    let investorSecret = process.env.TEST_INVESTOR_SECRET_KEY;
    let companySecret = process.env.TEST_COMPANY_SECRET_KEY;

    if (!investorSecret) {
        console.log('\n🔑 Generating new Test Investor keypair...');
        const kp = Keypair.random();
        investorSecret = kp.secret();
        appendToEnvFile('TEST_INVESTOR_SECRET_KEY', kp.secret());
        appendToEnvFile('TEST_INVESTOR_PUBLIC_KEY', kp.publicKey());
        console.log(`  Public: ${kp.publicKey()}`);
    }

    if (!companySecret) {
        console.log('\n🔑 Generating new Test Company keypair...');
        const kp = Keypair.random();
        companySecret = kp.secret();
        appendToEnvFile('TEST_COMPANY_SECRET_KEY', kp.secret());
        appendToEnvFile('TEST_COMPANY_PUBLIC_KEY', kp.publicKey());
        console.log(`  Public: ${kp.publicKey()}`);
    }

    const investorPublic = Keypair.fromSecret(investorSecret).publicKey();
    const companyPublic = Keypair.fromSecret(companySecret).publicKey();

    // Setup accounts
    const investorResult = await setupTestInvestor(investorSecret, investorPublic);
    const companyResult = await setupTestCompany(companySecret, companyPublic);
    const adminResult = await setupTestAdmin();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    SETUP COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');

    console.log('\n📊 Test Accounts Summary:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`Investor: ${investorResult.investor.email}`);
    console.log(`  ID: ${investorResult.investor.id}`);
    console.log(`  Stellar: ${investorPublic}`);
    console.log('');
    console.log(`Company: ${companyResult.company.name}`);
    console.log(`  ID: ${companyResult.company.id}`);
    console.log(`  User ID: ${companyResult.companyUser.id}`);
    console.log(`  Stellar: ${companyPublic}`);
    console.log('');
    console.log(`Admin: ${adminResult.admin.email}`);
    console.log(`  ID: ${adminResult.admin.id}`);
    console.log(`  Role: ${adminResult.admin.role}`);
    console.log(`  Stellar: ${companyPublic}`);

    if (generateTokens) {
        console.log('\n🎫 JWT Tokens (valid for 30 days):');
        console.log('─────────────────────────────────────────────────────────────');
        console.log('\nInvestor Token:');
        console.log(investorResult.token);
        console.log('\nCompany Token:');
        console.log(companyResult.token);
        console.log('\nAdmin Token:');
        console.log(adminResult.token);

        // Save tokens to a file for easy access
        const tokensPath = path.join(__dirname, 'test-tokens.json');
        fs.writeFileSync(tokensPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            expiresIn: '30 days',
            investor: {
                id: investorResult.investor.id,
                email: investorResult.investor.email,
                stellarPublicKey: investorPublic,
                token: investorResult.token,
            },
            company: {
                id: companyResult.company.id,
                userId: companyResult.companyUser.id,
                email: companyResult.companyUser.email,
                stellarPublicKey: companyPublic,
                token: companyResult.token,
            },
            admin: {
                id: adminResult.admin.id,
                email: adminResult.admin.email,
                role: adminResult.admin.role,
                token: adminResult.token,
            },
        }, null, 2));
        console.log(`\n✓ Tokens saved to: ${tokensPath}`);
    }

    console.log('\n💡 Usage:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('API calls with investor token:');
    console.log('  curl -H "Authorization: Bearer $INVESTOR_TOKEN" http://localhost:3000/api/...');
    console.log('');
    console.log('Re-generate tokens anytime:');
    console.log('  node scripts/setup-test-accounts.js --generate-tokens');
    console.log('');

    await prisma.$disconnect();
}

main().catch(async (error) => {
    console.error('Setup failed:', error);
    await prisma.$disconnect();
    process.exit(1);
});
