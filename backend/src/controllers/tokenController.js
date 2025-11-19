import { Token } from './models/Token.js';
import { Investor } from './models/Investor.js';
import { StellarService } from './services/stellar.service.js';

export const issueToken = async (req, res, next) => {
  try {
    const { assetCode, totalSupply, description, offerId } = req.body;

    const existingToken = await Token.findByAssetCode(assetCode);
    if (existingToken) {
      return res.status(409).json({
        success: false,
        error: 'Token with this asset code already exists',
      });
    }

    const stellarResult = await StellarService.issueToken(assetCode, totalSupply);

    const token = await Token.create({
      assetCode,
      issuerPublicKey: stellarResult.issuerPublicKey,
      totalSupply,
      description,
      offerId: offerId || null,
      issuedBy: req.user?.userId || null,
    });

    res.status(201).json({
      success: true,
      data: {
        ...token,
        transactionHash: stellarResult.transactionHash,
        ledger: stellarResult.ledger,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTokens = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const offerId = req.query.offer_id ? parseInt(req.query.offer_id, 10) : null;

    const tokens = await Token.findAll(limit, offset, offerId);

    res.json({
      success: true,
      data: tokens,
      pagination: {
        limit,
        offset,
        count: tokens.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTokenByAssetCode = async (req, res, next) => {
  try {
    const { assetCode } = req.params;

    const token = await Token.findByAssetCode(assetCode);

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: token.id,
        assetCode: token.assetCode,
        issuerPublicKey: token.issuerPublicKey,
        totalSupply: token.totalSupply ? parseFloat(token.totalSupply.toString()) : null,
        description: token.description,
        annualInterestRate: token.annualInterestRate ? parseFloat(token.annualInterestRate.toString()) : null,
        offerId: token.offerId,
        issuedBy: token.issuedBy,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const distributeTokens = async (req, res, next) => {
  try {
    const { investorId, assetCode, amount } = req.body;

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
        error: 'Investor does not have a Stellar public key configured',
      });
    }

    if (investor.kycStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Investor KYC status must be approved to receive tokens',
      });
    }

    const token = await Token.findByAssetCode(assetCode);
    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      });
    }

    const stellarResult = await StellarService.distributeTokens(
      assetCode,
      investor.stellarPublicKey,
      amount
    );

    // Buscar offer_id do token se existir
    const offerId = token?.offer_id || null;

    const distribution = await Token.createDistribution({
      investorId,
      assetCode,
      amount,
      transactionHash: stellarResult.transactionHash,
      offerId,
      memo: null, // Memo não usado em distribuições manuais
    });

    res.status(201).json({
      success: true,
      data: {
        ...distribution,
        transactionHash: stellarResult.transactionHash,
        ledger: stellarResult.ledger,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTokenBalance = async (req, res, next) => {
  try {
    const { assetCode } = req.params;
    const { publicKey } = req.query;

    if (!publicKey) {
      return res.status(400).json({
        success: false,
        error: 'publicKey query parameter is required',
      });
    }

    const balance = await StellarService.getTokenBalance(assetCode, publicKey);

    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    next(error);
  }
};

