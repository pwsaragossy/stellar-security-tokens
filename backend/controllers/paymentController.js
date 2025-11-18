import { PaymentService } from '../services/payment.service.js';
import prisma from '../config/prisma.js';

/**
 * Processa pagamentos de juros mensais manualmente
 * Calcula juros proporcionais, cria transação batch no Stellar e envia emails
 */
export const processMonthlyPayments = async (req, res, next) => {
  try {
    const { assetCode = 'SIN01' } = req.body;

    const result = await PaymentService.processMonthlyInterestPayments(assetCode);

    res.json({
      success: true,
      message: 'Monthly interest payments processed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Processa pagamentos bullet manualmente
 * Processa pagamentos únicos na data de vencimento das ofertas bullet
 */
export const processBulletPayments = async (req, res, next) => {
  try {
    const result = await PaymentService.processBulletPayments();

    res.json({
      success: true,
      message: 'Bullet payments processed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Processa pagamentos trimestrais manualmente
 * Calcula juros trimestrais, cria transação batch no Stellar e envia emails
 */
export const processQuarterlyPayments = async (req, res, next) => {
  try {
    const { assetCode = 'SIN01' } = req.body;

    const result = await PaymentService.processQuarterlyPayments(assetCode);

    res.json({
      success: true,
      message: 'Quarterly interest payments processed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Processa pagamentos semestrais manualmente
 * Calcula juros semestrais, cria transação batch no Stellar e envia emails
 */
export const processSemiAnnualPayments = async (req, res, next) => {
  try {
    const { assetCode = 'SIN01' } = req.body;

    const result = await PaymentService.processSemiAnnualPayments(assetCode);

    res.json({
      success: true,
      message: 'Semi-annual interest payments processed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtém histórico completo de pagamentos de juros
 * Inclui paginação e filtros opcionais
 */
export const getPaymentHistory = async (req, res, next) => {
  try {
    const { assetCode, limit = 100, offset = 0, investorId } = req.query;

    const where = {};
    if (assetCode) where.assetCode = assetCode;
    if (investorId) where.investorId = parseInt(investorId, 10);

    const [payments, total, summaryData] = await Promise.all([
      prisma.interestPayment.findMany({
        where,
        include: {
          investor: {
            select: {
              name: true,
              email: true,
            },
          },
          token: {
            select: {
              assetCode: true,
              description: true,
            },
          },
        },
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
        orderBy: [
          { paymentDate: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      prisma.interestPayment.count({ where }),
      prisma.interestPayment.findMany({
        where,
        select: {
          investorId: true,
          usdcAmount: true,
        },
      }),
    ]);

    const uniqueInvestors = new Set(summaryData.map(p => p.investorId)).size;
    const totalUsdcPaid = summaryData.reduce((sum, p) => sum + Number(p.usdcAmount), 0);
    const averagePayment = summaryData.length > 0 ? totalUsdcPaid / summaryData.length : 0;

    const summary = {
      unique_investors: uniqueInvestors,
      total_payments: summaryData.length,
      total_usdc_paid: totalUsdcPaid,
      average_payment: averagePayment,
    };

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          count: payments.length,
        },
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtém estatísticas de pagamentos por período
 */
export const getPaymentStatistics = async (req, res, next) => {
  try {
    const { assetCode, startDate, endDate } = req.query;

    const where = { status: 'completed' };
    if (assetCode) where.assetCode = assetCode;
    if (startDate) where.paymentDate = { ...where.paymentDate, gte: new Date(startDate) };
    if (endDate) where.paymentDate = { ...where.paymentDate, lte: new Date(endDate) };

    const payments = await prisma.interestPayment.findMany({
      where,
      select: {
        paymentDate: true,
        usdcAmount: true,
        investorId: true,
      },
    });

    // Group by date
    const byDate = {};
    for (const payment of payments) {
      const dateKey = payment.paymentDate.toISOString().split('T')[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          payment_date: dateKey,
          payment_count: 0,
          unique_investors: new Set(),
          total_usdc: 0,
          amounts: [],
        };
      }
      byDate[dateKey].payment_count++;
      byDate[dateKey].unique_investors.add(payment.investorId);
      byDate[dateKey].total_usdc += Number(payment.usdcAmount);
      byDate[dateKey].amounts.push(Number(payment.usdcAmount));
    }

    const statistics = Object.values(byDate).map(stat => ({
      payment_date: stat.payment_date,
      payment_count: stat.payment_count,
      unique_investors: stat.unique_investors.size,
      total_usdc: stat.total_usdc,
      average_usdc: stat.total_usdc / stat.payment_count,
      min_usdc: Math.min(...stat.amounts),
      max_usdc: Math.max(...stat.amounts),
    })).sort((a, b) => b.payment_date.localeCompare(a.payment_date));

    res.json({
      success: true,
      data: {
        statistics,
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

