import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { generateToken } from '../middleware/auth.js';
import { Investor } from '../models/Investor.js';
import { generateChallenge, verifyChallenge } from '../services/walletAuth.service.js';

const router = express.Router();

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').optional().isString().withMessage('Password must be a string'),
  validate,
];

const walletChallengeValidation = [
  body('publicKey')
    .matches(/^G[A-Z0-9]{55}$/)
    .withMessage('Valid Stellar public key is required'),
  validate,
];

const walletVerifyValidation = [
  body('challengeId').notEmpty().withMessage('Challenge ID is required'),
  body('signedXdr').notEmpty().withMessage('Signed transaction XDR is required'),
  body('publicKey')
    .matches(/^G[A-Z0-9]{55}$/)
    .withMessage('Valid Stellar public key is required'),
  validate,
];

const walletLoginValidation = [
  body('publicKey')
    .matches(/^G[A-Z0-9]{55}$/)
    .withMessage('Valid Stellar public key is required'),
  validate,
];

// Legacy email login
router.post('/login', loginValidation, async (req, res, next) => {
  try {
    const { email } = req.body;

    const investor = await Investor.findByEmail(email);
    if (!investor) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    const token = generateToken({
      id: investor.id,
      email: investor.email,
      role: 'investor',
    });

    res.json({
      success: true,
      data: {
        token,
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
          kycStatus: investor.kycStatus,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Request a challenge for wallet authentication
 * POST /api/auth/wallet/challenge
 */
router.post('/wallet/challenge', walletChallengeValidation, async (req, res, next) => {
  try {
    const { publicKey } = req.body;

    // Check if investor exists with this public key
    const investor = await Investor.findByStellarPublicKey(publicKey);
    
    const challenge = generateChallenge(publicKey);

    res.json({
      success: true,
      data: {
        challengeId: challenge.challengeId,
        message: challenge.message,
        expiresAt: challenge.expiresAt,
        investorExists: !!investor,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Verify signed challenge and authenticate
 * POST /api/auth/wallet/verify
 */
router.post('/wallet/verify', walletVerifyValidation, async (req, res, next) => {
  try {
    const { challengeId, signedXdr, publicKey } = req.body;

    // Verify the challenge signature
    const verification = await verifyChallenge(challengeId, signedXdr, publicKey);
    
    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: verification.error,
      });
    }

    // Find investor by public key
    const investor = await Investor.findByStellarPublicKey(publicKey);
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'No investor found with this wallet. Please register first.',
        code: 'INVESTOR_NOT_FOUND',
      });
    }

    // Generate JWT token
    const token = generateToken({
      id: investor.id,
      email: investor.email,
      stellarPublicKey: publicKey,
      role: 'investor',
    });

    res.json({
      success: true,
      data: {
        token,
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
          stellarPublicKey: investor.stellarPublicKey,
          kycStatus: investor.kycStatus,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Simple wallet login (without challenge/signature - for trusted contexts)
 * This is useful when the user has already authenticated their wallet via Freighter
 * POST /api/auth/wallet/login
 */
router.post('/wallet/login', walletLoginValidation, async (req, res, next) => {
  try {
    const { publicKey } = req.body;

    // Find investor by public key
    const investor = await Investor.findByStellarPublicKey(publicKey);
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'No investor found with this wallet. Please register first.',
        code: 'INVESTOR_NOT_FOUND',
      });
    }

    // Generate JWT token
    const token = generateToken({
      id: investor.id,
      email: investor.email,
      stellarPublicKey: publicKey,
      role: 'investor',
    });

    // Update last login
    await Investor.update(investor.id, {});

    res.json({
      success: true,
      data: {
        token,
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
          stellarPublicKey: investor.stellarPublicKey,
          kycStatus: investor.kycStatus,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Check if a wallet is registered
 * GET /api/auth/wallet/check/:publicKey
 */
router.get('/wallet/check/:publicKey', async (req, res, next) => {
  try {
    const { publicKey } = req.params;

    if (!/^G[A-Z0-9]{55}$/.test(publicKey)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Stellar public key format',
      });
    }

    const investor = await Investor.findByStellarPublicKey(publicKey);

    res.json({
      success: true,
      data: {
        registered: !!investor,
        investor: investor ? {
          id: investor.id,
          name: investor.name,
          kycStatus: investor.kycStatus,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

