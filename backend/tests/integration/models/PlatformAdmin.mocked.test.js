/**
 * Mocked version of PlatformAdmin Model Integration test
 * Uses esmock for CI stability (no Stellar dependencies, but keeping pattern consistent)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';
import { TestDatabase } from '../../helpers/testDatabase.js';

let PlatformAdmin;

describe('PlatformAdmin Model Integration (Mocked)', () => {
    before(async () => {
        // Load model (no mocking needed here, but keeping pattern for consistency)
        const module = await import('../../../src/models/PlatformAdmin.js');
        PlatformAdmin = module.PlatformAdmin;
        await TestDatabase.setup();
    });

    after(async () => {
        await TestDatabase.cleanup();
    });

    it('should create an admin successfully (mocked)', async () => {
        const adminData = {
            email: `admin.mocked.${Date.now()}@platform.com`,
            password: 'securePassword123',
            name: 'Super Admin Mocked',
            role: 'super_admin'
        };

        const admin = await PlatformAdmin.create(adminData);

        assert.ok(admin.id);
        assert.strictEqual(admin.email, adminData.email);
        assert.strictEqual(admin.role, 'super_admin');
        assert.strictEqual(admin.passwordHash, undefined); // Should not return hash
    });

    it('should authenticate correctly (mocked)', async () => {
        const adminData = {
            email: `auth.mocked.${Date.now()}@platform.com`,
            password: 'password123',
            name: 'Auth Admin Mocked',
        };

        await PlatformAdmin.create(adminData);

        const authenticated = await PlatformAdmin.authenticate(adminData.email, 'password123');
        assert.ok(authenticated);
        assert.strictEqual(authenticated.email, adminData.email);

        const failed = await PlatformAdmin.authenticate(adminData.email, 'wrongpassword');
        assert.strictEqual(failed, null);
    });

    it('should update admin details (mocked)', async () => {
        const adminData = {
            email: `update.mocked.${Date.now()}@platform.com`,
            password: 'password123',
            name: 'Update Admin Mocked',
        };
        const created = await PlatformAdmin.create(adminData);

        const updated = await PlatformAdmin.update(created.id, { name: 'Updated Name Mocked', role: 'manager' });
        assert.strictEqual(updated.name, 'Updated Name Mocked');
        assert.strictEqual(updated.role, 'manager');
    });
});
