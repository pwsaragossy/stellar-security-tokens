import prisma from '../config/prisma.js';

/**
 * Modelo para gerenciar investimentos no banco de dados usando Prisma
 */
export class Investment {
  /**
   * Cria um novo investimento
   * @param {Object} investmentData - Dados do investimento
   * @param {number} investmentData.investor_id - ID do investidor
   * @param {number} [investmentData.offer_id] - ID da oferta (opcional)
   * @param {string} investmentData.asset_code - Código do asset
   * @param {number|string} investmentData.usdc_amount - Quantidade em USDC
   * @param {number|string} investmentData.token_amount - Quantidade de tokens
   * @param {string} [investmentData.memo] - Memo único para rastreamento
   * @returns {Promise<Object>} Investimento criado
   */
  static async create(investmentData) {
    const {
      investor_id,
      offer_id,
      asset_code,
      usdc_amount,
      token_amount,
      memo,
    } = investmentData;

    return await prisma.investment.create({
      data: {
        investorId: investor_id,
        offerId: offer_id || null,
        assetCode: asset_code,
        usdcAmount: usdc_amount,
        tokenAmount: token_amount,
        status: 'pending_payment',
        memo: memo || null,
      },
    });
  }

  /**
   * Busca investimento por ID
   * @param {number} id - ID do investimento
   * @returns {Promise<Object|null>} Investimento encontrado ou null
   */
  static async findById(id) {
    return await prisma.investment.findUnique({
      where: { id },
    });
  }

  /**
   * Busca investimento por hash do pagamento USDC
   * @param {string} usdcPaymentHash - Hash da transação USDC
   * @returns {Promise<Object|null>} Investimento encontrado ou null
   */
  static async findByUSDC(usdcPaymentHash) {
    return await prisma.investment.findFirst({
      where: { usdcPaymentHash },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca investimentos por status
   * @param {string} status - Status do investimento
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @returns {Promise<Array>} Array de investimentos
   */
  static async findByStatus(status, limit = 100, offset = 0) {
    return await prisma.investment.findMany({
      where: { status: status.toLowerCase() },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca investimentos pendentes de pagamento por investidor
   * @param {string} investorPublicKey - Chave pública do investidor
   * @param {number|string} expectedAmount - Valor esperado (com tolerância)
   * @param {number} [windowMinutes=2] - Janela de tempo em minutos
   * @returns {Promise<Array>} Array de investimentos pendentes
   */
  static async findPendingByInvestor(investorPublicKey, expectedAmount, windowMinutes = 2) {
    const windowStartTime = new Date(Date.now() - windowMinutes * 60 * 1000);
    const expectedAmountFloat = parseFloat(expectedAmount);
    const tolerance = expectedAmountFloat * 0.0001; // 0.01% tolerance
    
    return await prisma.investment.findMany({
      where: {
        investor: {
          stellarPublicKey: investorPublicKey,
        },
        status: 'pending_payment',
        usdcAmount: {
          gte: expectedAmountFloat - tolerance,
          lte: expectedAmountFloat + tolerance,
        },
        createdAt: {
          gte: windowStartTime,
        },
      },
      include: {
        investor: {
          select: {
            stellarPublicKey: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  /**
   * Atualiza status do investimento
   * @param {number} id - ID do investimento
   * @param {Object} updateData - Dados para atualizar
   * @param {string} [updateData.status] - Novo status
   * @param {string} [updateData.usdc_payment_hash] - Hash do pagamento USDC
   * @param {string} [updateData.distribution_tx_hash] - Hash da distribuição
   * @param {string} [updateData.error_message] - Mensagem de erro
   * @returns {Promise<Object|null>} Investimento atualizado ou null
   */
  static async updateStatus(id, updateData) {
    const {
      status,
      usdc_payment_hash,
      distribution_tx_hash,
      error_message,
    } = updateData;

    const updateFields = {};
    if (status) updateFields.status = status.toLowerCase();
    if (usdc_payment_hash !== undefined) updateFields.usdcPaymentHash = usdc_payment_hash;
    if (distribution_tx_hash !== undefined) updateFields.distributionTxHash = distribution_tx_hash;
    if (error_message !== undefined) updateFields.errorMessage = error_message;

    if (Object.keys(updateFields).length === 0) {
      return await this.findById(id);
    }

    try {
      return await prisma.investment.update({
        where: { id },
        data: updateFields,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Busca investimentos por investidor
   * @param {number} investorId - ID do investidor
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @returns {Promise<Array>} Array de investimentos
   */
  static async findByInvestor(investorId, limit = 100, offset = 0) {
    return await prisma.investment.findMany({
      where: { investorId },
      include: {
        offer: {
          select: {
            offerName: true,
            description: true,
          },
        },
      },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca investimentos por oferta
   * @param {number} offerId - ID da oferta
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @returns {Promise<Array>} Array de investimentos
   */
  static async findByOffer(offerId, limit = 100, offset = 0) {
    return await prisma.investment.findMany({
      where: { offerId },
      include: {
        investor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }
}
