import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect } from 'react';

type AdminTab = 'offers' | 'contracts' | 'tokens' | 'companies' | 'users';

const TAB_ROUTES: Record<AdminTab, string> = {
    offers: '/admin/offers',
    contracts: '/admin/contracts',
    tokens: '/admin/tokens',
    companies: '/admin/companies',
    users: '/admin/users',
};

/**
 * Hook for cross-navigation between admin tabs.
 *
 * `navigateTo('offers', 5)` → navigates to /admin/offers?id=5
 *
 * `useAutoSelect(callback)` → reads ?id= from URL and calls callback(id) once on mount.
 */
export function useAdminNavigation() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const navigateTo = useCallback(
        (tab: AdminTab, entityId?: number | string) => {
            const path = TAB_ROUTES[tab];
            if (entityId != null) {
                navigate(`${path}?id=${entityId}`);
            } else {
                navigate(path);
            }
        },
        [navigate],
    );

    const getDeepLinkId = useCallback((): number | null => {
        const raw = searchParams.get('id');
        if (!raw) return null;
        const parsed = parseInt(raw, 10);
        return isNaN(parsed) ? null : parsed;
    }, [searchParams]);

    return { navigateTo, getDeepLinkId };
}

/**
 * Runs `onSelect(id)` once when the page loads with ?id= in the URL.
 */
export function useAutoSelect(onSelect: (id: number) => void) {
    const { getDeepLinkId } = useAdminNavigation();

    useEffect(() => {
        const id = getDeepLinkId();
        if (id != null) {
            onSelect(id);
        }
        // Run only on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
