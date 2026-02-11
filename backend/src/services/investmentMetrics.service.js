import prisma from '../config/prisma.js';
import { Investment } from '../models/Investment.js';

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

    const totalUsdcInvested = distributedInvestments.reduce((sum, inv) => sum + Number(inv.tokenAmount), 0);
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
        byDate[dateKey].totalUSDC += Number(inv.tokenAmount);
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
            stellarContractId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Obtém progresso de captação das ofertas ativas
   * @returns {Promise<Array>} Lista de ofertas com progresso
   */
  static async getFundraisingProgress() {
    const activeOffers = await prisma.offer.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        offerName: true,
        assetCode: true,
        totalSupply: true,
        investments: {
          where: {
            status: { in: ['payment_received', 'distributed'] },
          },
          select: {
            tokenAmount: true,
            usdcAmount: true,
          },
        },
      },
    });

    return activeOffers.map(offer => {
      const soldTokens = offer.investments.reduce((sum, inv) => sum + Number(inv.tokenAmount), 0);
      const raisedUSDC = offer.investments.reduce((sum, inv) => sum + Number(inv.tokenAmount), 0);
      const percentage = (soldTokens / Number(offer.totalSupply)) * 100;

      return {
        id: offer.id,
        name: offer.offerName,
        assetCode: offer.assetCode,
        targetTokens: Number(offer.totalSupply),
        soldTokens,
        raisedUSDC,
        percentage: parseFloat(percentage.toFixed(2)),
      };
    });
  }

  /**
   * Obtém breakdown de receita por categoria
   * @returns {Promise<Object>} Totais por categoria
   */
  static async getRevenueBreakdown() {
    const revenueBySource = await prisma.feeLog.groupBy({
      by: ['category'],
      _sum: {
        amount: true,
      },
    });

    const totalRevenue = revenueBySource.reduce((sum, item) => sum + Number(item._sum.amount || 0), 0);

    const breakdown = revenueBySource.map(item => ({
      category: item.category,
      totalAmount: Number(item._sum.amount || 0),
      percentage: totalRevenue > 0 ? (Number(item._sum.amount || 0) / totalRevenue) * 100 : 0,
    }));

    return {
      total: totalRevenue,
      breakdown,
    };
  }

  /**
   * Obtém coortes de investidores (Ativos vs Inativos)
   * @returns {Promise<Object>} Counts de ativos e inativos
   */
  static async getInvestorCohorts() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeCount = await prisma.investor.count({
      where: {
        lastLogin: {
          gte: thirtyDaysAgo,
        },
      },
    });

    const totalCount = await prisma.investor.count();
    const dormantCount = totalCount - activeCount;

    return {
      active: activeCount,
      dormant: dormantCount,
      total: totalCount,
    };
  }
}

