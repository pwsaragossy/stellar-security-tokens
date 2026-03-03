import { useEffect, useState } from 'react';
import { authStorage, type UserType } from '@/utils/authStorage';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Hook that attempts to restore the access token from the httpOnly refresh cookie on mount.
 * 
 * After a page reload, the in-memory access token is lost. This hook calls /api/auth/refresh
 * to get a new one using the httpOnly cookie (sent automatically by the browser).
 * 
 * Returns { isLoading, isAuthenticated } so the layout can show a loading state
 * while the refresh is in flight.
 */
export function useAuthRefresh(userType: UserType) {
    const [isLoading, setIsLoading] = useState(() => {
        // If we have a token in memory, no need to refresh
        if (authStorage.isAuthenticated(userType)) return false;
        // If we have user data, we probably have a cookie — attempt refresh
        if (authStorage.hasUser(userType)) return true;
        // No user data at all — not authenticated
        return false;
    });

    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        return authStorage.isAuthenticated(userType);
    });

    useEffect(() => {
        // Already have a token — nothing to do
        if (authStorage.isAuthenticated(userType)) {
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
        }

        // No user data — not logged in
        if (!authStorage.hasUser(userType)) {
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
        }

        // Has user data but no token — attempt refresh
        let cancelled = false;

        async function attemptRefresh() {
            try {
                const response = await axios.post(
                    `${API_URL}/auth/refresh`,
                    { userType },
                    { withCredentials: true }
                );

                if (!cancelled && response.data?.success && response.data?.data?.token) {
                    authStorage.setToken(response.data.data.token, userType);
                    setIsAuthenticated(true);
                }
            } catch {
                if (!cancelled) {
                    // Refresh failed — clear stale user data
                    authStorage.clear(userType);
                    setIsAuthenticated(false);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        attemptRefresh();

        return () => { cancelled = true; };
    }, [userType]);

    return { isLoading, isAuthenticated };
}
