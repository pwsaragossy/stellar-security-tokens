import prisma from '../config/prisma.js';

/**
 * Modelo para gerenciar empresas no banco de dados usando Prisma
 */
export class Company {
  /**
   * Cria uma nova empresa no banco de dados
   * @param {Object} companyData - Dados da empresa
   * @param {string} companyData.name - Nome da empresa
   * @param {string} companyData.cnpj - CNPJ da empresa (único)
   * @param {string} companyData.email - Email da empresa (único)
   * @param {string} companyData.legal_representative - Representante legal
   * @param {string} companyData.stellarPublicKey - Chave pública Stellar (obrigatória, 56 caracteres)
   * @param {string} [companyData.address] - Endereço
   * @param {string} [companyData.phone] - Telefone
   * @param {string} [companyData.status='pending'] - Status da empresa
   * @param {string} [companyData.kyc_status='pending'] - Status KYC
   * @param {Object} [companyData.kyc_documents] - Documentos KYC (JSONB)
   * @returns {Promise<Object>} Empresa criada
   * @throws {Error} Se houver violação de constraint (email/cnpj duplicado) ou stellarPublicKey inválido
   */
  static async create(companyData) {
    const {
      name,
      cnpj,
      email,
      legal_representative,
      stellarPublicKey,
      address,
      phone,
      status = 'pending',
      kyc_status = 'pending',
      kyc_documents = {},
    } = companyData;

    if (!stellarPublicKey) {
      throw new Error('stellarPublicKey é obrigatório para criar uma empresa');
    }
    
    // Validar formato da chave Stellar (56 caracteres, começando com G)
    if (!/^G[A-Z0-9]{55}$/.test(stellarPublicKey)) {
      throw new Error('stellarPublicKey deve ter 56 caracteres e começar com G');
    }

    return await prisma.company.create({
      data: {
        name,
        cnpj,
        email,
        legalRepresentative: legal_representative,
        stellarPublicKey,
        address: address || null,
        phone: phone || null,
        status: status.toLowerCase(),
        kycStatus: kyc_status.toLowerCase(),
        kycDocuments: kyc_documents,
      },
    });
  }

  /**
   * Busca empresa por ID
   * @param {number} id - ID da empresa
   * @returns {Promise<Object|null>} Empresa encontrada ou null
   */
  static async findById(id) {
    return await prisma.company.findUnique({
      where: { id },
    });
  }

  /**
   * Busca empresa por email
   * @param {string} email - Email da empresa
   * @returns {Promise<Object|null>} Empresa encontrada ou null
   */
  static async findByEmail(email) {
    return await prisma.company.findUnique({
      where: { email },
    });
  }

  /**
   * Busca empresa por CNPJ
   * @param {string} cnpj - CNPJ da empresa
   * @returns {Promise<Object|null>} Empresa encontrada ou null
   */
  static async findByCnpj(cnpj) {
    return await prisma.company.findUnique({
      where: { cnpj },
    });
  }

  /**
   * Lista todas as empresas com paginação
   * @param {number} [limit=100] - Número máximo de resultados
   * @param {number} [offset=0] - Número de registros a pular
   * @param {string} [status] - Filtrar por status (opcional)
   * @returns {Promise<Array>} Array de empresas
   */
  static async findAll(limit = 100, offset = 0, status = null) {
    const where = status ? { status: status.toLowerCase() } : {};
    
    return await prisma.company.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Atualiza dados de uma empresa
   * @param {number} id - ID da empresa
   * @param {Object} companyData - Dados a atualizar
   * @returns {Promise<Object|null>} Empresa atualizada ou null
   */
  static async update(id, companyData) {
    const {
      name,
      email,
      legal_representative,
      address,
      phone,
      status,
      kyc_status,
      kyc_documents,
    } = companyData;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (legal_representative !== undefined) updateData.legalRepresentative = legal_representative;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (status !== undefined) updateData.status = status.toLowerCase();
    if (kyc_status !== undefined) updateData.kycStatus = kyc_status.toLowerCase();
    if (kyc_documents !== undefined) updateData.kycDocuments = kyc_documents;

    if (Object.keys(updateData).length === 0) {
      return await this.findById(id);
    }

    try {
      return await prisma.company.update({
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
   * Atualiza status da empresa
   * @param {number} id - ID da empresa
   * @param {string} status - Novo status
   * @returns {Promise<Object|null>} Empresa atualizada ou null
   */
  static async updateStatus(id, status) {
    try {
      return await prisma.company.update({
        where: { id },
        data: { status: status.toLowerCase() },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }
}
