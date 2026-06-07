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
import crypto from 'crypto';
import { blocklistToken, storeChallenge, consumeChallenge } from '../config/redis.js';
import { verifyAssertion } from '../utils/webauthnAssertion.js';
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
    // Issue a one-time challenge AND persist it server-side so the POST step can
    // verify the assertion was signed over a challenge we actually issued.
    const challenge = crypto.randomBytes(32).toString('base64url');
    await storeChallenge(`discover:${challenge}`, { issuedAt: Date.now() });

    res.json({
      success: true,
      challenge,
      rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
      timeout: 60000,
      userVerification: 'required',
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
  body('assertion').notEmpty().withMessage('Assertion is required'),
  validate,
], async (req, res, next) => {
  try {
    const { assertion } = req.body;
    const credentialId = assertion?.id;
    if (!credentialId || !assertion?.response?.clientDataJSON) {
      return res.status(400).json({ success: false, error: 'Malformed passkey assertion' });
    }


    // Find user by credentialId (smart-account-kit doesn't set userHandle properly)
    // Look up in investors first
    let user = await prisma.investor.findFirst({
      where: { passkeyCredentialId: credentialId },
      select: { id: true, name: true, email: true, kycStatus: true, stellarContractId: true, passkeyPublicKey: true }
    });


    if (user) {
      user = { ...user, userType: 'investor' };
    } else {
      // Try company users (employees/representatives)
      user = await prisma.companyUser.findFirst({
        where: { passkeyCredentialId: credentialId },
        select: { id: true, name: true, email: true, role: true, companyId: true, stellarContractId: true, passkeyPublicKey: true }
      });


      if (user) {
        user = { ...user, userType: 'company' };
      } else {
        // Try companies directly (for new company registration flow)
        const company = await prisma.company.findFirst({
          where: { passkeyCredentialId: credentialId },
          select: { id: true, name: true, email: true, status: true, stellarContractId: true, passkeyPublicKey: true }
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
            passkeyPublicKey: company.passkeyPublicKey,
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

    // ─── SECURITY: verify the WebAuthn assertion signature server-side ───
    // A credentialId is a PUBLIC identifier, never a bearer token. We require a
    // valid passkey signature over a one-time, server-issued challenge before
    // issuing any session.
    if (!user.passkeyPublicKey) {
      // Pre-fix accounts have no stored public key — they must register again.
      return res.status(401).json({
        success: false,
        error: 'This account predates a security update and must be re-registered. Please sign up again.',
      });
    }

    let challenge;
    try {
      const clientData = JSON.parse(
        Buffer.from(assertion.response.clientDataJSON, 'base64url').toString('utf8')
      );
      challenge = clientData.challenge;
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid clientDataJSON' });
    }

    // FRESHNESS GATE: atomically consume the challenge. This is the single source
    // of truth for "we issued this challenge and it has not been used" — it must
    // run, and must be atomic, to prevent replay. The signature (verified below)
    // covers this same challenge, binding the two together.
    const consumed = await consumeChallenge(`discover:${challenge}`);
    if (!consumed) {
      return res.status(401).json({
        success: false,
        error: 'Login challenge expired or already used. Please try again.',
      });
    }

    const expectedOrigins = (process.env.WEBAUTHN_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const { verified, reason } = verifyAssertion({
      publicKey: Buffer.from(user.passkeyPublicKey),
      assertion,
      // Freshness is enforced by consumeChallenge above (the store is authoritative
      // for discoverable login); this is a belt-and-suspenders equality check.
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigins,
      expectedRpId: process.env.WEBAUTHN_RP_ID || 'localhost',
    });

    if (!verified) {
      log.warn(`[Login] Passkey assertion rejected for ${user.userType} ${user.id}: ${reason}`);
      return res.status(401).json({
        success: false,
        error: 'Passkey verification failed.',
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
