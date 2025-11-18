import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { InvestorLayout } from '@/components/layout/InvestorLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  Building,
  Target,
  AlertCircle,
  CheckCircle,
  ArrowLeft
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface Offer {
  id: number;
  asset_code: string;
  offer_name: string;
  description: string;
  total_supply: number;
  annual_interest_rate?: number;
  payment_type: 'monthly' | 'bullet' | 'quarterly' | 'semi_annual';
  maturity_date?: string;
  bullet_payment_amount?: number;
  payment_frequency: number;
  offer_type: 'collateral' | 'sale';
  status: string;
  company?: {
    name: string;
    cnpj: string;
  };
  legal_documents?: Record<string, any>;
  created_at: string;
}

const PAYMENT_TYPE_LABELS = {
  monthly: 'Monthly Interest Payments',
  bullet: 'Bullet Payment',
  quarterly: 'Quarterly Interest Payments',
  semi_annual: 'Semi-Annual Interest Payments',
};

const PAYMENT_TYPE_DESCRIPTIONS = {
  monthly: 'Receive monthly interest payments throughout the investment period',
  bullet: 'Receive a single lump-sum payment at maturity',
  quarterly: 'Receive interest payments every 3 months',
  semi_annual: 'Receive interest payments every 6 months',
};

export function InvestorOfferDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchOffer();
    }
  }, [id]);

  const fetchOffer = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/offers/${id}`);
      setOffer(response.data);
    } catch (error: any) {
      console.error('Error fetching offer:', error);
      setError(error.response?.data?.error || 'Failed to load offer');
      showToast('Failed to load offer details', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvest = () => {
    if (offer) {
      navigate(`/investor/invest/${offer.id}`);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getPaymentIcon = (paymentType: string) => {
    switch (paymentType) {
      case 'monthly':
        return <Clock className="h-5 w-5" />;
      case 'bullet':
        return <Target className="h-5 w-5" />;
      case 'quarterly':
        return <Calendar className="h-5 w-5" />;
      case 'semi_annual':
        return <TrendingUp className="h-5 w-5" />;
      default:
        return <DollarSign className="h-5 w-5" />;
    }
  };

  const getPaymentBadgeVariant = (paymentType: string) => {
    switch (paymentType) {
      case 'monthly':
        return 'default';
      case 'bullet':
        return 'secondary';
      case 'quarterly':
        return 'outline';
      case 'semi_annual':
        return 'outline';
      default:
        return 'default';
    }
  };

  if (isLoading) {
    return (
      <InvestorLayout>
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </InvestorLayout>
    );
  }

  if (error || !offer) {
    return (
      <InvestorLayout>
        <div className="max-w-4xl mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error || 'Offer not found'}
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/investor/offers')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Offers
            </Button>
          </div>
        </div>
      </InvestorLayout>
    );
  }

  const isBulletPayment = offer.payment_type === 'bullet';
  const isPeriodicPayment = ['monthly', 'quarterly', 'semi_annual'].includes(offer.payment_type);

  return (
    <InvestorLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate('/investor/offers')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Offers
            </Button>
            <h1 className="text-3xl font-bold">{offer.offer_name}</h1>
            <p className="text-muted-foreground">{offer.asset_code}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant={getPaymentBadgeVariant(offer.payment_type)}>
              {getPaymentIcon(offer.payment_type)}
              <span className="ml-1">{PAYMENT_TYPE_LABELS[offer.payment_type]}</span>
            </Badge>
            <Badge variant="outline">{offer.status}</Badge>
          </div>
        </div>

        {/* Payment Type Highlight */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getPaymentIcon(offer.payment_type)}
              Payment Structure
            </CardTitle>
            <CardDescription>
              {PAYMENT_TYPE_DESCRIPTIONS[offer.payment_type]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isPeriodicPayment && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Annual Interest Rate</span>
                  <span className="text-2xl font-bold text-green-600">
                    {offer.annual_interest_rate}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Payment Frequency</span>
                  <span>
                    {offer.payment_type === 'monthly' ? 'Monthly' :
                     offer.payment_type === 'quarterly' ? 'Every 3 months' :
                     'Every 6 months'}
                  </span>
                </div>
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    You'll receive regular interest payments based on your token holdings.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {isBulletPayment && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Maturity Payment</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {offer.bullet_payment_amount ? formatCurrency(offer.bullet_payment_amount) : 'TBD'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Maturity Date</span>
                  <span>
                    {offer.maturity_date ? formatDate(offer.maturity_date) : 'TBD'}
                  </span>
                </div>
                <Alert>
                  <Target className="h-4 w-4" />
                  <AlertDescription>
                    You'll receive a single payment when the investment matures.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Offer Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Offering Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Asset Code</span>
                <span className="font-mono">{offer.asset_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Total Supply</span>
                <span>{offer.total_supply.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Offer Type</span>
                <Badge variant="outline" className="capitalize">
                  {offer.offer_type}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Created</span>
                <span>{formatDate(offer.created_at)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Issuer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Company</span>
                <span>{offer.company?.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">CNPJ</span>
                <span className="font-mono text-sm">{offer.company?.cnpj || 'N/A'}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>About This Offering</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              {offer.description}
            </p>
          </CardContent>
        </Card>

        {/* Investment Action */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Ready to Invest?</h3>
                <p className="text-muted-foreground">
                  Start your investment journey with {offer.asset_code}
                </p>
              </div>
              <Button size="lg" onClick={handleInvest}>
                <DollarSign className="h-4 w-4 mr-2" />
                Invest Now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </InvestorLayout>
  );
}

