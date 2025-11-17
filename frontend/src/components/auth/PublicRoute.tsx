import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface PublicRouteProps {
  children: React.ReactNode;
  redirectIfAuthenticated?: boolean;
}

export function PublicRoute({ children, redirectIfAuthenticated = true }: PublicRouteProps) {
  const { isAuthenticated, role } = useAuth();

  if (isAuthenticated && redirectIfAuthenticated) {
    // Redirect based on role
    if (role === 'investor') {
      return <Navigate to="/investor/dashboard" replace />;
    } else if (role === 'company') {
      return <Navigate to="/company/dashboard" replace />;
    } else if (role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

