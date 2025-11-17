import { query } from '../config/database.js';
import bcrypt from 'bcrypt';

/**
 * Modelo para gerenciar usuários das empresas
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

    const result = await query(
      `INSERT INTO company_users (company_id, email, password_hash, name, stellar_public_key, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
       RETURNING id, company_id, email, name, stellar_public_key, role, is_active, created_at`,
      [company_id, email, passwordHash, name, stellarPublicKey, role]
    );

    return result.rows[0];
  }

  /**
   * Busca usuário por ID
   * @param {number} id - ID do usuário
   * @returns {Promise<Object|null>} Usuário encontrado ou null
   */
  static async findById(id) {
    const result = await query(
      'SELECT id, company_id, email, name, stellar_public_key, role, is_active, created_at FROM company_users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Busca usuário por email
   * @param {string} email - Email do usuário
   * @returns {Promise<Object|null>} Usuário encontrado (inclui password_hash) ou null
   */
  static async findByEmail(email) {
    const result = await query(
      'SELECT * FROM company_users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Busca usuários de uma empresa
   * @param {number} companyId - ID da empresa
   * @returns {Promise<Array>} Array de usuários
   */
  static async findByCompany(companyId) {
    const result = await query(
      'SELECT id, company_id, email, name, stellar_public_key, role, is_active, created_at FROM company_users WHERE company_id = $1 ORDER BY created_at DESC',
      [companyId]
    );
    return result.rows;
  }

  /**
   * Autentica usuário com email e senha
   * @param {string} email - Email do usuário
   * @param {string} password - Senha do usuário
   * @returns {Promise<Object|null>} Usuário autenticado (sem password_hash) ou null
   */
  static async authenticate(email, password) {
    const user = await this.findByEmail(email);
    if (!user || !user.password_hash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return null;
    }

    if (!user.is_active) {
      return null;
    }

    // Retornar sem password_hash
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Atualiza senha do usuário
   * @param {number} id - ID do usuário
   * @param {string} newPassword - Nova senha
   * @returns {Promise<boolean>} True se atualizado com sucesso
   */
  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await query(
      'UPDATE company_users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );
    return result.rowCount > 0;
  }

  /**
   * Atualiza dados do usuário
   * @param {number} id - ID do usuário
   * @param {Object} userData - Dados a atualizar
   * @returns {Promise<Object|null>} Usuário atualizado ou null
   */
  static async update(id, userData) {
    const { name, role, is_active } = userData;

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

    values.push(id);

    const result = await query(
      `UPDATE company_users SET ${fields.join(', ')} WHERE id = $${paramCount} 
       RETURNING id, company_id, email, name, stellar_public_key, role, is_active, created_at`,
      values
    );

    return result.rows[0] || null;
  }
}

