import crypto from 'crypto';
import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { generateToken } from '../middleware/auth.js';
import { Investor } from '../models/Investor.js';
import { CompanyUser } from '../models/CompanyUser.js';
import prisma from '../config/prisma.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';

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
 * /api/auth/passkey-login/challenge:
 *   post:
 *     summary: Get WebAuthn challenge for login
 *     description: Returns a challenge and allowed credentials for WebAuthn authentication
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               userType:
 *                 type: string
 *                 enum: [investor, company]
 *     responses:
 *       200:
 *         description: Challenge and allowed credentials
 *       404:
 *         description: User not found
 */
router.post('/passkey-login/challenge', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('userType').optional().isIn(['investor', 'company']).withMessage('Invalid user type'),
  validate,
], async (req, res, next) => {
  try {
    const { email, userType = 'investor' } = req.body;

    let user;
    if (userType === 'company') {
      user = await CompanyUser.findByEmail(email);
    } else {
      user = await Investor.findByEmail(email);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.passkeyCredentialId) {
      return res.status(400).json({
        success: false,
        error: 'No passkey registered for this user',
      });
    }

    // Generate a random challenge
    const challenge = Buffer.from(crypto.randomBytes(32)).toString('base64');

    // Return the challenge and the user's credential ID
    res.json({
      success: true,
      challenge,
      allowCredentials: [{
        id: user.passkeyCredentialId,
        type: 'public-key',
        transports: ['internal', 'hybrid'],
      }],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/passkey-login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('credentialId').notEmpty().withMessage('Credential ID is required'),
  body('userType').optional().isIn(['investor', 'company']).withMessage('Invalid user type'),
  validate,
], async (req, res, next) => {
  try {
    const { email, credentialId, userType = 'investor' } = req.body;

    let user;

    if (userType === 'company') {
      user = await CompanyUser.findByEmail(email);
    } else {
      user = await Investor.findByEmail(email);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Verify credential ID matches
    if (user.passkeyCredentialId !== credentialId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid passkey credentials',
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      userType: userType,
      role: userType === 'investor' ? 'investor' : user.role,
      ...(userType === 'company' ? { companyId: user.companyId } : {})
    });

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      stellarContractId: user.stellarContractId,
    };

    if (userType === 'investor') {
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
        userType
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
