import { InvestmentMetricsService } from './services/investmentMetrics.service.js';
import { requirePlatformAdmin } from './middleware/authorize.js';

/**
 * Controller para métricas de investimentos (apenas platform_admin)
 */
export class InvestmentMetricsController {
  /**
   * Obtém métricas gerais de investimentos
   * GET /api/admin/investments/metrics
   */
  static async getMetrics(req, res) {
    try {
      const { offer_id, start_date, end_date } = req.query;

      const filters = {};
      if (offer_id) filters.offerId = parseInt(offer_id, 10);
      if (start_date) filters.startDate = start_date;
      if (end_date) filters.endDate = end_date;

      const metrics = await InvestmentMetricsService.getMetrics(filters);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      console.error('Error fetching investment metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch investment metrics',
        details: error.message,
      });
    }
  }

  /**
   * Obtém estatísticas por período
   * GET /api/admin/investments/statistics
   */
  static async getStatistics(req, res) {
    try {
      const { start_date, end_date, offer_id } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'start_date and end_date are required (YYYY-MM-DD)',
        });
      }

      const statistics = await InvestmentMetricsService.getStatisticsByPeriod(
        start_date,
        end_date,
        offer_id ? parseInt(offer_id, 10) : null
      );

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      console.error('Error fetching investment statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch investment statistics',
        details: error.message,
      });
    }
  }

  /**
   * Obtém investimentos pendentes
   * GET /api/admin/investments/pending
   */
  static async getPendingInvestments(req, res) {
    try {
      const { limit = 50 } = req.query;

      const pending = await InvestmentMetricsService.getPendingInvestments(parseInt(limit, 10));

      res.json({
        success: true,
        data: pending,
      });
    } catch (error) {
      console.error('Error fetching pending investments:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pending investments',
        details: error.message,
      });
    }
  }
}

