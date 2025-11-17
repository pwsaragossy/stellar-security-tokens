import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { formatStellarPublicKey } from '@/utils/stellar';

export function InvestorHeader() {
  const { user } = useAuth();
  const investor = user?.investor;

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
            {investor?.name || 'Investidor'}
          </h2>
          <Badge variant={getKycBadgeVariant(investor?.kyc_status)}>
            {getKycLabel(investor?.kyc_status)}
          </Badge>
        </div>
        {investor?.stellar_public_key && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Chave:</span>
            <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
              {formatStellarPublicKey(investor.stellar_public_key)}
            </code>
          </div>
        )}
      </div>
    </header>
  );
}

