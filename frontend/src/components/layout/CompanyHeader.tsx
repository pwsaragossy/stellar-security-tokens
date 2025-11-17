import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';

export function CompanyHeader() {
  const { user } = useAuth();
  const company = user?.company;

  const getStatusBadgeVariant = (status?: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'suspended':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'warning';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'approved':
        return 'Aprovada';
      case 'suspended':
        return 'Suspensa';
      case 'rejected':
        return 'Rejeitada';
      default:
        return 'Pendente';
    }
  };

  const getKycBadgeVariant = (status?: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'danger';
      default:
        return 'warning';
    }
  };

  const getKycLabel = (status?: string) => {
    switch (status) {
      case 'approved':
        return 'KYC Aprovado';
      case 'rejected':
        return 'KYC Rejeitado';
      default:
        return 'KYC Pendente';
    }
  };

  return (
    <header className="h-16 border-b bg-card">
      <div className="flex h-full items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            {company?.name || 'Empresa'}
          </h2>
          <Badge variant={getStatusBadgeVariant(company?.status)}>
            {getStatusLabel(company?.status)}
          </Badge>
          <Badge variant={getKycBadgeVariant(company?.kyc_status)}>
            {getKycLabel(company?.kyc_status)}
          </Badge>
        </div>
        {user?.companyUser && (
          <div className="text-sm text-muted-foreground">
            {user.companyUser.name}
          </div>
        )}
      </div>
    </header>
  );
}

