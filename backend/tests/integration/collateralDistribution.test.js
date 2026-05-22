#!/usr/bin/env node
/**
 * Integration test: processCollateralDistribution
 *
 * Verifies the DB status transitions after admin signs a collateral distribution TX.
 * Uses real Prisma against the Docker Postgres — mocks only the Stellar network call.
 *
 * Assertions:
 *   1. offer.status → 'closed'
 *   2. CompanyPenalty.status → 'enforced' + enforcedAt set
 *   3. Notifications created for each investor
 *   4. Return value contains success + transactionHash
 *
 * Run: docker exec stellar_backend sh -c 'cd /app/backend && node --import tsx ../backend/tests/integration/collateralDistribution.test.js'
 */

import crypto from 'crypto';

// Bootstrap env BEFORE imports
process.env.KEY_MODE = 'env';
process.env.STELLAR_NETWORK = 'testnet';

const { default: prisma } = await import('../../src/config/prisma.js');

// ─── Mock StellarService.submitTransaction to skip network ───
const { StellarService } = await import('../../src/services/stellar.service.js');
const originalSubmit = StellarService.submitTransaction;
const MOCK_TX_HASH = 'a'.repeat(64);

StellarService.submitTransaction = async () => ({
  success: true,
  transactionHash: MOCK_TX_HASH,
});

// ─── Mock NotificationService to capture calls ───
const { NotificationService } = await import('../../src/services/notification.service.js');
const capturedNotifications = [];
const originalCreateNotification = NotificationService.createNotification;
NotificationService.createNotification = async (data) => {
  capturedNotifications.push(data);
  return { id: capturedNotifications.length };
};

// ─── Mock EmailService to skip actual sends ───
const { EmailService } = await import('../../src/services/email.service.js');
if (EmailService.sendCollateralReceivedNotification) {
  EmailService.sendCollateralReceivedNotification = async () => ({ success: true });
}

const { CollateralDistributionService } = await import('../../src/services/collateralDistribution.service.js');

// ═══════════════════════════════════════════════════════════════
// SETUP: Create test data
// ═══════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const testIds = {};

function check(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`);
  }
}

async function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  processCollateralDistribution Integration Test');
  console.log('═══════════════════════════════════════════════════════\n');

  const ASSET_CODE = 'D' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);

  // --- Create company + users ---
  const company = await prisma.company.create({
    data: {
      name: `CollatTest Co ${ASSET_CODE}`,
      cnpj: `99${Date.now().toString().slice(-12)}`,
      email: `co-${ASSET_CODE}@test.local`,
      stellarPublicKey: 'G' + 'A'.repeat(55),
    },
  });
  testIds.companyId = company.id;

  const companyUser = await prisma.companyUser.create({
    data: {
      companyId: company.id,
      name: 'Admin Test',
      email: `admin-${ASSET_CODE}@test.local`,
      passwordHash: 'nothashed',
      role: 'admin',
    },
  });
  testIds.companyUserId = companyUser.id;

  const investor = await prisma.investor.create({
    data: {
      name: 'Investor Collat A',
      email: `inv-a-${ASSET_CODE}@test.local`,
      document: `111${Date.now().toString().slice(-8)}`,
      stellarContractId: 'C' + 'B'.repeat(55),
      passkeyCredentialId: `cred-a-${ASSET_CODE}`,
      kycStatus: 'approved',
    },
  });
  testIds.investorId = investor.id;

  const investorB = await prisma.investor.create({
    data: {
      name: 'Investor Collat B',
      email: `inv-b-${ASSET_CODE}@test.local`,
      document: `222${Date.now().toString().slice(-8)}`,
      stellarContractId: 'C' + 'C'.repeat(55),
      passkeyCredentialId: `cred-b-${ASSET_CODE}`,
      kycStatus: 'approved',
    },
  });
  testIds.investorBId = investorB.id;

  // --- Create defaulted offer ---
  const offer = await prisma.offer.create({
    data: {
      companyId: company.id,
      requestedBy: companyUser.id,
      offerName: `Collat Test ${ASSET_CODE}`,
      assetCode: ASSET_CODE,
      description: 'Integration test: processCollateralDistribution',
      totalSupply: 100,
      unitPrice: 1.0,
      annualInterestRate: 12,
      investorRate: 10,
      offerType: 'collateral',
      paymentType: 'monthly',
      status: 'active',               // Must be 'active' for getDefaultedOffers query
      paymentDueStatus: 'defaulted',   // The key field
      collateralType: 'real_estate',
      collateralDescription: 'Test collateral property',
      collateralValue: 50000,
      isTokenLocked: true,
    },
  });
  testIds.offerId = offer.id;

  await prisma.token.create({
    data: {
      assetCode: ASSET_CODE,
      issuerPublicKey: 'G' + 'D'.repeat(55),
      totalSupply: 100,
      annualInterestRate: 12,
      offerId: offer.id,
    },
  });

  // Investments: A=60, B=40
  await prisma.investment.create({
    data: {
      investorId: investor.id,
      offerId: offer.id,
      assetCode: ASSET_CODE,
      usdcAmount: 60,
      tokenAmount: 60,
      status: 'distributed',
    },
  });
  await prisma.investment.create({
    data: {
      investorId: investorB.id,
      offerId: offer.id,
      assetCode: ASSET_CODE,
      usdcAmount: 40,
      tokenAmount: 40,
      status: 'distributed',
    },
  });

  // Create pending CompanyPenalty (should flip to 'enforced')
  const penalty = await prisma.companyPenalty.create({
    data: {
      offerId: offer.id,
      companyId: company.id,
      penaltyType: 'default_fee',
      description: 'Default fee for integration test',
      amount: 0,
      status: 'pending',
    },
  });
  testIds.penaltyId = penalty.id;

  console.log(`  Setup: Offer ${offer.id} (${ASSET_CODE}), defaulted, 2 investors (60/40)\n`);

  // ═══════════════════════════════════════════════════════════════
  // PRE-CONDITION CHECKS
  // ═══════════════════════════════════════════════════════════════
  console.log('--- Pre-condition checks ---');

  const prOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
  check(prOffer.status === 'active', `Pre: offer.status = ${prOffer.status} === 'active'`);
  check(prOffer.paymentDueStatus === 'defaulted', `Pre: paymentDueStatus = ${prOffer.paymentDueStatus} === 'defaulted'`);

  const prPenalty = await prisma.companyPenalty.findUnique({ where: { id: penalty.id } });
  check(prPenalty.status === 'pending', `Pre: penalty.status = ${prPenalty.status} === 'pending'`);
  check(prPenalty.enforcedAt === null, `Pre: penalty.enforcedAt = null`);

  // ═══════════════════════════════════════════════════════════════
  // EXECUTE: processCollateralDistribution
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- Executing processCollateralDistribution ---');

  const result = await CollateralDistributionService.processCollateralDistribution(
    'MOCK_SIGNED_XDR', // StellarService.submitTransaction is mocked
    offer.id,
    companyUser.id,
  );

  // ═══════════════════════════════════════════════════════════════
  // POST-CONDITION CHECKS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- Post-condition checks ---');

  // 1. Return value
  check(result.success === true, `Return: success = ${result.success}`);
  check(result.transactionHash === MOCK_TX_HASH, `Return: transactionHash = ${result.transactionHash}`);
  check(result.investorCount === 2, `Return: investorCount = ${result.investorCount}`);
  check(result.offerId === offer.id, `Return: offerId = ${result.offerId}`);

  // 2. offer.status → 'closed'
  const postOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
  check(postOffer.status === 'closed', `Post: offer.status = ${postOffer.status} === 'closed'`);
  check(postOffer.paymentDueStatus === 'defaulted', `Post: paymentDueStatus preserved = ${postOffer.paymentDueStatus}`);

  // 3. CompanyPenalty.status → 'enforced'
  const postPenalty = await prisma.companyPenalty.findUnique({ where: { id: penalty.id } });
  check(postPenalty.status === 'enforced', `Post: penalty.status = ${postPenalty.status} === 'enforced'`);
  check(postPenalty.enforcedAt !== null, `Post: penalty.enforcedAt is set (${postPenalty.enforcedAt})`);
  check(
    postPenalty.enforcedAt instanceof Date,
    `Post: penalty.enforcedAt is a Date instance`,
  );

  // 4. Notifications created (one per investor)
  check(capturedNotifications.length === 2, `Notifications: ${capturedNotifications.length} === 2`);

  const notifA = capturedNotifications.find(n => n.userId === investor.id);
  const notifB = capturedNotifications.find(n => n.userId === investorB.id);
  check(notifA !== undefined, `Notification for investor A exists`);
  check(notifB !== undefined, `Notification for investor B exists`);
  check(notifA?.userType === 'investor', `Notification A userType = 'investor'`);
  check(notifA?.type === 'info', `Notification A type = 'info'`);
  check(notifA?.title?.includes(ASSET_CODE), `Notification A title contains asset code`);

  // 5. Offer no longer appears in getDefaultedOffers (status is 'closed', not 'active')
  const defaultedOffers = await CollateralDistributionService.getDefaultedOffers();
  const stillThere = defaultedOffers.find(o => o.offerId === offer.id);
  check(stillThere === undefined, `Post: offer NOT in getDefaultedOffers() (status=closed)`);

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`═══════════════════════════════════════════════════════\n`);
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP + RUN
// ═══════════════════════════════════════════════════════════════

try {
  await run();
} finally {
  // Restore mocks
  StellarService.submitTransaction = originalSubmit;
  NotificationService.createNotification = originalCreateNotification;

  // Cleanup DB records
  if (testIds.offerId) {
    await prisma.companyPenalty.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
    await prisma.notification.deleteMany({
      where: { userId: { in: [testIds.investorId, testIds.investorBId].filter(Boolean) } }
    }).catch(() => {});
    await prisma.investment.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
    await prisma.token.deleteMany({ where: { offerId: testIds.offerId } }).catch(() => {});
    await prisma.offer.delete({ where: { id: testIds.offerId } }).catch(() => {});
  }
  if (testIds.investorId) await prisma.investor.delete({ where: { id: testIds.investorId } }).catch(() => {});
  if (testIds.investorBId) await prisma.investor.delete({ where: { id: testIds.investorBId } }).catch(() => {});
  if (testIds.companyUserId) await prisma.companyUser.delete({ where: { id: testIds.companyUserId } }).catch(() => {});
  if (testIds.companyId) await prisma.company.delete({ where: { id: testIds.companyId } }).catch(() => {});

  console.log('  ✅ Cleanup complete');
  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n✅ processCollateralDistribution integration test passed!');
    process.exit(0);
  }
}
