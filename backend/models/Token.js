import { query } from '../config/database.js';

/**
 * Modelo para gerenciar tokens e distribuições no banco de dados
 */
export class Token {
  /**
   * Cria um novo token no banco de dados
   * @param {Object} tokenData - Dados do token
   * @param {string} tokenData.assetCode - Código do asset (máximo 12 caracteres, único)
   * @param {string} tokenData.issuerPublicKey - Chave pública da conta emissora
   * @param {number|string} tokenData.totalSupply - Supply total do token
   * @param {string} [tokenData.description] - Descrição do token (opcional)
   * @returns {Promise<Object>} Token criado com todos os campos
   * @throws {Error} Se assetCode já existir (violação de constraint único)
   */
  static async create(tokenData) {
    const { assetCode, issuerPublicKey, totalSupply, description } = tokenData;
    
    const result = await query(
      `INSERT INTO tokens (asset_code, issuer_public_key, total_supply, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [assetCode, issuerPublicKey, totalSupply, description]
    );
    
    return result.rows[0];
  }

  /**
   * Busca token por código do asset
   * @param {string} assetCode - Código do asset (ex: 'SIN01')
   * @returns {Promise<Object|null>} Token encontrado ou null
   */
  static async findByAssetCode(assetCode) {
    const result = await query(
      'SELECT * FROM tokens WHERE asset_code = $1',
      [assetCode]
    );
    return result.rows[0] || null;
  }

  /**
   * Lista todos os tokens com paginação
   * @param {number} [limit=100] - Número máximo de resultados
   * @param {number} [offset=0] - Número de registros a pular
   * @returns {Promise<Array>} Array de tokens ordenados por data de criação (mais recentes primeiro)
   */
  static async findAll(limit = 100, offset = 0) {
    const result = await query(
      'SELECT * FROM tokens ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  /**
   * Registra uma distribuição de tokens para um investidor
   * @param {Object} distributionData - Dados da distribuição
   * @param {number} distributionData.investorId - ID do investidor
   * @param {string} distributionData.assetCode - Código do asset distribuído
   * @param {number|string} distributionData.amount - Quantidade distribuída
   * @param {string} distributionData.transactionHash - Hash da transação Stellar
   * @returns {Promise<Object>} Distribuição registrada com todos os campos
   * @throws {Error} Se investorId ou assetCode não existirem (violação de foreign key)
   */
  static async createDistribution(distributionData) {
    const { investorId, assetCode, amount, transactionHash } = distributionData;
    
    const result = await query(
      `INSERT INTO token_distributions (investor_id, asset_code, amount, transaction_hash, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [investorId, assetCode, amount, transactionHash]
    );
    
    return result.rows[0];
  }

  /**
   * Busca todas as distribuições de um investidor específico
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Array>} Array de distribuições com informações do token, ordenadas por data (mais recentes primeiro)
   */
  static async getDistributionsByInvestor(investorId) {
    const result = await query(
      `SELECT td.*, t.asset_code, t.description 
       FROM token_distributions td
       JOIN tokens t ON td.asset_code = t.asset_code
       WHERE td.investor_id = $1
       ORDER BY td.created_at DESC`,
      [investorId]
    );
    return result.rows;
  }

  /**
   * Busca todas as distribuições de um asset específico
   * @param {string} assetCode - Código do asset
   * @returns {Promise<Array>} Array de distribuições com informações dos investidores, ordenadas por data (mais recentes primeiro)
   */
  static async getDistributionsByAsset(assetCode) {
    const result = await query(
      `SELECT td.*, i.name as investor_name, i.email as investor_email
       FROM token_distributions td
       JOIN investors i ON td.investor_id = i.id
       WHERE td.asset_code = $1
       ORDER BY td.created_at DESC`,
      [assetCode]
    );
    return result.rows;
  }
}
