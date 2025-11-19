import prisma from './config/prisma.js';
import { Investment } from './models/Investment.js';

/**
 * Serviço para métricas e estatísticas de investimentos
 */
export class InvestmentMetricsService {
  /**
   * Obtém métricas gerais de investimentos
   * @param {Object} [filters] - Filtros opcionais
   * @param {number} [filters.offerId] - Filtrar por oferta
   * @param {string} [filters.startDate] - Data inicial (YYYY-MM-DD)
   * @param {string} [filters.endDate] - Data final (YYYY-MM-DD)
   * @returns {Promise<Object>} Métricas consolidadas
   */
  static async getMetrics(filters = {}) {
    const { offerId, startDate, endDate } = filters;

    const where = {};
    if (offerId) where.offerId = offerId;
    if (startDate) where.createdAt = { ...where.createdAt, gte: new Date(startDate) };
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      where.createdAt = { ...where.createdAt, lte: endDateTime };
    }

    const [
      total,
      pendingPayment,
      paymentReceived,
      distributed,
      failed,
      cancelled,
      distributedInvestments,
      uniqueInvestors,
    ] = await Promise.all([
      prisma.investment.count({ where }),
      prisma.investment.count({ where: { ...where, status: 'pending_payment' } }),
      prisma.investment.count({ where: { ...where, status: 'payment_received' } }),
      prisma.investment.count({ where: { ...where, status: 'distributed' } }),
      prisma.investment.count({ where: { ...where, status: 'failed' } }),
      prisma.investment.count({ where: { ...where, status: 'cancelled' } }),
      prisma.investment.findMany({
        where: { ...where, status: 'distributed' },
        select: {
          usdcAmount: true,
          tokenAmount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.investment.findMany({
        where: { ...where, status: 'distributed' },
        select: { investorId: true },
        distinct: ['investorId'],
      }),
    ]);

    const totalUsdcInvested = distributedInvestments.reduce((sum, inv) => sum + Number(inv.usdcAmount), 0);
    const totalTokensDistributed = distributedInvestments.reduce((sum, inv) => sum + Number(inv.tokenAmount), 0);
    
    const avgProcessingTime = distributedInvestments.length > 0
      ? distributedInvestments.reduce((sum, inv) => {
          const processingTime = (inv.updatedAt - inv.createdAt) / 1000; // seconds
          return sum + processingTime;
        }, 0) / distributedInvestments.length
      : 0;

    const successRate = total > 0 ? (distributed / total) * 100 : 0;

    return {
      total,
      byStatus: {
        pending_payment: pendingPayment,
        payment_received: paymentReceived,
        distributed,
        failed,
        cancelled,
      },
      totals: {
        usdcInvested: totalUsdcInvested,
        tokensDistributed: totalTokensDistributed,
      },
      performance: {
        successRate: parseFloat(successRate.toFixed(2)),
        avgProcessingTimeSeconds: parseFloat(avgProcessingTime.toFixed(2)),
        uniqueInvestors: uniqueInvestors.length,
      },
    };
  }

  /**
   * Obtém estatísticas por período (agrupado por dia)
   * @param {string} startDate - Data inicial (YYYY-MM-DD)
   * @param {string} endDate - Data final (YYYY-MM-DD)
   * @param {number} [offerId] - Filtrar por oferta (opcional)
   * @returns {Promise<Array>} Estatísticas por dia
   */
  static async getStatisticsByPeriod(startDate, endDate, offerId = null) {
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);

    const where = {
      createdAt: {
        gte: new Date(startDate),
        lte: endDateTime,
      },
    };
    if (offerId) where.offerId = offerId;

    const investments = await prisma.investment.findMany({
      where,
      select: {
        createdAt: true,
        status: true,
        usdcAmount: true,
        tokenAmount: true,
        investorId: true,
      },
    });

    // Group by date
    const byDate = {};
    for (const inv of investments) {
      const dateKey = inv.createdAt.toISOString().split('T')[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          date: dateKey,
          totalInvestments: 0,
          successful: 0,
          failed: 0,
          totalUSDC: 0,
          totalTokens: 0,
          uniqueInvestors: new Set(),
        };
      }
      
      byDate[dateKey].totalInvestments++;
      if (inv.status === 'distributed') {
        byDate[dateKey].successful++;
        byDate[dateKey].totalUSDC += Number(inv.usdcAmount);
        byDate[dateKey].totalTokens += Number(inv.tokenAmount);
        byDate[dateKey].uniqueInvestors.add(inv.investorId);
      } else if (inv.status === 'failed') {
        byDate[dateKey].failed++;
      }
    }

    return Object.values(byDate)
      .map(stat => ({
        date: stat.date,
        totalInvestments: stat.totalInvestments,
        successful: stat.successful,
        failed: stat.failed,
        totalUSDC: stat.totalUSDC,
        totalTokens: stat.totalTokens,
        uniqueInvestors: stat.uniqueInvestors.size,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Obtém investimentos pendentes que precisam de atenção
   * @param {number} [limit=50] - Limite de resultados
   * @returns {Promise<Array>} Investimentos pendentes
   */
  static async getPendingInvestments(limit = 50) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    return await prisma.investment.findMany({
      where: {
        status: { in: ['pending_payment', 'payment_received'] },
        createdAt: { lt: fiveMinutesAgo },
      },
      include: {
        investor: {
          select: {
            name: true,
            email: true,
            stellarPublicKey: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}

