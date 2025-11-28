/**
 * Middleware to require email verification
 * Blocks actions that require verified email
 */
export const requireEmailVerified = (req, res, next) => {
    if (!req.user || !req.user.emailVerified) {
        return res.status(403).json({
            success: false,
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED',
            action: {
                message: 'Please verify your email address to proceed',
                endpoint: '/api/investors/verify-email',
            },
        });
    }
    next();
};

/**
 * Middleware to require KYC approval
 * Blocks actions that require approved KYC status
 */
export const requireKyc = (req, res, next) => {
    if (!req.user || req.user.kycStatus !== 'approved') {
        return res.status(403).json({
            success: false,
            error: 'KYC approval required',
            code: 'KYC_NOT_APPROVED',
            kycStatus: req.user?.kycStatus || 'unknown',
            action: {
                message: 'Please complete and get KYC approval to proceed',
                currentStatus: req.user?.kycStatus || 'unknown',
                endpoint: '/api/kyc/start',
            },
        });
    }
    next();
};

/**
 * Combined middleware - requires both email verification AND KYC approval
 * Use for critical actions like creating investments
 */
export const requireVerifiedAndKyc = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
        });
    }

    // Check email first
    if (!req.user.emailVerified) {
        return res.status(403).json({
            success: false,
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED',
        });
    }

    // Then check KYC
    if (req.user.kycStatus !== 'approved') {
        return res.status(403).json({
            success: false,
            error: 'KYC approval required',
            code: 'KYC_NOT_APPROVED',
            kycStatus: req.user.kycStatus,
        });
    }

    next();
};
