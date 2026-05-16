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
function extractStack(meta) {
    if (!meta) return null;
    if (meta instanceof Error) return meta.stack ?? null;
    if (typeof meta === 'object' && typeof meta.stack === 'string') return meta.stack;
    return null;
}

/**
 * Build a structured meta object from a caught exception so logs always
 * carry message + stack + code. Used by errorFromException / warnFromException.
 */
function buildExceptionMeta(err, extraMeta) {
    const base = (extraMeta && typeof extraMeta === 'object') ? { ...extraMeta } : {};
    if (!err) return Object.keys(base).length > 0 ? base : null;
    base.error = err.message ?? String(err);
    if (err.stack) base.stack = err.stack;
    if (err.code !== undefined) base.code = err.code;
    return base;
}

function createLogFn(level) {
    return (message, meta = null) => {
        if (LEVELS[level] <= CURRENT_LEVEL) {
            const formatted = formatMessage(level, null, message, meta);

            if (level === 'error') {
                console.error(formatted);
                const stack = extractStack(meta);
                if (stack) console.error(stack);
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
    const obj = {
        error: (message, meta = null) => {
            if (LEVELS.error <= CURRENT_LEVEL) {
                const formatted = formatMessage('error', component, message, meta);
                console.error(formatted);
                const stack = extractStack(meta);
                if (stack) console.error(stack);
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
    obj.errorFromException = (message, err, extraMeta) => obj.error(message, buildExceptionMeta(err, extraMeta));
    obj.warnFromException = (message, err, extraMeta) => obj.warn(message, buildExceptionMeta(err, extraMeta));
    return obj;
}

const logger = {
    error: createLogFn('error'),
    warn: createLogFn('warn'),
    info: createLogFn('info'),
    debug: createLogFn('debug'),

    /**
     * Log a caught exception at error/warn level with structured meta that
     * always carries message + stack + code. Prevents stack-dropping when
     * callers used `{ error: err.message }` without `.stack`.
     */
    errorFromException(message, err, extraMeta) {
        this.error(message, buildExceptionMeta(err, extraMeta));
    },
    warnFromException(message, err, extraMeta) {
        this.warn(message, buildExceptionMeta(err, extraMeta));
    },

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
