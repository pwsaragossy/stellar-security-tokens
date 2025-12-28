import prisma from '../config/prisma.js';

/**
 * Modelo para gerenciar tokens e distribuições no banco de dados usando Prisma
 */
export class Token {
  /**
   * Cria um novo token no banco de dados
   * @param {Object} tokenData - Dados do token
   * @param {string} tokenData.assetCode - Código do asset (máximo 12 caracteres, único)
   * @param {string} tokenData.issuerPublicKey - Chave pública da conta emissora
   * @param {number|string} tokenData.totalSupply - Supply total do token
   * @param {string} [tokenData.description] - Descrição do token (opcional)
   * @param {number} [tokenData.offerId] - ID da oferta relacionada (opcional)
   * @param {number} [tokenData.issuedBy] - ID do admin que emitiu (opcional)
   * @returns {Promise<Object>} Token criado com todos os campos
   * @throws {Error} Se assetCode já existir (violação de constraint único)
   */
  static async create(tokenData) {
    const { assetCode, issuerPublicKey, totalSupply, description, offerId, issuedBy } = tokenData;

    return await prisma.token.create({
      data: {
        assetCode,
        issuerPublicKey,
        totalSupply,
        description,
        offerId: offerId || null,
        issuedBy: issuedBy || null,
      },
    });
  }

  /**
   * Busca token por código do asset
   * @param {string} assetCode - Código do asset (ex: 'REIT01')
   * @returns {Promise<Object|null>} Token encontrado ou null
   */
  static async findByAssetCode(assetCode) {
    return await prisma.token.findUnique({
      where: { assetCode },
    });
  }

  /**
   * Lista todos os tokens com paginação
   * @param {number} [limit=100] - Número máximo de resultados
   * @param {number} [offset=0] - Número de registros a pular
   * @param {number} [offerId] - Filtrar por ID da oferta (opcional)
   * @returns {Promise<Array>} Array de tokens ordenados por data de criação (mais recentes primeiro)
   */
  static async findAll(limit = 100, offset = 0, offerId = null) {
    const where = offerId ? { offerId } : {};

    return await prisma.token.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca tokens por ID da oferta
   * @param {number} offerId - ID da oferta
   * @returns {Promise<Array>} Array de tokens relacionados à oferta
   */
  static async findByOffer(offerId) {
    return await prisma.token.findMany({
      where: { offerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca tokens ativos (com ofertas ativas)
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @returns {Promise<Array>} Array de tokens com ofertas ativas
   */
  static async findActiveTokens(limit = 100, offset = 0) {
    return await prisma.token.findMany({
      where: {
        offer: {
          status: 'active',
        },
      },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca distribuição por hash do pagamento USDC (para idempotência)
   * @param {string} usdcPaymentHash - Hash da transação USDC
   * @returns {Promise<Object|null>} Distribuição encontrada ou null
   */
  static async findDistributionByUSDC(usdcPaymentHash) {
    return await prisma.tokenDistribution.findFirst({
      where: { usdcPaymentHash },
    });
  }

  /**
   * Busca distribuição por memo (para idempotência)
   * @param {string} memo - Memo da transação Stellar
   * @returns {Promise<Object|null>} Distribuição encontrada ou null
   */
  static async findDistributionByMemo(memo) {
    return await prisma.tokenDistribution.findFirst({
      where: { memo },
    });
  }

  /**
   * Verifica se distribuição já existe (idempotência)
   * @param {Object} distributionData - Dados da distribuição
   * @returns {Promise<Object|null>} Distribuição existente ou null
   */
  static async findExistingDistribution(distributionData) {
    const { usdcPaymentHash, memo, transactionHash } = distributionData;

    // Verificar por transaction_hash primeiro (mais confiável)
    if (transactionHash) {
      const byTxHash = await prisma.tokenDistribution.findUnique({
        where: { transactionHash },
      });
      if (byTxHash) {
        return byTxHash;
      }
    }

    // Verificar por usdc_payment_hash
    if (usdcPaymentHash) {
      const byUSDC = await this.findDistributionByUSDC(usdcPaymentHash);
      if (byUSDC) {
        return byUSDC;
      }
    }

    // Verificar por memo
    if (memo) {
      const byMemo = await this.findDistributionByMemo(memo);
      if (byMemo) {
        return byMemo;
      }
    }

    return null;
  }

  /**
   * Registra uma distribuição de tokens para um investidor
   * Verifica idempotência antes de criar nova distribuição
   * @param {Object} distributionData - Dados da distribuição
   * @param {number} distributionData.investorId - ID do investidor
   * @param {string} distributionData.assetCode - Código do asset distribuído
   * @param {number|string} distributionData.amount - Quantidade distribuída
   * @param {string} distributionData.transactionHash - Hash da transação Stellar
   * @param {string} [distributionData.usdcPaymentHash] - Hash da transação USDC (opcional)
   * @param {number} [distributionData.offerId] - ID da oferta relacionada (opcional)
   * @param {string} [distributionData.memo] - Memo da transação (opcional)
   * @returns {Promise<Object>} Distribuição registrada ou existente (idempotência)
   * @throws {Error} Se investorId ou assetCode não existirem (violação de foreign key)
   */
  static async createDistribution(distributionData) {
    const { investorId, assetCode, amount, transactionHash, usdcPaymentHash, offerId, memo } = distributionData;

    // Verificar idempotência antes de inserir
    const existing = await this.findExistingDistribution({
      usdcPaymentHash,
      memo,
      transactionHash,
    });

    if (existing) {
      console.log('Distribution already exists (idempotency check):', existing.id);
      return existing;
    }

    return await prisma.tokenDistribution.create({
      data: {
        investorId,
        assetCode,
        amount,
        transactionHash,
        usdcPaymentHash: usdcPaymentHash || null,
        offerId: offerId || null,
        memo: memo || null,
      },
    });
  }

  /**
   * Busca todas as distribuições de um investidor específico
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Array>} Array de distribuições com informações do token, ordenadas por data (mais recentes primeiro)
   */
  static async getDistributionsByInvestor(investorId) {
    return await prisma.tokenDistribution.findMany({
      where: { investorId },
      include: {
        token: {
          select: {
            assetCode: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca todas as distribuições de um asset específico
   * @param {string} assetCode - Código do asset
   * @returns {Promise<Array>} Array de distribuições com informações dos investidores, ordenadas por data (mais recentes primeiro)
   */
  static async getDistributionsByAsset(assetCode) {
    return await prisma.tokenDistribution.findMany({
      where: { assetCode },
      include: {
        investor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
