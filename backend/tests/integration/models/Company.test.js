import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { Company } from '../../../src/models/Company.js';
import { TestDatabase } from '../../helpers/testDatabase.js';

describe('Company Model Integration', () => {
    before(async () => {
        await TestDatabase.setup();
    });

    after(async () => {
        await TestDatabase.cleanup();
    });

    it('should create a company successfully', async () => {
        const companyData = {
            name: 'Test Company',
            cnpj: '12.345.678/0001-90',
            email: 'test@company.com',
            legal_representative: 'John Doe',
            stellarPublicKey: 'GABC1234567890123456789012345678901234567890123456789012',
            address: '123 Test St',
            phone: '1234567890'
        };

        const company = await Company.create(companyData);

        assert.ok(company.id);
        assert.strictEqual(company.name, companyData.name);
        assert.strictEqual(company.cnpj, companyData.cnpj);
        assert.strictEqual(company.status, 'pending'); // Default status
    });

    it('should fail to create company with invalid stellar key', async () => {
        const companyData = {
            name: 'Bad Key Company',
            cnpj: '99.999.999/0001-99',
            email: 'bad@company.com',
            legal_representative: 'Bad Actor',
            stellarPublicKey: 'INVALID_KEY',
        };

        await assert.rejects(async () => {
            await Company.create(companyData);
        }, /stellarPublicKey deve ter 56 caracteres e começar com G/);
    });

    it('should find company by id', async () => {
        const companyData = {
            name: 'Find Me Company',
            cnpj: '11.111.111/0001-11',
            email: 'findme@company.com',
            legal_representative: 'Jane Doe',
            stellarPublicKey: 'GDEF1234567890123456789012345678901234567890123456789012',
        };
        const created = await Company.create(companyData);
        const found = await Company.findById(created.id);

        assert.ok(found);
        assert.strictEqual(found.id, created.id);
    });

    it('should update company status', async () => {
        const companyData = {
            name: 'Status Company',
            cnpj: '22.222.222/0001-22',
            email: 'status@company.com',
            legal_representative: 'Status Updater',
            stellarPublicKey: 'GHIJ1234567890123456789012345678901234567890123456789012',
        };
        const created = await Company.create(companyData);

        const updated = await Company.updateStatus(created.id, 'approved');
        assert.strictEqual(updated.status, 'approved');
    });
});
