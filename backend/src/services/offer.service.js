import { Offer } from '../models/Offer.js';
import { Token } from '../models/Token.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
const log = logger.scope('OfferService');

/**
 * Serviço para gerenciar ofertas de tokenização
 */
export class OfferService {
  /**
   * Valida código do asset
   * @param {string} assetCode - Código do asset
   * @returns {boolean} True se válido
   */
  static validateAssetCode(assetCode) {
    if (!assetCode || typeof assetCode !== 'string') {
      return false;
    }
    if (assetCode.length > 12 || assetCode.length < 1) {
      return false;
    }
    if (!/^[A-Z0-9]+$/.test(assetCode)) {
      return false;
    }
    return true;
  }

  /**
   * Valida tipo de pagamento e campos associados
   * @param {string} paymentType - Tipo de pagamento ('monthly', 'bullet', 'quarterly', 'semi_annual')
   * @param {Object} paymentFields - Campos relacionados ao pagamento
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validatePaymentFields(paymentType, paymentFields) {
    const errors = [];
    const { maturityDate, _bulletPaymentAmount, paymentFrequency, annualInterestRate } = paymentFields;

    // Validar tipos de pagamento suportados
    const validPaymentTypes = ['monthly', 'bullet', 'quarterly', 'semi_annual'];
    if (!validPaymentTypes.includes(paymentType)) {
      errors.push(`Invalid payment type. Must be one of: ${validPaymentTypes.join(', ')}`);
      return { valid: false, errors };
    }

    // Para pagamentos mensais, taxa de juros é obrigatória
    if (paymentType === 'monthly') {
      if (!annualInterestRate || typeof annualInterestRate !== 'number' || annualInterestRate <= 0) {
        errors.push('annual_interest_rate is required and must be a positive number for monthly payments');
      }
    }

    // Para pagamentos bullet, data de vencimento e taxa de juros são obrigatórios
    if (paymentType === 'bullet') {
      if (!maturityDate) {
        errors.push('maturity_date is required for bullet payments');
      } else {
        const maturity = new Date(maturityDate);
        if (isNaN(maturity.getTime())) {
          errors.push('maturity_date must be a valid date');
        } else if (maturity <= new Date()) {
          errors.push('maturity_date must be in the future');
        }
      }

      // Issue 5 Fix: Require annualInterestRate for bullet payments (used in dynamic calculation)
      if (!annualInterestRate || typeof annualInterestRate !== 'number' || annualInterestRate <= 0) {
        errors.push('annual_interest_rate is required and must be a positive number for bullet payments');
      }
    }

    // Para pagamentos periódicos (quarterly, semi_annual), taxa de juros é obrigatória
    if (['quarterly', 'semi_annual'].includes(paymentType)) {
      if (!annualInterestRate || typeof annualInterestRate !== 'number' || annualInterestRate <= 0) {
        errors.push('annual_interest_rate is required and must be a positive number for periodic payments');
      }
    }

    // Validar frequência de pagamento
    if (paymentFrequency && (typeof paymentFrequency !== 'number' || paymentFrequency < 1)) {
      errors.push('payment_frequency must be a positive number (months between payments)');
    }

    // Definir frequência padrão baseada no tipo
    const defaultFrequencies = {
      monthly: 1,
      quarterly: 3,
      semi_annual: 6,
      bullet: null // bullet não tem frequência periódica
    };

    if (paymentFrequency && defaultFrequencies[paymentType] && paymentFrequency !== defaultFrequencies[paymentType]) {
      errors.push(`payment_frequency for ${paymentType} should be ${defaultFrequencies[paymentType]} months`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Valida regras da oferta
   * @param {Object} offerRules - Regras da oferta
   * @param {string} offerType - Tipo da oferta ('collateral' ou 'sale')
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validateOfferRules(offerRules, offerType) {
    const errors = [];

    if (offerType === 'collateral') {
      // Regras para ofertas de captação (colateral)
      if (offerRules.min_investment && typeof offerRules.min_investment !== 'number') {
        errors.push('min_investment must be a number');
      }
      if (offerRules.max_investment && typeof offerRules.max_investment !== 'number') {
        errors.push('max_investment must be a number');
      }
      if (offerRules.max_investment && offerRules.max_investment > 0 && offerRules.min_investment && offerRules.max_investment < offerRules.min_investment) {
        errors.push('max_investment must be greater than min_investment');
      }

      // New Validation: max_investment cannot exceed total raise (handled dynamically in controller but good to enforce logic here if data available exists)
      // Note: total_supply and unit_price are checked in calculateTotalRaise() context, but createOffer receives flat data.
      // We will leave the strictly simple check here.  }
      if (offerRules.loan_term && (typeof offerRules.loan_term !== 'number' || offerRules.loan_term < 1)) {
        errors.push('loan_term must be a positive number');
      }
    } else if (offerType === 'sale') {
      // Regras para ofertas de venda
      if (offerRules.min_investment && typeof offerRules.min_investment !== 'number') {
        errors.push('min_investment must be a number');
      }
      if (offerRules.max_investment && typeof offerRules.max_investment !== 'number') {
        errors.push('max_investment must be a number');
      }
      if (offerRules.price_per_token && typeof offerRules.price_per_token !== 'number') {
        errors.push('price_per_token must be a number');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Busca ofertas ativas
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @param {string} [offerType] - Filtrar por tipo
   * @returns {Promise<Array>} Array de ofertas ativas
   */
  static async getActiveOffers(limit = 100, offset = 0, offerType = null) {
    return await Offer.findAllActive(limit, offset, offerType);
  }

  /**
   * Busca ofertas por tipo
   * @param {string} offerType - Tipo: 'collateral' ou 'sale'
   * @param {number} [limit=100] - Limite de resultados
   * @param {number} [offset=0] - Offset
   * @returns {Promise<Array>} Array de ofertas
   */
  static async getOffersByType(offerType, limit = 100, offset = 0) {
    return await Offer.getOffersByType(offerType, limit, offset);
  }

  /**
   * Cria uma nova oferta
   * @param {Object} offerData - Dados da oferta
   * @returns {Promise<Object>} Oferta criada
   */
  static async createOffer(offerData) {
    // Validar asset_code
    if (!this.validateAssetCode(offerData.asset_code)) {
      throw new Error('Invalid asset_code. Must be uppercase alphanumeric, max 12 characters');
    }

    if (!offerData.total_supply || parseFloat(offerData.total_supply) <= 0) {
      throw new Error('Total supply must be a positive number');
    }

    if (offerData.unit_price && parseFloat(offerData.unit_price) < 0) {
      throw new Error('Unit price must be a non-negative number');
    }

    // Validar campos de pagamento
    const paymentValidation = this.validatePaymentFields(
      offerData.payment_type || 'monthly',
      {
        maturityDate: offerData.maturity_date,
        bulletPaymentAmount: offerData.bullet_payment_amount,
        paymentFrequency: offerData.payment_frequency,
        annualInterestRate: offerData.annual_interest_rate
      }
    );
    if (!paymentValidation.valid) {
      throw new Error(`Invalid payment fields: ${paymentValidation.errors.join(', ')}`);
    }

    // Validar regras
    const rulesValidation = this.validateOfferRules(offerData.offer_rules || {}, offerData.offer_type);
    if (!rulesValidation.valid) {
      throw new Error(`Invalid offer rules: ${rulesValidation.errors.join(', ')}`);
    }

    // Verificar se asset_code já existe
    const existingOffer = await Offer.findByAssetCode(offerData.asset_code);
    if (existingOffer) {
      throw new Error('Asset code already exists');
    }

    // Collateral (debt) offers MUST have a maturity date — it's a financial instrument
    if (offerData.offer_type === 'collateral') {
      if (!offerData.maturity_date) {
        throw new Error('maturity_date is required for all collateral (debt) offers');
      }
      const maturity = new Date(offerData.maturity_date);
      if (isNaN(maturity.getTime())) {
        throw new Error('maturity_date must be a valid date');
      }
      if (maturity <= new Date()) {
        throw new Error('maturity_date must be in the future');
      }
    }

    // Setup/issuance fee is handled off-chain via service contract — no on-chain fee log here
    return await prisma.offer.create({
      data: {
        companyId: offerData.company_id,
        requestedBy: offerData.requested_by,
        assetCode: offerData.asset_code,
        offerName: offerData.offer_name,
        description: offerData.description,
        totalSupply: offerData.total_supply,
        unitPrice: offerData.unit_price,
        annualInterestRate: offerData.annual_interest_rate,
        offerType: offerData.offer_type,
        paymentType: offerData.payment_type || 'monthly',
        maturityDate: offerData.maturity_date ? new Date(offerData.maturity_date) : null,
        bulletPaymentAmount: offerData.bullet_payment_amount,
        paymentFrequency: offerData.payment_frequency || 1,
        offerRules: offerData.offer_rules || {},
        legalDocuments: offerData.legal_documents || {},
        collateralType: offerData.collateral_type || 'real_estate',
        collateralDescription: offerData.collateral_description,
        collateralValue: offerData.collateral_value,
        collateralLTV: offerData.collateral_ltv,
        // Phase 2: Asset Intelligence
        rentalYieldRate: offerData.rental_yield_rate || null,
        valueGrowthRate: offerData.value_growth_rate || null,
        latitude: offerData.latitude || null,
        longitude: offerData.longitude || null,
        locationAddress: offerData.location_address || null,
        assetMetadata: offerData.asset_metadata || {},
        // Phase 3: Asset lifecycle stage
        assetStage: offerData.asset_stage || null,
        status: 'pending_review',
      },
      include: {
        company: true,
        tokens: true,
        requester: true
      }
    });
  }

  /**
   * Revisa uma oferta (apenas platform_admin)
   * @param {number} offerId - ID da oferta
   * @param {string} status - Novo status
   * @param {number} reviewedBy - ID do admin que revisou
   * @param {string} [rejectionReason] - Motivo da rejeição
   * @returns {Promise<Object>} Oferta atualizada
   */
  static async reviewOffer(offerId, status, reviewedBy, rejectionReason = null) {
    if (!['approved', 'rejected', 'under_review'].includes(status)) {
      throw new Error('Invalid status. Must be: approved, rejected, or under_review');
    }

    if (status === 'rejected' && !rejectionReason) {
      throw new Error('Rejection reason is required when rejecting an offer');
    }

    return await Offer.updateStatus(offerId, status, reviewedBy, rejectionReason);
  }

  /**
   * Emite token a partir de uma oferta aprovada
   * @param {number} offerId - ID da oferta
   * @param {number} issuedBy - ID do admin que emitiu
   * @param {string} issuerPublicKey - Chave pública do issuer Stellar
   * @returns {Promise<Object>} Token criado
   */
  static async issueTokenFromOffer(offerId, issuedBy, issuerPublicKey, transactionHash = null) {
    const offer = await Offer.findById(offerId);
    if (!offer) {
      throw new Error('Offer not found');
    }

    if (offer.status !== 'approved') {
      throw new Error('Offer must be approved before issuing token');
    }

    // Verificar se token já foi emitido
    const existingToken = await Token.findByAssetCode(offer.assetCode);
    if (existingToken) {
      throw new Error('Token already issued for this offer');
    }

    // Criar token
    const token = await Token.create({
      assetCode: offer.assetCode,
      issuerPublicKey: issuerPublicKey,
      totalSupply: offer.totalSupply,
      description: offer.description,
      offerId: offer.id,
      issuedBy: issuedBy,
      issuanceTransactionHash: transactionHash,
    });

    return token;
  }

  /**
   * Ativa uma oferta: inicia o pipeline de Soroban deploy → create → activate.
   * Constrói o TX de deploy sem assinar e envia para o approval hub (Freighter).
   * A oferta só vira 'active' após processEffects('sale_create') completar.
   *
   * @param {number} offerId - ID da oferta
   * @returns {Promise<Object>} Oferta com status de init atualizado
   */
  static async activateOffer(offerId) {
    const offer = await Offer.findById(offerId);
    if (!offer) {
      throw new Error('Offer not found');
    }

    // Verificar se token foi emitido
    const token = await Token.findByAssetCode(offer.assetCode);
    if (!token) {
      throw new Error('Token must be issued before activating offer');
    }

    // SAC must be deployed before sale contract can reference it
    if (!token.sacContractId) {
      throw new Error('Token SAC not deployed — issue the token first (SAC deploy must be signed)');
    }

    if (offer.status !== 'approved') {
      throw new Error('Offer must be approved before activation');
    }

    // Idempotency: don't queue another deploy if one is already in progress
    if (offer.sorobanInitStatus === 'deploying') {
      throw new Error('Soroban deploy already in progress — check the Approvals tab');
    }
    if (offer.sorobanInitStatus === 'deployed') {
      throw new Error('Soroban contract already deployed — awaiting sale_create step');
    }

    // All offer types need a Soroban sale contract for the crowdfunding flow
    return await this.#initSorobanDeploy(offer, token);
  }

  /**
   * Retry Soroban init for a failed sale offer
   * @param {number} offerId - ID da oferta
   * @returns {Promise<Object>} Oferta com init reiniciado
   */
  static async retrySorobanInit(offerId) {
    const offer = await Offer.findById(offerId);
    if (!offer) {
      throw new Error('Offer not found');
    }
    if (offer.sorobanInitStatus && !['failed', null].includes(offer.sorobanInitStatus)) {
      throw new Error('Soroban deployment is already in progress or completed');
    }

    const token = await Token.findByAssetCode(offer.assetCode);
    if (!token) {
      throw new Error('Token not found');
    }

    return await this.#initSorobanDeploy(offer, token);
  }

  /**
   * Internal: Build + queue the Soroban deploy TX
   * @private
   */
  static async #initSorobanDeploy(offer, token) {
    const { createHash } = await import('crypto');
    const { keyManager } = await import('../services/KeyManager.js');
    const { getSaleWasmHash } = await import('../config/stellar.js');
    const { SorobanSaleService } = await import('../services/sorobanSale.service.js');
    const { TransactionManager } = await import('../services/transactionManager.service.js');

    const issuerPublicKey = keyManager.getIssuerPublicKey();
    const wasmHash = getSaleWasmHash();

    // Deterministic salt: sha256("radox:sale:{offerId}")
    const salt = createHash('sha256')
      .update(`radox:sale:${offer.id}`)
      .digest();

    // Check for crash recovery: contract may already exist on-chain
    const precomputedId = SorobanSaleService.precomputeContractId(issuerPublicKey, salt);
    const alreadyDeployed = await SorobanSaleService.contractExistsOnChain(precomputedId);

    if (alreadyDeployed) {
      log.info(`[activateOffer] Contract ${precomputedId} already deployed, skipping to create step`);
      // Update DB and return — the sale_create chain must be triggered
      // manually via retrySorobanInit or processEffects when the original TX is re-processed.
      await prisma.offer.update({
        where: { id: offer.id },
        data: {
          sorobanContractId: precomputedId,
          sorobanInitStatus: 'deployed',
          sorobanInitError: null,
        },
      });

      // Directly chain the sale_create TX
      const { SorobanSaleService: SaleService } = await import('../services/sorobanSale.service.js');
      const { TransactionManager: TxMgr } = await import('../services/transactionManager.service.js');
      const { keyManager: km } = await import('../services/KeyManager.js');

      const deployedOffer = await prisma.offer.findUnique({
        where: { id: offer.id },
        include: { tokens: true, company: true },
      });

      const sellToken = deployedOffer.tokens?.[0]?.sacContractId;
      if (!sellToken) throw new Error(`Token SAC not deployed for offer #${offer.id}`);
      const buyToken = process.env.USDC_SAC_CONTRACT_ID;
      if (!buyToken) throw new Error('USDC_SAC_CONTRACT_ID env var is required');

      const companyWallet = deployedOffer.company?.stellarContractId || deployedOffer.company?.stellarPublicKey;
      if (!companyWallet) throw new Error(`Company wallet not found for offer #${offer.id}`);

      const fixedFee = BigInt(Math.floor((parseFloat(deployedOffer.processingFee) || 5) * 10_000_000));

      const rules = typeof deployedOffer.offerRules === 'string'
        ? JSON.parse(deployedOffer.offerRules)
        : deployedOffer.offerRules || {};

      const createResult = await SaleService.buildCreateSaleXdr(
        precomputedId,
        km.getIssuerPublicKey(),
        {
          admin: km.getIssuerPublicKey(),
          seller: km.getIssuerPublicKey(),
          sellToken,
          buyToken,
          treasury: km.getTreasuryPublicKey(),
          company: companyWallet,
          fixedFee,
          sellPrice: parseInt(deployedOffer.unitPrice * 10000000) || 1,
          buyPrice: 10000000,
          deadlineLedger: 0,
          minBuyAmount: BigInt(Math.floor((rules.min_investment || 0) * 10000000)),
          maxBuyPerBuyer: BigInt(Math.floor((rules.max_investment || 0) * 10000000)),
        }
      );

      await TxMgr.submit({
        xdr: createResult.xdr,
        operationType: 'sale_create',
        signingRole: 'ISSUER',
        metadata: {
          offerId: offer.id,
          contractId: precomputedId,
          assetCode: offer.assetCode,
        },
        description: `Initialize sale contract for ${offer.assetCode}`,
      });

      log.info(`[activateOffer] Crash recovery: chained sale_create for offer #${offer.id}`);
      return await Offer.findById(offer.id);
    }

    // Build unsigned deploy TX
    const { xdr, contractId } = await SorobanSaleService.buildDeployXdr(
      issuerPublicKey,
      wasmHash,
      salt,
    );

    // Save precomputed contractId + status BEFORE queuing TX
    await prisma.offer.update({
      where: { id: offer.id },
      data: {
        sorobanContractId: contractId,
        sorobanInitStatus: 'deploying',
        sorobanInitError: null,
      },
    });

    // Queue for Freighter signing via TransactionManager
    await TransactionManager.submit({
      xdr,
      operationType: 'sale_deploy',
      signingRole: 'ISSUER',
      metadata: {
        offerId: offer.id,
        contractId,
        assetCode: offer.assetCode,
        tokenId: token.id,
      },
      description: `Deploy sale contract for ${offer.assetCode}`,
    });

    log.info(`[activateOffer] Soroban deploy TX queued for offer ${offer.id}, contractId=${contractId}`);

    return await Offer.findById(offer.id);
  }



  /**
   * Busca investidores de uma oferta (Cap Table)
   * @param {number} offerId - ID da oferta
   * @returns {Promise<Array>} Lista de investidores agregada
   */
  static async getOfferInvestors(offerId) {
    const investments = await prisma.investment.findMany({
      where: {
        offerId: parseInt(offerId),
        status: { in: ['payment_received', 'distributed'] }
      },
      include: {
        investor: {
          select: {
            id: true,
            name: true,
            email: true,
            stellarContractId: true,
            kycStatus: true,
            createdAt: true // Investor registration date
          }
        }
      }
    });

    // Aggregate by investor
    const capTable = {};
    for (const inv of investments) {
      if (!capTable[inv.investorId]) {
        capTable[inv.investorId] = {
          investor_id: inv.investorId,
          name: inv.investor.name,
          email: inv.investor.email,
          wallet_address: inv.investor.stellarContractId,
          kyc_status: inv.investor.kycStatus,
          registered_at: inv.investor.createdAt,
          total_tokens: 0,
          total_invested: 0,
          invested_at: inv.createdAt // First investment date (for this record)
        };
      }
      capTable[inv.investorId].total_tokens += parseFloat(inv.tokenAmount);
      capTable[inv.investorId].total_invested += parseFloat(inv.usdcAmount);

      // Keep easiest investment date if multiple
      if (new Date(inv.createdAt) < new Date(capTable[inv.investorId].invested_at)) {
        capTable[inv.investorId].invested_at = inv.createdAt;
      }
    }

    return Object.values(capTable);
  }
}

