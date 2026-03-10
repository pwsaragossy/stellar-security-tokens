/**
 * Logger Utility
 * 
 * Centralized logging with configurable levels.
 * Replaces console.log throughout the codebase for production-ready logging.
 * 
 * Levels (in order of severity):
 * - error: Critical errors that need immediate attention
 * - warn: Warning conditions that should be reviewed
 * - info: General operational information
 * - debug: Detailed debugging information (off in production)
 * 
 * Usage:
 *   import logger from '../utils/logger.js';
 *   logger.info('Payment processed', { amount: 100, userId: 1 });
 *   logger.error('Transaction failed', error);
 */

const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const LOG_LEVEL = process.env.LOG_LEVEL?.toLowerCase() || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CURRENT_LEVEL = LEVELS[LOG_LEVEL] ?? LEVELS.info;

/**
 * Format log message with timestamp and metadata
 */
function formatMessage(level, component, message, meta = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const componentTag = component ? `[${component}]` : '';

    if (IS_PRODUCTION) {
        // JSON format for production (easier to parse in log aggregators)
        return JSON.stringify({
            timestamp,
            level,
            component,
            message,
            ...(meta && { meta }),
        });
    }

    // Human-readable format for development
    return `${prefix}${componentTag} ${message}`;
}

/**
 * Create a log function for a specific level
 */
function createLogFn(level) {
    return (message, meta = null) => {
        if (LEVELS[level] <= CURRENT_LEVEL) {
            const formatted = formatMessage(level, null, message, meta);

            if (level === 'error') {
                console.error(formatted);
                if (meta instanceof Error) {
                    console.error(meta.stack);
                }
            } else if (level === 'warn') {
                console.warn(formatted);
            } else {
                console.log(formatted);
            }
        }
    };
}

/**
 * Create a scoped logger for a specific component
 * Usage: const log = logger.scope('InvestmentController');
 *        log.info('Started');
 */
function createScopedLogger(component) {
    return {
        error: (message, meta = null) => {
            if (LEVELS.error <= CURRENT_LEVEL) {
                const formatted = formatMessage('error', component, message, meta);
                console.error(formatted);
                if (meta instanceof Error) {
                    console.error(meta.stack);
                }
            }
        },
        warn: (message, meta = null) => {
            if (LEVELS.warn <= CURRENT_LEVEL) {
                console.warn(formatMessage('warn', component, message, meta));
            }
        },
        info: (message, meta = null) => {
            if (LEVELS.info <= CURRENT_LEVEL) {
                console.log(formatMessage('info', component, message, meta));
            }
        },
        debug: (message, meta = null) => {
            if (LEVELS.debug <= CURRENT_LEVEL) {
                console.log(formatMessage('debug', component, message, meta));
            }
        },
    };
}

const logger = {
    error: createLogFn('error'),
    warn: createLogFn('warn'),
    info: createLogFn('info'),
    debug: createLogFn('debug'),

    /**
     * Create a scoped logger for a component
     * @param {string} component - Component name (e.g., 'InvestmentController', 'KeyManager')
     * @returns {Object} Scoped logger with error, warn, info, debug methods
     */
    scope: createScopedLogger,

    /**
     * Get the current log level
     */
    getLevel: () => LOG_LEVEL,

    /**
     * Check if a level is enabled
     */
    isLevelEnabled: (level) => LEVELS[level] <= CURRENT_LEVEL,
};

export default logger;
