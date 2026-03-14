import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticateToken, generateToken, generateRefreshToken, setRefreshCookie } from '../middleware/auth.js';
import { requirePlatformAdmin, requireAdminRole } from '../middleware/authorize.js';
import { PlatformAdminController } from '../controllers/platformAdminController.js';
import { InvestmentMetricsController } from '../controllers/investmentMetricsController.js';
import { TreasuryController } from '../controllers/treasuryController.js';
import prisma from '../config/prisma.js';
import { PasskeyWalletService } from '../services/passkeyWallet.service.js';
import { WebAuthnService } from '../services/webauthn.service.js';
import { EmailService } from '../services/email.service.js';
import { CollateralDistributionService } from '../services/collateralDistribution.service.js';
import logger from '../utils/logger.js';
import { storeChallenge, getChallenge, deleteChallenge } from '../config/redis.js';

const log = logger.scope('AdminRoutes');

const router = express.Router();

const createValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('role').optional().isIn(['admin', 'manager', 'super_admin']).withMessage('Invalid role'),
  validate,
];

// Rota de debug para criar admin sem autenticação (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  router.post('/debug/create', createValidation, PlatformAdminController.createPlatformAdmin);
}

// ============ Freighter Challenge-Response Login (Public) ============
// Uses signTransaction for authentication (SEP-10 style challenge).
// Challenges stored in Redis with 5-minute TTL (key: freighter:{publicKey})

/**
 * POST /api/platform-admins/freighter/challenge
 * Generate a challenge transaction XDR for the admin to sign with Freighter.
 * Uses a ManageData operation with a random nonce — never submitted to the network.
 */
router.post('/freighter/challenge', async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey || typeof publicKey !== 'string' || publicKey.length !== 56) {
      return res.status(400).json({ success: false, error: 'Valid Stellar public key required' });
    }

    // Check if this public key belongs to a registered admin
    const admin = await prisma.platformAdmin.findFirst({
      where: { stellarPublicKey: publicKey, isActive: true },
      select: { id: true, email: true, name: true }
    });

    if (!admin) {
      return res.status(404).json({ success: false, error: 'No admin account found for this key. Contact a super_admin to register your key.' });
    }

    // Build a challenge transaction (SEP-10 style)
    const { randomBytes } = await import('crypto');
    const StellarSdk = await import('@stellar/stellar-sdk');
    const { TransactionBuilder, Networks, Operation, Account } = StellarSdk;

    const nonce = randomBytes(32).toString('hex');

    // Use the admin's public key as source with sequence 0 (not submitted to network)
    const sourceAccount = new Account(publicKey, '0');

    const networkPassphrase = process.env.STELLAR_NETWORK === 'public'
      ? Networks.PUBLIC
      : Networks.TESTNET;

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(Operation.manageData({
        name: 'radox_auth_challenge',
        value: nonce,
      }))
      .setTimeout(300)
      .build();

    const challengeXdr = tx.toXDR();
    const txHash = tx.hash();

    // Store challenge data in Redis (txHash as hex for JSON serialization)
    const challengeRedisKey = `freighter:${publicKey}`;
    await storeChallenge(challengeRedisKey, {
      nonce,
      txHash: tx.hash().toString('hex'),
      adminId: admin.id,
      networkPassphrase,
    });

    log.info(`[Freighter Auth] Challenge TX issued for admin ${admin.email} (${publicKey.slice(0, 8)}...)`);

    res.json({
      success: true,
      data: {
        challengeXdr,
        networkPassphrase,
      }
    });
  } catch (error) {
    log.error('[Freighter Auth] Challenge error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate challenge' });
  }
});

/**
 * POST /api/platform-admins/freighter/verify
 * Verify the signed transaction XDR and issue a JWT.
 */
router.post('/freighter/verify', async (req, res) => {
  try {
    const { publicKey, signedXdr } = req.body;

    if (!publicKey || !signedXdr) {
      return res.status(400).json({ success: false, error: 'Public key and signed transaction are required' });
    }

    // Retrieve and validate the stored challenge
    const challengeRedisKey = `freighter:${publicKey}`;
    const stored = await getChallenge(challengeRedisKey);
    if (!stored) {
      return res.status(401).json({ success: false, error: 'No pending challenge. Please request a new one.' });
    }

    // Parse the signed transaction and verify signature
    const StellarSdk = await import('@stellar/stellar-sdk');
    const { TransactionBuilder, Keypair } = StellarSdk;

    let signedTx;
    try {
      signedTx = TransactionBuilder.fromXDR(signedXdr, stored.networkPassphrase);
    } catch (e) {
      await deleteChallenge(challengeRedisKey);
      return res.status(400).json({ success: false, error: 'Invalid signed transaction XDR.' });
    }

    // Verify that this is our challenge tx by checking the hash matches
    const signedTxHash = signedTx.hash();
    const storedTxHash = Buffer.from(stored.txHash, 'hex');
    if (!storedTxHash.equals(signedTxHash)) {
      await deleteChallenge(challengeRedisKey);
      return res.status(401).json({ success: false, error: 'Transaction hash mismatch. Please request a new challenge.' });
    }

    // Check that the transaction has a valid signature from the expected public key
    const keypair = Keypair.fromPublicKey(publicKey);
    const signatures = signedTx.signatures;

    let verified = false;
    for (const sig of signatures) {
      try {
        if (keypair.verify(signedTxHash, sig.signature())) {
          verified = true;
          break;
        }
      } catch {
        // try next signature
      }
    }

    // Consume the challenge regardless of result
    await deleteChallenge(challengeRedisKey);

    if (!verified) {
      log.info(`[Freighter Auth] Signature verification failed for ${publicKey.slice(0, 8)}... (${signatures.length} signatures on TX)`);
      return res.status(401).json({ success: false, error: 'Invalid signature. Authentication failed.' });
    }

    // Load the full admin record
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: stored.adminId },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    });

    if (!admin || !admin.isActive) {
      return res.status(401).json({ success: false, error: 'Admin account not found or inactive.' });
    }

    // Generate JWT
    const token = generateToken({
      userId: admin.id,
      email: admin.email,
      userType: 'platform_admin',
      role: admin.role
    });

    // Generate refresh token and set httpOnly cookie
    const refreshToken = await generateRefreshToken('platform_admin', admin.id);
    setRefreshCookie(res, refreshToken, 'platform_admin');

    log.info(`[Freighter Auth] Login successful for ${admin.email}`);

    res.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role
        }
      }
    });
  } catch (error) {
    log.error('[Freighter Auth] Verify error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// ============ Admin Passkey Login Routes (Public) ============

router.post('/passkey/login/options', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const admin = await prisma.platformAdmin.findUnique({ where: { email } });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const options = await WebAuthnService.generateAuthenticationOptions('platform_admin', admin.id);
    res.json(options);
  } catch (error) {
    log.error('Passkey Auth Options Error:', error);
    res.status(500).json({ error: 'Failed to generate auth options' });
  }
});

router.post('/passkey/login/verify', async (req, res) => {
  try {
    const { email, authResponse } = req.body;
    const admin = await prisma.platformAdmin.findUnique({ where: { email } });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const result = await WebAuthnService.verifyAuthenticationResponse(
      'platform_admin',
      admin.id,
      authResponse
    );

    if (result.verified) {
      // Login successful -> Generate JWT
      const token = generateToken(admin);

      // Generate refresh token and set httpOnly cookie
      const refreshToken = await generateRefreshToken('platform_admin', admin.id);
      setRefreshCookie(res, refreshToken, 'platform_admin');

      res.json({ success: true, token, user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
    } else {
      res.status(400).json({ success: false, error: 'Authentication failed' });
    }
  } catch (error) {
    log.error('Passkey Verify Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Admin Passkey Routes ============


/**
 * POST /api/platform-admins/passkey/register/options
 * Get passkey registration options (requires password login first)
 */
router.post('/passkey/register/options', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const adminId = req.user.userId;
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, name: true }
    });

    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    const options = await WebAuthnService.generateRegistrationOptions(
      'platform_admin',
      admin.id,
      admin.name,
      admin.email
    );

    res.json({ success: true, options, challenge: options.challenge });
  } catch (error) {
    log.error('[Admin Passkey] Registration options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform-admins/passkey/register
 * Complete passkey registration
 */
router.post('/passkey/register', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const adminId = req.user.userId;
    const { credential, challenge, deviceName } = req.body;

    if (!credential || !challenge) {
      return res.status(400).json({ success: false, error: 'Credential and challenge required' });
    }

    const verification = await WebAuthnService.verifyRegistration(
      'platform_admin',
      adminId,
      credential,
      challenge,
      deviceName || 'Admin Device'
    );

    if (verification.verified) {
      res.json({
        success: true,
        message: 'Passkey registered successfully. You can now login with passkey.'
      });
    } else {
      res.status(400).json({ success: false, error: 'Passkey verification failed' });
    }
  } catch (error) {
    log.error('[Admin Passkey] Registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/platform-admins/passkey-login
 * Get passkey authentication challenge (no auth required)
 */
router.get('/passkey-login', async (req, res) => {
  try {
    const options = await WebAuthnService.generateDiscoverableAuthOptions();
    res.json({
      success: true,
      challenge: Buffer.from(options.challenge).toString('base64'),
      rpId: options.rpId,
      timeout: options.timeout
    });
  } catch (error) {
    log.error('[Admin Passkey] Auth options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform-admins/passkey-login
 * Authenticate with passkey
 */
router.post('/passkey-login', async (req, res) => {
  try {
    const { credentialId } = req.body;

    if (!credentialId) {
      return res.status(400).json({ success: false, error: 'Credential ID required' });
    }

    // Find admin by credential ID
    const credential = await prisma.platformAdminWebauthnCredential.findUnique({
      where: { credentialId },
      include: {
        platformAdmin: {
          select: { id: true, email: true, name: true, role: true, isActive: true }
        }
      }
    });

    if (!credential || !credential.platformAdmin) {
      return res.status(401).json({ success: false, error: 'Invalid passkey' });
    }

    const admin = credential.platformAdmin;

    if (!admin.isActive) {
      return res.status(401).json({ success: false, error: 'Admin account is inactive' });
    }

    // Update last used
    await prisma.platformAdminWebauthnCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() }
    });

    // Generate JWT
    const token = generateToken({
      userId: admin.id,
      email: admin.email,
      userType: 'platform_admin',
      role: admin.role
    });

    // Generate refresh token and set httpOnly cookie
    const rtk = await generateRefreshToken('platform_admin', admin.id);
    setRefreshCookie(res, rtk, 'platform_admin');

    res.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role
        }
      }
    });
  } catch (error) {
    log.error('[Admin Passkey] Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/platform-admins:
 *   post:
 *     summary: Criar administrador
 *     description: Apenas super_admin pode criar outros admins
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, manager, super_admin]
 *     responses:
 *       201:
 *         description: Admin criado
 *       403:
 *         description: Acesso negado
 *   get:
 *     summary: Listar administradores
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de administradores
 */
// Rotas para platform_admins (apenas super_admin pode criar)
router.post('/', requireAdminRole('super_admin'), createValidation, PlatformAdminController.createPlatformAdmin);
router.get('/', requirePlatformAdmin, PlatformAdminController.getPlatformAdmins);

// Rotas de configuração e logs (DEVEM vir antes de /:id)
/**
 * @swagger
 * /api/platform-admins/system-config:
 *   get:
 *     summary: Obter configurações do sistema (Taxas)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configurações retornadas
 *   put:
 *     summary: Atualizar configurações do sistema
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               settings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                     value:
 *                       type: string
 *     responses:
 *       200:
 *         description: Configurações atualizadas
 */
router.get('/system-config', authenticateToken, requirePlatformAdmin, PlatformAdminController.getSystemConfig);
router.put('/system-config', [
  body('settings').isArray({ min: 1 }).withMessage('Settings must be a non-empty array'),
  body('settings.*.key').isString().notEmpty().withMessage('Each setting must have a key'),
  body('settings.*.value').isString().withMessage('Each setting must have a string value'),
  validate,
], authenticateToken, requirePlatformAdmin, PlatformAdminController.updateSystemConfig);

/**
 * @swagger
 * /api/platform-admins/investments/metrics:
 *   get:
 *     summary: Obter métricas gerais de investimento
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema: { type: string }
 *       - in: query
 *         name: end_date
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Métricas retornadas
 */
router.get('/investments/metrics', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getMetrics);

/**
 * @swagger
 * /api/platform-admins/investments/statistics:
 *   get:
 *     summary: Obter estatísticas de investimento por período
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Estatísticas retornadas
 */
router.get('/investments/statistics', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getStatistics);

/**
 * @swagger
 * /api/platform-admins/investments/pending:
 *   get:
 *     summary: Obter investimentos pendentes de pagamento
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de investimentos pendentes
 */
router.get('/investments/pending', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getPendingInvestments);

/**
 * @swagger
 * /api/platform-admins/investments/fundraising:
 *   get:
 *     summary: Obter progresso de captação (Ofertas ativas)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de progresso das ofertas
 */
router.get('/investments/fundraising', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getFundraisingProgress);

/**
 * @swagger
 * /api/platform-admins/investments/revenue-breakdown:
 *   get:
 *     summary: Obter breakdown de receita por categoria
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Totais de receita por categoria
 */
router.get('/investments/revenue-breakdown', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getRevenueBreakdown);

/**
 * @swagger
 * /api/platform-admins/investments/cohorts:
 *   get:
 *     summary: Obter coortes de investidores (Ativos vs Inativos)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contagem de usuários ativos e inativos
 */
router.get('/investments/cohorts', authenticateToken, requirePlatformAdmin, InvestmentMetricsController.getInvestorCohorts);

/**
 * @swagger
 * /api/platform-admins/fee-logs:
 *   get:
 *     summary: Obter logs de taxas (Receita)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Logs retornados com sumário de receita
 */
router.get('/fee-logs', authenticateToken, requirePlatformAdmin, PlatformAdminController.getFeeLogs);

/**
 * @swagger
 * /api/platform-admins/{id}:
 *   put:
 *     summary: Atualizar administrador
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [admin, manager, super_admin]
 *     responses:
 *       200:
 *         description: Admin atualizado
 */
router.put('/:id', requirePlatformAdmin, PlatformAdminController.updatePlatformAdmin);

/**
 * @swagger
 * /api/platform-admins/investors:
 *   get:
 *     summary: "[Admin] Listar todos os investidores"
 *     description: Lista investidores com filtro por status (pending/active/rejected)
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, active, rejected]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de investidores
 */
router.get('/investors', authenticateToken, requirePlatformAdmin, PlatformAdminController.getAllInvestors);

// ============ Treasury Management Routes ============

/**
 * @swagger
 * /api/platform-admins/treasury/balances:
 *   get:
 *     summary: "[Admin] View Treasury balances"
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Treasury public key and balances
 */
router.get('/treasury/balances', authenticateToken, requirePlatformAdmin, TreasuryController.getBalances);
router.get('/maintenance/ttl-stats', authenticateToken, requirePlatformAdmin, PlatformAdminController.getTTLStats);



// ============ Company Management Routes ============

/**
 * @swagger
 * /api/platform-admins/companies:
 *   get:
 *     summary: "[Admin] List all companies"
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of companies
 */
router.get('/companies', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    // Build where clause based on status filter
    const where = status ? { status: status.toLowerCase() } : {};

    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        status: true,
        stellarContractId: true,
        createdAt: true,
        users: {
          select: { id: true, name: true, email: true, role: true }
        },
        offers: {
          where: { status: 'active' },
          select: { id: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const result = companies.map(c => ({
      ...c,
      walletAddress: c.stellarContractId,
      activeOffers: c.offers.length,
      totalInvestments: 0, // Would need aggregation
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    log.error('[Companies List] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/platform-admins/companies/{id}/details:
 *   get:
 *     summary: "[Admin] Get company details"
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Company details
 *       404:
 *         description: Company not found
 */
router.get('/companies/:id/details', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        legalRepresentative: true,
        phone: true,
        address: true,
        status: true,
        stellarContractId: true,
        createdAt: true,
        users: {
          select: { id: true, name: true, email: true, role: true }
        },
        offers: {
          select: {
            id: true,
            offerName: true,
            assetCode: true,
            status: true,
            totalSupply: true,
            annualInterestRate: true,
            maturityDate: true,
            sorobanContractId: true,
            offerType: true,
            createdAt: true,
            tokens: { select: { id: true, assetCode: true, sacContractId: true } },
            _count: { select: { investments: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        _count: { select: { offers: true } },
      }
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Aggregate investment stats across all offers
    const investmentStats = await prisma.investment.aggregate({
      where: { offer: { companyId: parseInt(id) } },
      _sum: { usdcAmount: true },
      _count: true,
    });

    // Get balances if wallet exists
    let balances = { xlm: '0', usdc: '0' };
    if (company.stellarContractId) {
      try {
        balances = await PasskeyWalletService.getSorobanWalletBalances(company.stellarContractId);
      } catch (err) {
        log.info('[Company Details] Balance fetch error:', err.message);
      }
    }

    res.json({
      success: true,
      data: {
        ...company,
        walletAddress: company.stellarContractId,
        activeOffers: company.offers.filter(o => o.status === 'active').length,
        totalOfferCount: company._count?.offers || 0,
        totalInvestments: investmentStats._count || 0,
        totalInvestmentVolume: investmentStats._sum?.usdcAmount?.toString() || '0',
        balances,
      }
    });
  } catch (error) {
    log.error('[Company Details] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/platform-admins/companies/{id}/approve:
 *   post:
 *     summary: "[Admin] Approve a company"
 *     description: Changes company status to 'approved'
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Company approved
 *       404:
 *         description: Company not found
 */
router.post('/companies/:id/approve', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id: parseInt(id) }
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (company.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot approve company: status is already '${company.status}'`
      });
    }

    const updatedCompany = await prisma.company.update({
      where: { id: parseInt(id) },
      data: { status: 'approved' }
    });

    // Send approval email to company
    try {
      await EmailService.sendCompanyStatusUpdate(company.email, company.name, 'approved');
      log.info(`[Admin] Approval email sent to ${company.email}`);
    } catch (emailErr) {
      log.error(`[Admin] Failed to send approval email:`, emailErr.message);
      // Don't fail the approval if email fails
    }

    log.info(`[Admin] Company ${id} (${company.name}) approved by admin ${req.user.userId}`);

    res.json({
      success: true,
      message: `Company '${company.name}' has been approved`,
      data: updatedCompany
    });
  } catch (error) {
    log.error('[Company Approve] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/platform-admins/companies/{id}/reject:
 *   post:
 *     summary: "[Admin] Reject a company"
 *     description: Changes company status to 'rejected'
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Rejection reason
 *     responses:
 *       200:
 *         description: Company rejected
 *       400:
 *         description: Reason not provided
 *       404:
 *         description: Company not found
 */
router.post('/companies/:id/reject', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }

    const company = await prisma.company.findUnique({
      where: { id: parseInt(id) }
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (company.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot reject company: status is already '${company.status}'`
      });
    }

    const updatedCompany = await prisma.company.update({
      where: { id: parseInt(id) },
      data: { status: 'rejected' }
    });

    // Send rejection email to company with reason
    try {
      await EmailService.sendCompanyStatusUpdate(company.email, company.name, 'rejected', reason);
      log.info(`[Admin] Rejection email sent to ${company.email}`);
    } catch (emailErr) {
      log.error(`[Admin] Failed to send rejection email:`, emailErr.message);
      // Don't fail the rejection if email fails
    }

    log.info(`[Admin] Company ${id} (${company.name}) rejected by admin ${req.user.userId}. Reason: ${reason}`);

    res.json({
      success: true,
      message: `Company '${company.name}' has been rejected`,
      data: updatedCompany
    });
  } catch (error) {
    log.error('[Company Reject] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/platform-admins/companies/{id}/sponsor:
 *   post:
 *     summary: "[Admin] Sponsor company wallet with XLM"
 *     description: Sends XLM from Treasury to company's smart wallet. Requires approved status.
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: string
 *                 description: Amount of XLM to send (default 10)
 *     responses:
 *       200:
 *         description: Wallet sponsored successfully
 *       400:
 *         description: Invalid request or company not eligible
 *       404:
 *         description: Company not found
 */
router.post('/companies/:id/sponsor', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount = '10' } = req.body;

    // Validate amount
    const xlmAmount = parseFloat(amount);
    if (isNaN(xlmAmount) || xlmAmount <= 0 || xlmAmount > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be between 0 and 10000 XLM'
      });
    }

    // Get company
    const company = await prisma.company.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        stellarContractId: true,
      }
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (company.status !== 'approved' && company.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: `Cannot sponsor wallet: status is '${company.status}'. Must be 'approved' or 'active'.`
      });
    }

    if (!company.stellarContractId) {
      return res.status(400).json({
        success: false,
        error: 'Company does not have a wallet yet. They must complete passkey registration first.'
      });
    }

    log.info(`[Admin Sponsor Company] Sponsoring wallet for company ${company.id} (${company.name})`);
    log.info(`[Admin Sponsor Company] Sending ${xlmAmount} XLM to ${company.stellarContractId}`);

    // Get Treasury keypair (imported at bottom of file)
    const { getTreasuryKeypair, getNetworkPassphrase } = await import('../config/stellar.js');
    const treasuryKeypair = getTreasuryKeypair();
    const networkPassphrase = getNetworkPassphrase();

    // Get XLM SAC contract ID
    const xlmSacContractId = process.env.XLM_SAC_CONTRACT_ID;
    if (!xlmSacContractId) {
      return res.status(500).json({
        success: false,
        error: 'XLM_SAC_CONTRACT_ID not configured. Cannot sponsor Soroban wallets.'
      });
    }

    // Import required modules
    const stellarSdk = await import('@stellar/stellar-sdk');
    const { Contract, nativeToScVal, rpc, TransactionBuilder: TxBuilder } = stellarSdk;

    // Create Soroban RPC server
    const sorobanRpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    const sorobanServer = new rpc.Server(sorobanRpcUrl, { allowHttp: true });

    // Load treasury account
    const treasuryAccount = await sorobanServer.getAccount(treasuryKeypair.publicKey());

    // Build SAC transfer transaction
    const xlmSac = new Contract(xlmSacContractId);
    const amountStroops = BigInt(Math.floor(xlmAmount * 10_000_000));

    // Build the transfer operation
    const transferOp = xlmSac.call(
      'transfer',
      nativeToScVal(treasuryKeypair.publicKey(), { type: 'address' }),
      nativeToScVal(company.stellarContractId, { type: 'address' }),
      nativeToScVal(amountStroops, { type: 'i128' })
    );

    // Build initial transaction
    let tx = new TxBuilder(treasuryAccount, {
      fee: '100000',
      networkPassphrase
    })
      .addOperation(transferOp)
      .setTimeout(30)
      .build();

    // Simulate the transaction
    log.info('[Admin Sponsor Company] Simulating transaction...');
    const simResult = await sorobanServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResult)) {
      log.error('[Admin Sponsor Company] Simulation error:', simResult.error);
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    // Prepare the transaction with simulation results
    tx = rpc.assembleTransaction(tx, simResult).build();

    // Sign the prepared transaction
    tx.sign(treasuryKeypair);

    // Submit via Soroban RPC
    log.info('[Admin Sponsor Company] Submitting transaction...');
    const sendResponse = await sorobanServer.sendTransaction(tx);

    if (sendResponse.status === 'ERROR') {
      throw new Error(sendResponse.errorResultXdr || 'Transaction submission failed');
    }

    // Poll for transaction result
    let getResponse;
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      getResponse = await sorobanServer.getTransaction(sendResponse.hash);

      if (getResponse.status !== 'NOT_FOUND') {
        break;
      }
      attempts++;
    }

    if (!getResponse || getResponse.status !== 'SUCCESS') {
      throw new Error(`Transaction failed: ${getResponse?.status || 'TIMEOUT'}`);
    }

    log.info(`[Admin Sponsor Company] Success! TX Hash: ${sendResponse.hash}`);

    res.json({
      success: true,
      message: `Successfully sent ${xlmAmount} XLM to ${company.name}'s wallet`,
      data: {
        companyId: company.id,
        companyName: company.name,
        walletAddress: company.stellarContractId,
        amountXLM: xlmAmount,
        transactionHash: sendResponse.hash,
        explorer: `https://stellar.expert/explorer/testnet/tx/${sendResponse.hash}`
      }
    });

  } catch (error) {
    log.error('[Admin Sponsor Company] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/platform-admins/investors/{id}/details:
 *   get:
 *     summary: "[Admin] Get complete investor details"
 *     description: Returns investor profile with wallet, balances, and transaction history
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Investor details
 *       404:
 *         description: Investor not found
 */
router.get('/investors/:id/details', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const investor = await prisma.investor.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        email: true,
        document: true,
        kycStatus: true,
        emailVerified: true,
        stellarContractId: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        investments: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            usdcAmount: true,
            tokenAmount: true,
            assetCode: true,
            status: true,
            createdAt: true,
            offer: {
              select: {
                id: true,
                offerName: true,
                assetCode: true,
                company: { select: { id: true, name: true } },
              }
            }
          }
        }
      }
    });

    if (!investor) {
      return res.status(404).json({ success: false, error: 'Investor not found' });
    }

    // Aggregate total invested
    const investmentStats = await prisma.investment.aggregate({
      where: { investorId: parseInt(id) },
      _sum: { usdcAmount: true },
      _count: true,
    });

    // Get balances from Soroban if wallet exists
    let balances = { xlm: '0', usdc: '0' };
    let transactions = [];

    if (investor.stellarContractId) {
      try {
        const balanceResult = await PasskeyWalletService.getSorobanWalletBalances(investor.stellarContractId);
        balances = balanceResult;
      } catch (err) {
        log.info('[Investor Details] Balance fetch error:', err.message);
      }

      // Map DB investments to transactions for display (legacy compat)
      transactions = investor.investments.map(inv => ({
        type: inv.offer ? `Investment: ${inv.offer.offerName}` : 'Investment',
        amount: `$${Number(inv.usdcAmount).toFixed(2)}`,
        date: new Date(inv.createdAt).toLocaleDateString()
      }));
    }

    res.json({
      success: true,
      data: {
        ...investor,
        status: investor.kycStatus,
        walletAddress: investor.stellarContractId,
        balances,
        transactions,
        totalInvestedAmount: investmentStats._sum?.usdcAmount?.toString() || '0',
        investmentCount: investmentStats._count || 0,
      }
    });
  } catch (error) {
    log.error('[Investor Details] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/platform-admins/investors/{id}/approve:
 *   put:
 *     summary: "[Admin] Aprovar KYC de investidor"
 *     description: Altera o status do investidor para 'active'
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Investidor aprovado
 *       404:
 *         description: Investidor não encontrado
 */
router.put('/investors/:id/approve', authenticateToken, requirePlatformAdmin, PlatformAdminController.approveInvestor);

/**
 * @swagger
 * /api/platform-admins/investors/{id}/reject:
 *   put:
 *     summary: "[Admin] Rejeitar KYC de investidor"
 *     description: Altera o status do investidor para 'rejected'
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Motivo da rejeição
 *     responses:
 *       200:
 *         description: Investidor rejeitado
 *       400:
 *         description: Motivo não fornecido
 *       404:
 *         description: Investidor não encontrado
 */
router.put('/investors/:id/reject', authenticateToken, requirePlatformAdmin, PlatformAdminController.rejectInvestor);

// ============ Wallet Sponsorship Routes ============

import { getTreasuryKeypair, getNetworkPassphrase, stellarServer } from '../config/stellar.js';
import { TransactionBuilder, BASE_FEE, Operation, Asset, Keypair } from '@stellar/stellar-sdk';

/**
 * @swagger
 * /api/platform-admins/investors/{id}/sponsor:
 *   post:
 *     summary: "[Admin] Sponsor investor wallet with XLM"
 *     description: Sends XLM from Treasury to investor's smart wallet. Requires approved KYC.
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: string
 *                 description: Amount of XLM to send (default 10)
 *     responses:
 *       200:
 *         description: Wallet sponsored successfully
 *       400:
 *         description: Invalid request or investor not eligible
 *       404:
 *         description: Investor not found
 */
router.post('/investors/:id/sponsor', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount = '10' } = req.body; // Default 10 XLM

    // Validate amount
    const xlmAmount = parseFloat(amount);
    if (isNaN(xlmAmount) || xlmAmount <= 0 || xlmAmount > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be between 0 and 10000 XLM'
      });
    }

    // Get investor
    const investor = await prisma.investor.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        email: true,
        kycStatus: true,
        stellarContractId: true,
        emailVerified: true,
      }
    });

    if (!investor) {
      return res.status(404).json({ success: false, error: 'Investor not found' });
    }

    if (investor.kycStatus !== 'approved') {
      return res.status(400).json({
        success: false,
        error: `Cannot sponsor wallet: KYC status is '${investor.kycStatus}'. Must be 'approved'.`
      });
    }

    if (!investor.stellarContractId) {
      return res.status(400).json({
        success: false,
        error: 'Investor does not have a wallet yet. They must complete passkey registration first.'
      });
    }

    log.info(`[Admin Sponsor] Sponsoring wallet for investor ${investor.id} (${investor.email})`);
    log.info(`[Admin Sponsor] Sending ${xlmAmount} XLM to ${investor.stellarContractId}`);

    // Get Treasury keypair
    const treasuryKeypair = getTreasuryKeypair();
    const networkPassphrase = getNetworkPassphrase();

    // Import required modules from stellar-sdk
    const stellarSdk = await import('@stellar/stellar-sdk');
    const { Contract, nativeToScVal, rpc } = stellarSdk;

    // Create Soroban RPC server
    const sorobanRpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    const sorobanServer = new rpc.Server(sorobanRpcUrl, { allowHttp: true });

    // Load treasury account from Soroban RPC (not Horizon!)
    const treasuryAccount = await sorobanServer.getAccount(treasuryKeypair.publicKey());

    // Get XLM SAC contract ID
    const xlmSacContractId = process.env.XLM_SAC_CONTRACT_ID;
    if (!xlmSacContractId) {
      return res.status(500).json({
        success: false,
        error: 'XLM_SAC_CONTRACT_ID not configured. Cannot sponsor Soroban wallets.'
      });
    }

    // Build SAC transfer transaction
    const xlmSac = new Contract(xlmSacContractId);
    const amountStroops = BigInt(Math.floor(xlmAmount * 10_000_000));

    // Build the transfer operation
    const transferOp = xlmSac.call(
      'transfer',
      nativeToScVal(treasuryKeypair.publicKey(), { type: 'address' }),
      nativeToScVal(investor.stellarContractId, { type: 'address' }),
      nativeToScVal(amountStroops, { type: 'i128' })
    );

    // Build initial transaction
    let tx = new TransactionBuilder(treasuryAccount, {
      fee: '100000', // Higher fee for Soroban
      networkPassphrase
    })
      .addOperation(transferOp)
      .setTimeout(30)
      .build();

    // Simulate the transaction to get proper footprint and auth
    log.info('[Admin Sponsor] Simulating transaction...');
    const simResult = await sorobanServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResult)) {
      log.error('[Admin Sponsor] Simulation error:', simResult.error);
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    // Prepare the transaction with simulation results
    tx = rpc.assembleTransaction(tx, simResult).build();

    // Sign the prepared transaction
    tx.sign(treasuryKeypair);

    // Submit via Soroban RPC
    log.info('[Admin Sponsor] Submitting transaction...');
    const sendResponse = await sorobanServer.sendTransaction(tx);

    if (sendResponse.status === 'ERROR') {
      throw new Error(sendResponse.errorResultXdr || 'Transaction submission failed');
    }

    // Poll for transaction result
    let getResponse;
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      getResponse = await sorobanServer.getTransaction(sendResponse.hash);

      if (getResponse.status !== 'NOT_FOUND') {
        break;
      }
      attempts++;
    }

    if (!getResponse || getResponse.status !== 'SUCCESS') {
      throw new Error(`Transaction failed: ${getResponse?.status || 'TIMEOUT'}`);
    }

    log.info(`[Admin Sponsor] Success! TX Hash: ${sendResponse.hash}`);

    res.json({
      success: true,
      message: `Successfully sent ${xlmAmount} XLM to ${investor.name}'s wallet`,
      data: {
        investorId: investor.id,
        investorName: investor.name,
        walletAddress: investor.stellarContractId,
        amountXLM: xlmAmount,
        transactionHash: sendResponse.hash,
        explorer: `https://stellar.expert/explorer/testnet/tx/${sendResponse.hash}`
      }
    });

  } catch (error) {
    log.error('[Admin Sponsor] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ Default Management Routes ============

/**
 * GET /api/platform-admins/defaults
 * Get all defaulted offers awaiting admin action
 */
router.get('/defaults', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const defaults = await CollateralDistributionService.getDefaultedOffers();
    const stats = await CollateralDistributionService.getDefaultStatistics();

    res.json({
      success: true,
      data: { defaults, stats }
    });
  } catch (error) {
    log.error('[Admin Defaults] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/platform-admins/defaults/:offerId
 * Get details of a specific defaulted offer
 */
router.get('/defaults/:offerId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { offerId } = req.params;
    const details = await CollateralDistributionService.getDefaultedOfferDetails(parseInt(offerId));

    if (!details) {
      return res.status(404).json({ success: false, error: 'Defaulted offer not found' });
    }

    res.json({ success: true, data: details });
  } catch (error) {
    log.error('[Admin Defaults] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform-admins/defaults/:offerId/prepare
 * Prepare collateral distribution transaction for admin signing
 */
router.post('/defaults/:offerId/prepare', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { offerId } = req.params;
    const transaction = await CollateralDistributionService.prepareCollateralDistribution(parseInt(offerId));

    res.json({
      success: true,
      data: transaction,
      message: 'Transaction prepared. Sign with admin passkey to distribute collateral.'
    });
  } catch (error) {
    log.error('[Admin Defaults] Prepare error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform-admins/defaults/:offerId/distribute
 * Submit signed collateral distribution transaction
 */
router.post('/defaults/:offerId/distribute', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { offerId } = req.params;
    const { signedXDR } = req.body;

    if (!signedXDR) {
      return res.status(400).json({ success: false, error: 'Signed transaction XDR required' });
    }

    const result = await CollateralDistributionService.processCollateralDistribution(
      signedXDR,
      parseInt(offerId),
      req.user.userId
    );

    res.json({
      success: true,
      data: result,
      message: 'Collateral distributed to investors successfully'
    });
  } catch (error) {
    log.error('[Admin Defaults] Distribute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ Token Lifecycle Management Routes ============

/**
 * @swagger
 * /api/platform-admins/offers/{offerId}/unlock-token:
 *   post:
 *     summary: "[Admin] Unlock a token for DEX trading"
 *     description: Clears AUTH_REQUIRED flag on Stellar, allowing free trading on DEXes
 *     tags: [Platform Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: offerId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirm
 *             properties:
 *               confirm:
 *                 type: boolean
 *                 description: Must be true to confirm the irreversible action
 *     responses:
 *       200:
 *         description: Token unlocked successfully
 *       400:
 *         description: Confirmation required or token already unlocked
 *       404:
 *         description: Offer not found
 */
router.post('/offers/:offerId/unlock-token', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { offerId } = req.params;
    const { confirm } = req.body;

    // Safety check - require explicit confirmation
    if (confirm !== true) {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required. This action cannot be undone.',
        message: 'Set { "confirm": true } to proceed. Once unlocked, the token will be freely tradable on DEXes.'
      });
    }

    // Find the offer
    const offer = await prisma.offer.findUnique({
      where: { id: parseInt(offerId) },
      include: {
        tokens: true,
        company: { select: { id: true, name: true } }
      }
    });

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Check if already unlocked
    if (offer.isTokenLocked === false) {
      return res.status(400).json({
        success: false,
        error: 'Token is already unlocked',
        unlockedAt: offer.tokenUnlockedAt
      });
    }

    // Import StellarService dynamically to avoid circular deps
    const { StellarService } = await import('../services/stellar.service.js');

    // Call Stellar to unlock (clear AUTH_REQUIRED)
    const stellarResult = await StellarService.unlockToken(offer.assetCode);

    if (!stellarResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Stellar operation failed',
        details: stellarResult
      });
    }

    // Update database
    const updatedOffer = await prisma.offer.update({
      where: { id: parseInt(offerId) },
      data: {
        isTokenLocked: false,
        tokenUnlockedAt: new Date()
      }
    });

    log.info(`[Admin] Token ${offer.assetCode} unlocked by admin ${req.user.userId}. TxHash: ${stellarResult.txHash || 'N/A'}`);

    res.json({
      success: true,
      message: `Token ${offer.assetCode} is now unlocked for DEX trading`,
      data: {
        offerId: updatedOffer.id,
        assetCode: offer.assetCode,
        isTokenLocked: updatedOffer.isTokenLocked,
        tokenUnlockedAt: updatedOffer.tokenUnlockedAt,
        stellarTxHash: stellarResult.txHash || null,
        alreadyUnlocked: stellarResult.alreadyUnlocked || false
      }
    });
  } catch (error) {
    log.error('[Token Unlock] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ Soroban Contract Dashboard ============

/**
 * GET /api/platform-admins/soroban/dashboard
 * Returns all Soroban sale contracts with on-chain state + metrics.
 */
router.get('/soroban/dashboard', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    // 1. Get all offers with Soroban contracts
    const offers = await prisma.offer.findMany({
      where: { sorobanContractId: { not: null } },
      select: {
        id: true,
        offerName: true,
        assetCode: true,
        status: true,
        sorobanContractId: true,
        unitPrice: true,
        totalSupply: true,
        _count: {
          select: {
            investments: { where: { status: { in: ['distributed', 'payment_received'] } } },
          },
        },
      },
    });

    // 2. Query on-chain state for each contract
    const { SorobanSaleService } = await import('../services/sorobanSale.service.js');
    const contracts = [];

    for (const offer of offers) {
      let onChain = { status: 'unknown', error: null };
      try {
        const [version, saleOffer, isFrozen] = await Promise.allSettled([
          SorobanSaleService.getVersion(offer.sorobanContractId),
          SorobanSaleService.getOffer(offer.sorobanContractId),
          SorobanSaleService.isFrozen(offer.sorobanContractId, 'DUMMY'), // will fail but tells us contract exists
        ]);

        onChain = {
          version: version.status === 'fulfilled' ? version.value : null,
          initialized: saleOffer.status === 'fulfilled',
          offer: saleOffer.status === 'fulfilled' ? saleOffer.value : null,
          status: saleOffer.status === 'fulfilled' ? 'active' : 'uninitialized',
        };
      } catch (err) {
        onChain.error = err.message;
      }

      // TTL check
      let ttl = null;
      try {
        const { StellarService } = await import('../services/stellar.service.js');
        ttl = await StellarService.getContractTTL(offer.sorobanContractId);
      } catch (_) { /* ignore */ }

      contracts.push({
        offerId: offer.id,
        offerName: offer.offerName,
        assetCode: offer.assetCode,
        offerStatus: offer.status,
        contractId: offer.sorobanContractId,
        unitPrice: offer.unitPrice,
        totalSupply: offer.totalSupply,
        investmentCount: offer._count.investments,
        onChain,
        ttl,
      });
    }

    // 3. Get metrics
    let metrics = null;
    try {
      const { SorobanMetrics } = await import('../services/sorobanMetrics.service.js');
      metrics = SorobanMetrics.getStats();
    } catch (_) { /* metrics not started */ }

    // 4. Get reconciler stats from last run
    let reconcilerInfo = null;
    try {
      const pendingOrphans = await prisma.investment.count({
        where: { status: 'trade_submitted' },
      });
      const pendingPayments = await prisma.investment.count({
        where: { status: 'pending_payment', offer: { sorobanContractId: { not: null } } },
      });
      reconcilerInfo = {
        orphanedTradeSubmitted: pendingOrphans,
        pendingSorobanPayments: pendingPayments,
      };
    } catch (_) { /* ignore */ }

    res.json({
      success: true,
      data: {
        contracts,
        metrics,
        reconciler: reconcilerInfo,
        featureFlag: process.env.ENABLE_SOROBAN_SALE === 'true',
      },
    });
  } catch (error) {
    log.error('[Soroban Dashboard] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

