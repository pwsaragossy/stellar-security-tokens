import { generateToken } from '../../src/middleware/auth.js';
import prisma from '../../src/config/prisma.js';
import bcrypt from 'bcrypt';

/**
 * Helper to generate a valid JWT token for an investor
 * @param {Object} investor - Prisma investor object
 * @returns {string} Bearer token
 */
export const getInvestorToken = (investor) => {
    return generateToken({
        userId: investor.id,
        email: investor.email,
        userType: 'investor',
        role: 'investor'
    });
};

/**
 * Helper to generate a valid JWT token for a platform admin
 * @param {Object} admin - Prisma admin object
 * @returns {string} Bearer token
 */
export const getAdminToken = (admin) => {
    return generateToken({
        userId: admin.id,
        email: admin.email,
        role: 'platform_admin',
        userType: 'platform_admin'
    });
};

/**
 * Create a test admin in the database
 * @returns {Promise<Object>} Created admin
 */
export const createTestAdmin = async () => {
    const email = `admin-${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash('password123', 10);

    return await prisma.platformAdmin.create({
        data: {
            name: 'Test Admin',
            email,
            passwordHash,
            role: 'super_admin',
            isActive: true,
        }
    });
};

/**
 * Helper to generate a valid JWT token for a company (direct company login)
 * @param {Object} company - Prisma company object
 * @returns {string} Bearer token
 */
export const getCompanyToken = (company) => {
    return generateToken({
        userId: company.id,
        email: company.email,
        userType: 'company',
        role: 'admin',
        companyId: company.id
    });
};

/**
 * Helper to generate a valid JWT token for a company user (employee)
 * @param {Object} companyUser - Prisma companyUser object
 * @returns {string} Bearer token
 */
export const getCompanyUserToken = (companyUser) => {
    return generateToken({
        userId: companyUser.id,
        email: companyUser.email,
        userType: 'company',
        role: companyUser.role || 'admin',
        companyId: companyUser.companyId
    });
};

/**
 * Create a test company in the database
 * @returns {Promise<Object>} Created company with companyUser
 */
export const createTestCompany = async () => {
    const timestamp = Date.now();

    const company = await prisma.company.create({
        data: {
            name: `Test Company ${timestamp}`,
            email: `company-${timestamp}@example.com`,
            cnpj: `${timestamp}`.slice(-14).padStart(14, '0'),
            legalRepresentative: 'Test Representative',
            status: 'approved',
        }
    });

    const companyUser = await prisma.companyUser.create({
        data: {
            companyId: company.id,
            name: 'Test Company Admin',
            email: `admin-company-${timestamp}@example.com`,
            role: 'admin',
            passkeyCredentialId: `test-${timestamp}`,
        }
    });

    return { company, companyUser };
};
