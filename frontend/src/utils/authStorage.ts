/**
 * Centralized auth storage utility for multi-session support.
 * 
 * This allows simultaneous login as admin, company, and investor
 * in the same browser by using separate localStorage keys for each user type.
 */

export type UserType = 'admin' | 'company' | 'investor';

interface StorageKeys {
    token: string;
    user: string;
}

const STORAGE_KEYS: Record<UserType, StorageKeys> = {
    admin: { token: 'admin_token', user: 'admin_user' },
    company: { token: 'company_token', user: 'company_user' },
    investor: { token: 'investor_token', user: 'investor_user' },
};

// Legacy keys for backward compatibility
const LEGACY_KEYS = {
    token: 'token',
    user: 'user',
    userType: 'userType',
    admin: 'admin',
};

/**
 * Detect user type from current URL path.
 * Falls back to 'investor' for unrecognized paths.
 */
export function detectUserType(): UserType {
    const path = window.location.pathname;
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/company')) return 'company';
    return 'investor';
}

/**
 * Get the storage keys for a given user type.
 * If no user type is provided, it's auto-detected from the current path.
 */
function getKeys(userType?: UserType): StorageKeys {
    const type = userType ?? detectUserType();
    return STORAGE_KEYS[type];
}

/**
 * Migrate legacy session data to new type-specific keys.
 * Called once on first access to ensure backward compatibility.
 */
function migrateLegacySession(): void {
    const legacyToken = localStorage.getItem(LEGACY_KEYS.token);
    if (!legacyToken) return; // No legacy session to migrate

    const legacyUserType = localStorage.getItem(LEGACY_KEYS.userType);
    const legacyUser = localStorage.getItem(LEGACY_KEYS.user);
    const legacyAdmin = localStorage.getItem(LEGACY_KEYS.admin);

    // Determine which user type this legacy session belongs to
    let targetType: UserType = 'investor';
    let userData = legacyUser;

    if (legacyUserType === 'admin' || legacyAdmin) {
        targetType = 'admin';
        userData = legacyAdmin || legacyUser;
    } else if (legacyUserType === 'company') {
        targetType = 'company';
    }

    // Migrate to new keys
    const newKeys = STORAGE_KEYS[targetType];
    localStorage.setItem(newKeys.token, legacyToken);
    if (userData) {
        localStorage.setItem(newKeys.user, userData);
    }

    // Clear legacy keys after migration
    localStorage.removeItem(LEGACY_KEYS.token);
    localStorage.removeItem(LEGACY_KEYS.user);
    localStorage.removeItem(LEGACY_KEYS.userType);
    localStorage.removeItem(LEGACY_KEYS.admin);

    console.log(`[authStorage] Migrated legacy session to ${targetType}`);
}

// Run migration once on module load
migrateLegacySession();

export const authStorage = {
    /**
     * Get the auth token for the specified user type.
     * Auto-detects user type from path if not provided.
     */
    getToken(userType?: UserType): string | null {
        const keys = getKeys(userType);
        return localStorage.getItem(keys.token);
    },

    /**
     * Set the auth token for the specified user type.
     */
    setToken(token: string, userType?: UserType): void {
        const keys = getKeys(userType);
        localStorage.setItem(keys.token, token);
    },

    /**
     * Get the user object for the specified user type.
     * Returns null if not found or invalid JSON.
     */
    getUser<T = unknown>(userType?: UserType): T | null {
        const keys = getKeys(userType);
        const userStr = localStorage.getItem(keys.user);
        if (!userStr) return null;
        try {
            return JSON.parse(userStr) as T;
        } catch {
            return null;
        }
    },

    /**
     * Set the user object for the specified user type.
     */
    setUser(user: object, userType?: UserType): void {
        const keys = getKeys(userType);
        localStorage.setItem(keys.user, JSON.stringify(user));
    },

    /**
     * Clear auth data for the specified user type.
     * Auto-detects user type from path if not provided.
     */
    clear(userType?: UserType): void {
        const keys = getKeys(userType);
        localStorage.removeItem(keys.token);
        localStorage.removeItem(keys.user);
    },

    /**
     * Clear auth data for all user types.
     * Useful for a complete logout from all sessions.
     */
    clearAll(): void {
        Object.values(STORAGE_KEYS).forEach(keys => {
            localStorage.removeItem(keys.token);
            localStorage.removeItem(keys.user);
        });
        // Also clear legacy keys for backward compatibility
        Object.values(LEGACY_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    },

    /**
     * Check if a user is authenticated for the specified user type.
     */
    isAuthenticated(userType?: UserType): boolean {
        return !!this.getToken(userType);
    },
};

export default authStorage;
