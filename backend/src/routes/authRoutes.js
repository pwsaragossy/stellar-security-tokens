import crypto from 'crypto';
import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { generateToken } from '../middleware/auth.js';
import { Investor } from '../models/Investor.js';
import { CompanyUser } from '../models/CompanyUser.js';
import prisma from '../config/prisma.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';

const router = express.Router();


/**
 * @swagger
 * /api/auth/config:
 *   get:
 *     summary: Passkey configuration
 *     description: Returns configuration for client-side PasskeyKit
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
    res.status(500).json({ error: error.message });
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
    console.log('[Auth] Discover Login - Received credentialId:', credentialId);

    // Find user by credentialId (passkey-kit doesn't set userHandle properly)
    // Look up in investors first
    let user = await prisma.investor.findFirst({
      where: { passkeyCredentialId: credentialId },
      select: { id: true, name: true, email: true, kycStatus: true, stellarContractId: true }
    });
    console.log('[Auth] Investor lookup result:', user ? `Found (ID: ${user.id})` : 'Not found');

    if (user) {
      user = { ...user, userType: 'investor' };
    } else {
      // Try company users (employees/representatives)
      user = await prisma.companyUser.findFirst({
        where: { passkeyCredentialId: credentialId },
        select: { id: true, name: true, email: true, role: true, companyId: true, stellarContractId: true }
      });
      console.log('[Auth] CompanyUser lookup result:', user ? `Found (ID: ${user.id})` : 'Not found');

      if (user) {
        user = { ...user, userType: 'company' };
      } else {
        // Try companies directly (for new company registration flow)
        const company = await prisma.company.findFirst({
          where: { passkeyCredentialId: credentialId },
          select: { id: true, name: true, email: true, status: true, stellarContractId: true }
        });
        console.log('[Auth] Company lookup result:', company ? `Found (ID: ${company.id})` : 'Not found');

        if (company) {
          user = {
            id: company.id,
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

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: user.userType,
      role: user.userType === 'investor' ? 'investor' : user.role,
      ...(user.userType === 'company' ? { companyId: user.companyId } : {})
    });

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

export default router;
