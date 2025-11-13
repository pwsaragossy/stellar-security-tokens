import { query } from '../config/database.js';

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
   * @param {string} [investorData.stellarPublicKey] - Chave pública Stellar (opcional)
   * @param {string} [investorData.kycStatus='pending'] - Status KYC (pending/approved/rejected)
   * @returns {Promise<Object>} Investidor criado com todos os campos
   * @throws {Error} Se houver violação de constraint (email/document duplicado)
   */
  static async create(investorData) {
    const { name, email, document, stellarPublicKey, kycStatus = 'pending' } = investorData;
    
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
}
