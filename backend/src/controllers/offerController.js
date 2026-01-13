import { Offer } from '../models/Offer.js';
import { Company } from '../models/Company.js';
import { Token } from '../models/Token.js';
import { StellarService } from '../services/stellar.service.js';
import { OfferService } from '../services/offer.service.js';
import { ipfsService } from '../services/ipfs.service.js';
import { StellarTomlService } from '../services/stellarToml.service.js';
import { CompanyUser } from '../models/CompanyUser.js';
import { Keypair } from '@stellar/stellar-sdk';

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
  static formatOfferForResponse(offer) {
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
      offerType: offer.offerType,
      offer_type: offer.offerType,
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
      // Formatted JSONB fields
      legalDocuments: OfferController.formatLegalDocuments(legalDocuments),
      legal_documents: OfferController.formatLegalDocuments(legalDocuments),
      offerRules: offerRules,
      offer_rules: offerRules,
    };
  }

  /**
   * Obtém a taxa de emissão de token (público/opcional)
   * GET /api/offers/fees
   */
  static async getIssuanceFee(req, res) {
    try {
      const fee = await OfferService.getIssuanceFee();
      res.json({
        success: true,
        data: {
          issuanceFee: fee,
          currency: 'USDC', // Configurable? currently assumed
        },
      });
    } catch (error) {
      console.error('Error fetching issuance fee:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch issuance fee',
      });
    }
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
      } = req.body;

      // Converter campos numéricos vindos de multipart/form-data (strings)
      if (total_supply) total_supply = parseFloat(total_supply);
      if (annual_interest_rate) annual_interest_rate = parseFloat(annual_interest_rate);
      if (bullet_payment_amount) bullet_payment_amount = parseFloat(bullet_payment_amount);
      if (payment_frequency) payment_frequency = parseInt(payment_frequency, 10);
      if (collateral_ltv) collateral_ltv = parseFloat(collateral_ltv);

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
          error: 'Asset code already exists',
        });
      }

      const companyId = req.user.companyId;
      let requestedBy = req.user.userId;

      // Fix for Foreign Key violation when logged in as Company (userType='company')
      // The 'requested_by' field must point to a valid record in 'company_users' table,
      // but 'req.user.userId' is the Company ID (from companies table) in this case.
      if (req.user.userType === 'company') {
        const companyUsers = await CompanyUser.findByCompany(companyId); // Get users sorted by createdAt desc
        if (companyUsers && companyUsers.length > 0) {
          // Use the most recent user (or first found) as the proxy requester
          requestedBy = companyUsers[0].id;
        } else {
          // Create a default admin user for this company if none exists (Lazy creation)
          try {
            const randomKeypair = Keypair.random();
            const newUser = await CompanyUser.create({
              company_id: companyId,
              email: `admin+${companyId}@system.local`, // System generated email
              password: randomKeypair.secret(), // Random password
              name: 'Company Admin (System)',
              stellarPublicKey: randomKeypair.publicKey(),
              role: 'admin'
            });
            requestedBy = newUser.id;
            console.log(`[OfferController] Created system user for Company ${companyId}: ID ${newUser.id}`);
          } catch (err) {
            console.error('[OfferController] Failed to create system user:', err);
            return res.status(400).json({
              success: false,
              error: 'Cannot create offer: No company users found and failed to create default user.',
              details: err.message
            });
          }
        }
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
        asset_code,
        offer_name,
        description,
        total_supply,
        annual_interest_rate,
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
      });

      res.status(201).json({
        success: true,
        data: OfferController.formatOfferForResponse(offer),
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create offer',
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
      console.error('Error fetching company offers:', error);
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
      if (req.user.role === 'company_user' && offer.companyId !== req.user.companyId) {
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
      console.error('Error fetching offer details:', error);
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
      if (offer.companyId !== req.user.companyId) {
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
            console.error(`Failed to upload ${docType}:`, uploadError);
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
          console.warn('Failed to parse offer_rules string:', e);
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
        status: newStatus, // Reset status to prompt re-review
        updatedAt: new Date(),
      });

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
      });
    } catch (error) {
      console.error('Error fetching file uploads:', error);
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
      if (req.user.role === 'company_user' && offer.companyId !== req.user.companyId) {
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
      console.error('Error fetching offer investors:', error);
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
      console.error('Error fetching active offers:', error);
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
        req.user?.role !== 'company_user') {
        return res.status(403).json({
          success: false,
          error: 'Offer is not active',
        });
      }

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(offer),
      });
    } catch (error) {
      console.error('Error fetching public offer details:', error);
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
      console.error('Error fetching all offers:', error);
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
      const { status, rejection_reason } = req.body;

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

      const reviewedBy = req.user.userId;
      const updatedOffer = await Offer.updateStatus(
        parseInt(id),
        status,
        reviewedBy,
        rejection_reason
      );

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

      res.json({
        success: true,
        data: OfferController.formatOfferForResponse(updatedOffer),
      });
    } catch (error) {
      console.error('Error reviewing offer:', error);
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
      console.error('Error adding due diligence notes:', error);
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

      // Emitir token usando o serviço
      const issuerPublicKey = process.env.STELLAR_ISSUER_PUBLIC_KEY;
      if (!issuerPublicKey) {
        return res.status(500).json({
          success: false,
          error: 'Stellar issuer public key not configured',
        });
      }

      // Verificar documentos IPFS
      const legalDocuments = offer.legalDocuments || {};
      // Skip IPFS validation for now, focus on upload functionality

      // Configurar home domain se disponível
      const homeDomain = process.env.STELLAR_HOME_DOMAIN || null;

      // Emitir token no Stellar com home domain
      const tokenResult = await StellarService.issueSecurityToken(
        offer.assetCode,
        offer.totalSupply.toString(),
        { homeDomain }
      );

      // Criar registro no banco usando o serviço
      const token = await OfferService.issueTokenFromOffer(
        offer.id,
        req.user.userId,
        issuerPublicKey
      );

      // Se home domain configurado e documentos IPFS existem, gerar stellar.toml
      if (homeDomain && Object.keys(legalDocuments).length > 0) {
        try {
          const tomlContent = StellarTomlService.generateToml({
            code: offer.assetCode,
            issuer: issuerPublicKey,
            name: offer.offerName,
            description: offer.description,
            ipfsDocuments: legalDocuments,
            conditions: {
              annual_interest_rate: offer.annualInterestRate,
              ...offer.offerRules,
            },
          });

          // TODO: Salvar stellar.toml no servidor web configurado no home_domain
          // Por enquanto, apenas logamos
          console.log(`Stellar.toml content for ${offer.assetCode}:`, tomlContent);
        } catch (error) {
          console.warn('Failed to generate stellar.toml:', error.message);
        }
      }

      res.status(201).json({
        success: true,
        data: {
          token,
          stellar_transaction: tokenResult,
        },
      });
    } catch (error) {
      console.error('Error issuing token from offer:', error);
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
      console.error('Error activating offer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to activate offer',
        details: error.message,
      });
    }
  }
}

