import { Investor } from '../models/Investor.js';
import { Token } from '../models/Token.js';
import { StellarService } from '../services/stellar.service.js';
import { PaymentService } from '../services/payment.service.js';
import { getTreasuryKeypair } from '../config/stellar.js';

const SIN01_ASSET_CODE = 'SIN01';
const USDC_PAYMENT_WINDOW_MINUTES = parseInt(process.env.USDC_PAYMENT_WINDOW_MINUTES || '10', 10);

export const purchaseInvestment = async (req, res, next) => {
  try {
    const { investorId, usdcAmount, assetCode = SIN01_ASSET_CODE } = req.body;

    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'USDC amount must be a positive number',
      });
    }

    const investor = await Investor.findById(investorId);
    if (!investor) {
      return res.status(404).json({
        success: false,
        error: 'Investor not found',
      });
    }

    if (!investor.stellar_public_key) {
      return res.status(400).json({
        success: false,
        error: 'Investor does not have a Stellar public key configured',
      });
    }

    if (investor.kyc_status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Investor KYC status must be approved to purchase tokens',
      });
    }

    const token = await Token.findByAssetCode(assetCode);
    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      });
    }

    // Verificar se pagamento USDC foi recebido antes de distribuir tokens
    const treasuryKeypair = getTreasuryKeypair();
    const usdcPayment = await StellarService.verifyUSDCPayment(
      investor.stellar_public_key,
      usdcAmount,
      treasuryKeypair.publicKey(),
      USDC_PAYMENT_WINDOW_MINUTES
    );

    if (!usdcPayment) {
      return res.status(400).json({
        success: false,
        error: 'USDC payment not found',
        message: `Please send ${usdcAmount} USDC to ${treasuryKeypair.publicKey()} first. ` +
                 `Payment must be sent within the last ${USDC_PAYMENT_WINDOW_MINUTES} minutes.`,
        treasuryAddress: treasuryKeypair.publicKey(),
        requiredAmount: usdcAmount,
      });
    }

    const tokenAmount = parseFloat(usdcAmount);

    const stellarResult = await StellarService.distributeTokens(
      assetCode,
      investor.stellar_public_key,
      tokenAmount.toString()
    );

    const distribution = await Token.createDistribution({
      investorId,
      assetCode,
      amount: tokenAmount,
      transactionHash: stellarResult.transactionHash,
      usdcPaymentHash: usdcPayment.transactionHash,
    });

    res.status(201).json({
      success: true,
      message: 'Investment purchased successfully',
      data: {
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
        },
        investment: {
          usdcAmount: parseFloat(usdcAmount),
          tokenAmount: tokenAmount,
          assetCode: assetCode,
          exchangeRate: 1.0,
        },
        distribution: {
          id: distribution.id,
          amount: distribution.amount,
          transactionHash: distribution.transaction_hash,
          createdAt: distribution.created_at,
        },
        transaction: {
          hash: stellarResult.transactionHash,
          ledger: stellarResult.ledger,
        },
        usdcPayment: {
          transactionHash: usdcPayment.transactionHash,
          ledger: usdcPayment.ledger,
          verifiedAt: usdcPayment.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

