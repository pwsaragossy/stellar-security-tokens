import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';

/**
 * Modelo para gerenciar investidores no banco de dados usando Prisma
 */
export class Investor {
  /**
   * DEPRECATED: Use PasskeyWalletService.createSmartWallet and direct Prisma calls instead.
   * Traditional investor creation is no longer supported.
   * 
   * For passkey-based registration:
   * 1. Create investor record with email, name, document (no stellarPublicKey)
   * 2. Send email verification
   * 3. After verification, create passkey and smart wallet via PasskeyWalletService
   * 4. Update investor with stellarContractId, passkeyCredentialId, passkeyPublicKey
   */
  static async create() {
    throw new Error('Investor.create() is deprecated. Use passkey registration flow instead.');
  }


  /**
   * Busca investidor por ID
   * @param {number} id - ID do investidor
   * @returns {Promise<Object|null>} Investidor encontrado ou null
   */
  static async findById(id) {
    return await prisma.investor.findUnique({
      where: { id },
    });
  }

  /**
   * Busca investidor por email
   * @param {string} email - Email do investidor
   * @returns {Promise<Object|null>} Investidor encontrado ou null
   */
  static async findByEmail(email) {
    return await prisma.investor.findUnique({
      where: { email },
    });
  }

  /**
   * Busca investidor por documento (CPF/CNPJ)
   * @param {string} document - Documento do investidor
   * @returns {Promise<Object|null>} Investidor encontrado ou null
   */
  static async findByDocument(document) {
    return await prisma.investor.findUnique({
      where: { document },
    });
  }

  /**
   * DEPRECATED: Use findByStellarContractId instead for smart wallet lookups
   * @param {string} stellarPublicKey - Legacy Stellar public key
   * @returns {Promise<Object|null>} Investor found or null
   */
  static async findByStellarPublicKey(stellarPublicKey) {
    return await prisma.investor.findFirst({
      where: { stellarPublicKey },
    });
  }

  /**
   * Busca investidor por contract ID (smart wallet address)
   * @param {string} stellarContractId - Smart wallet contract address (56 characters)
   * @returns {Promise<Object|null>} Investidor encontrado ou null
   */
  static async findByStellarContractId(stellarContractId) {
    return await prisma.investor.findFirst({
      where: { stellarContractId },
    });
  }

  /**
   * Lista todos os investidores com paginação
   * @param {number} [limit=100] - Número máximo de resultados
   * @param {number} [offset=0] - Número de registros a pular
   * @returns {Promise<Array>} Array de investidores ordenados por data de criação (mais recentes primeiro)
   */
  static async findAll(limit = 100, offset = 0) {
    return await prisma.investor.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Atualiza dados de um investidor
   * Apenas campos fornecidos serão atualizados
   * @param {number} id - ID do investidor
   * @param {Object} investorData - Dados a atualizar (campos opcionais)
   * @param {string} [investorData.name] - Novo nome
   * @param {string} [investorData.email] - Novo email
   * @param {string} [investorData.document] - Novo documento
   * @param {string} [investorData.stellarPublicKey] - Nova chave pública
   * @param {string} [investorData.kycStatus] - Novo status KYC
   * @returns {Promise<Object|null>} Investidor atualizado ou null se não encontrado
   */
  static async update(id, investorData) {
    const { name, email, document, stellarPublicKey, kycStatus } = investorData;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (document !== undefined) updateData.document = document;
    if (stellarPublicKey !== undefined) updateData.stellarPublicKey = stellarPublicKey;
    if (kycStatus !== undefined) updateData.kycStatus = kycStatus.toLowerCase();

    if (Object.keys(updateData).length === 0) {
      return await this.findById(id);
    }

    try {
      return await prisma.investor.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        // Record not found
        return null;
      }
      throw error;
    }
  }

  /**
   * Remove um investidor do banco de dados
   * @param {number} id - ID do investidor
   * @returns {Promise<Object|null>} Investidor removido ou null se não encontrado
   */
  static async delete(id) {
    try {
      return await prisma.investor.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        // Record not found
        return null;
      }
      throw error;
    }
  }

  /**
   * Autentica investidor com email e senha
   * @param {string} email - Email do investidor
   * @param {string} password - Senha do investidor
   * @returns {Promise<Object|null>} Investidor autenticado (sem password_hash) ou null
   */
  static async authenticate(email, password) {
    const investor = await this.findByEmail(email);
    if (!investor || !investor.passwordHash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, investor.passwordHash);
    if (!isValid) {
      return null;
    }

    // Atualizar last_login
    await prisma.investor.update({
      where: { id: investor.id },
      data: { lastLogin: new Date() },
    });

    // Retornar sem password_hash
    const { passwordHash, ...investorWithoutPassword } = investor;
    return investorWithoutPassword;
  }

  /**
   * Atualiza senha do investidor
   * @param {number} id - ID do investidor
   * @param {string} newPassword - Nova senha
   * @returns {Promise<boolean>} True se atualizado com sucesso
   */
  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    try {
      await prisma.investor.update({
        where: { id },
        data: { passwordHash },
      });
      return true;
    } catch (error) {
      if (error.code === 'P2025') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Busca portfólio do investidor (tokens de múltiplas ofertas)
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Array>} Array com tokens e ofertas relacionadas
   */
  static async getPortfolio(investorId) {
    const distributions = await prisma.tokenDistribution.findMany({
      where: { investorId },
      include: {
        token: {
          include: {
            offer: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by asset and calculate totals
    const portfolioMap = new Map();
    for (const dist of distributions) {
      const assetCode = dist.assetCode;
      if (!portfolioMap.has(assetCode)) {
        portfolioMap.set(assetCode, {
          id: dist.token.id,
          assetCode: dist.token.assetCode,
          totalSupply: dist.token.totalSupply,
          issuedAt: dist.token.createdAt,
          offerId: dist.token.offer?.id || null,
          offerName: dist.token.offer?.offerName || null,
          description: dist.token.offer?.description || null,
          offerType: dist.token.offer?.offerType || null,
          annualInterestRate: dist.token.offer?.annualInterestRate || dist.token.annualInterestRate,
          offerStatus: dist.token.offer?.status || null,
          totalDistributed: 0,
        });
      }
      const entry = portfolioMap.get(assetCode);
      entry.totalDistributed = Number(entry.totalDistributed) + Number(dist.amount);
    }

    return Array.from(portfolioMap.values());
  }

  /**
   * Busca métricas consolidadas do portfólio
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Object>} Métricas consolidadas
   */
  static async getConsolidatedMetrics(investorId) {
    const [distributions, payments] = await Promise.all([
      prisma.tokenDistribution.findMany({
        where: { investorId },
        select: { assetCode: true, amount: true },
      }),
      prisma.interestPayment.findMany({
        where: {
          investorId,
          status: 'completed',
        },
        select: { usdcAmount: true },
      }),
    ]);

    const totalOffers = new Set(distributions.map(d => d.assetCode)).size;
    const totalInvested = distributions.reduce((sum, d) => sum + Number(d.amount), 0);
    const totalInterestReceived = payments.reduce((sum, p) => sum + Number(p.usdcAmount), 0);

    return {
      totalOffers,
      totalInvested,
      totalInterestReceived,
      totalPayments: payments.length,
    };
  }
}
