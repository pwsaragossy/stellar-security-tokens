import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';

export function AdminHeader() {
  const { user } = useAuth();
  const admin = user?.platformAdmin;

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'manager':
        return 'Manager';
      default:
        return 'Admin';
    }
  };

  return (
    <header className="h-16 border-b bg-card">
      <div className="flex h-full items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            {admin?.name || 'Administrador'}
          </h2>
          <Badge variant="info">
            {getRoleLabel(admin?.role)}
          </Badge>
        </div>
        {admin?.email && (
          <div className="text-sm text-muted-foreground">
            {admin.email}
          </div>
        )}
      </div>
    </header>
  );
}

