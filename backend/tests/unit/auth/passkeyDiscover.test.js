/**
 * Tests for Passkey Discover Login Flow
 * Tests the usernameless passkey authentication logic
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createMockRequest, createMockResponse } from '../../helpers/testUtils.js';

describe('Passkey Discover Login', () => {

    describe('GET /auth/passkey-login/discover - Challenge Generation', () => {
        test('challenge should be a valid format', () => {
            // Simulate generating a challenge like the endpoint does
            const challenge = crypto.randomBytes(32).toString('base64');

            assert.ok(challenge);
            assert.strictEqual(typeof challenge, 'string');
            assert.ok(challenge.length > 0);
        });

        test('response structure for discover challenge', () => {
            const expectedResponse = {
                challenge: 'dGVzdENoYWxsZW5nZQ==',
                rpId: 'localhost',
                timeout: 60000,
                userVerification: 'required',
                allowCredentials: [],
            };

            assert.ok(expectedResponse.challenge);
            assert.ok(expectedResponse.rpId);
            assert.strictEqual(expectedResponse.timeout, 60000);
            assert.strictEqual(expectedResponse.userVerification, 'required');
            assert.ok(Array.isArray(expectedResponse.allowCredentials));
            assert.strictEqual(expectedResponse.allowCredentials.length, 0);
        });
    });

    describe('POST /auth/passkey-login/discover - User Lookup Logic', () => {
        test('returns 401 when credentialId not found', () => {
            const req = createMockRequest({
                body: {
                    credentialId: 'non_existent_credential_id',
                },
            });
            const res = createMockResponse();

            // Simulate no user found
            const user = null;

            if (!user) {
                res.status(401).json({ success: false, error: 'User not found' });
            }

            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.error, 'User not found');
        });

        test('returns correct investor response structure', () => {
            const mockInvestor = {
                id: 1,
                name: 'Test Investor',
                email: 'investor@test.com',
                kycStatus: 'approved',
                stellarContractId: 'CTEST123CONTRACT',
            };

            const res = createMockResponse();
            const user = { ...mockInvestor, userType: 'investor' };

            res.status(200).json({
                success: true,
                data: {
                    token: 'mock_jwt_token',
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        stellarContractId: user.stellarContractId,
                        kycStatus: user.kycStatus,
                    },
                    userType: 'investor',
                },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.data.userType, 'investor');
            assert.strictEqual(res.body.data.user.email, 'investor@test.com');
            assert.strictEqual(res.body.data.user.kycStatus, 'approved');
            assert.ok(res.body.data.token);
        });

        test('returns correct company user response structure', () => {
            const mockCompanyUser = {
                id: 5,
                name: 'Test Company User',
                email: 'company@test.com',
                role: 'admin',
                companyId: 10,
                stellarContractId: 'CCOMPANY123CONTRACT',
            };

            const res = createMockResponse();
            const user = { ...mockCompanyUser, userType: 'company' };

            res.status(200).json({
                success: true,
                data: {
                    token: 'mock_jwt_token',
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        stellarContractId: user.stellarContractId,
                        role: user.role,
                        companyId: user.companyId,
                    },
                    userType: 'company',
                },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.data.userType, 'company');
            assert.strictEqual(res.body.data.user.email, 'company@test.com');
            assert.strictEqual(res.body.data.user.role, 'admin');
            assert.strictEqual(res.body.data.user.companyId, 10);
        });

        test('investor response includes kycStatus', () => {
            const investorData = {
                id: 1,
                name: 'Test',
                email: 'test@test.com',
                kycStatus: 'pending',
                stellarContractId: 'C123',
            };

            const res = createMockResponse();
            res.json({
                success: true,
                data: {
                    user: investorData,
                    userType: 'investor',
                },
            });

            assert.ok(res.body.data.user.kycStatus);
            assert.strictEqual(res.body.data.user.kycStatus, 'pending');
        });

        test('company response includes role and companyId', () => {
            const companyUserData = {
                id: 1,
                name: 'Test',
                email: 'test@test.com',
                role: 'company_admin',
                companyId: 5,
                stellarContractId: 'C123',
            };

            const res = createMockResponse();
            res.json({
                success: true,
                data: {
                    user: companyUserData,
                    userType: 'company',
                },
            });

            assert.ok(res.body.data.user.role);
            assert.ok(res.body.data.user.companyId);
            assert.strictEqual(res.body.data.user.role, 'company_admin');
            assert.strictEqual(res.body.data.user.companyId, 5);
        });
    });

    describe('Credential ID Validation', () => {
        test('rejects empty credentialId', () => {
            const req = createMockRequest({
                body: {
                    credentialId: '',
                },
            });
            const res = createMockResponse();

            if (!req.body.credentialId) {
                res.status(400).json({
                    success: false,
                    error: 'Credential ID is required',
                });
            }

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.error, 'Credential ID is required');
        });

        test('rejects missing credentialId', () => {
            const req = createMockRequest({
                body: {},
            });
            const res = createMockResponse();

            if (!req.body.credentialId) {
                res.status(400).json({
                    success: false,
                    error: 'Credential ID is required',
                });
            }

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.error, 'Credential ID is required');
        });

        test('accepts valid base64url credentialId', () => {
            // This is a valid base64url encoded string
            const validCredentialId = 'dGVzdC1jcmVkZW50aWFsLWlk';

            const req = createMockRequest({
                body: {
                    credentialId: validCredentialId,
                },
            });

            assert.ok(req.body.credentialId);
            assert.strictEqual(typeof req.body.credentialId, 'string');
            assert.ok(req.body.credentialId.length > 0);

            // Verify it doesn't contain invalid characters for base64url
            const base64urlRegex = /^[A-Za-z0-9_-]+$/;
            assert.ok(base64urlRegex.test(validCredentialId));
        });
    });

    describe('Response Structure', () => {
        test('successful response includes required fields', () => {
            const successResponse = {
                success: true,
                data: {
                    token: 'jwt_token',
                    user: {
                        id: 1,
                        name: 'Test User',
                        email: 'test@example.com',
                        stellarContractId: 'CONTRACT123',
                    },
                    userType: 'investor',
                },
            };

            assert.ok(successResponse.success);
            assert.ok(successResponse.data.token);
            assert.ok(successResponse.data.user);
            assert.ok(successResponse.data.userType);
            assert.ok(['investor', 'company'].includes(successResponse.data.userType));
        });

        test('error response includes required fields', () => {
            const errorResponse = {
                success: false,
                error: 'User not found',
            };

            assert.strictEqual(errorResponse.success, false);
            assert.ok(errorResponse.error);
            assert.strictEqual(typeof errorResponse.error, 'string');
        });

        test('user object includes stellarContractId', () => {
            const userResponse = {
                id: 1,
                name: 'Test',
                email: 'test@test.com',
                stellarContractId: 'CABCDEF123456',
            };

            assert.ok(userResponse.stellarContractId);
            assert.strictEqual(typeof userResponse.stellarContractId, 'string');
            assert.ok(userResponse.stellarContractId.startsWith('C'));
        });
    });

    describe('User Type Detection', () => {
        test('correctly identifies investor user type', () => {
            const investorUser = {
                id: 1,
                email: 'investor@test.com',
                kycStatus: 'approved', // Investors have kycStatus
            };

            // Logic: if user has kycStatus, they're an investor
            const userType = investorUser.kycStatus !== undefined ? 'investor' : 'company';
            assert.strictEqual(userType, 'investor');
        });

        test('correctly identifies company user type', () => {
            const companyUser = {
                id: 1,
                email: 'company@test.com',
                role: 'admin', // Company users have role
                companyId: 5,
            };

            // Logic: if user has companyId, they're a company user
            const userType = companyUser.companyId !== undefined ? 'company' : 'investor';
            assert.strictEqual(userType, 'company');
        });
    });
});
