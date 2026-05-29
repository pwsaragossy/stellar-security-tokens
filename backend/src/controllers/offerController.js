import { Offer } from '../models/Offer.js';
import { Company } from '../models/Company.js';
import { Token } from '../models/Token.js';
import { Investment } from '../models/Investment.js';
import { StellarService } from '../services/stellar.service.js';
import { OfferService } from '../services/offer.service.js';
import { ConfigService } from '../services/config.service.js';
import { ipfsService } from '../services/ipfs.service.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import { computeSpreadRatio, validateYieldSpreadRatio } from '../utils/stellarAmount.js';
const log = logger.scope('OfferController');

/**
 * Controller para gerenciar ofertas de tokenização
 */
export class OfferController {
  /**
   * Formata documentos legais adicionando URLs IPFS completas
   * @param {Object} legalDocuments - Documentos do banco (JSONB)
   * @returns {Object} Documentos formatados com URLs completas
   */
  static formatLegalDocuments(legalDocuments) {
    if (!legalDocuments || typeof legalDocuments !== 'object') {
      return {};
    }

    const formatted = {};

    // Lista de tipos de documentos suportados
    const documentTypes = ['contract', 'terms', 'prospectus', 'kyc', 'matricula', 'laudo', 'projeto', 'other'];

    for (const docType of documentTypes) {
      if (legalDocuments[docType]) {
        const doc = legalDocuments[docType];

        formatted[docType] = {
          hash: doc.hash || null,
          url: doc.url || (doc.hash ? ipfsService.getGatewayUrl(doc.hash) : null),
          fileName: doc.fileName || null,
          uploadedAt: doc.uploadedAt || null,
        };
      }
    }

    return formatted;
  }

  /**
   * Formata oferta para resposta do frontend
   * @param {Object} offer - Oferta do banco
   * @returns {Object} Oferta formatada
   */
  static formatOfferForResponse(offer, cutoffDays = 90) {
    if (!offer) {
      return null;
    }

    // Parse JSONB fields se necessário
    const legalDocuments = typeof offer.legalDocuments === 'string'
      ? JSON.parse(offer.legalDocuments)
      : offer.legalDocuments || {};

    const offerRules = typeof offer.offerRules === 'string'
      ? JSON.parse(offer.offerRules)
      : offer.offerRules || {};

    // Map database camelCase to API snake_case
    return {
      id: offer.id,
      companyId: offer.companyId,
      company_id: offer.companyId,
      requestedBy: offer.requestedBy,
      requested_by: offer.requestedBy,
      assetCode: offer.assetCode,
      asset_code: offer.assetCode,
      offerName: offer.offerName,
      offer_name: offer.offerName,
      description: offer.description,
      totalSupply: offer.totalSupply,
      total_supply: offer.totalSupply,
      annualInterestRate: offer.annualInterestRate,
      annual_interest_rate: offer.annualInterestRate,
      investorRate: offer.investorRate ?? null,
      investor_rate: offer.investorRate ?? null,
      offerType: offer.offerType,
      offer_type: offer.offerType,
      unitPrice: offer.unitPrice,
      unit_price: offer.unitPrice,
      status: offer.status,
      rejectionReason: offer.rejectionReason,
      rejection_reason: offer.rejectionReason,
      reviewedBy: offer.reviewedBy,
      reviewed_by: offer.reviewedBy,
      reviewedAt: offer.reviewedAt,
      reviewed_at: offer.reviewedAt,
      dueDiligenceNotes: offer.dueDiligenceNotes,
      due_diligence_notes: offer.dueDiligenceNotes,
      paymentType: offer.paymentType,
      payment_type: offer.paymentType,
      maturityDate: offer.maturityDate,
      maturity_date: offer.maturityDate,
      bulletPaymentAmount: offer.bulletPaymentAmount,
      bullet_payment_amount: offer.bulletPaymentAmount,
      paymentFrequency: offer.paymentFrequency,
      payment_frequency: offer.paymentFrequency,
      createdAt: offer.createdAt,
      created_at: offer.createdAt,
      updatedAt: offer.updatedAt,
      updated_at: offer.updatedAt,
      // Collateral fields
      collateralType: offer.collateralType,
      collateral_type: offer.collateralType,
      collateralDescription: offer.collateralDescription,
      collateral_description: offer.collateralDescription,
      collateralValue: offer.collateralValue,
      collateral_value: offer.collateralValue,
      collateralLTV: offer.collateralLTV,
      collateral_ltv: offer.collateralLTV,
      // Phase 2: Asset Intelligence
      rentalYieldRate: offer.rentalYieldRate ?? null,
      rental_yield_rate: offer.rentalYieldRate ?? null,
      valueGrowthRate: offer.valueGrowthRate ?? null,
      value_growth_rate: offer.valueGrowthRate ?? null,
      latitude: offer.latitude ?? null,
      longitude: offer.longitude ?? null,
      locationAddress: offer.locationAddress ?? null,
      location_address: offer.locationAddress ?? null,
      assetMetadata: offer.assetMetadata ?? {},
      asset_metadata: offer.assetMetadata ?? {},
      // Phase 3: Asset Stage
      assetStage: offer.assetStage ?? null,
      asset_stage: offer.assetStage ?? null,
      // Formatted JSONB fields
      legalDocuments: OfferController.formatLegalDocuments(legalDocuments),
      legal_documents: OfferController.formatLegalDocuments(legalDocuments),
      offerRules: offerRules,
      offer_rules: offerRules,
      // Supply tracking (computed, attached by controller)
      tokensSold: offer._tokensSold ?? null,
      tokens_sold: offer._tokensSold ?? null,
      // Fixed processing fee per trade in USDC (v5 contracts)
      processingFee: parseFloat(offer.processingFee) || 5.0,
      processing_fee: parseFloat(offer.processingFee) || 5.0,
      // Maturity cutoff (computed from maturityDate - cutoffDays)
      investmentCutoffDate: offer.maturityDate
        ? new Date(new Date(offer.maturityDate).getTime() - cutoffDays * 24 * 60 * 60 * 1000).toISOString()
        : null,
      investment_cutoff_date: offer.maturityDate
        ? new Date(new Date(offer.maturityDate).getTime() - cutoffDays * 24 * 60 * 60 * 1000).toISOString()
        : null,
      // Relations
      company: offer.company || null,
      token: (offer.tokens && offer.tokens.length > 0) ? offer.tokens[0] : (offer.token || null),
      // Soroban contracts
      sorobanContractId: offer.sorobanContractId || null,
      soroban_contract_id: offer.sorobanContractId || null,
      sorobanSettlementContractId: offer.sorobanSettlementContractId || null,
      soroban_settlement_contract_id: offer.sorobanSettlementContractId || null,
      // Token lifecycle
      isTokenLocked: offer.isTokenLocked ?? true,
      paymentDueStatus: offer.paymentDueStatus || null,
      payment_due_status: offer.paymentDueStatus || null,
      lastPaymentDate: offer.lastPaymentDate || null,
      last_payment_date: offer.lastPaymentDate || null,
    };
  }

  /**
   * Cria uma nova oferta (company_user)
   * POST /api/companies/offers
   */
  /**
   * Cria uma nova oferta (company_user)
   * POST /api/companies/offers
   */
  static async createOffer(req, res) {
    try {
      let {
        asset_code,
        offer_name,
        description,
        total_supply,
        annual_interest_rate,
        offer_type,
        payment_type = 'monthly',
        maturity_date,
        bullet_payment_amount,
        payment_frequency = 1,
        offer_rules = {},
        // Collateral fields
        collateral_type = 'real_estate',
        collateral_description,
        collateral_value,
        collateral_ltv,
        // Phase 2: Asset Intelligence
        rental_yield_rate,
        value_growth_rate,
        latitude,
        longitude,
        location_address,
        asset_metadata,
        // Phase 3: Asset lifecycle stage
        asset_stage,
      } = req.body;

      // Sanitize Brazilian number format ("1.000.000,50" → "1000000.50") before parseFloat
      const sanitizeNumber = (val) => {
        if (typeof val !== 'string') return val;
        // If it has both dots and comma, it's likely BR format: dots are thousands, comma is decimal
        if (val.includes(',') && val.includes('.')) {
          return val.replace(/\./g, '').replace(',', '.');
        }
        // If only comma (e.g. "1000,50"), treat comma as decimal separator
        if (val.includes(',') && !val.includes('.')) {
          return val.replace(',', '.');
        }
        return val;
      };

      // Converter campos numéricos vindos de multipart/form-data (strings)
      if (total_supply) total_supply = parseFloat(sanitizeNumber(total_supply));
      if (annual_interest_rate) annual_interest_rate = parseFloat(sanitizeNumber(annual_interest_rate));
      if (bullet_payment_amount) bullet_payment_amount = parseFloat(sanitizeNumber(bullet_payment_amount));
      if (payment_frequency) payment_frequency = parseInt(payment_frequency, 10);
      if (collateral_ltv) collateral_ltv = parseFloat(sanitizeNumber(collateral_ltv));
      if (collateral_value) collateral_value = parseFloat(sanitizeNumber(collateral_value));
      // Phase 2: sanitize new numeric fields
      if (rental_yield_rate) rental_yield_rate = parseFloat(sanitizeNumber(rental_yield_rate));
      if (value_growth_rate) value_growth_rate = parseFloat(sanitizeNumber(value_growth_rate));
      if (latitude) latitude = parseFloat(sanitizeNumber(latitude));
      if (longitude) longitude = parseFloat(sanitizeNumber(longitude));

      // Parse unit_price if provided
      let unit_price = 1.0;
      if (req.body.unit_price) {
        unit_price = parseFloat(sanitizeNumber(req.body.unit_price));
      }





      // Parse offer_rules se enviado como string JSON (comum em multipart)
      if (typeof offer_rules === 'string') {
        try {
          offer_rules = JSON.parse(offer_rules);
        } catch (e) {
          offer_rules = {};
        }
      }

      // Validações básicas
      if (!asset_code || !offer_name || !description || !total_supply || !offer_type) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: asset_code, offer_name, description, total_supply, offer_type',
        });
      }

      if (!['collateral', 'sale'].includes(offer_type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid offer_type. Must be "collateral" or "sale"',
        });
      }

      // Phase 3: Validate asset_stage if provided
      const VALID_ASSET_STAGES = ['under_development', 'completed', 'income_producing'];
      if (asset_stage && !VALID_ASSET_STAGES.includes(asset_stage)) {
        return res.status(400).json({
          success: false,
          error: `Invalid asset_stage. Must be one of: ${VALID_ASSET_STAGES.join(', ')}`,
        });
      }

      // Validar formato do asset_code (máximo 12 caracteres, alfanumérico)
      if (asset_code.length > 12 || !/^[A-Z0-9]+$/.test(asset_code)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid asset_code. Must be uppercase alphanumeric, max 12 characters',
        });
      }

      // Verificar se asset_code já existe
      const existingOffer = await Offer.findByAssetCode(asset_code);
      if (existingOffer) {
        return res.status(409).json({
          success: false,
          error: `Asset code "${asset_code}" is not available. Each asset code can only be used once.`,
        });
      }

      const companyId = req.user.companyId;
      let requestedBy = req.user.userId;

      // Resolve the admin CompanyUser created during registration
      // Mirrors the ghost-user lookup in authRoutes.js L190-191
      if (req.user.userType === 'company') {
        const adminUser = await prisma.companyUser.findFirst({
          where: { companyId, role: 'admin' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (!adminUser) {
          log.error(`[OfferController] No admin CompanyUser found for Company ${companyId}`);
          return res.status(400).json({
            success: false,
            error: 'No company admin user found. Please contact support.',
          });
        }
        requestedBy = adminUser.id;
      }

      // Processar uploads de arquivos para IPFS
      let legal_documents = {};

      // Se vieram arquivos via multipart/form-data
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          // O campo do formulário define o tipo (ex: 'matricula', 'laudo', 'contract')
          const docType = file.fieldname;

          const uploadResult = await ipfsService.uploadFile(
            file.buffer,
            file.originalname,
            {
              companyId,
              assetCode: asset_code,
              type: docType
            }
          );

          legal_documents[docType] = {
            hash: uploadResult.ipfsHash,
            fileName: file.originalname,
            uploadedAt: new Date().toISOString(),
            url: uploadResult.url
          };
        }
      } else if (req.body.legal_documents) {
        // Fallback para JSON se enviado diretamente (sem upload de arquivo)
        legal_documents = typeof req.body.legal_documents === 'string'
          ? JSON.parse(req.body.legal_documents)
          : req.body.legal_documents;
      }

      // Calcular LTV se não fornecido e temos valores
      let finalLTV = collateral_ltv;
      if (!finalLTV && collateral_value && total_supply) {
        finalLTV = (parseFloat(total_supply) / parseFloat(collateral_value)) * 100;
      }

      // USAR O SERVIÇO para criação centralizada com taxas
      const offer = await OfferService.createOffer({
        company_id: companyId,
        requested_by: requestedBy,
        asset_code: asset_code,
        offer_name: offer_name,
        description,
        total_supply: total_supply,
        unit_price: unit_price,
        annual_interest_rate: annual_interest_rate,
        offer_type,
        payment_type,
        maturity_date,
        bullet_payment_amount,
        payment_frequency,
        offer_rules,
        legal_documents,
        // Collateral
        collateral_type,
        collateral_description,
        collateral_value,
        collateral_ltv: finalLTV,
        // Phase 2: Asset Intelligence
        rental_yield_rate,
        value_growth_rate,
        latitude,
        longitude,
        location_address,
        asset_metadata: typeof asset_metadata === 'string' ? JSON.parse(asset_metadata) : (asset_metadata || {}),
      });

      res.status(201).json({
        success: true,
        data: OfferController.formatOfferForResponse(offer),
      });
    } catch (error) {
      log.error('Error creating offer:', error);

      // Return 400 for known validation errors from OfferService
      const validationPrefixes = ['Invalid payment fields', 'Invalid offer rules', 'Invalid asset_code', 'Total supply', 'Unit price', 'Asset code already'];
      const isValidationError = validationPrefixes.some(p => error.message.startsWith(p));

      res.status(isValidationError ? 400 : 500).json({
        success: false,
        error: isValidationError ? error.message : 'Failed to create offer',
        details: error.message,
      });
    }
  }

  /**
   * Lista ofertas da empresa (company_user)
   * GET /api/companies/offers
   */
  static async getCompanyOffers(req, res) {
    try {
      const companyId = req.user.companyId;
      const offers = await Offer.findByCompany(companyId);

      // Formatar ofertas com documentos IPFS
      const formattedOffers = offers.map(offer =>
        OfferController.formatOfferForResponse(offer)
      );

      res.json({
        success: true,
        data: formattedOffers,
      });
    } catch (error) {
      log.error('Error fetching company offers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch company offers',
        details: error.message,
      });
    }
  }

  /**
   * Busca detalhes de uma oferta específica
   * GET /api/companies/offers/:id
   */
  static async getOfferDetails(req, res) {
    try {
      const { id } = req.params;
      const offer = await Offer.findById(parseInt(id));

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      // Verificar acesso (company_user só vê suas próprias ofertas)
      // Check both role === 'company_user' (legacy) and userType === 'company' (direct company login)
      const isCompanyAccess = req.user.role === 'company_user' || req.user.userType === 'company';
      if (isCompanyAccess && offer.companyId !== req.user.companyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }
      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(offer),
      });
    } catch (error) {
      log.error('Error fetching offer details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch offer details',
        details: error.message,
      });
    }
  }

  /**
   * Atualiza oferta (company_user, apenas se pending_review)
   * PUT /api/companies/offers/:id
   */
  static async updateOffer(req, res) {
    try {
      const { id } = req.params;
      const offer = await Offer.findById(parseInt(id));

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      // Verificar acesso
      const isCompanyAccess = req.user.role === 'company_user' || req.user.userType === 'company';
      if (offer.companyId !== req.user.companyId && (!isCompanyAccess || offer.companyId !== req.user.companyId)) {
        // Double check because req.user.companyId might be set for both
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      // Só pode atualizar se estiver em pending_review
      if (offer.status !== 'pending_review') {
        return res.status(400).json({
          success: false,
          error: 'Can only update offers with status "pending_review"',
        });
      }

      const {
        offer_name,
        description,
        total_supply,
        annual_interest_rate,
        offer_rules,
        // Phase 2
        rental_yield_rate,
        value_growth_rate,
        latitude,
        longitude,
        location_address,
        asset_metadata,
        // Phase 3
        asset_stage,
      } = req.body;

      // Handle file uploads (merge with existing)
      let currentDocuments = typeof offer.legalDocuments === 'string'
        ? JSON.parse(offer.legalDocuments)
        : offer.legalDocuments || {};

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const docType = file.fieldname;
          try {
            const uploadResult = await ipfsService.uploadFile(
              file.buffer,
              file.originalname,
              {
                companyId: offer.companyId,
                assetCode: offer.assetCode, // Use existing asset code
                type: docType
              }
            );

            currentDocuments[docType] = {
              hash: uploadResult.ipfsHash,
              fileName: file.originalname,
              uploadedAt: new Date().toISOString(),
              url: uploadResult.url
            };
          } catch (uploadError) {
            log.error(`Failed to upload ${docType}:`, uploadError);
            // Decide if we abort or continue. For now, log and ensure partial success or fail hard?
            // Let's fail hard to ensure data integrity
            throw new Error(`Failed to upload document: ${file.originalname}`);
          }
        }
      }

      // Handle numeric updates
      let updatedTotalSupply = total_supply;
      if (updatedTotalSupply) updatedTotalSupply = parseFloat(updatedTotalSupply);

      let updatedInterestRate = annual_interest_rate;
      if (updatedInterestRate) updatedInterestRate = parseFloat(updatedInterestRate);

      // Handle offer rules parsing
      let updatedRules = offer_rules;
      if (typeof updatedRules === 'string') {
        try {
          updatedRules = JSON.parse(updatedRules);
        } catch (e) {
          // If parse fails, ignore or keep existing? Let's assume partial updates might send strings
          log.warn('Failed to parse offer_rules string:', e);
        }
      }

      // Automatically reset status to 'pending_review' if it was 'rejected'
      // This allows the admin to review the corrections
      let newStatus = offer.status;
      if (offer.status === 'rejected' || offer.status === 'pending_review') {
        newStatus = 'pending_review';
      }

      const updatedOffer = await Offer.update(parseInt(id), {
        offer_name,
        description,
        total_supply: updatedTotalSupply,
        annual_interest_rate: updatedInterestRate,
        offer_rules: updatedRules,
        legal_documents: currentDocuments,
        status: newStatus,
        updatedAt: new Date(),
        // Phase 2 + 3
        rental_yield_rate,
        value_growth_rate,
        latitude,
        longitude,
        location_address,
        asset_metadata,
        asset_stage,
      });

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
      });
    } catch (error) {
      log.error('Error fetching file uploads:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update offer',
        details: error.message,
      });
    }
  }

  /**
   * Lista investidores de uma oferta (Cap Table)
   * GET /api/companies/offers/:id/investors
   */
  static async getOfferInvestors(req, res) {
    try {
      const { id } = req.params;
      const offer = await Offer.findById(parseInt(id));

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      // Check ownership (skip for admin)
      const isCompanyAccess = req.user.role === 'company_user' || req.user.userType === 'company';
      if (isCompanyAccess && offer.companyId !== req.user.companyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      const investors = await OfferService.getOfferInvestors(parseInt(id));

      res.json({
        success: true,
        data: investors,
      });
    } catch (error) {
      log.error('Error fetching offer investors:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch offer investors',
        details: error.message,
      });
    }
  }

  /**
   * Lista ofertas ativas (público/investidores)
   * GET /api/offers/active
   */
  static async getActiveOffers(req, res) {
    try {
      const { limit = 100, offset = 0, offer_type } = req.query;

      const offers = await Offer.findAllActive(
        parseInt(limit),
        parseInt(offset),
        offer_type || null
      );

      // Compute tokens_sold for each offer in parallel
      const tokensSoldMap = await Promise.all(
        offers.map(async (offer) => {
          const sold = await Investment.getTokensSoldByOffer(offer.id);
          return { id: offer.id, sold };
        })
      );
      const soldLookup = Object.fromEntries(tokensSoldMap.map(e => [e.id, e.sold]));

      // Fetch cutoff from config
      const cutoffDays = await ConfigService.getFloat('MATURITY_CUTOFF_DAYS', 7);

      // Formatar ofertas com documentos IPFS + supply data
      const formattedOffers = offers.map(offer => {
        offer._tokensSold = soldLookup[offer.id] || 0;
        return OfferController.formatOfferForResponse(offer, cutoffDays);
      });

      res.json({
        success: true,
        data: formattedOffers,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      log.error('Error fetching active offers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch active offers',
        details: error.message,
      });
    }
  }

  /**
   * Busca detalhes de oferta pública (com IPFS)
   * GET /api/offers/:id
   */
  static async getPublicOfferDetails(req, res) {
    try {
      const { id } = req.params;
      const offer = await Offer.findById(parseInt(id));

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      // Só retornar se estiver ativa ou se for admin/company_user
      if (offer.status !== 'active' &&
        req.user?.role !== 'platform_admin' &&
        req.user?.role !== 'company_user' &&
        req.user?.userType !== 'company') {
        return res.status(403).json({
          success: false,
          error: 'Offer is not active',
        });
      }

      // Compute tokens_sold for this offer
      offer._tokensSold = await Investment.getTokensSoldByOffer(offer.id);
      const cutoffDays = await ConfigService.getFloat('MATURITY_CUTOFF_DAYS', 7);

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(offer, cutoffDays),
      });
    } catch (error) {
      log.error('Error fetching public offer details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch offer details',
        details: error.message,
      });
    }
  }

  /**
   * Lista todas as ofertas (platform_admin)
   * GET /api/admin/offers
   */
  static async getAllOffers(req, res) {
    try {
      const { limit = 100, offset = 0, status, company_id } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (company_id) filters.companyId = parseInt(company_id);

      const offers = await Offer.findAll(
        parseInt(limit),
        parseInt(offset),
        filters.status || null,
        filters.companyId || null
      );

      // Formatar ofertas com documentos IPFS
      const formattedOffers = offers.map(offer =>
        OfferController.formatOfferForResponse(offer)
      );

      res.json({
        success: true,
        data: formattedOffers,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      log.error('Error fetching all offers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch offers',
        details: error.message,
      });
    }
  }

  /**
   * Revisa oferta (platform_admin)
   * PUT /api/admin/offers/:id/review
   */
  static async reviewOffer(req, res) {
    try {
      const { id } = req.params;
      const { status, rejection_reason, investor_rate } = req.body;

      if (!status || !['approved', 'rejected', 'under_review'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Must be: approved, rejected, or under_review',
        });
      }

      if (status === 'rejected' && !rejection_reason) {
        return res.status(400).json({
          success: false,
          error: 'Rejection reason is required when rejecting an offer',
        });
      }

      // Validate investorRate against annualInterestRate before persisting
      if (status === 'approved' && investor_rate != null) {
        const offer = await Offer.findById(parseInt(id));
        if (offer) {
          const annualRate = parseFloat(offer.annualInterestRate || 0);
          const parsedInvestorRate = parseFloat(investor_rate);
          if (parsedInvestorRate < 0) {
            return res.status(400).json({
              success: false,
              error: 'Investor rate cannot be negative',
            });
          }
          if (parsedInvestorRate > annualRate) {
            return res.status(400).json({
              success: false,
              error: `Investor rate (${parsedInvestorRate}%) cannot exceed annual interest rate (${annualRate}%)`,
            });
          }
          const spreadRatio = computeSpreadRatio(annualRate, parsedInvestorRate);
          try {
            validateYieldSpreadRatio(spreadRatio, annualRate, parsedInvestorRate);
          } catch (spreadErr) {
            return res.status(spreadErr.httpStatus || 400).json({
              success: false,
              error: spreadErr.message,
              code: spreadErr.code,
            });
          }
        }
      }

      const reviewedBy = req.user.userId;
      let updatedOffer = await Offer.updateStatus(
        parseInt(id),
        status,
        reviewedBy,
        rejection_reason
      );

      // Persist investorRate on approval (yield spread = annualRate - investorRate)
      if (status === 'approved' && investor_rate != null) {
        updatedOffer = await prisma.offer.update({
          where: { id: parseInt(id) },
          data: { investorRate: parseFloat(investor_rate) },
        });
        log.info(`[reviewOffer] Set investorRate=${investor_rate}% for offer ${id}`);
      }

      // Any COLLATERAL offer with a maturityDate requires a MaturitySettlement contract:
      //   - Bullet: full payout (principal + interest) at maturity, via Settlement contract.
      //   - Periodic (monthly/quarterly/semi_annual/annual): principal return at maturity,
      //     via the same Settlement contract (interest already paid during).
      // We mark it here; UI shows a "Deploy Settlement" call-to-action until completed.
      // The actual deploy + initialize is admin-driven (uses existing /admin/offers/:id/deploy-settlement
      // and /admin/offers/:id/init-settlement endpoints). On mark-defaulted, we validate it exists.
      if (status === 'approved' && updatedOffer && updatedOffer.offerType === 'collateral' && updatedOffer.maturityDate) {
        const currentRules = typeof updatedOffer.offerRules === 'string'
          ? JSON.parse(updatedOffer.offerRules)
          : updatedOffer.offerRules || {};
        updatedOffer = await prisma.offer.update({
          where: { id: parseInt(id) },
          data: {
            offerRules: { ...currentRules, requires_settlement_deploy: true },
          },
        });
        log.info(`[reviewOffer] Marked offer ${id} as requires_settlement_deploy (${updatedOffer.paymentType} collateral with maturity)`);
      }

      if (!updatedOffer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      // Send notification to company
      const company = await Company.findById(updatedOffer.companyId);
      if (company) {
        const { EmailService } = await import('../services/email.service.js');
        await EmailService.sendOfferStatusUpdate(
          company.email,
          company.name,
          updatedOffer.offerName,
          status,
          rejection_reason
        );
      }

      // ─── Auto-issue on approval: create Token DB + queue SAC deploy ───
      let autoIssueResult = null;
      if (status === 'approved') {
        try {
          const issuerPublicKey = process.env.STELLAR_ISSUER_PUBLIC_KEY || process.env.ISSUER_PUBLIC_KEY;
          if (issuerPublicKey) {
            const { StellarService } = await import('../services/stellar.service.js');

            // Create Token DB record
            const token = await OfferService.issueTokenFromOffer(
              parseInt(id),
              req.user.userId,
              issuerPublicKey
            );
            log.info(`[reviewOffer] Auto-issued token for ${updatedOffer.assetCode} (id=${token.id})`);

            // Deploy SAC via multisig (chains the entire pipeline)
            const sacResult = await StellarService.deploySACForAsset(
              updatedOffer.assetCode,
              issuerPublicKey,
              {
                offerId: parseInt(id),
                tokenId: token.id,
                assetCode: updatedOffer.assetCode,
                autoVerifyOffer: true,
              }
            );

            autoIssueResult = {
              tokenId: token.id,
              sacContractId: sacResult.sacContractId,
              multiSigTransactionId: sacResult.multiSigTransactionId,
              status: sacResult.status,
            };
            log.info(`[reviewOffer] SAC deploy queued for ${updatedOffer.assetCode}`);
          }
        } catch (issueErr) {
          log.warn(`[reviewOffer] Auto-issue failed: ${issueErr.message}. Admin can issue manually.`);
          autoIssueResult = { error: issueErr.message };
        }
      }

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
        autoIssueResult,
      });
    } catch (error) {
      log.error('Error reviewing offer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to review offer',
        details: error.message,
      });
    }
  }

  /**
   * Adiciona notas de due diligence (platform_admin)
   * POST /api/admin/offers/:id/due-diligence
   */
  static async addDueDiligenceNotes(req, res) {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      if (!notes) {
        return res.status(400).json({
          success: false,
          error: 'Notes are required',
        });
      }

      const updatedOffer = await Offer.addDueDiligenceNotes(parseInt(id), notes);

      if (!updatedOffer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
      });
    } catch (error) {
      log.error('Error adding due diligence notes:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add due diligence notes',
        details: error.message,
      });
    }
  }

  /**
   * Emite token a partir de uma oferta aprovada (platform_admin)
   * POST /api/admin/offers/:id/issue
   */
  static async issueTokenFromOffer(req, res) {
    try {
      const { id } = req.params;
      const offer = await Offer.findById(parseInt(id));

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      if (offer.status !== 'approved') {
        return res.status(400).json({
          success: false,
          error: 'Offer must be approved before issuing token',
        });
      }

      // Verificar se token já foi emitido
      const existingToken = await Token.findByAssetCode(offer.assetCode);
      if (existingToken) {
        return res.status(409).json({
          success: false,
          error: 'Token already issued for this offer',
        });
      }

      // PHASE 2.4: Prevent duplicate proposals in queue
      const pendingTx = await prisma.multiSigTransaction.findFirst({
        where: {
          operationType: { in: ['token_issue', 'sac_deploy'] },
          status: 'pending',
          metadata: {
            path: ['assetCode'],
            equals: offer.assetCode
          }
        }
      });
      if (pendingTx) {
        return res.status(409).json({
          success: false,
          error: 'An issuance proposal for this asset code is already pending in the multisig queue.',
          data: { proposalId: pendingTx.id }
        });
      }

      const issuerPublicKey = process.env.STELLAR_ISSUER_PUBLIC_KEY || process.env.ISSUER_PUBLIC_KEY;
      if (!issuerPublicKey) {
        return res.status(500).json({
          success: false,
          error: 'Stellar issuer public key not configured',
        });
      }

      // ─── Sale-bound offers: skip useless token_issue TX ───
      // With forSaleContract, the classic TX only re-asserts flags (no-op).
      // Instead: create Token DB record directly → deploy SAC via multisig.
      // This eliminates 1 Freighter sign from the pipeline.

      // 1. Create Token DB record directly
      const token = await OfferService.issueTokenFromOffer(
        offer.id,
        req.user.userId,
        issuerPublicKey
      );
      log.info(`[issueToken] Token DB record created for ${offer.assetCode} (id=${token.id})`);

      // 2. Deploy SAC via multisig (still requires Freighter sign)
      const sacResult = await StellarService.deploySACForAsset(
        offer.assetCode,
        issuerPublicKey,
        {
          offerId: offer.id,
          tokenId: token.id,
          assetCode: offer.assetCode,
          autoVerifyOffer: true,
        }
      );

      if (sacResult.status === 'pending_multisig') {
        return res.status(202).json({
          success: true,
          status: 'pending_multisig',
          message: 'SAC deployment queued for approval — sign to continue the issuance pipeline',
          data: {
            multiSigTransactionId: sacResult.multiSigTransactionId,
            sacContractId: sacResult.sacContractId,
            tokenId: token.id,
            assetCode: offer.assetCode,
          },
        });
      }

      // Env mode (direct signing): SAC deployed immediately, update token record
      if (sacResult.sacContractId) {
        const prisma = (await import('../config/prisma.js')).default;
        await prisma.token.update({
          where: { id: token.id },
          data: { sacContractId: sacResult.sacContractId },
        });
      }

      // Auto-verify the offer
      const prismaClient = (await import('../config/prisma.js')).default;
      const currentRules = typeof offer.offerRules === 'string'
        ? JSON.parse(offer.offerRules)
        : offer.offerRules || {};
      await prismaClient.offer.update({
        where: { id: offer.id },
        data: {
          offerRules: {
            ...currentRules,
            admin_verified: true,
            verified_at: new Date().toISOString(),
          },
        },
      });

      res.status(201).json({
        success: true,
        data: {
          token,
          sacContractId: sacResult.sacContractId,
        },
      });
    } catch (error) {
      log.error('Error issuing token from offer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to issue token',
        details: error.message,
      });
    }
  }

  /**
   * Ativa oferta após token emitido (platform_admin)
   * POST /api/admin/offers/:id/activate
   */
  static async activateOffer(req, res) {
    try {
      const { id } = req.params;
      const offer = await Offer.findById(parseInt(id));

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      // Ativar usando o serviço
      const updatedOffer = await OfferService.activateOffer(parseInt(id));

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
      });
    } catch (error) {
      log.error('Error activating offer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to activate offer',
        details: error.message,
      });
    }
  }

  /**
   * Retry Soroban init for a failed sale offer (platform_admin)
   * POST /api/admin/offers/:id/retry-soroban
   */
  static async retrySorobanInit(req, res) {
    try {
      const { id } = req.params;
      const updatedOffer = await OfferService.retrySorobanInit(parseInt(id));

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
        message: 'Soroban deployment retried — check approval hub for signing',
      });
    } catch (error) {
      log.error('Error retrying Soroban init:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry Soroban init',
        details: error.message,
      });
    }
  }
  /**
   * Ativa oferta pelo próprio owner (company_user)
   * POST /api/companies/offers/:id/activate
   */
  static async activateCompanyOffer(req, res) {
    try {
      const { id } = req.params;
      const offer = await Offer.findById(parseInt(id));

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      // Check ownership
      const isCompanyAccess = req.user.role === 'company_user' || req.user.userType === 'company';
      if (isCompanyAccess && offer.companyId !== req.user.companyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      if (offer.status === 'active') {
        return res.status(400).json({
          success: false,
          error: 'Offer is already active',
        });
      }

      // Must have token issued
      if (!offer.token && (!offer.tokens || offer.tokens.length === 0)) {
        return res.status(400).json({
          success: false,
          error: 'Cannot activate offer: Token not yet issued',
        });
      }

      // Check for Admin Verification (stored in offerRules)
      const offerRules = typeof offer.offerRules === 'string'
        ? JSON.parse(offer.offerRules)
        : offer.offerRules || {};

      if (!offerRules.admin_verified) {
        return res.status(400).json({
          success: false,
          error: 'Offer is pending final admin verification',
        });
      }

      // Ativar usando o serviço
      const updatedOffer = await OfferService.activateOffer(parseInt(id));

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
      });
    } catch (error) {
      log.error('Error activating offer by company:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to activate offer',
        details: error.message,
      });
    }
  }

  /**
   * Verifica a emissão do token e habilita o launch para a empresa (platform_admin)
   * POST /api/admin/offers/:id/verify
   */
  static async verifyOfferIssuance(req, res) {
    try {
      const { id } = req.params;
      const offer = await Offer.findById(parseInt(id));

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: 'Offer not found',
        });
      }

      if (offer.status !== 'approved') {
        return res.status(400).json({
          success: false,
          error: 'Offer must be approved',
        });
      }

      // Ensure token is issued
      const token = await Token.findByAssetCode(offer.assetCode);
      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token must be issued before verification',
        });
      }

      // Update offerRules with admin_verified flag
      let offerRules = typeof offer.offerRules === 'string'
        ? JSON.parse(offer.offerRules)
        : offer.offerRules || {};

      offerRules = { ...offerRules, admin_verified: true, verified_at: new Date().toISOString() };

      const updatedOffer = await Offer.updateOfferRules(parseInt(id), offerRules);

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
      });
    } catch (error) {
      log.error('Error verifying offer issuance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify offer',
        details: error.message,
      });
    }
  }
}

