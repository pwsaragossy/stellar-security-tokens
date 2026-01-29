import { Token } from '../models/Token.js';
import { Investor } from '../models/Investor.js';
import { StellarService } from '../services/stellar.service.js';
import { keyManager } from '../services/KeyManager.js';
import { MultiSigTransactionService } from '../services/multiSigTransaction.service.js';
import { buildUnsignedTransaction } from '../config/stellar.js';
import { Operation } from '@stellar/stellar-sdk';

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

    const stellarResult = await StellarService.issueSecurityToken(assetCode, totalSupply, {
      description,
      offerId
    });

    // PHASE 2.3: Handle MultiSig Deferral
    // If multisig is required, the transaction is queued and we return 202 (Accepted)
    // The DB record will be created later by the MultiSig service hook.
    if (stellarResult.status === 'pending_multisig') {
      return res.status(202).json({
        success: true,
        status: 'pending_multisig',
        message: 'Security token issuance queued for MultiSig approval',
        data: stellarResult
      });
    }

    const token = await Token.create({
      assetCode,
      issuerPublicKey: stellarResult.issuerPublicKey,
      totalSupply,
      description,
      offerId: offerId || null,
      issuedBy: req.user?.userId || null,
      sacContractId: stellarResult.sacContractId,
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

export const syncTokens = async (req, res, next) => {
  try {
    const distributorPublicKey = keyManager.getDistributorPublicKey();
    const assets = await StellarService.listAccountAssets(distributorPublicKey);

    const syncResults = [];
    for (const asset of assets) {
      const existing = await Token.findByAssetCode(asset.assetCode);
      if (!existing) {
        // Create "orphan" token in database if it doesn't exist
        const newToken = await Token.create({
          assetCode: asset.assetCode,
          issuerPublicKey: asset.assetIssuer,
          totalSupply: asset.balance, // Use current balance as initial total supply for orphan tokens
          description: `Discovered from Distributor account ${distributorPublicKey}`,
        });
        syncResults.push({ assetCode: asset.assetCode, status: 'created', id: newToken.id });
      } else {
        syncResults.push({ assetCode: asset.assetCode, status: 'exists', id: existing.id });
      }
    }

    res.json({
      success: true,
      message: 'Tokens synced with Distributor wallet',
      data: syncResults,
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

    if (!investor.stellarPublicKey && !investor.stellarContractId) {
      return res.status(400).json({
        success: false,
        error: 'Investor does not have a Stellar public key or wallet configured',
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

    // JIT AUTHORIZATION
    // Ensure investor is authorized before distribution
    let targetWallet = investor.stellarPublicKey;
    if (!targetWallet && investor.stellarContractId) {
      targetWallet = investor.stellarContractId;
    }

    if (targetWallet) {
      console.log(`[TokenController] JIT Authorizing ${targetWallet} for ${assetCode}...`);
      try {
        await StellarService.authorizeInvestor(targetWallet, assetCode);
      } catch (authErr) {
        console.error(`[TokenController] JIT Auth Error:`, authErr);
      }
    }

    const stellarResult = await StellarService.distributeTokens(
      targetWallet,
      amount,
      assetCode,
      { investorId: parseInt(investorId) }
    );

    // If multisig is required, return 202
    if (stellarResult.status === 'pending_multisig') {
      return res.status(202).json({
        success: true,
        status: 'pending_multisig',
        message: 'Token distribution queued for MultiSig approval',
        data: stellarResult
      });
    }

    // Buscar offerId do token se existir
    const offerId = token?.offerId || null;

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

export const freezeAccount = async (req, res, next) => {
  try {
    const { investorPublicKey, assetCode } = req.body;

    if (!investorPublicKey || !assetCode) {
      return res.status(400).json({
        success: false,
        error: 'investorPublicKey and assetCode are required',
      });
    }

    const result = await StellarService.freezeAccount(investorPublicKey, assetCode);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const unfreezeAccount = async (req, res, next) => {
  try {
    const { investorPublicKey, assetCode } = req.body;

    if (!investorPublicKey || !assetCode) {
      return res.status(400).json({
        success: false,
        error: 'investorPublicKey and assetCode are required',
      });
    }

    const result = await StellarService.unfreezeAccount(investorPublicKey, assetCode);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const clawbackTokens = async (req, res, next) => {
  try {
    const { investorPublicKey, assetCode, amount } = req.body;

    if (!investorPublicKey || !assetCode || !amount) {
      return res.status(400).json({
        success: false,
        error: 'investorPublicKey, assetCode, and amount are required',
      });
    }

    const result = await StellarService.clawbackTokens(investorPublicKey, amount, assetCode);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const disableClawback = async (req, res, next) => {
  try {
    const { investorPublicKey, assetCode } = req.body;

    if (!investorPublicKey || !assetCode) {
      return res.status(400).json({
        success: false,
        error: 'investorPublicKey and assetCode are required',
      });
    }

    // PHASE 2.1: Multi-Admin Consensus for Compliance Finality
    if (keyManager.requiresMultisigApproval('disable_clawback')) {
      console.log(`[TokenController] Multi-Admin mode: Creating proposal for disable_clawback...`);

      const issuerPublicKey = keyManager.getIssuerPublicKey();
      const xdr = await buildUnsignedTransaction(
        issuerPublicKey,
        [StellarService.buildDisableClawbackOp(investorPublicKey, assetCode)]
      );

      const proposal = await MultiSigTransactionService.create({
        operationType: 'disable_clawback',
        xdr,
        requiredSigners: keyManager.getRequiredSigners('disable_clawback'),
        thresholdRequired: keyManager.getSignatureThreshold('disable_clawback'),
        description: `Permanently disable clawback for holder ${investorPublicKey.slice(0, 12)}... on asset ${assetCode}`,
        metadata: { investorPublicKey, assetCode },
        initiatorId: req.user?.userId || null,
      });

      return res.status(202).json({
        success: true,
        message: 'Multisig proposal created for compliance finality',
        data: {
          proposalId: proposal.id,
          status: 'pending_signatures',
        },
      });
    }

    const result = await StellarService.disableClawbackForTrustline(investorPublicKey, assetCode);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const listAssetHolders = async (req, res, next) => {
  try {
    const { assetCode } = req.params;

    if (!assetCode) {
      return res.status(400).json({
        success: false,
        error: 'assetCode is required',
      });
    }

    const holders = await StellarService.listAssetHolders(assetCode);

    res.json({
      success: true,
      data: holders,
    });
  } catch (error) {
    next(error);
  }
};
