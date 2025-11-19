import { Investor } from './models/Investor.js';
import { Token } from './models/Token.js';
import { Investment } from './models/Investment.js';
import { StellarService } from './services/stellar.service.js';
import { PaymentService } from './services/payment.service.js';
import { getTreasuryKeypair } from './config/stellar.js';
import { addDistributionJob, isQueueAvailable } from './services/distributionQueue.service.js';
import crypto from 'crypto';

const SIN01_ASSET_CODE = 'SIN01';
const USDC_PAYMENT_WINDOW_MINUTES = parseInt(process.env.USDC_PAYMENT_WINDOW_MINUTES || '2', 10);

/**
 * Gera memo único para transação Stellar
 * @param {number} investmentId - ID do investimento
 * @param {number} investorId - ID do investidor
 * @param {string} assetCode - Código do asset
 * @returns {string} Memo único (máximo 28 caracteres)
 */
function generateInvestmentMemo(investmentId, investorId, assetCode) {
  // Formato: INV-{investmentId}-{hash}
  // Limita a 28 caracteres (limite do Stellar)
  const hash = crypto.createHash('sha256')
    .update(`${investmentId}-${investorId}-${assetCode}-${Date.now()}`)
    .digest('hex')
    .substring(0, 8);
  return `INV-${investmentId}-${hash}`.substring(0, 28);
}

export const purchaseInvestment = async (req, res, next) => {
  try {
    const { investorId, usdcAmount, assetCode = SIN01_ASSET_CODE, offerId } = req.body;

    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'USDC amount must be a positive number',
      });
    }

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

    const tokenAmount = parseFloat(usdcAmount);
    const treasuryKeypair = getTreasuryKeypair();

    // Criar registro de investimento primeiro
    const investment = await Investment.create({
      investor_id: investorId,
      offer_id: offerId || null,
      asset_code: assetCode,
      usdc_amount: usdcAmount,
      token_amount: tokenAmount,
      memo: null, // Será gerado quando pagamento for detectado
    });

    // Verificar se pagamento USDC já foi recebido
    const usdcPayment = await StellarService.verifyUSDCPayment(
      investor.stellarPublicKey,
      usdcAmount,
      treasuryKeypair.publicKey(),
      USDC_PAYMENT_WINDOW_MINUTES
    );

    if (!usdcPayment) {
      // Pagamento ainda não recebido, retornar instruções
      return res.status(202).json({
        success: true,
        message: 'Investment created. Please send USDC payment.',
        data: {
          investment: {
            id: investment.id,
            status: investment.status,
            usdcAmount: parseFloat(usdcAmount),
            tokenAmount: tokenAmount,
            assetCode: assetCode,
          },
          paymentInstructions: {
            treasuryAddress: treasuryKeypair.publicKey(),
            requiredAmount: usdcAmount,
            assetCode: 'USDC',
            windowMinutes: USDC_PAYMENT_WINDOW_MINUTES,
            message: `Send ${usdcAmount} USDC to ${treasuryKeypair.publicKey()} within ${USDC_PAYMENT_WINDOW_MINUTES} minutes`,
          },
        },
      });
    }

    // Pagamento encontrado, processar distribuição
    // Tentar usar fila se disponível, senão processar sincronamente
    if (isQueueAvailable()) {
      return await processInvestmentPaymentWithQueue(investment, usdcPayment, req, res, next);
    } else {
      return await processInvestmentPayment(investment, usdcPayment, req, res, next);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Processa pagamento USDC usando fila assíncrona (com retry automático)
 * @param {Object} investment - Investimento criado
 * @param {Object} usdcPayment - Dados do pagamento USDC
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 */
async function processInvestmentPaymentWithQueue(investment, usdcPayment, req, res, next) {
  try {
    // Verificar idempotência: se já existe distribuição para este pagamento
    const existingDistribution = await Token.findDistributionByUSDC(usdcPayment.transactionHash);
    
    if (existingDistribution) {
      await Investment.updateStatus(investment.id, {
        status: 'distributed',
        usdc_payment_hash: usdcPayment.transactionHash,
        distribution_tx_hash: existingDistribution.transaction_hash,
      });

      return res.status(200).json({
        success: true,
        message: 'Investment already processed (idempotency)',
        data: {
          investment: {
            id: investment.id,
            status: 'distributed',
          },
          distribution: existingDistribution,
        },
      });
    }

    // Buscar investidor para obter chave pública
    const investor = await Investor.findById(investment.investorId);
    if (!investor || !investor.stellarPublicKey) {
      throw new Error(`Investor ${investment.investorId} not found or missing Stellar key`);
    }

    // Gerar memo único
    const memo = generateInvestmentMemo(investment.id, investment.investorId, investment.assetCode);

    // Atualizar investment com hash do pagamento
    await Investment.updateStatus(investment.id, {
      status: 'payment_received',
      usdc_payment_hash: usdcPayment.transactionHash,
    });

    // Adicionar job à fila para processamento assíncrono com retry
    const job = await addDistributionJob({
      investmentId: investment.id,
      investorPublicKey: investor.stellarPublicKey,
      assetCode: investment.assetCode,
      amount: investment.tokenAmount.toString(),
      memo,
    });

    res.status(202).json({
      success: true,
      message: 'Payment received. Token distribution queued for processing.',
      data: {
        investment: {
          id: investment.id,
          status: 'payment_received',
          usdcAmount: parseFloat(investment.usdcAmount.toString()),
          tokenAmount: parseFloat(investment.tokenAmount.toString()),
          assetCode: investment.assetCode,
        },
        queue: {
          jobId: job.id,
          status: 'queued',
          message: 'Distribution will be processed automatically with retry on failure',
        },
        usdcPayment: {
          transactionHash: usdcPayment.transactionHash,
          ledger: usdcPayment.ledger,
          verifiedAt: usdcPayment.createdAt,
        },
      },
    });
  } catch (error) {
    await Investment.updateStatus(investment.id, {
      status: 'failed',
      error_message: error.message,
    });
    next(error);
  }
}

/**
 * Processa pagamento USDC e distribui tokens (síncrono, fallback)
 * @param {Object} investment - Investimento criado
 * @param {Object} usdcPayment - Dados do pagamento USDC
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 */
async function processInvestmentPayment(investment, usdcPayment, req, res, next) {
  try {
    // Verificar idempotência: se já existe distribuição para este pagamento
    const existingDistribution = await Token.findDistributionByUSDC(usdcPayment.transactionHash);
    
    if (existingDistribution) {
      // Já processado, atualizar investment e retornar distribuição existente
      await Investment.updateStatus(investment.id, {
        status: 'distributed',
        usdc_payment_hash: usdcPayment.transactionHash,
        distribution_tx_hash: existingDistribution.transaction_hash,
      });

      return res.status(200).json({
        success: true,
        message: 'Investment already processed (idempotency)',
        data: {
          investment: {
            id: investment.id,
            status: 'distributed',
          },
          distribution: existingDistribution,
        },
      });
    }

    // Verificar se investment já foi processado
    const currentInvestment = await Investment.findById(investment.id);
    if (currentInvestment.status === 'distributed') {
      return res.status(200).json({
        success: true,
        message: 'Investment already processed',
        data: {
          investment: currentInvestment,
        },
      });
    }

    // Gerar memo único
    const memo = generateInvestmentMemo(investment.id, investment.investorId, investment.assetCode);

    // Atualizar investment com hash do pagamento
    await Investment.updateStatus(investment.id, {
      status: 'payment_received',
      usdc_payment_hash: usdcPayment.transactionHash,
    });

    // Distribuir tokens com memo
    const stellarResult = await StellarService.distributeTokens(
      investment.assetCode,
      (await Investor.findById(investment.investorId)).stellarPublicKey,
      investment.tokenAmount.toString(),
      { memo }
    );

    // Criar distribuição (com verificação de idempotência interna)
    const distribution = await Token.createDistribution({
      investorId: investment.investorId,
      assetCode: investment.assetCode,
      amount: investment.tokenAmount,
      transactionHash: stellarResult.transactionHash,
      usdcPaymentHash: usdcPayment.transactionHash,
      offerId: investment.offerId,
      memo,
    });

    // Atualizar investment com hash da distribuição
    await Investment.updateStatus(investment.id, {
      status: 'distributed',
      distribution_tx_hash: stellarResult.transactionHash,
    });

    res.status(201).json({
      success: true,
      message: 'Investment purchased successfully',
      data: {
        investment: {
          id: investment.id,
          status: 'distributed',
          usdcAmount: parseFloat(investment.usdcAmount.toString()),
          tokenAmount: parseFloat(investment.tokenAmount.toString()),
          assetCode: investment.assetCode,
        },
        distribution: {
          id: distribution.id,
          amount: distribution.amount,
          transactionHash: distribution.transaction_hash,
          memo: distribution.memo,
          createdAt: distribution.created_at,
        },
        transactions: {
          usdcPayment: {
            hash: usdcPayment.transactionHash,
            ledger: usdcPayment.ledger,
            verifiedAt: usdcPayment.createdAt,
          },
          tokenDistribution: {
            hash: stellarResult.transactionHash,
            ledger: stellarResult.ledger,
            memo: memo,
          },
        },
      },
    });
  } catch (error) {
    // Marcar investment como failed em caso de erro
    try {
      await Investment.updateStatus(investment.id, {
        status: 'failed',
        error_message: error.message,
      });
    } catch (updateError) {
      console.error('Failed to update investment status:', updateError);
    }
    next(error);
  }
}

/**
 * Verifica status de um investimento
 * GET /api/investments/:id/status
 */
export const getInvestmentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const investment = await Investment.findById(parseInt(id));

    if (!investment) {
      return res.status(404).json({
        success: false,
        error: 'Investment not found',
      });
    }


    res.json({
      success: true,
      data: {
        id: investment.id,
        status: investment.status,
        usdcAmount: investment.usdcAmount !== null && investment.usdcAmount !== undefined ? parseFloat(investment.usdcAmount.toString()) : null,
        tokenAmount: investment.tokenAmount !== null && investment.tokenAmount !== undefined ? parseFloat(investment.tokenAmount.toString()) : null,
        assetCode: investment.assetCode,
        usdcPaymentHash: investment.usdcPaymentHash,
        distributionTxHash: investment.distributionTxHash,
        memo: investment.memo,
        errorMessage: investment.errorMessage,
        createdAt: investment.createdAt,
        updatedAt: investment.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

