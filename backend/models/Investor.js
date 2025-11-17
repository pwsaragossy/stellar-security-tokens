import { query } from '../config/database.js';
import bcrypt from 'bcrypt';

/**
 * Modelo para gerenciar investidores no banco de dados
 */
export class Investor {
  /**
   * Cria um novo investidor no banco de dados
   * @param {Object} investorData - Dados do investidor
   * @param {string} investorData.name - Nome completo do investidor
   * @param {string} investorData.email - Email do investidor (único)
   * @param {string} investorData.document - CPF/CNPJ do investidor (único)
   * @param {string} investorData.stellarPublicKey - Chave pública Stellar (obrigatória, 56 caracteres)
   * @param {string} [investorData.kycStatus='pending'] - Status KYC (pending/approved/rejected)
   * @returns {Promise<Object>} Investidor criado com todos os campos
   * @throws {Error} Se houver violação de constraint (email/document duplicado)
   */
  static async create(investorData) {
    const { name, email, document, stellarPublicKey, kycStatus = 'pending' } = investorData;
    
    if (!stellarPublicKey) {
      throw new Error('stellarPublicKey é obrigatório para criar um investidor');
    }
    
    // Validar formato da chave Stellar (56 caracteres, começando com G)
    if (!/^G[A-Z0-9]{55}$/.test(stellarPublicKey)) {
      throw new Error('stellarPublicKey deve ter 56 caracteres e começar com G');
    }
    
    const result = await query(
      `INSERT INTO investors (name, email, document, stellar_public_key, kyc_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [name, email, document, stellarPublicKey, kycStatus]
    );
    
    return result.rows[0];
  }

  /**
   * Busca investidor por ID
   * @param {number} id - ID do investidor
   * @returns {Promise<Object|null>} Investidor encontrado ou null
   */
  static async findById(id) {
    const result = await query(
      'SELECT * FROM investors WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Busca investidor por email
   * @param {string} email - Email do investidor
   * @returns {Promise<Object|null>} Investidor encontrado ou null
   */
  static async findByEmail(email) {
    const result = await query(
      'SELECT * FROM investors WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Busca investidor por documento (CPF/CNPJ)
   * @param {string} document - Documento do investidor
   * @returns {Promise<Object|null>} Investidor encontrado ou null
   */
  static async findByDocument(document) {
    const result = await query(
      'SELECT * FROM investors WHERE document = $1',
      [document]
    );
    return result.rows[0] || null;
  }

  /**
   * Busca investidor por chave pública Stellar
   * @param {string} stellarPublicKey - Chave pública Stellar (56 caracteres)
   * @returns {Promise<Object|null>} Investidor encontrado ou null
   */
  static async findByStellarPublicKey(stellarPublicKey) {
    const result = await query(
      'SELECT * FROM investors WHERE stellar_public_key = $1',
      [stellarPublicKey]
    );
    return result.rows[0] || null;
  }

  /**
   * Lista todos os investidores com paginação
   * @param {number} [limit=100] - Número máximo de resultados
   * @param {number} [offset=0] - Número de registros a pular
   * @returns {Promise<Array>} Array de investidores ordenados por data de criação (mais recentes primeiro)
   */
  static async findAll(limit = 100, offset = 0) {
    const result = await query(
      'SELECT * FROM investors ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
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
    
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (document !== undefined) {
      fields.push(`document = $${paramCount++}`);
      values.push(document);
    }
    if (stellarPublicKey !== undefined) {
      fields.push(`stellar_public_key = $${paramCount++}`);
      values.push(stellarPublicKey);
    }
    if (kycStatus !== undefined) {
      fields.push(`kyc_status = $${paramCount++}`);
      values.push(kycStatus);
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE investors SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Remove um investidor do banco de dados
   * @param {number} id - ID do investidor
   * @returns {Promise<Object|null>} Investidor removido ou null se não encontrado
   */
  static async delete(id) {
    const result = await query(
      'DELETE FROM investors WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Autentica investidor com email e senha
   * @param {string} email - Email do investidor
   * @param {string} password - Senha do investidor
   * @returns {Promise<Object|null>} Investidor autenticado (sem password_hash) ou null
   */
  static async authenticate(email, password) {
    const investor = await this.findByEmail(email);
    if (!investor || !investor.password_hash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, investor.password_hash);
    if (!isValid) {
      return null;
    }

    // Atualizar last_login
    await query(
      'UPDATE investors SET last_login = NOW() WHERE id = $1',
      [investor.id]
    );

    // Retornar sem password_hash
    const { password_hash, ...investorWithoutPassword } = investor;
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
    const result = await query(
      'UPDATE investors SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, id]
    );
    return result.rowCount > 0;
  }

  /**
   * Busca portfólio do investidor (tokens de múltiplas ofertas)
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Array>} Array com tokens e ofertas relacionadas
   */
  static async getPortfolio(investorId) {
    const result = await query(
      `SELECT 
        t.id, t.asset_code, t.total_supply, t.issued_at,
        o.id as offer_id, o.offer_name, o.description, o.offer_type,
        o.annual_interest_rate, o.status as offer_status,
        COALESCE(SUM(td.amount), 0) as total_distributed
      FROM tokens t
      LEFT JOIN offers o ON t.offer_id = o.id
      LEFT JOIN token_distributions td ON t.asset_code = td.asset_code AND td.investor_id = $1
      WHERE EXISTS (
        SELECT 1 FROM token_distributions 
        WHERE investor_id = $1 AND asset_code = t.asset_code
      )
      GROUP BY t.id, o.id
      ORDER BY t.issued_at DESC`,
      [investorId]
    );
    return result.rows;
  }

  /**
   * Busca métricas consolidadas do portfólio
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Object>} Métricas consolidadas
   */
  static async getConsolidatedMetrics(investorId) {
    const result = await query(
      `SELECT 
        COUNT(DISTINCT td.asset_code) as total_offers,
        COALESCE(SUM(td.amount), 0) as total_invested,
        COALESCE(SUM(ip.usdc_amount), 0) as total_interest_received,
        COUNT(DISTINCT ip.id) as total_payments
      FROM token_distributions td
      LEFT JOIN interest_payments ip ON td.investor_id = ip.investor_id AND td.asset_code = ip.asset_code
      WHERE td.investor_id = $1`,
      [investorId]
    );
    return result.rows[0] || {
      total_offers: 0,
      total_invested: 0,
      total_interest_received: 0,
      total_payments: 0,
    };
  }
}
