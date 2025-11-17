import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
  requiredRole?: 'investor' | 'company' | 'admin';
  redirectTo?: string;
}

export function PrivateRoute({ children, requiredRole, redirectTo }: PrivateRouteProps) {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Determine redirect path based on current location
    let loginPath = '/';
    if (location.pathname.startsWith('/investor')) {
      loginPath = '/investor/login';
    } else if (location.pathname.startsWith('/company')) {
      loginPath = '/company/login';
    } else if (location.pathname.startsWith('/admin')) {
      loginPath = '/admin/login';
    }
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  if (requiredRole && role !== requiredRole) {
    // Redirect based on role
    if (role === 'investor') {
      return <Navigate to="/investor/dashboard" replace />;
    } else if (role === 'company') {
      return <Navigate to="/company/dashboard" replace />;
    } else if (role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <Navigate to={redirectTo || '/'} replace />;
  }

  return <>{children}</>;
}

