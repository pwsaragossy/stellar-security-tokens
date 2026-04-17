/**
 * Security Routes
 * Handles passkey management for multi-device support
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { PasskeyWalletService, UserType } from '../services/passkeyWallet.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';
import logger from '../utils/logger.js';
const log = logger.scope('SecurityRoutes');

const router = Router();

/**
 * @swagger
 * /api/security/passkeys:
 *   get:
 *     summary: List all passkeys for the authenticated user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of registered passkeys
 */
router.get('/passkeys', authenticateToken, async (req, res) => {
    try {
        const { userType, userId } = req.user;

        // Map JWT userType to service UserType
        const serviceUserType = userType === 'investor' ? UserType.INVESTOR : UserType.COMPANY_USER;

        const passkeys = await PasskeyWalletService.listUserPasskeys(serviceUserType, userId);

        res.json({
            success: true,
            data: passkeys,
        });
    } catch (error) {
        log.error('Error listing passkeys:', error);
        throw error;
    }
});

/**
 * @swagger
 * /api/security/passkeys/verify/challenge:
 *   post:
 *     summary: Get WebAuthn assertion challenge to verify existing passkey
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: WebAuthn assertion options for verification
 */
router.post('/passkeys/verify/challenge', authenticateToken, async (req, res) => {
    try {
        const { userId, userType } = req.user;
        const serviceUserType = userType === 'investor' ? UserType.INVESTOR : UserType.COMPANY_USER;

        // Get user's existing passkeys to include as allowCredentials
        const passkeys = await PasskeyWalletService.listUserPasskeys(serviceUserType, userId);

        if (passkeys.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No passkeys registered. Cannot verify identity.',
            });
        }

        // Generate assertion options for passkey verification
        const options = await WebAuthnService.generateAuthenticationOptions({
            rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
            allowCredentials: passkeys.map(p => ({
                id: p.credentialId,
                type: 'public-key',
            })),
            userVerification: 'required',
        });

        res.json({
            success: true,
            data: { options },
        });
    } catch (error) {
        log.error('Error generating verify challenge:', error);
        throw error;
    }
});

/**
 * @swagger
 * /api/security/passkeys/add/options:
 *   post:
 *     summary: Get WebAuthn registration options for adding a new passkey (requires prior verification)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deviceName:
 *                 type: string
 *                 description: Optional name for the new device
 *     responses:
 *       200:
 *         description: WebAuthn registration options
 */
router.post('/passkeys/add/options', authenticateToken, async (req, res) => {
    try {
        const { userId, email, userType } = req.user;
        const { deviceName } = req.body;

        // Generate WebAuthn registration options
        // Map userType to service format (investor stays as investor, company becomes company_user)
        const serviceUserType = userType === 'investor' ? 'investor' : 'company_user';
        const options = await WebAuthnService.generateRegistrationOptions(
            serviceUserType,
            userId,
            email,  // userName
            email   // userEmail
        );

        // Debug: log the options structure
        log.info('[Security] Registration options generated:', JSON.stringify({
            hasChallenge: !!options.challenge,
            hasUser: !!options.user,
            userId: options.user?.id,
            userName: options.user?.name,
            rpId: options.rp?.id,
        }));

        res.json({
            success: true,
            data: {
                options,
                deviceName: deviceName || null,
            },
        });
    } catch (error) {
        log.error('Error generating add passkey options:', error);
        throw error;
    }
});

// NOTE: POST /passkeys/add and DELETE /passkeys/:passkeyId were removed —
// on-chain signer management requires frontend-initiated passkey authorization.
// See: smart-account-kit add_signer/remove_signer contract spec.


/**
 * @swagger
 * /api/security/passkey-config:
 *   get:
 *     summary: Get passkey configuration for frontend
 *     tags: [Security]
 *     responses:
 *       200:
 *         description: Passkey configuration
 */
router.get('/passkey-config', async (req, res) => {
    try {
        const config = PasskeyWalletService.getClientConfig();

        res.json({
            success: true,
            data: {
                ...config,
                rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
                rpName: process.env.WEBAUTHN_RP_NAME || 'Stellar Security Tokens',
            },
        });
    } catch (error) {
        log.error('Error getting passkey config:', error);
        throw error;
    }
});

// =========================================================================
// ED25519 RECOVERY SIGNERS (Ledger)
// =========================================================================

/**
 * @swagger
 * /api/security/recovery-signers:
 *   get:
 *     summary: List all Ed25519 recovery signers (e.g., Ledger)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of registered recovery signers
 */
router.get('/recovery-signers', authenticateToken, async (req, res) => {
    try {
        const { userType, userId } = req.user;
        const serviceUserType = userType === 'investor' ? UserType.INVESTOR : UserType.COMPANY_USER;

        const signers = await PasskeyWalletService.listEd25519Signers(serviceUserType, userId);

        res.json({
            success: true,
            data: signers,
        });
    } catch (error) {
        log.error('Error listing recovery signers:', error);
        throw error;
    }
});

// NOTE: POST /recovery-signers/add and DELETE /recovery-signers/:signerId were removed —
// on-chain signer management requires frontend-initiated passkey authorization.
// See: smart-account-kit add_signer/remove_signer contract spec.

export default router;

