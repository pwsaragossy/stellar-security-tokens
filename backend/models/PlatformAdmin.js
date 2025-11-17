import { query } from '../config/database.js';
import bcrypt from 'bcrypt';

/**
 * Modelo para gerenciar administradores da plataforma
 */
export class PlatformAdmin {
  /**
   * Cria um novo administrador da plataforma
   * @param {Object} adminData - Dados do administrador
   * @param {string} adminData.email - Email do admin (único)
   * @param {string} adminData.password - Senha do admin (será hasheada)
   * @param {string} adminData.name - Nome do admin
   * @param {string} adminData.stellarPublicKey - Chave pública Stellar (obrigatória, 56 caracteres)
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

    if (!stellarPublicKey) {
      throw new Error('stellarPublicKey é obrigatório para criar um administrador');
    }
    
    // Validar formato da chave Stellar (56 caracteres, começando com G)
    if (!/^G[A-Z0-9]{55}$/.test(stellarPublicKey)) {
      throw new Error('stellarPublicKey deve ter 56 caracteres e começar com G');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO platform_admins (email, password_hash, name, stellar_public_key, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
       RETURNING id, email, name, stellar_public_key, role, is_active, created_at, updated_at`,
      [email, passwordHash, name, stellarPublicKey, role]
    );

    return result.rows[0];
  }

  /**
   * Busca admin por ID
   * @param {number} id - ID do admin
   * @returns {Promise<Object|null>} Admin encontrado ou null
   */
  static async findById(id) {
    const result = await query(
      'SELECT id, email, name, stellar_public_key, role, is_active, created_at, updated_at FROM platform_admins WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Busca admin por email
   * @param {string} email - Email do admin
   * @returns {Promise<Object|null>} Admin encontrado (inclui password_hash) ou null
   */
  static async findByEmail(email) {
    const result = await query(
      'SELECT * FROM platform_admins WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Lista todos os administradores
   * @param {number} [limit=100] - Número máximo de resultados
   * @param {number} [offset=0] - Número de registros a pular
   * @returns {Promise<Array>} Array de administradores
   */
  static async findAll(limit = 100, offset = 0) {
    const result = await query(
      'SELECT id, email, name, stellar_public_key, role, is_active, created_at, updated_at FROM platform_admins ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  /**
   * Autentica admin com email e senha
   * @param {string} email - Email do admin
   * @param {string} password - Senha do admin
   * @returns {Promise<Object|null>} Admin autenticado (sem password_hash) ou null
   */
  static async authenticate(email, password) {
    const admin = await this.findByEmail(email);
    if (!admin || !admin.password_hash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return null;
    }

    if (!admin.is_active) {
      return null;
    }

    // Atualizar last_login seria aqui, mas não temos esse campo ainda
    // Retornar sem password_hash
    const { password_hash, ...adminWithoutPassword } = admin;
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
    const result = await query(
      'UPDATE platform_admins SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, id]
    );
    return result.rowCount > 0;
  }

  /**
   * Atualiza dados do admin
   * @param {number} id - ID do admin
   * @param {Object} adminData - Dados a atualizar
   * @returns {Promise<Object|null>} Admin atualizado ou null
   */
  static async update(id, adminData) {
    const { name, role, is_active } = adminData;

    const fields = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (role !== undefined) {
      fields.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE platform_admins SET ${fields.join(', ')} WHERE id = $${paramCount} 
       RETURNING id, email, name, stellar_public_key, role, is_active, created_at, updated_at`,
      values
    );

    return result.rows[0] || null;
  }
}

