import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';

/**
 * Modelo para gerenciar usuários das empresas usando Prisma
 */
export class CompanyUser {
  /**
   * Cria um novo usuário da empresa
   * @param {Object} userData - Dados do usuário
   * @param {number} userData.company_id - ID da empresa
   * @param {string} userData.email - Email do usuário (único)
   * @param {string} userData.password - Senha do usuário (será hasheada)
   * @param {string} userData.name - Nome do usuário
   * @param {string} userData.stellarPublicKey - Chave pública Stellar (obrigatória, 56 caracteres)
   * @param {string} [userData.role='user'] - Role do usuário
   * @returns {Promise<Object>} Usuário criado (sem password_hash)
   * @throws {Error} Se email já existir ou stellarPublicKey inválido
   */
  static async create(userData) {
    const {
      company_id,
      email,
      password,
      name,
      stellarPublicKey,
      role = 'user',
    } = userData;

    if (!stellarPublicKey) {
      throw new Error('stellarPublicKey é obrigatório para criar um usuário da empresa');
    }

    // Validar formato da chave Stellar (56 caracteres, começando com G)
    if (!/^G[A-Z0-9]{55}$/.test(stellarPublicKey)) {
      throw new Error('stellarPublicKey deve ter 56 caracteres e começar com G');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return await prisma.companyUser.create({
      data: {
        companyId: company_id,
        email,
        passwordHash,
        name,
        stellarPublicKey,
        role: role.toLowerCase(),
        isActive: true,
      },
      select: {
        id: true,
        companyId: true,
        email: true,
        name: true,
        stellarPublicKey: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Busca usuário por ID
   * @param {number} id - ID do usuário
   * @returns {Promise<Object|null>} Usuário encontrado ou null
   */
  static async findById(id) {
    return await prisma.companyUser.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        email: true,
        name: true,
        stellarPublicKey: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Busca usuário por email
   * @param {string} email - Email do usuário
   * @returns {Promise<Object|null>} Usuário encontrado (inclui password_hash) ou null
   */
  static async findByEmail(email) {
    return await prisma.companyUser.findUnique({
      where: { email },
    });
  }

  /**
   * Busca usuários de uma empresa
   * @param {number} companyId - ID da empresa
   * @returns {Promise<Array>} Array de usuários
   */
  static async findByCompany(companyId) {
    return await prisma.companyUser.findMany({
      where: { companyId },
      select: {
        id: true,
        companyId: true,
        email: true,
        name: true,
        stellarPublicKey: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }



  /**
   * Atualiza dados do usuário
   * @param {number} id - ID do usuário
   * @param {Object} userData - Dados a atualizar
   * @returns {Promise<Object|null>} Usuário atualizado ou null
   */
  static async update(id, userData) {
    const { name, role, is_active } = userData;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role.toLowerCase();
    if (is_active !== undefined) updateData.isActive = is_active;

    if (Object.keys(updateData).length === 0) {
      return await this.findById(id);
    }

    try {
      return await prisma.companyUser.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          companyId: true,
          email: true,
          name: true,
          stellarPublicKey: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }
}
