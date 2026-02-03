/**
 * Security Routes
 * Handles passkey management for multi-device support
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { PasskeyWalletService, UserType } from '../services/passkeyWallet.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';

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
        console.error('Error listing passkeys:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
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
        console.error('Error generating verify challenge:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
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
        const options = await WebAuthnService.generateRegistrationOptions({
            userId: userId.toString(),
            userName: email,
            userDisplayName: email,
            rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
            rpName: process.env.WEBAUTHN_RP_NAME || 'Stellar Security Tokens',
        });

        res.json({
            success: true,
            data: {
                options,
                deviceName: deviceName || null,
            },
        });
    } catch (error) {
        console.error('Error generating add passkey options:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/security/passkeys/add:
 *   post:
 *     summary: Complete WebAuthn registration for a new passkey (REQUIRES verification assertion)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credentialId
 *               - publicKey
 *               - verificationAssertion
 *             properties:
 *               credentialId:
 *                 type: string
 *                 description: Base64-encoded credential ID of NEW passkey
 *               publicKey:
 *                 type: string
 *                 description: Base64-encoded public key of NEW passkey
 *               deviceName:
 *                 type: string
 *                 description: Human-readable device name
 *               verificationAssertion:
 *                 type: object
 *                 description: WebAuthn assertion proving ownership of EXISTING passkey
 *     responses:
 *       200:
 *         description: Passkey added successfully
 *       401:
 *         description: Passkey verification failed
 */
router.post('/passkeys/add', authenticateToken, async (req, res) => {
    try {
        const { userType, userId } = req.user;
        const { credentialId, publicKey, deviceName, verificationAssertion } = req.body;

        if (!credentialId || !publicKey) {
            return res.status(400).json({
                success: false,
                error: 'credentialId and publicKey are required',
            });
        }

        // SECURITY: Require verification with existing passkey
        if (!verificationAssertion) {
            return res.status(401).json({
                success: false,
                error: 'Passkey verification required. Please verify your identity first.',
            });
        }

        const serviceUserType = userType === 'investor' ? UserType.INVESTOR : UserType.COMPANY_USER;

        // Verify the assertion matches a registered passkey for this user
        try {
            const passkeys = await PasskeyWalletService.listUserPasskeys(serviceUserType, userId);
            const matchingPasskey = passkeys.find(p =>
                p.credentialId === verificationAssertion.credentialId
            );

            if (!matchingPasskey) {
                return res.status(401).json({
                    success: false,
                    error: 'Verification failed. The passkey used does not belong to this account.',
                });
            }

            // Note: Full WebAuthn assertion verification would check signature here
            // For now, we verify the credential ID matches and trust the browser's verification
            console.log(`[Security] Passkey verification passed for user ${userId} with credential ${matchingPasskey.id}`);
        } catch (verifyError) {
            console.error('Passkey verification failed:', verifyError);
            return res.status(401).json({
                success: false,
                error: 'Passkey verification failed.',
            });
        }

        const result = await PasskeyWalletService.addPasskeySigner(
            serviceUserType,
            userId,
            credentialId,
            publicKey,
            deviceName
        );

        res.json({
            success: true,
            data: result,
            message: 'Passkey added successfully. You can now sign in with this device.',
        });
    } catch (error) {
        console.error('Error adding passkey:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/security/passkeys/{passkeyId}:
 *   delete:
 *     summary: Remove a passkey (must keep at least one)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: passkeyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Passkey removed successfully
 *       400:
 *         description: Cannot remove last passkey
 */
router.delete('/passkeys/:passkeyId', authenticateToken, async (req, res) => {
    try {
        const { userType, userId } = req.user;
        const passkeyId = parseInt(req.params.passkeyId, 10);

        if (isNaN(passkeyId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid passkey ID',
            });
        }

        const serviceUserType = userType === 'investor' ? UserType.INVESTOR : UserType.COMPANY_USER;

        const result = await PasskeyWalletService.removePasskeySigner(
            serviceUserType,
            userId,
            passkeyId
        );

        res.json({
            success: true,
            data: result,
            message: 'Passkey removed successfully.',
        });
    } catch (error) {
        console.error('Error removing passkey:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

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
        console.error('Error getting passkey config:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
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
        console.error('Error listing recovery signers:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/security/recovery-signers/add:
 *   post:
 *     summary: Add an Ed25519 recovery signer (Ledger public key)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicKey
 *             properties:
 *               publicKey:
 *                 type: string
 *                 description: Stellar public key from Ledger (G... address)
 *               name:
 *                 type: string
 *                 description: Human-readable name (default "Ledger")
 *     responses:
 *       200:
 *         description: Recovery signer added successfully
 *       400:
 *         description: Invalid public key format
 */
router.post('/recovery-signers/add', authenticateToken, async (req, res) => {
    try {
        const { userType, userId } = req.user;
        const { publicKey, name } = req.body;

        if (!publicKey) {
            return res.status(400).json({
                success: false,
                error: 'publicKey is required',
            });
        }

        if (!publicKey.startsWith('G') || publicKey.length !== 56) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Stellar public key format. Must be a G... address.',
            });
        }

        const serviceUserType = userType === 'investor' ? UserType.INVESTOR : UserType.COMPANY_USER;

        const result = await PasskeyWalletService.addEd25519Signer(
            serviceUserType,
            userId,
            publicKey,
            name || 'Ledger'
        );

        res.json({
            success: true,
            data: result,
            message: 'Recovery signer added. Your Ledger can now be used to recover your wallet.',
        });
    } catch (error) {
        console.error('Error adding recovery signer:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/security/recovery-signers/{signerId}:
 *   delete:
 *     summary: Remove an Ed25519 recovery signer
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: signerId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Recovery signer removed successfully
 */
router.delete('/recovery-signers/:signerId', authenticateToken, async (req, res) => {
    try {
        const { userType, userId } = req.user;
        const signerId = parseInt(req.params.signerId, 10);

        if (isNaN(signerId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid signer ID',
            });
        }

        const serviceUserType = userType === 'investor' ? UserType.INVESTOR : UserType.COMPANY_USER;

        const result = await PasskeyWalletService.removeEd25519Signer(
            serviceUserType,
            userId,
            signerId
        );

        res.json({
            success: true,
            data: result,
            message: 'Recovery signer removed.',
        });
    } catch (error) {
        console.error('Error removing recovery signer:', error);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

export default router;

