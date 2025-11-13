import { PaymentService } from '../services/payment.service.js';
import { query } from '../config/database.js';

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
 * Obtém histórico completo de pagamentos de juros
 * Inclui paginação e filtros opcionais
 */
export const getPaymentHistory = async (req, res, next) => {
  try {
    const { assetCode, limit = 100, offset = 0, investorId } = req.query;

    let queryText = `
      SELECT 
        ip.*,
        i.name as investor_name,
        i.email as investor_email,
        t.asset_code,
        t.description as token_description
      FROM interest_payments ip
      JOIN investors i ON ip.investor_id = i.id
      JOIN tokens t ON ip.asset_code = t.asset_code
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 1;

    if (assetCode) {
      queryText += ` AND ip.asset_code = $${paramCount++}`;
      queryParams.push(assetCode);
    }

    if (investorId) {
      queryText += ` AND ip.investor_id = $${paramCount++}`;
      queryParams.push(parseInt(investorId, 10));
    }

    queryText += ` ORDER BY ip.payment_date DESC, ip.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    queryParams.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await query(queryText, queryParams);

    // Query para contar total (sem LIMIT/OFFSET)
    let countQueryText = `
      SELECT COUNT(*) as total 
      FROM interest_payments ip
      WHERE 1=1
    `;
    const countQueryParams = [];
    let countParamCount = 1;

    if (assetCode) {
      countQueryText += ` AND ip.asset_code = $${countParamCount++}`;
      countQueryParams.push(assetCode);
    }

    if (investorId) {
      countQueryText += ` AND ip.investor_id = $${countParamCount++}`;
      countQueryParams.push(parseInt(investorId, 10));
    }

    const totalResult = await query(countQueryText, countQueryParams);

    // Query para estatísticas resumidas
    let summaryQueryText = `
      SELECT 
        COUNT(DISTINCT ip.investor_id) as unique_investors,
        COUNT(*) as total_payments,
        SUM(ip.usdc_amount) as total_usdc_paid,
        AVG(ip.usdc_amount) as average_payment
      FROM interest_payments ip
      WHERE 1=1
    `;
    const summaryQueryParams = [];
    let summaryParamCount = 1;

    if (assetCode) {
      summaryQueryText += ` AND ip.asset_code = $${summaryParamCount++}`;
      summaryQueryParams.push(assetCode);
    }

    if (investorId) {
      summaryQueryText += ` AND ip.investor_id = $${summaryParamCount++}`;
      summaryQueryParams.push(parseInt(investorId, 10));
    }

    const summaryResult = await query(summaryQueryText, summaryQueryParams);

    res.json({
      success: true,
      data: {
        payments: result.rows,
        pagination: {
          total: parseInt(totalResult.rows[0].total, 10),
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          count: result.rows.length,
        },
        summary: summaryResult.rows[0],
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

    let queryText = `
      SELECT 
        ip.payment_date,
        COUNT(*) as payment_count,
        COUNT(DISTINCT ip.investor_id) as unique_investors,
        SUM(ip.usdc_amount) as total_usdc,
        AVG(ip.usdc_amount) as average_usdc,
        MIN(ip.usdc_amount) as min_usdc,
        MAX(ip.usdc_amount) as max_usdc
      FROM interest_payments ip
      WHERE ip.status = 'completed'
    `;
    const queryParams = [];
    let paramCount = 1;

    if (assetCode) {
      queryText += ` AND ip.asset_code = $${paramCount++}`;
      queryParams.push(assetCode);
    }

    if (startDate) {
      queryText += ` AND ip.payment_date >= $${paramCount++}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      queryText += ` AND ip.payment_date <= $${paramCount++}`;
      queryParams.push(endDate);
    }

    queryText += ` GROUP BY ip.payment_date ORDER BY ip.payment_date DESC`;

    const result = await query(queryText, queryParams);

    res.json({
      success: true,
      data: {
        statistics: result.rows,
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

