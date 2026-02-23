/**
 * Serviço para alertas e notificações de problemas críticos
 * Por enquanto apenas loga, mas pode ser estendido para:
 * - Email para equipe
 * - Slack/Discord webhooks
 * - SMS para emergências
 * - Integração com sistemas de monitoramento (Datadog, Sentry, etc)
 */
import logger from '../utils/logger.js';
const log = logger.scope('AlertService');

const ALERT_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
};

/**
 * Serviço de alertas
 */
export class AlertService {
  /**
   * Envia um alerta
   * @param {string} level - Nível do alerta (INFO, WARNING, ERROR, CRITICAL)
   * @param {string} message - Mensagem do alerta
   * @param {Object} [metadata] - Metadados adicionais
   */
  static async notify(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    // Log baseado no nível
    switch (level) {
      case ALERT_LEVELS.CRITICAL:
      case ALERT_LEVELS.ERROR:
        log.error(logMessage, metadata);
        break;
      case ALERT_LEVELS.WARNING:
        log.warn(logMessage, metadata);
        break;
      default:
        log.info(logMessage, metadata);
    }

    // TODO: Implementar integrações externas
    // - Email para equipe em caso de CRITICAL
    // - Slack/Discord webhook para ERROR e CRITICAL
    // - SMS para CRITICAL apenas
    // - Integração com sistemas de monitoramento

    // Por enquanto apenas retorna o alerta formatado
    return {
      level,
      message,
      timestamp,
      metadata,
    };
  }

  /**
   * Alerta de informação
   * @param {string} message - Mensagem
   * @param {Object} [metadata] - Metadados
   */
  static async info(message, metadata = {}) {
    return this.notify(ALERT_LEVELS.INFO, message, metadata);
  }

  /**
   * Alerta de aviso
   * @param {string} message - Mensagem
   * @param {Object} [metadata] - Metadados
   */
  static async warning(message, metadata = {}) {
    return this.notify(ALERT_LEVELS.WARNING, message, metadata);
  }

  /**
   * Alerta de erro
   * @param {string} message - Mensagem
   * @param {Object} [metadata] - Metadados
   */
  static async error(message, metadata = {}) {
    return this.notify(ALERT_LEVELS.ERROR, message, metadata);
  }

  /**
   * Alerta crítico
   * @param {string} message - Mensagem
   * @param {Object} [metadata] - Metadados
   */
  static async critical(message, metadata = {}) {
    return this.notify(ALERT_LEVELS.CRITICAL, message, metadata);
  }

  /**
   * Alerta de falha na distribuição de tokens
   * @param {number} investmentId - ID do investimento
   * @param {string} errorMessage - Mensagem de erro
   * @param {number} attempts - Número de tentativas
   */
  static async distributionFailed(investmentId, errorMessage, attempts) {
    return this.critical(
      `Token distribution failed for investment ${investmentId} after ${attempts} attempts`,
      {
        investmentId,
        errorMessage,
        attempts,
        type: 'distribution_failed',
      }
    );
  }

  /**
   * Alerta de falha no monitoramento de pagamentos
   * @param {string} errorMessage - Mensagem de erro
   */
  static async paymentMonitorFailed(errorMessage) {
    return this.error(
      `Payment monitor failed: ${errorMessage}`,
      {
        type: 'payment_monitor_failed',
        errorMessage,
      }
    );
  }

  /**
   * Alerta de falha na fila de distribuição
   * @param {string} errorMessage - Mensagem de erro
   */
  static async distributionQueueFailed(errorMessage) {
    const message = errorMessage || 'Unknown error';
    return this.error(
      `Distribution queue failed: ${message}`,
      {
        type: 'distribution_queue_failed',
        errorMessage: message,
      }
    );
  }

  /**
   * Alerta de investimento pendente há muito tempo
   * @param {number} investmentId - ID do investimento
   * @param {string} status - Status atual
   * @param {number} minutesPending - Minutos pendente
   */
  static async investmentStuck(investmentId, status, minutesPending) {
    return this.warning(
      `Investment ${investmentId} stuck in status '${status}' for ${minutesPending} minutes`,
      {
        investmentId,
        status,
        minutesPending,
        type: 'investment_stuck',
      }
    );
  }
}

export default AlertService;

