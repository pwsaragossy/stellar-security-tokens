import { InvestmentMetricsService } from '../services/investmentMetrics.service.js';
import logger from '../utils/logger.js';
const log = logger.scope('InvestmentMetrics');

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
      log.error('Error fetching investment metrics:', error);
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
      log.error('Error fetching investment statistics:', error);
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
      log.error('Error fetching pending investments:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pending investments',
        details: error.message,
      });
    }
  }
  /**
   * Obtém progresso de captação
   * GET /api/admin/investments/fundraising
   */
  static async getFundraisingProgress(req, res) {
    try {
      const progress = await InvestmentMetricsService.getFundraisingProgress();
      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      log.error('Error fetching fundraising progress:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch fundraising progress',
      });
    }
  }

  /**
   * Obtém breakdown de receita
   * GET /api/admin/investments/revenue-breakdown
   */
  static async getRevenueBreakdown(req, res) {
    try {
      const breakdown = await InvestmentMetricsService.getRevenueBreakdown();
      res.json({
        success: true,
        data: breakdown,
      });
    } catch (error) {
      log.error('Error fetching revenue breakdown:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch revenue breakdown',
        details: error.message,
      });
    }
  }

  /**
   * Obtém coortes de investidores
   * GET /api/admin/investments/cohorts
   */
  static async getInvestorCohorts(req, res) {
    try {
      const cohorts = await InvestmentMetricsService.getInvestorCohorts();
      res.json({
        success: true,
        data: cohorts,
      });
    } catch (error) {
      log.error('Error fetching investor cohorts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch investor cohorts',
        details: error.message,
      });
    }
  }
}
