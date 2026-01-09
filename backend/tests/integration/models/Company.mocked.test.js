/**
 * Mocked version of Company Model Integration test
 * Uses esmock for CI stability (no Stellar dependencies, but keeping pattern consistent)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';
import { TestDatabase } from '../../helpers/testDatabase.js';

let Company;

describe('Company Model Integration (Mocked)', () => {
    before(async () => {
        // Load model (no mocking needed here, but keeping pattern for consistency)
        const module = await import('../../../src/models/Company.js');
        Company = module.Company;
        await TestDatabase.setup();
    });

    after(async () => {
        await TestDatabase.cleanup();
    });

    it('should create a company successfully (mocked)', async () => {
        const companyData = {
            name: 'Test Company Mocked',
            cnpj: `12.345.${Date.now().toString().slice(-3)}/0001-90`,
            email: `test.mocked.${Date.now()}@company.com`,
            legal_representative: 'John Doe Mocked',
            stellarPublicKey: 'GABC1234567890123456789012345678901234567890123456789012',
            address: '123 Test St Mocked',
            phone: '1234567890'
        };

        const company = await Company.create(companyData);

        assert.ok(company.id);
        assert.strictEqual(company.name, companyData.name);
        assert.strictEqual(company.status, 'pending'); // Default status
    });

    it('should fail to create company with invalid stellar key (mocked)', async () => {
        const companyData = {
            name: 'Bad Key Company Mocked',
            cnpj: `12.345.${Date.now().toString().slice(-3)}/0001-99`,
            email: `bad.mocked.${Date.now()}@company.com`,
            legal_representative: 'Bad Actor Mocked',
            stellarPublicKey: 'INVALID_KEY',
        };

        await assert.rejects(async () => {
            await Company.create(companyData);
        }, /stellarPublicKey deve ter 56 caracteres e começar com G/);
    });

    it('should find company by id (mocked)', async () => {
        const companyData = {
            name: 'Find Me Company Mocked',
            cnpj: `12.345.${Date.now().toString().slice(-3)}/0001-11`,
            email: `findme.mocked.${Date.now()}@company.com`,
            legal_representative: 'Jane Doe Mocked',
            stellarPublicKey: 'GDEF1234567890123456789012345678901234567890123456789012',
        };
        const created = await Company.create(companyData);
        const found = await Company.findById(created.id);

        assert.ok(found);
        assert.strictEqual(found.id, created.id);
    });

    it('should update company status (mocked)', async () => {
        const companyData = {
            name: 'Status Company Mocked',
            cnpj: `12.345.${Date.now().toString().slice(-3)}/0001-22`,
            email: `status.mocked.${Date.now()}@company.com`,
            legal_representative: 'Status Updater Mocked',
            stellarPublicKey: 'GHIJ1234567890123456789012345678901234567890123456789012',
        };
        const created = await Company.create(companyData);

        const updated = await Company.updateStatus(created.id, 'approved');
        assert.strictEqual(updated.status, 'approved');
    });
});
