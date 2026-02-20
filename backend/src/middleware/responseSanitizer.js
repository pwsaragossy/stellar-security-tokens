import crypto from 'crypto';

/**
 * Response Sanitizer Middleware (H-1 Security Fix)
 * 
 * Intercepts res.json() to strip sensitive error details from 5xx responses
 * in production. In development, responses pass through unchanged.
 * 
 * This is applied as early middleware so ALL routes benefit automatically,
 * without needing to modify individual catch blocks.
 */
export function responseSanitizer(req, res, next) {
    if (process.env.NODE_ENV !== 'production') {
        return next(); // No-op in development
    }

    const originalJson = res.json.bind(res);

    res.json = function sanitizedJson(body) {
        // Only sanitize 5xx error responses
        if (res.statusCode >= 500 && body && typeof body === 'object') {
            const errorId = body.errorId || crypto.randomUUID();

            // Log the original response server-side for debugging
            console.error(`[ErrorSanitizer ${errorId}]`, JSON.stringify(body));

            return originalJson({
                success: false,
                error: 'Internal server error',
                errorId,
            });
        }

        return originalJson(body);
    };

    next();
}
