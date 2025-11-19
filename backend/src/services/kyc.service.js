import { Investor } from '../models/Investor.js';

/**
 * Serviço para gerenciar verificação KYC (Know Your Customer) de investidores
 */
export class KYCService {
  /**
   * Verifica e aprova um investidor com dados KYC
   * @param {number} investorId - ID do investidor
   * @param {Object} kycData - Dados de verificação KYC
   * @returns {Promise<Object>} Resultado da verificação
   * @returns {number} returns.investorId - ID do investidor
   * @returns {string} returns.status - Status da verificação ('approved')
   * @returns {string} returns.verifiedAt - Data/hora da verificação (ISO string)
   * @returns {Object} returns.kycData - Dados KYC fornecidos
   * @throws {Error} Se investidor não for encontrado
   */
  static async verifyInvestor(investorId, kycData) {
    try {
      const investor = await Investor.findById(investorId);
      
      if (!investor) {
        throw new Error('Investor not found');
      }

      const verificationResult = {
        investorId,
        status: 'approved',
        verifiedAt: new Date().toISOString(),
        kycData,
      };

      await Investor.update(investorId, {
        kycStatus: verificationResult.status,
      });

      return verificationResult;
    } catch (error) {
      console.error('Error verifying investor KYC:', error);
      throw new Error(`KYC verification failed: ${error.message}`);
    }
  }

  /**
   * Aprova um investidor (muda status KYC para 'approved')
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Object>} Resultado da aprovação
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {Object} returns.investor - Investidor atualizado
   * @throws {Error} Se investidor não for encontrado
   */
  static async approveInvestor(investorId) {
    try {
      const investor = await Investor.findById(investorId);
      
      if (!investor) {
        throw new Error('Investor not found');
      }

      const updatedInvestor = await Investor.update(investorId, {
        kycStatus: 'approved',
      });

      return {
        success: true,
        investor: updatedInvestor,
      };
    } catch (error) {
      console.error('Error approving investor:', error);
      throw new Error(`Investor approval failed: ${error.message}`);
    }
  }

  /**
   * Rejeita um investidor (muda status KYC para 'rejected')
   * @param {number} investorId - ID do investidor
   * @param {string} reason - Motivo da rejeição
   * @returns {Promise<Object>} Resultado da rejeição
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {Object} returns.investor - Investidor atualizado
   * @returns {string} returns.reason - Motivo da rejeição
   * @throws {Error} Se investidor não for encontrado
   */
  static async rejectInvestor(investorId, reason) {
    try {
      const investor = await Investor.findById(investorId);
      
      if (!investor) {
        throw new Error('Investor not found');
      }

      const updatedInvestor = await Investor.update(investorId, {
        kycStatus: 'rejected',
      });

      return {
        success: true,
        investor: updatedInvestor,
        reason,
      };
    } catch (error) {
      console.error('Error rejecting investor:', error);
      throw new Error(`Investor rejection failed: ${error.message}`);
    }
  }

  /**
   * Obtém o status KYC atual de um investidor
   * @param {number} investorId - ID do investidor
   * @returns {Promise<Object>} Status KYC
   * @returns {number} returns.investorId - ID do investidor
   * @returns {string} returns.kycStatus - Status atual (pending/approved/rejected)
   * @returns {Date} returns.updatedAt - Data da última atualização
   * @throws {Error} Se investidor não for encontrado
   */
  static async getKYCStatus(investorId) {
    try {
      const investor = await Investor.findById(investorId);
      
      if (!investor) {
        throw new Error('Investor not found');
      }

      return {
        investorId,
        kycStatus: investor.kycStatus,
        updatedAt: investor.updated_at,
      };
    } catch (error) {
      console.error('Error getting KYC status:', error);
      throw new Error(`Failed to get KYC status: ${error.message}`);
    }
  }
}

