import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { authStorage } from '@/utils/authStorage';

/**
 * Sign-in gate shown to guests (unauthenticated visitors) on private screens.
 *
 * The platform is browseable without auth — guests can view the Marketplace —
 * but personal screens (portfolio, wallet, …) and actions (invest) require a
 * passkey login. This renders INSTEAD of the gated screen, so the screen and
 * its data hooks never mount and no gated endpoint is ever called (which would
 * otherwise 401 and force a redirect). The backend stays fully gated regardless.
 */
export function SignInGate({ title = 'Sign in to continue' }: { title?: string }) {
    const navigate = useNavigate();
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
            <div className="rounded-2xl border border-border bg-card p-5">
                <Lock className="h-7 w-7 text-accent" strokeWidth={1.5} />
            </div>
            <h2 className="mt-6 text-xl font-semibold text-foreground">{title}</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                This is private to your account. Sign in with your passkey to continue.
            </p>
            <button
                onClick={() => navigate('/login')}
                className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                Sign in
            </button>
        </div>
    );
}

/**
 * Route guard: renders children only for an authenticated investor, otherwise a
 * SignInGate. Used to wrap private investor routes so guests browse the shell
 * but never mount gated screens.
 */
export function RequireInvestorAuth({ title, children }: { title?: string; children: ReactNode }) {
    if (!authStorage.isAuthenticated('investor')) {
        return <SignInGate title={title} />;
    }
    return <>{children}</>;
}
