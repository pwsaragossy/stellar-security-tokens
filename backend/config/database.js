// Database configuration - now using Prisma
// This file is kept for backward compatibility during migration
// All new code should import from '../config/prisma.js' directly

import prisma from './prisma.js';

/**
 * @deprecated Use Prisma Client directly: import prisma from '../config/prisma.js'
 * This export is kept for backward compatibility during migration
 */
export { prisma as default };

// Legacy exports for compatibility - will be removed after full migration
export const query = async (text, params) => {
  console.warn('⚠️  Using legacy query() function. Please migrate to Prisma Client.');
  // This is a compatibility shim - should not be used in new code
  throw new Error('Legacy query() function is deprecated. Use Prisma Client instead.');
};

export const getClient = async () => {
  console.warn('⚠️  Using legacy getClient() function. Please migrate to Prisma transactions.');
  throw new Error('Legacy getClient() function is deprecated. Use Prisma transactions instead.');
};

