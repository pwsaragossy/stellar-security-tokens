import prisma from './config/prisma.js';
import bcrypt from 'bcrypt';

/**
 * Modelo para gerenciar administradores da plataforma usando Prisma
 */
export class PlatformAdmin {
  /**
   * Cria um novo administrador da plataforma
   * @param {Object} adminData - Dados do administrador
   * @param {string} adminData.email - Email do admin (único)
   * @param {string} adminData.password - Senha do admin (será hasheada)
   * @param {string} adminData.name - Nome do admin
   * @param {string} [adminData.stellarPublicKey] - Chave pública Stellar (opcional, 56 caracteres)
   * @param {string} [adminData.role='admin'] - Role do admin
   * @returns {Promise<Object>} Admin criado (sem password_hash)
   * @throws {Error} Se email já existir ou stellarPublicKey inválido
   */
  static async create(adminData) {
    const {
      email,
      password,
      name,
      stellarPublicKey,
      role = 'admin',
    } = adminData;

    // Validar formato da chave Stellar (56 caracteres, começando com G) apenas se fornecida
    if (stellarPublicKey && !/^G[A-Z0-9]{55}$/.test(stellarPublicKey)) {
      throw new Error('stellarPublicKey deve ter 56 caracteres e começar com G');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return await prisma.platformAdmin.create({
      data: {
        email,
        passwordHash,
        name,
        stellarPublicKey: stellarPublicKey || null,
        role: role.toLowerCase(),
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        stellarPublicKey: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Busca admin por ID
   * @param {number} id - ID do admin
   * @returns {Promise<Object|null>} Admin encontrado ou null
   */
  static async findById(id) {
    return await prisma.platformAdmin.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        stellarPublicKey: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Busca admin por email
   * @param {string} email - Email do admin
   * @returns {Promise<Object|null>} Admin encontrado (inclui password_hash) ou null
   */
  static async findByEmail(email) {
    return await prisma.platformAdmin.findUnique({
      where: { email },
    });
  }

  /**
   * Lista todos os administradores
   * @param {number} [limit=100] - Número máximo de resultados
   * @param {number} [offset=0] - Número de registros a pular
   * @returns {Promise<Array>} Array de administradores
   */
  static async findAll(limit = 100, offset = 0) {
    return await prisma.platformAdmin.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        stellarPublicKey: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Autentica admin com email e senha
   * @param {string} email - Email do admin
   * @param {string} password - Senha do admin
   * @returns {Promise<Object|null>} Admin autenticado (sem password_hash) ou null
   */
  static async authenticate(email, password) {
    const admin = await this.findByEmail(email);
    if (!admin || !admin.passwordHash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid) {
      return null;
    }

    if (!admin.isActive) {
      return null;
    }

    // Retornar sem password_hash
    const { passwordHash, ...adminWithoutPassword } = admin;
    return adminWithoutPassword;
  }

  /**
   * Atualiza senha do admin
   * @param {number} id - ID do admin
   * @param {string} newPassword - Nova senha
   * @returns {Promise<boolean>} True se atualizado com sucesso
   */
  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    try {
      await prisma.platformAdmin.update({
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
   * Atualiza dados do admin
   * @param {number} id - ID do admin
   * @param {Object} adminData - Dados a atualizar
   * @returns {Promise<Object|null>} Admin atualizado ou null
   */
  static async update(id, adminData) {
    const { name, role, is_active } = adminData;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role.toLowerCase();
    if (is_active !== undefined) updateData.isActive = is_active;

    if (Object.keys(updateData).length === 0) {
      return await this.findById(id);
    }

    try {
      return await prisma.platformAdmin.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          stellarPublicKey: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
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
