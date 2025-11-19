import { Offer } from '../models/Offer.js';
import { Token } from '../models/Token.js';
import { Company } from '../models/Company.js';

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
    const { maturityDate, bulletPaymentAmount, paymentFrequency, annualInterestRate } = paymentFields;

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

    // Para pagamentos bullet, data de vencimento e valor são obrigatórios
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

      if (!bulletPaymentAmount || typeof bulletPaymentAmount !== 'number' || bulletPaymentAmount <= 0) {
        errors.push('bullet_payment_amount is required and must be a positive number for bullet payments');
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
      if (offerRules.min_investment && offerRules.max_investment && 
          offerRules.min_investment > offerRules.max_investment) {
        errors.push('min_investment cannot be greater than max_investment');
      }
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

    return await Offer.create(offerData);
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
  static async issueTokenFromOffer(offerId, issuedBy, issuerPublicKey) {
    const offer = await Offer.findById(offerId);
    if (!offer) {
      throw new Error('Offer not found');
    }

    if (offer.status !== 'approved') {
      throw new Error('Offer must be approved before issuing token');
    }

    // Verificar se token já foi emitido
    const existingToken = await Token.findByAssetCode(offer.asset_code);
    if (existingToken) {
      throw new Error('Token already issued for this offer');
    }

    // Criar token
    const token = await Token.create({
      asset_code: offer.asset_code,
      issuer_public_key: issuerPublicKey,
      total_supply: offer.total_supply,
      description: offer.description,
      offer_id: offer.id,
      issued_by: issuedBy,
    });

    return token;
  }

  /**
   * Ativa uma oferta após token emitido
   * @param {number} offerId - ID da oferta
   * @returns {Promise<Object>} Oferta atualizada
   */
  static async activateOffer(offerId) {
    const offer = await Offer.findById(offerId);
    if (!offer) {
      throw new Error('Offer not found');
    }

    // Verificar se token foi emitido
    const token = await Token.findByAssetCode(offer.asset_code);
    if (!token) {
      throw new Error('Token must be issued before activating offer');
    }

    if (offer.status !== 'approved') {
      throw new Error('Offer must be approved before activation');
    }

    return await Offer.updateStatus(offerId, 'active');
  }
}

