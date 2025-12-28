import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

// Force Dev Mode by ensuring SVars are empty/undefined
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';

// Import service AFTER setting env
const { EmailService } = await import('../../../src/services/email.service.js');

describe('EmailService - Comprehensive Coverage', () => {
    const testEmail = 'test@example.com';
    const testName = 'Test User';

    test('sendInterestPaymentConfirmation sends email', async () => {
        const result = await EmailService.sendInterestPaymentConfirmation(
            testEmail, testName, 100, 'tx_hash_123', '2024-01-01'
        );
        assert.strictEqual(result.success, true);
        assert.ok(result.messageId.startsWith('dev-mock-'));
    });

    test('sendVerificationEmail sends email with link', async () => {
        const result = await EmailService.sendVerificationEmail(
            testEmail, testName, 'token_123'
        );
        assert.strictEqual(result.success, true);
    });

    test('sendWelcomeEmail sends email with contract ID', async () => {
        const result = await EmailService.sendWelcomeEmail(
            testEmail, testName, 'C_CONTRACT_123'
        );
        assert.strictEqual(result.success, true);
    });

    test('sendBulletPaymentConfirmation sends email', async () => {
        const data = {
            investorName: testName,
            paymentDate: '2024-01-01',
            transactionHash: 'tx_hash_123',
            totalAmount: 1000,
            payments: []
        };
        const result = await EmailService.sendBulletPaymentConfirmation(testEmail, data);
        assert.strictEqual(result.success, true);
    });

    test('sendQuarterlyPaymentConfirmation sends email', async () => {
        const data = {
            investorName: testName,
            paymentDate: '2024-03-01',
            transactionHash: 'tx_hash_123',
            totalAmount: 250
        };
        const result = await EmailService.sendQuarterlyPaymentConfirmation(testEmail, data);
        assert.strictEqual(result.success, true);
    });

    test('sendSemiAnnualPaymentConfirmation sends email', async () => {
        const data = {
            investorName: testName,
            paymentDate: '2024-06-01',
            transactionHash: 'tx_hash_123',
            totalAmount: 500
        };
        const result = await EmailService.sendSemiAnnualPaymentConfirmation(testEmail, data);
        assert.strictEqual(result.success, true);
    });

    test('sendInvestmentConfirmation sends email', async () => {
        const investment = { assetCode: 'TEST01', tokenAmount: 50 };
        const distribution = { transactionHash: 'tx_hash_123' };

        const result = await EmailService.sendInvestmentConfirmation(
            testEmail, investment, distribution
        );
        assert.strictEqual(result.success, true);
    });

    test('sendKYCApprovalEmail sends email', async () => {
        const result = await EmailService.sendKYCApprovalEmail(
            testEmail, testName
        );
        assert.strictEqual(result.success, true);
    });

    test('sendKYCRejectionEmail sends email', async () => {
        const result = await EmailService.sendKYCRejectionEmail(
            testEmail, testName, 'Invalid Document'
        );
        assert.strictEqual(result.success, true);
    });

    test('sendCompanyStatusUpdate sends email (Approved)', async () => {
        const result = await EmailService.sendCompanyStatusUpdate(
            testEmail, 'Test Company', 'approved'
        );
        assert.strictEqual(result.success, true);
    });

    test('sendCompanyStatusUpdate sends email (Rejected with reason)', async () => {
        const result = await EmailService.sendCompanyStatusUpdate(
            testEmail, 'Test Company', 'rejected', 'Missing docs'
        );
        assert.strictEqual(result.success, true);
    });

    test('sendOfferStatusUpdate sends email', async () => {
        const result = await EmailService.sendOfferStatusUpdate(
            testEmail, 'Test Offer', 'active'
        );
        assert.strictEqual(result.success, true);
    });
});
