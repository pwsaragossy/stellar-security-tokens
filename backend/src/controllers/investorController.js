import { Investor } from './models/Investor.js';
import { StellarService } from './services/stellar.service.js';
import { PaymentService } from './services/payment.service.js';
import { generateToken } from './middleware/auth.js';
import prisma from './config/prisma.js';
import bcrypt from 'bcrypt';

export const createInvestor = async (req, res, next) => {
  try {
    const { name, email, document, stellarPublicKey, kycStatus } = req.body;

    const existingEmail = await Investor.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: 'Investor with this email already exists',
      });
    }

    const existingDocument = await Investor.findByDocument(document);
    if (existingDocument) {
      return res.status(409).json({
        success: false,
        error: 'Investor with this document already exists',
      });
    }

    if (stellarPublicKey) {
      const existingStellar = await Investor.findByStellarPublicKey(stellarPublicKey);
      if (existingStellar) {
        return res.status(409).json({
          success: false,
          error: 'Investor with this Stellar public key already exists',
        });
      }
    }

    const investor = await Investor.create({
      name,
      email,
      document,
      stellarPublicKey,
      kycStatus,
    });

    res.status(201).json({
      success: true,
      data: investor,
    });
  } catch (error) {
    next(error);
  }
};

export const registerInvestor = async (req, res, next) => {
  try {
    const { name, email, document, password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required',
      });
    }

    const existingEmail = await Investor.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: 'Investor with this email already exists',
      });
    }

    const existingDocument = await Investor.findByDocument(document);
    if (existingDocument) {
      return res.status(409).json({
        success: false,
        error: 'Investor with this document already exists',
      });
    }

    const stellarAccount = await StellarService.createInvestorAccount();

    // Criar investidor com senha
    const passwordHash = await bcrypt.hash(password, 10);
    const investor = await Investor.create({
      name,
      email,
      document,
      stellarPublicKey: stellarAccount.publicKey,
      kycStatus: 'pending',
    });

    // Atualizar com password_hash
    await Investor.updatePassword(investor.id, password);

    res.status(201).json({
      success: true,
      data: {
        id: investor.id,
        name: investor.name,
        email: investor.email,
        document: investor.document,
        stellarPublicKey: investor.stellarPublicKey,
        kycStatus: investor.kycStatus,
        createdAt: investor.created_at,
      },
      stellarAccount: {
        publicKey: stellarAccount.publicKey,
        note: 'Keep your secret key secure. It will not be shown again.',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const loginInvestor = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const investor = await Investor.authenticate(email, password);
    if (!investor) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Gerar token JWT
    const token = generateToken({
      userId: investor.id,
      email: investor.email,
      role: 'investor',
    });

    res.json({
      success: true,
      data: {
        token,
        investor: {
          id: investor.id,
          email: investor.email,
          name: investor.name,
          document: investor.document,
          stellarPublicKey: investor.stellarPublicKey,
          kycStatus: investor.kycStatus,
          created_at: investor.created_at,
          updated_at: investor.updated_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const whitelistInvestor = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const { assetCode = 'SIN01' } = req.body;

    const investor = await Investor.findById(parseInt(investorId, 10));
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    if (!investor.stellarPublicKey) {
      return res.status(400).json({
        success: false,
        error: 'Investor does not have a Stellar public key',
      });
    }

    const result = await StellarService.whitelistInvestor(
      investor.stellarPublicKey,
      assetCode
    );

    const updatedInvestor = await Investor.update(investorId, {
      kycStatus: 'approved',
    });

    res.json({
      success: true,
      message: 'Investor whitelisted successfully',
      data: {
        investor: updatedInvestor,
        stellarTransaction: {
          transactionHash: result.transactionHash,
          ledger: result.ledger,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvestors = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const investors = await Investor.findAll(limit, offset);

    res.json({
      success: true,
      data: investors,
      pagination: {
        limit,
        offset,
        count: investors.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvestorById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const investor = await Investor.findById(parseInt(id, 10));

    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: investor.id,
        name: investor.name,
        email: investor.email,
        document: investor.document,
        stellarPublicKey: investor.stellarPublicKey,
        kycStatus: investor.kycStatus,
        lastLogin: investor.lastLogin,
        createdAt: investor.createdAt,
        updatedAt: investor.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvestorBalance = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const { assetCode = 'SIN01' } = req.query;

    const investor = await Investor.findById(parseInt(investorId, 10));
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    if (!investor.stellarPublicKey) {
      return res.status(400).json({
        success: false,
        error: 'Investor does not have a Stellar public key',
      });
    }

    const balance = await StellarService.getTokenBalance(
      assetCode,
      investor.stellarPublicKey
    );

    const distributions = await prisma.tokenDistribution.findMany({
      where: {
        investorId: parseInt(investorId, 10),
        assetCode,
      },
      include: {
        token: {
          select: {
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const interestPayments = await prisma.interestPayment.findMany({
      where: {
        investorId: parseInt(investorId, 10),
        assetCode,
      },
      orderBy: [
        { paymentDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
          stellarPublicKey: investor.stellarPublicKey,
          kycStatus: investor.kycStatus,
        },
        balance: {
          assetCode: balance.assetCode,
          balance: balance.balance,
          isAuthorized: balance.isAuthorized,
        },
        tokenDistributions: distributions,
        interestPayments,
        summary: {
          totalTokensReceived: distributions.reduce(
            (sum, d) => sum + parseFloat(d.amount),
            0
          ),
          totalInterestReceived: interestPayments.reduce(
            (sum, p) => sum + parseFloat(p.usdcAmount),
            0
          ),
          distributionCount: distributions.length,
          interestPaymentCount: interestPayments.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvestorPayments = async (req, res, next) => {
  try {
    const { investorId } = req.params;
    const { assetCode, limit = 100, offset = 0 } = req.query;

    const investor = await Investor.findById(parseInt(investorId, 10));
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    const where = { investorId: parseInt(investorId, 10) };
    if (assetCode) where.assetCode = assetCode;

    const [payments, total] = await Promise.all([
      prisma.interestPayment.findMany({
        where,
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
        orderBy: [
          { paymentDate: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      prisma.interestPayment.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
        },
        payments,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          count: payments.length,
        },
        summary: {
          totalInterestReceived: payments.reduce(
            (sum, p) => sum + parseFloat(p.usdcAmount || 0),
            0
          ),
          totalPayments: total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateInvestor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const investor = await Investor.findById(parseInt(id, 10));
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    if (updateData.email) {
      const existingEmail = await Investor.findByEmail(updateData.email);
      if (existingEmail && existingEmail.id !== parseInt(id, 10)) {
        return res.status(409).json({
          success: false,
          error: 'Investor with this email already exists',
        });
      }
    }

    const updatedInvestor = await Investor.update(id, updateData);

    res.json({
      success: true,
      data: updatedInvestor,
    });
  } catch (error) {
    next(error);
  }
};

export const getInvestorPortfolio = async (req, res, next) => {
  try {
    const { id } = req.params;
    const investorId = parseInt(id, 10);

    const investor = await Investor.findById(investorId);
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    const portfolio = await Investor.getPortfolio(investorId);

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
        },
        portfolio,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvestorMetrics = async (req, res, next) => {
  try {
    const { id } = req.params;
    const investorId = parseInt(id, 10);

    const investor = await Investor.findById(investorId);
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    const metrics = await Investor.getConsolidatedMetrics(investorId);

    res.json({
      success: true,
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
        },
        metrics,
      },
    });
  } catch (error) {
    next(error);
  }
};
