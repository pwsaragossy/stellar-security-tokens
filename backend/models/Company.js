import { query } from '../config/database.js';

/**
 * Modelo para gerenciar empresas no banco de dados
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

    const result = await query(
      `INSERT INTO companies (
        name, cnpj, email, legal_representative, stellar_public_key, address, phone,
        status, kyc_status, kyc_documents, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [name, cnpj, email, legal_representative, stellarPublicKey, address || null, phone || null, status, kyc_status, JSON.stringify(kyc_documents)]
    );

    return result.rows[0];
  }

  /**
   * Busca empresa por ID
   * @param {number} id - ID da empresa
   * @returns {Promise<Object|null>} Empresa encontrada ou null
   */
  static async findById(id) {
    const result = await query('SELECT * FROM companies WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  /**
   * Busca empresa por email
   * @param {string} email - Email da empresa
   * @returns {Promise<Object|null>} Empresa encontrada ou null
   */
  static async findByEmail(email) {
    const result = await query('SELECT * FROM companies WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  /**
   * Busca empresa por CNPJ
   * @param {string} cnpj - CNPJ da empresa
   * @returns {Promise<Object|null>} Empresa encontrada ou null
   */
  static async findByCnpj(cnpj) {
    const result = await query('SELECT * FROM companies WHERE cnpj = $1', [cnpj]);
    return result.rows[0] || null;
  }

  /**
   * Lista todas as empresas com paginação
   * @param {number} [limit=100] - Número máximo de resultados
   * @param {number} [offset=0] - Número de registros a pular
   * @param {string} [status] - Filtrar por status (opcional)
   * @returns {Promise<Array>} Array de empresas
   */
  static async findAll(limit = 100, offset = 0, status = null) {
    if (status) {
      const result = await query(
        'SELECT * FROM companies WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [status, limit, offset]
      );
      return result.rows;
    }

    const result = await query(
      'SELECT * FROM companies ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
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
    if (legal_representative !== undefined) {
      fields.push(`legal_representative = $${paramCount++}`);
      values.push(legal_representative);
    }
    if (address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(address);
    }
    if (phone !== undefined) {
      fields.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (kyc_status !== undefined) {
      fields.push(`kyc_status = $${paramCount++}`);
      values.push(kyc_status);
    }
    if (kyc_documents !== undefined) {
      fields.push(`kyc_documents = $${paramCount++}`);
      values.push(JSON.stringify(kyc_documents));
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Atualiza status da empresa
   * @param {number} id - ID da empresa
   * @param {string} status - Novo status
   * @returns {Promise<Object|null>} Empresa atualizada ou null
   */
  static async updateStatus(id, status) {
    const result = await query(
      'UPDATE companies SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0] || null;
  }
}

