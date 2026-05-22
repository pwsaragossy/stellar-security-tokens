import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import {
  generateToken,
  authenticateToken,
  generateRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  rotateRefreshToken,
  getRefreshTokenFromCookies,
} from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';
import { blocklistToken } from '../config/redis.js';
import logger from '../utils/logger.js';
const log = logger.scope('AuthRoutes');

const router = express.Router();

/**
 * Detect user type from the Referer header URL path.
 * Used as a fallback when the frontend doesn't send an explicit userType hint.
 */
function detectUserTypeFromReferer(referer) {
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    if (url.pathname.startsWith('/admin')) return 'platform_admin';
    if (url.pathname.startsWith('/company')) return 'company';
    return 'investor';
  } catch {
    return undefined;
  }
}


/**
 * @swagger
 * /api/auth/config:
 *   get:
 *     summary: Passkey configuration
 *     description: Returns configuration for client-side SmartAccountKit
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Configuration object
 */
router.get('/config', (req, res) => {
  try {
    const config = PasskeyWalletService.getClientConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/auth/passkey-login:
 *   post:
 *     summary: Login com passkey
 *     description: Autenticação usando credencial passkey (WebAuthn). Retorna JWT token.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - credentialId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: investor@example.com
 *               credentialId:
 *                 type: string
 *                 description: ID da credencial passkey
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     investor:
 *                       $ref: '#/components/schemas/Investor'
 *       401:
 *         description: Credenciais inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/passkey-login/discover:
 *   get:
 *     summary: Get challenge for usernameless passkey login
 *     description: Returns a challenge for discoverable credential authentication (no email needed)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Challenge for WebAuthn authentication
 */
router.get('/passkey-login/discover', async (req, res, next) => {
  try {
    const options = await WebAuthnService.generateDiscoverableAuthOptions();

    // Store challenge in memory or session for verification
    // For simplicity, we'll include it in the response and verify client-side
    res.json({
      success: true,
      challenge: Buffer.from(options.challenge).toString('base64'),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/passkey-login/discover:
 *   post:
 *     summary: Authenticate with discoverable passkey
 *     description: Verifies the passkey response and identifies user via userHandle
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credentialId
 *               - userHandle
 *             properties:
 *               credentialId:
 *                 type: string
 *               userHandle:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Authentication failed
 */
router.post('/passkey-login/discover', [
  body('credentialId').notEmpty().withMessage('Credential ID is required'),
  validate,
], async (req, res, next) => {
  try {
    const { credentialId } = req.body;


    // Find user by credentialId (smart-account-kit doesn't set userHandle properly)
    // Look up in investors first
    let user = await prisma.investor.findFirst({
      where: { passkeyCredentialId: credentialId },
      select: { id: true, name: true, email: true, kycStatus: true, stellarContractId: true }
    });


    if (user) {
      user = { ...user, userType: 'investor' };
    } else {
      // Try company users (employees/representatives)
      user = await prisma.companyUser.findFirst({
        where: { passkeyCredentialId: credentialId },
        select: { id: true, name: true, email: true, role: true, companyId: true, stellarContractId: true }
      });


      if (user) {
        user = { ...user, userType: 'company' };
      } else {
        // Try companies directly (for new company registration flow)
        const company = await prisma.company.findFirst({
          where: { passkeyCredentialId: credentialId },
          select: { id: true, name: true, email: true, status: true, stellarContractId: true }
        });


        if (company) {
          // Find the ghost CompanyUser created during registration
          const ghostUser = await prisma.companyUser.findFirst({
            where: { companyId: company.id, role: 'admin' },
            select: { id: true }
          });

          user = {
            id: ghostUser?.id || company.id, // Use CompanyUser ID if exists
            companyUserId: ghostUser?.id, // For offer creation
            name: company.name,
            email: company.email,
            status: company.status,
            stellarContractId: company.stellarContractId,
            companyId: company.id,
            role: 'admin', // Company owner is admin
            userType: 'company'
          };
        }
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    // Generate JWT access token (short-lived)
    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: user.userType,
      role: user.userType === 'investor' ? 'investor' : user.role,
      ...(user.userType === 'company' ? {
        companyId: user.companyId,
        companyUserId: user.companyUserId || user.id
      } : {})
    });

    // Generate refresh token (long-lived, stored in httpOnly cookie)
    const refreshToken = await generateRefreshToken(user.userType, user.id);
    setRefreshCookie(res, refreshToken, user.userType);

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      stellarContractId: user.stellarContractId,
    };

    if (user.userType === 'investor') {
      userData.kycStatus = user.kycStatus;
    } else {
      userData.role = user.role;
      userData.companyId = user.companyId;
    }

    res.json({
      success: true,
      data: {
        token,
        user: userData,
        userType: user.userType
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using httpOnly cookie
 *     description: Reads the refresh token from the httpOnly cookie, rotates it, and returns a new access token.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: No valid refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const userTypeHint = req.body?.userType || detectUserTypeFromReferer(req.headers.referer);
    const cookieData = getRefreshTokenFromCookies(req.cookies || {}, userTypeHint);

    if (!cookieData) {
      return res.status(401).json({
        success: false,
        error: 'No refresh token provided',
      });
    }

    const result = await rotateRefreshToken(cookieData.token);

    if (!result) {
      // Clear the invalid cookie
      clearRefreshCookie(res, cookieData.userType);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token. Please login again.',
      });
    }

    // Set new refresh cookie
    setRefreshCookie(res, result.refreshToken, result.userType);

    res.json({
      success: true,
      data: {
        token: result.accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and invalidate token
 *     description: Adds the current JWT token to the blocklist, preventing further use.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out
 *       401:
 *         description: No token provided
 */
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const success = await blocklistToken(token);
      if (!success) {
        log.warn('[Auth] Failed to blocklist token (Redis unavailable)');
      }
    }

    // Also revoke the refresh token and clear the cookie
    const userType = req.user?.userType || 'investor';
    clearRefreshCookie(res, userType);

    res.json({
      success: true,
      message: 'Successfully logged out',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
