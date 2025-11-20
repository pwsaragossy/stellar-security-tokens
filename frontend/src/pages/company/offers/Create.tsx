import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompanyLayout } from '@/components/layout/CompanyLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Calendar, DollarSign } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface OfferFormData {
  asset_code: string;
  offer_name: string;
  description: string;
  total_supply: string;
  payment_type: string;
  annual_interest_rate: string;
  maturity_date: string;
  bullet_payment_amount: string;
  payment_frequency: string;
  offer_type: string;
  min_investment: string;
  max_investment: string;
  price_per_token: string;
}

const PAYMENT_TYPES = [
  { value: 'monthly', label: 'Monthly Interest Payments', description: 'Investors receive monthly interest payments' },
  { value: 'bullet', label: 'Bullet Payment', description: 'Single payment at maturity date' },
  { value: 'quarterly', label: 'Quarterly Interest Payments', description: 'Investors receive quarterly interest payments' },
  { value: 'semi_annual', label: 'Semi-Annual Interest Payments', description: 'Investors receive semi-annual interest payments' },
];

const OFFER_TYPES = [
  { value: 'collateral', label: 'Collateral Offering', description: 'Secured offering backed by assets' },
  { value: 'sale', label: 'Token Sale', description: 'Direct token sale offering' },
];

export function CompanyOfferCreate() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<OfferFormData>({
    asset_code: '',
    offer_name: '',
    description: '',
    total_supply: '',
    payment_type: 'monthly',
    annual_interest_rate: '',
    maturity_date: '',
    bullet_payment_amount: '',
    payment_frequency: '1',
    offer_type: 'collateral',
    min_investment: '',
    max_investment: '',
    price_per_token: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.asset_code) newErrors.asset_code = 'Asset code is required';
    if (!formData.offer_name) newErrors.offer_name = 'Offer name is required';
    if (!formData.description) newErrors.description = 'Description is required';
    if (!formData.total_supply) newErrors.total_supply = 'Total supply is required';

    // Asset code validation
    if (formData.asset_code && (!/^[A-Z0-9]{1,12}$/.test(formData.asset_code))) {
      newErrors.asset_code = 'Asset code must be 1-12 uppercase letters and numbers';
    }

    // Payment type specific validation
    if (formData.payment_type === 'monthly' || formData.payment_type === 'quarterly' || formData.payment_type === 'semi_annual') {
      if (!formData.annual_interest_rate) {
        newErrors.annual_interest_rate = 'Annual interest rate is required for periodic payments';
      } else if (parseFloat(formData.annual_interest_rate) <= 0) {
        newErrors.annual_interest_rate = 'Interest rate must be greater than 0';
      }
    }

    if (formData.payment_type === 'bullet') {
      if (!formData.maturity_date) {
        newErrors.maturity_date = 'Maturity date is required for bullet payments';
      } else {
        const maturityDate = new Date(formData.maturity_date);
        if (maturityDate <= new Date()) {
          newErrors.maturity_date = 'Maturity date must be in the future';
        }
      }

      if (!formData.bullet_payment_amount) {
        newErrors.bullet_payment_amount = 'Bullet payment amount is required';
      } else if (parseFloat(formData.bullet_payment_amount) <= 0) {
        newErrors.bullet_payment_amount = 'Payment amount must be greater than 0';
      }
    }

    // Numeric validations
    if (formData.total_supply && parseFloat(formData.total_supply) <= 0) {
      newErrors.total_supply = 'Total supply must be greater than 0';
    }

    if (formData.min_investment && parseFloat(formData.min_investment) <= 0) {
      newErrors.min_investment = 'Minimum investment must be greater than 0';
    }

    if (formData.max_investment && parseFloat(formData.max_investment) <= 0) {
      newErrors.max_investment = 'Maximum investment must be greater than 0';
    }

    if (formData.min_investment && formData.max_investment &&
        parseFloat(formData.min_investment) > parseFloat(formData.max_investment)) {
      newErrors.max_investment = 'Maximum investment must be greater than minimum investment';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast('error', 'Please fix the errors in the form');
      return;
    }

    setIsLoading(true);
    try {
      const submitData = {
        ...formData,
        total_supply: parseFloat(formData.total_supply),
        annual_interest_rate: formData.annual_interest_rate ? parseFloat(formData.annual_interest_rate) : undefined,
        bullet_payment_amount: formData.bullet_payment_amount ? parseFloat(formData.bullet_payment_amount) : undefined,
        payment_frequency: parseInt(formData.payment_frequency),
        min_investment: formData.min_investment ? parseFloat(formData.min_investment) : undefined,
        max_investment: formData.max_investment ? parseFloat(formData.max_investment) : undefined,
        price_per_token: formData.price_per_token ? parseFloat(formData.price_per_token) : undefined,
      };

      await api.post('/companies/offers', submitData);
      showToast('success', 'Offer created successfully!');
      navigate('/company/offers');
    } catch (error: any) {
      console.error('Error creating offer:', error);
      const errorMessage = error.response?.data?.error || 'Failed to create offer';
      showToast('error', errorMessage);

      if (error.response?.data?.details) {
        setErrors({ general: error.response.data.details });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof OfferFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const isPeriodicPayment = ['monthly', 'quarterly', 'semi_annual'].includes(formData.payment_type);
  const isBulletPayment = formData.payment_type === 'bullet';

  return (
    <CompanyLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create New Offer</h1>
          <p className="text-muted-foreground">
            Set up a new security token offering with customizable payment terms
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Define the fundamental details of your token offering
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="asset_code">Asset Code *</Label>
                  <Input
                    id="asset_code"
                    value={formData.asset_code}
                    onChange={(e) => handleInputChange('asset_code', e.target.value.toUpperCase())}
                    placeholder="e.g., SIN01"
                    maxLength={12}
                  />
                  {errors.asset_code && (
                    <p className="text-sm text-destructive">{errors.asset_code}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="offer_name">Offer Name *</Label>
                  <Input
                    id="offer_name"
                    value={formData.offer_name}
                    onChange={(e) => handleInputChange('offer_name', e.target.value)}
                    placeholder="e.g., Green Energy Token Series 1"
                  />
                  {errors.offer_name && (
                    <p className="text-sm text-destructive">{errors.offer_name}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('description', e.target.value)}
                  placeholder="Describe your offering, use case, and value proposition..."
                  rows={3}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_supply">Total Supply *</Label>
                  <Input
                    id="total_supply"
                    type="number"
                    value={formData.total_supply}
                    onChange={(e) => handleInputChange('total_supply', e.target.value)}
                    placeholder="1000000"
                    min="0"
                    step="0.0000001"
                  />
                  {errors.total_supply && (
                    <p className="text-sm text-destructive">{errors.total_supply}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="offer_type">Offer Type *</Label>
                  <Select value={formData.offer_type} onValueChange={(value: string) => handleInputChange('offer_type', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OFFER_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-sm text-muted-foreground">{type.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_type">Payment Type *</Label>
                  <Select value={formData.payment_type} onValueChange={(value: string) => handleInputChange('payment_type', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-sm text-muted-foreground">{type.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Payment Configuration
              </CardTitle>
              <CardDescription>
                Configure how investors will receive returns from their investment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isPeriodicPayment && (
                <div className="space-y-2">
                  <Label htmlFor="annual_interest_rate">Annual Interest Rate (%) *</Label>
                  <Input
                    id="annual_interest_rate"
                    type="number"
                    value={formData.annual_interest_rate}
                    onChange={(e) => handleInputChange('annual_interest_rate', e.target.value)}
                    placeholder="10.0"
                    min="0"
                    step="0.1"
                  />
                  {errors.annual_interest_rate && (
                    <p className="text-sm text-destructive">{errors.annual_interest_rate}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Investors will receive {formData.payment_type === 'monthly' ? 'monthly' :
                      formData.payment_type === 'quarterly' ? 'quarterly' : 'semi-annual'} payments
                    at this annual rate
                  </p>
                </div>
              )}

              {isBulletPayment && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="maturity_date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Maturity Date *
                      </Label>
                      <Input
                        id="maturity_date"
                        type="date"
                        value={formData.maturity_date}
                        onChange={(e) => handleInputChange('maturity_date', e.target.value)}
                      />
                      {errors.maturity_date && (
                        <p className="text-sm text-destructive">{errors.maturity_date}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bullet_payment_amount">Bullet Payment Amount (USDC) *</Label>
                      <Input
                        id="bullet_payment_amount"
                        type="number"
                        value={formData.bullet_payment_amount}
                        onChange={(e) => handleInputChange('bullet_payment_amount', e.target.value)}
                        placeholder="10000.00"
                        min="0"
                        step="0.01"
                      />
                      {errors.bullet_payment_amount && (
                        <p className="text-sm text-destructive">{errors.bullet_payment_amount}</p>
                      )}
                    </div>
                  </div>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Investors will receive a single payment of {formData.bullet_payment_amount || '0'} USDC
                      on {formData.maturity_date || 'the maturity date'}.
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </CardContent>
          </Card>

          {/* Investment Limits */}
          <Card>
            <CardHeader>
              <CardTitle>Investment Limits</CardTitle>
              <CardDescription>
                Set minimum and maximum investment amounts (optional)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_investment">Minimum Investment (USDC)</Label>
                  <Input
                    id="min_investment"
                    type="number"
                    value={formData.min_investment}
                    onChange={(e) => handleInputChange('min_investment', e.target.value)}
                    placeholder="100"
                    min="0"
                    step="0.01"
                  />
                  {errors.min_investment && (
                    <p className="text-sm text-destructive">{errors.min_investment}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_investment">Maximum Investment (USDC)</Label>
                  <Input
                    id="max_investment"
                    type="number"
                    value={formData.max_investment}
                    onChange={(e) => handleInputChange('max_investment', e.target.value)}
                    placeholder="10000"
                    min="0"
                    step="0.01"
                  />
                  {errors.max_investment && (
                    <p className="text-sm text-destructive">{errors.max_investment}</p>
                  )}
                </div>
              </div>

              {formData.offer_type === 'sale' && (
                <div className="space-y-2">
                  <Label htmlFor="price_per_token">Price per Token (USDC)</Label>
                  <Input
                    id="price_per_token"
                    type="number"
                    value={formData.price_per_token}
                    onChange={(e) => handleInputChange('price_per_token', e.target.value)}
                    placeholder="1.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {errors.general && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.general}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4">
            <Button type="button" variant="outline" onClick={() => navigate('/company/offers')}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating Offer...' : 'Create Offer'}
            </Button>
          </div>
        </form>
      </div>
    </CompanyLayout>
  );
}

