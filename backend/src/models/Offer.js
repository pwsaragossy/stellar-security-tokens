import prisma from '../config/prisma.js';

/**
 * Modelo para gerenciar ofertas de tokenização usando Prisma
 */
export class Offer {
  /**
   * Cria uma nova oferta de tokenização
   * @param {Object} offerData - Dados da oferta
   * @param {number} offerData.company_id - ID da empresa
   * @param {number} offerData.requested_by - ID do usuário que solicitou
   * @param {string} offerData.asset_code - Código único do asset
   * @param {string} offerData.offer_name - Nome da oferta
   * @param {string} offerData.description - Descrição da oferta
   * @param {number|string} offerData.total_supply - Supply total
   * @param {number} [offerData.annual_interest_rate] - Taxa de juros anual
   * @param {string} offerData.offer_type - Tipo: 'collateral' ou 'sale'
   * @param {Object} [offerData.offer_rules] - Regras personalizadas (JSONB)
   * @param {Object} [offerData.legal_documents] - Documentos IPFS (JSONB)
   * @returns {Promise<Object>} Oferta criada
   * @throws {Error} Se asset_code já existir
   */
  static async create(offerData) {
    const {
      company_id,
      requested_by,
      asset_code,
      offer_name,
      description,
      total_supply,
      annual_interest_rate,
      offer_type,
      offer_rules = {},
      legal_documents = {},
      payment_type,
      maturity_date,
      bullet_payment_amount,
      payment_frequency,
      // Collateral
      collateral_type,
      collateral_description,
      collateral_value,
      collateral_ltv,
    } = offerData;

    return await prisma.offer.create({
      data: {
        companyId: company_id,
        requestedBy: requested_by,
        assetCode: asset_code,
        offerName: offer_name,
        description,
        totalSupply: total_supply,
        annualInterestRate: annual_interest_rate || null,
        offerType: offer_type.toLowerCase(),
        offerRules: offer_rules,
        legalDocuments: legal_documents,
        status: 'pending_review',
        paymentType: payment_type || 'monthly',
        maturityDate: maturity_date ? new Date(maturity_date) : null,
        bulletPaymentAmount: bullet_payment_amount,
        paymentFrequency: payment_frequency || 1,
        // Collateral
        collateralType: collateral_type,
        collateralDescription: collateral_description,
        collateralValue: collateral_value,
        collateralLTV: collateral_ltv,
      },
    });
  }

  /**
   * Busca oferta por ID
   * @param {number} id - ID da oferta
   * @returns {Promise<Object|null>} Oferta encontrada ou null
   */
  static async findById(id) {
    return await prisma.offer.findUnique({
      where: { id },
    });
  }

  /**
   * Busca oferta por código do asset
   * @param {string} assetCode - Código do asset
   * @returns {Promise<Object|null>} Oferta encontrada ou null
   */
  static async findByAssetCode(assetCode) {
    return await prisma.offer.findUnique({
      where: { assetCode },
    });
  }

  /**
   * Busca ofertas de uma empresa
   * @param {number} companyId - ID da empresa
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @returns {Promise<Array>} Array de ofertas
   */
  static async findByCompany(companyId, limit = 100, offset = 0) {
    return await prisma.offer.findMany({
      where: { companyId },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lista todas as ofertas
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @param {string} [status] - Filtrar por status
   * @returns {Promise<Array>} Array de ofertas
   */
  static async findAll(limit = 100, offset = 0, status = null, companyId = null) {
    const where = {};
    if (status) where.status = status.toLowerCase();
    if (companyId) where.companyId = parseInt(companyId);

    return await prisma.offer.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca ofertas ativas (para investidores)
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @param {string} [offerType] - Filtrar por tipo
   * @returns {Promise<Array>} Array de ofertas ativas
   */
  static async findAllActive(limit = 100, offset = 0, offerType = null) {
    const where = { status: 'active' };
    if (offerType) {
      where.offerType = offerType.toLowerCase();
    }

    return await prisma.offer.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca ofertas por tipo
   * @param {string} offerType - Tipo: 'collateral' ou 'sale'
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @returns {Promise<Array>} Array de ofertas
   */
  static async getOffersByType(offerType, limit = 100, offset = 0) {
    return await prisma.offer.findMany({
      where: { offerType: offerType.toLowerCase() },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Atualiza status da oferta
   * @param {number} id - ID da oferta
   * @param {string} status - Novo status
   * @param {number} [reviewedBy] - ID do admin que revisou
   * @param {string} [rejectionReason] - Motivo da rejeição (se aplicável)
   * @returns {Promise<Object|null>} Oferta atualizada ou null
   */
  static async updateStatus(id, status, reviewedBy = null, rejectionReason = null) {
    const updateData = {
      status: status.toLowerCase(),
    };

    if (reviewedBy) {
      updateData.reviewedBy = reviewedBy;
      updateData.reviewedAt = new Date();
    }

    if (rejectionReason !== null) {
      updateData.rejectionReason = rejectionReason;
    }

    try {
      return await prisma.offer.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Adiciona notas de due diligence
   * @param {number} id - ID da oferta
   * @param {string} notes - Notas de due diligence
   * @returns {Promise<Object|null>} Oferta atualizada ou null
   */
  static async addDueDiligenceNotes(id, notes) {
    try {
      return await prisma.offer.update({
        where: { id },
        data: { dueDiligenceNotes: notes },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Adiciona documentos legais (hashes IPFS)
   * @param {number} id - ID da oferta
   * @param {Object} legalDocuments - Documentos em formato JSONB
   * @returns {Promise<Object|null>} Oferta atualizada ou null
   */
  static async addLegalDocuments(id, legalDocuments) {
    try {
      return await prisma.offer.update({
        where: { id },
        data: { legalDocuments },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Atualiza regras da oferta
   * @param {number} id - ID da oferta
   * @param {Object} offerRules - Regras personalizadas
   * @returns {Promise<Object|null>} Oferta atualizada ou null
   */
  static async updateOfferRules(id, offerRules) {
    try {
      return await prisma.offer.update({
        where: { id },
        data: { offerRules },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Atualiza dados da oferta
   * @param {number} id - ID da oferta
   * @param {Object} offerData - Dados a atualizar
   * @returns {Promise<Object|null>} Oferta atualizada ou null
   */
  static async update(id, offerData) {
    const {
      offer_name,
      description,
      total_supply,
      annual_interest_rate,
      offer_rules,
    } = offerData;

    const updateData = {};
    if (offer_name !== undefined) updateData.offerName = offer_name;
    if (description !== undefined) updateData.description = description;
    if (total_supply !== undefined) updateData.totalSupply = total_supply;
    if (annual_interest_rate !== undefined) updateData.annualInterestRate = annual_interest_rate;
    if (offer_rules !== undefined) updateData.offerRules = offer_rules;

    if (Object.keys(updateData).length === 0) {
      return await this.findById(id);
    }

    try {
      return await prisma.offer.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }
}
