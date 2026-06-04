import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, Check, FileText, Upload, Loader2, Landmark, TrendingUp, X, AlertTriangle, Calendar, Eye, Trash2, Building2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { offersApi } from "@/api/offers";

interface AssetMetadata {
    propertyType?: 'house' | 'apartment' | 'townhouse' | 'land' | 'commercial';
    sizeM2?: string;
    rooms?: string;
    bedrooms?: string;
    yearBuilt?: string;
}

interface OfferFormData {
    offer_name: string;
    asset_code: string;
    description: string;
    offer_type: 'collateral' | 'sale';
    total_supply: string;
    unit_price: string;
    annual_interest_rate: string;
    min_investment: string;
    max_investment: string;
    payment_type: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'bullet';
    payment_day: string;
    payment_count: string;
    maturity_date: string;
    // Phase 2: Asset Intelligence
    rental_yield_rate: string;
    value_growth_rate: string;
    latitude: string;
    longitude: string;
    location_address: string;
    asset_metadata: AssetMetadata;
    // Phase 3: Asset lifecycle stage
    asset_stage: string;
    // Legal documents
    legal_documents: {
        contract?: { name: string; file?: File };
        terms?: { name: string; file?: File };
        prospectus?: { name: string; file?: File };
    };
}

const initialFormData: OfferFormData = {
    offer_name: '',
    asset_code: '',
    description: '',
    offer_type: 'collateral',
    total_supply: '',
    unit_price: '1.00',
    annual_interest_rate: '',
    min_investment: '100',
    max_investment: '',
    payment_type: 'monthly',
    payment_day: '1',
    payment_count: '12',
    maturity_date: '',
    rental_yield_rate: '',
    value_growth_rate: '',
    latitude: '',
    longitude: '',
    location_address: '',
    asset_metadata: {},
    asset_stage: '',
    legal_documents: {},
};

const STORAGE_KEY = 'createOffer_draft';

// Derive maturity date from installment count: today + N periods, day = payment_day
function computeMaturityDate(paymentType: string, paymentDay: number, paymentCount: number): string {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const monthsPerPeriod: Record<string, number> = {
        monthly: 1,
        quarterly: 3,
        semi_annual: 6,
        annual: 12,
    };
    const months = (monthsPerPeriod[paymentType] || 1) * paymentCount;
    const maturity = new Date(now);
    maturity.setMonth(maturity.getMonth() + months);
    maturity.setDate(Math.min(paymentDay, 28)); // clamp to 28 to avoid month overflow
    return maturity.toISOString().split('T')[0];
}

interface StoredDraft {
    formData: Omit<OfferFormData, 'legal_documents'>;
    step: number;
    offerType: 'collateral' | 'sale';
}

export function CreateOffer() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<OfferFormData>(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get offer type from URL params
    const offerType = searchParams.get('type') as 'collateral' | 'sale' | null;



    // Load saved draft from sessionStorage when offerType is available
    useEffect(() => {
        if (!offerType) return;

        const savedDraft = sessionStorage.getItem(STORAGE_KEY);
        let restored = false;

        if (savedDraft) {
            try {
                const parsed: StoredDraft = JSON.parse(savedDraft);
                // Only restore if the offer type matches and step is valid (not success)
                if (parsed.offerType === offerType && parsed.step < 5) {
                    setFormData(prev => ({
                        ...prev,
                        ...parsed.formData,
                        offer_type: parsed.offerType,
                        legal_documents: {} // Files can't be persisted
                    }));
                    setStep(parsed.step);
                    restored = true;
                }
            } catch (e) {
                console.error('Failed to parse saved draft:', e);
            }
        }

        // If no draft was restored, reset to initial state with correct offer type
        if (!restored) {
            setFormData({
                ...initialFormData,
                offer_type: offerType,
            });
            setStep(1);
        }


    }, [offerType]);

    // Save draft to sessionStorage whenever formData or step changes
    useEffect(() => {
        if (offerType && step < 5) {
            const { legal_documents: _legal_documents, ...formDataWithoutFiles } = formData;
            const draft: StoredDraft = {
                formData: formDataWithoutFiles,
                step,
                offerType: offerType,
            };
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        }
    }, [formData, step, offerType]);

    // Initialize offer type from URL or redirect if not provided
    useEffect(() => {
        if (!offerType) {
            navigate('/company/offers/new');
            return;
        }
        if (offerType === 'collateral' || offerType === 'sale') {
            setFormData(prev => ({ ...prev, offer_type: offerType }));
        }
    }, [offerType, navigate]);

    // Clear draft and navigate away
    const handleClose = () => {
        sessionStorage.removeItem(STORAGE_KEY);
        navigate('/company/offers');
    };

    // Total steps is 5: Step 1 is SelectOfferType page, Steps 2-5 are here.
    // Step 5 (displayStep) = Review & Submit. The confirmation screen after is not a numbered step.
    const totalSteps = 6;
    const displayStep = step + 1;
    const isSuccess = step === 6;

    const updateFormData = (updates: Partial<OfferFormData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    const handleNext = () => {
        if (step < totalSteps) {
            setStep(step + 1);
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    };

    const handleFileChange = (docType: 'contract' | 'terms' | 'prospectus', file: File | undefined) => {
        if (file) {
            setFormData(prev => ({
                ...prev,
                legal_documents: {
                    ...prev.legal_documents,
                    [docType]: { name: file.name, file: file }
                }
            }));
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await offersApi.create({
                offer_name: formData.offer_name,
                asset_code: formData.asset_code.toUpperCase(),
                description: formData.description,
                offer_type: formData.offer_type,
                total_supply: formData.total_supply,
                unit_price: formData.unit_price,
                annual_interest_rate: formData.annual_interest_rate ? parseFloat(formData.annual_interest_rate) : undefined,
                payment_type: formData.payment_type || undefined,
                payment_day: formData.payment_type !== 'bullet' ? parseInt(formData.payment_day) : undefined,
                maturity_date: formData.offer_type === 'collateral'
                    ? (formData.payment_type !== 'bullet'
                        ? computeMaturityDate(formData.payment_type, parseInt(formData.payment_day), parseInt(formData.payment_count))
                        : formData.maturity_date)
                    : undefined,
                offer_rules: {
                    min_investment: formData.min_investment ? Number(formData.min_investment) : undefined,
                    max_investment: formData.max_investment ? Number(formData.max_investment) : undefined,
                },
                // Phase 2: Asset Intelligence
                rental_yield_rate: formData.rental_yield_rate ? parseFloat(formData.rental_yield_rate) : undefined,
                value_growth_rate: formData.value_growth_rate ? parseFloat(formData.value_growth_rate) : undefined,
                latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
                longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
                location_address: formData.location_address || undefined,
                asset_metadata: Object.keys(formData.asset_metadata).length > 0 ? formData.asset_metadata : undefined,
                // Phase 3: Asset lifecycle stage
                asset_stage: formData.asset_stage || undefined,
                legal_documents: {}, // Metadata is optional, relying on file fields
                contract: formData.legal_documents.contract?.file,
                terms: formData.legal_documents.terms?.file,
                prospectus: formData.legal_documents.prospectus?.file,
            });

            if (response.success) {
                // Clear draft from storage on success
                sessionStorage.removeItem(STORAGE_KEY);
                // Move to confirmation step (step 5 internal = displayStep 6)
                setStep(6);
            } else {
                setError(response.error || 'Failed to create offer');
            }
        } catch (err: any) {
            console.error('Failed to create offer:', err);
            // Extract field-level validation errors from the API response
            let apiError = 'Failed to create offer';
            if (err.response?.data) {
                const d = typeof err.response.data === 'string'
                    ? (() => { try { return JSON.parse(err.response.data); } catch { return null; } })()
                    : err.response.data;

                // If backend returns validation details array, format them as readable messages
                if (Array.isArray(d?.details) && d.details.length > 0) {
                    apiError = d.details
                        .map((e: any) => {
                            const field = e.path || e.param || '';
                            const msg = e.msg || e.message || 'invalid';
                            return field ? `${field.replace(/_/g, ' ')}: ${msg}` : msg;
                        })
                        .join('. ');
                } else {
                    apiError = d?.error || d?.message || apiError;
                }
            }
            setError(apiError);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isStepValid = () => {
        switch (step) {
            case 1:
                return formData.offer_name && formData.asset_code && formData.description;
            case 2: {
                if (!formData.total_supply) return false;
                if (!formData.annual_interest_rate) return false;
                if (formData.offer_type === 'collateral') {
                    if (formData.payment_type === 'bullet') {
                        if (!formData.maturity_date) return false;
                        if (new Date(formData.maturity_date) <= new Date()) return false;
                    } else {
                        if (!formData.payment_count || parseInt(formData.payment_count) < 1) return false;
                    }
                }
                if (formData.max_investment && formData.min_investment &&
                    parseFloat(formData.max_investment) < parseFloat(formData.min_investment)) return false;
                return true;
            }
            case 3:
                return true; // Asset Details — optional during beta
            case 4:
                return true; // Documents optional
            case 5:
                return true; // Review
            default:
                return false;
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            {/* ... */}
            <div className="flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => step > 1 ? setStep(step - 1) : navigate('/company/offers/new')}
                        className="text-muted-foreground hover:text-white transition-transform hover:scale-110"
                        disabled={isSuccess}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold font-heading text-white">Create New Offer</h2>
                        {!isSuccess && <p className="text-muted-foreground">Step {displayStep} of {totalSteps}</p>}
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="text-muted-foreground hover:text-white transition-transform hover:scale-110"
                >
                    <X className="w-5 h-5" />
                </Button>
            </div>

            {/* Progress Indicator */}
            {!isSuccess && (
                <div className="flex gap-2 animate-fade-in-up animate-delay-1">
                    {Array.from({ length: totalSteps }, (_, i) => (
                        <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${i + 1 <= displayStep ? 'bg-primary' : 'bg-muted/20'}`}
                        />
                    ))}
                </div>
            )}

            {/* Form Content */}
            <Card className="glass-panel border-white/5 bg-white/5 animate-fade-in-up animate-delay-2">
                {step === 1 && (
                    <>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                            <CardDescription>Enter the basic details of your offer</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Offer Name *</label>
                                <Input
                                    placeholder="e.g. Premium Real Estate Fund"
                                    value={formData.offer_name}
                                    onChange={(e) => updateFormData({ offer_name: e.target.value })}
                                    className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Asset Code *</label>
                                <Input
                                    placeholder="e.g. PRFUND (3-12 characters)"
                                    value={formData.asset_code}
                                    onChange={(e) => updateFormData({ asset_code: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) })}
                                    className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 uppercase text-foreground"
                                    maxLength={12}
                                />
                                <p className="text-xs text-muted-foreground">
                                    This will be the token symbol on the Stellar network
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Description *</label>
                                <textarea
                                    placeholder="Descreva sua oferta em detalhes (Ex: Endereço do imóvel, descrição do ativo, garantias, etc...)"
                                    value={formData.description}
                                    onChange={(e) => updateFormData({ description: e.target.value })}
                                    className="w-full min-h-[120px] px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:border-teal-500/50 focus:outline-none text-white resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Offer Type</label>
                                <div className={`p-4 rounded-lg border flex items-center gap-3 ${formData.offer_type === 'collateral'
                                    ? 'border-blue-500/50 bg-blue-500/10'
                                    : 'border-emerald-500/50 bg-emerald-500/10'
                                    }`}>
                                    {formData.offer_type === 'collateral' ? (
                                        <Landmark className="w-5 h-5 text-blue-400" />
                                    ) : (
                                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                                    )}
                                    <div>
                                        <p className="font-medium text-white">
                                            {formData.offer_type === 'collateral' ? 'Collateral (Debt)' : 'Sale (Equity)'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formData.offer_type === 'collateral'
                                                ? 'Fixed interest rate with scheduled payments'
                                                : 'Ownership stake with variable dividends'}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="ml-auto text-xs text-muted-foreground hover:text-white"
                                        onClick={() => navigate('/company/offers/new')}
                                    >
                                        Change
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </>
                )}

                {step === 2 && (
                    <>
                        <CardHeader>
                            <CardTitle>Financial Details</CardTitle>
                            <CardDescription>Set the financial parameters of your offer</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Target Raise (USD) *</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input
                                        type="number"
                                        placeholder="100000"
                                        min="0"
                                        value={formData.total_supply}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '' || parseFloat(val) >= 0) {
                                                updateFormData({ total_supply: val, unit_price: '1.00' });
                                            }
                                        }}
                                        className="pl-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Each token = $1.00 USD — supply is set automatically
                                </p>
                            </div>

                            {formData.total_supply && parseFloat(formData.total_supply) > 0 && (
                                <div className="p-4 rounded-lg bg-white/5 border border-white/10 animate-fade-in">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Tokens to issue</span>
                                        <span className="text-lg font-bold text-emerald-400">
                                            {new Intl.NumberFormat('en-US').format(parseFloat(formData.total_supply))} tokens
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">@ $1.00 per token</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">
                                    {formData.offer_type === 'collateral' ? 'Annual Interest Rate (%) *' : 'Expected Annual Dividend (%) *'}
                                </label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        step="0.1"
                                        placeholder={formData.offer_type === 'collateral' ? '12.5' : '8.0'}
                                        value={formData.annual_interest_rate}
                                        onChange={(e) => updateFormData({ annual_interest_rate: e.target.value })}
                                        className="pr-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {formData.offer_type === 'collateral'
                                        ? 'Annual percentage yield paid to token holders'
                                        : 'Projected annual dividend rate distributed to shareholders'}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white">
                                    {formData.offer_type === 'collateral' ? 'Payment Frequency *' : 'Dividend Frequency *'}
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: 'monthly', label: 'Monthly' },
                                        { value: 'quarterly', label: 'Quarterly' },
                                        { value: 'semi_annual', label: 'Semi-Annual' },
                                        { value: 'annual', label: 'Annual' },
                                        ...(formData.offer_type === 'collateral'
                                            ? [{ value: 'bullet', label: 'Bullet (at maturity)' }]
                                            : []),
                                    ].map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => updateFormData({ payment_type: option.value as any })}
                                            className={`p-2 rounded-lg border text-sm transition-all ${formData.payment_type === option.value
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
                                                }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {formData.offer_type === 'collateral'
                                        ? 'How often investors receive yield payments'
                                        : 'How often dividends are distributed to shareholders'}
                                </p>
                            </div>

                            {formData.payment_type !== 'bullet' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-white">Payment Day</label>
                                        <Input
                                            type="number"
                                            min="1"
                                            max="28"
                                            placeholder="1"
                                            value={formData.payment_day}
                                            onChange={(e) => updateFormData({ payment_day: e.target.value })}
                                            className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 w-24 text-foreground"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Day of month for payments (1-28)
                                        </p>
                                    </div>

                                    {formData.offer_type === 'collateral' && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Number of Payments *</label>
                                            <Input
                                                type="number"
                                                min="1"
                                                max="120"
                                                placeholder="12"
                                                value={formData.payment_count}
                                                onChange={(e) => updateFormData({ payment_count: e.target.value })}
                                                className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 w-28 text-foreground"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Installments before principal return
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Derived maturity date — show for periodic collateral */}
                            {formData.offer_type === 'collateral' && formData.payment_type !== 'bullet' &&
                             formData.payment_count && parseInt(formData.payment_count) > 0 && (() => {
                                const periodsMap: Record<string, string> = {
                                    monthly: 'monthly',
                                    quarterly: 'quarterly',
                                    semi_annual: 'semi-annual',
                                    annual: 'annual',
                                };
                                const count = parseInt(formData.payment_count);
                                const derivedDate = computeMaturityDate(
                                    formData.payment_type,
                                    parseInt(formData.payment_day) || 1,
                                    count,
                                );
                                const maturityFormatted = new Date(derivedDate).toLocaleDateString('en-US', {
                                    year: 'numeric', month: 'long', day: 'numeric',
                                });
                                return (
                                    <div className="px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-zinc-400">Maturity Date</p>
                                            <p className="text-sm font-medium text-white">{maturityFormatted}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-zinc-400">Term</p>
                                            <p className="text-sm font-medium text-emerald-400">
                                                {count} {periodsMap[formData.payment_type]} payment{count !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Bullet — raw date picker (no installments concept) */}
                            {formData.offer_type === 'collateral' && formData.payment_type === 'bullet' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Bullet Payment Date *</label>
                                    <Input
                                        type="date"
                                        value={formData.maturity_date}
                                        onChange={(e) => updateFormData({ maturity_date: e.target.value })}
                                        className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                        min={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Date when principal and interest are paid in one lump sum
                                    </p>
                                    {formData.maturity_date && new Date(formData.maturity_date) <= new Date() && (
                                        <p className="text-xs text-red-400 mt-1">
                                            Maturity date must be in the future
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ─── Payment Preview Calculator ─── */}
                            {formData.total_supply && parseFloat(formData.total_supply) > 0 &&
                             formData.annual_interest_rate && parseFloat(formData.annual_interest_rate) > 0 && (() => {
                                const round7 = (v: number) => Math.round(v * 10_000_000) / 10_000_000;
                                const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
                                const totalInvested = parseFloat(formData.total_supply);
                                const rate = parseFloat(formData.annual_interest_rate);
                                const periodsMap: Record<string, { perYear: number; label: string }> = {
                                    monthly: { perYear: 12, label: 'month' },
                                    quarterly: { perYear: 4, label: 'quarter' },
                                    semi_annual: { perYear: 2, label: 'semester' },
                                    annual: { perYear: 1, label: 'year' },
                                };

                                if (formData.payment_type === 'bullet') {
                                    // Bullet: show total at maturity
                                    if (!formData.maturity_date || new Date(formData.maturity_date) <= new Date()) return null;
                                    const now = new Date();
                                    now.setHours(0, 0, 0, 0); // normalize to midnight — prevent time-of-day drift
                                    const maturity = new Date(formData.maturity_date);
                                    const yearsToMaturity = (maturity.getTime() - now.getTime()) / (365 * 24 * 60 * 60 * 1000);
                                    const totalInterest = round7(totalInvested * (rate / 100) * yearsToMaturity);
                                    const totalPayout = totalInvested + totalInterest;
                                    const months = Math.round(yearsToMaturity * 12);

                                    return (
                                        <div className="p-4 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-amber-600/5 animate-fade-in space-y-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                <span className="text-sm font-semibold text-amber-300">Cost Preview — Bullet</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Assuming 100% of the offer is sold, in ~{months} month{months !== 1 ? 's' : ''} you will owe:
                                            </p>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="p-3 rounded-lg bg-black/20 text-center">
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Principal</p>
                                                    <p className="text-base font-bold text-white mt-0.5">{fmt(totalInvested)}</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-black/20 text-center">
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Interest</p>
                                                    <p className="text-base font-bold text-amber-400 mt-0.5">{fmt(totalInterest)}</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-black/20 border border-amber-500/20 text-center">
                                                    <p className="text-[10px] text-amber-300/80 uppercase tracking-wider font-semibold">Total Due</p>
                                                    <p className="text-base font-bold text-amber-300 mt-0.5">{fmt(totalPayout)}</p>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground/60">
                                                Single lump-sum payment at maturity. Exact amount depends on actual amount raised.
                                            </p>
                                        </div>
                                    );
                                } else {
                                    // Periodic: show per-period amount
                                    const period = periodsMap[formData.payment_type];
                                    if (!period) return null;
                                    const periodInterest = round7(totalInvested * (rate / 100) / period.perYear);
                                    const annualInterest = round7(totalInvested * (rate / 100));

                                    // Use payment_count directly for periodic offers
                                    let totalPayments: number | null = null;
                                    let totalInterestOverLife: number | null = null;
                                    let totalOwedAtEnd: number | null = null;
                                    if (formData.offer_type === 'collateral' && formData.payment_count && parseInt(formData.payment_count) > 0) {
                                        totalPayments = parseInt(formData.payment_count);
                                        totalInterestOverLife = round7(periodInterest * totalPayments);
                                        totalOwedAtEnd = totalInvested + totalInterestOverLife;
                                    }

                                    return (
                                        <div className="p-4 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-amber-600/5 animate-fade-in space-y-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                <span className="text-sm font-semibold text-amber-300">
                                                    {formData.offer_type === 'sale' ? 'Dividend' : 'Cost'} Preview — {formData.payment_type.replace('_', '-').replace(/\b\w/g, c => c.toUpperCase())}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Assuming 100% of the offer is sold, each {period.label} you will owe:
                                            </p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-3 rounded-lg bg-black/20 border border-amber-500/20 text-center">
                                                    <p className="text-[10px] text-amber-300/80 uppercase tracking-wider font-semibold">Per {period.label}</p>
                                                    <p className="text-lg font-bold text-amber-300 mt-0.5">{fmt(periodInterest)}</p>
                                                    <p className="text-[10px] text-muted-foreground">{formData.offer_type === 'sale' ? 'dividend' : 'interest only'}</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-black/20 text-center">
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Annual Total</p>
                                                    <p className="text-lg font-bold text-white mt-0.5">{fmt(annualInterest)}</p>
                                                    <p className="text-[10px] text-muted-foreground">{period.perYear} payment{period.perYear > 1 ? 's' : ''}/year</p>
                                                </div>
                                            </div>
                                            {totalPayments !== null && totalInterestOverLife !== null && totalOwedAtEnd !== null && (
                                                <div className="pt-2 border-t border-white/5 space-y-1.5">
                                                    <p className="text-xs text-muted-foreground">
                                                        Over the full term ({totalPayments} payment{totalPayments !== 1 ? 's' : ''} + principal return):
                                                    </p>
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div className="p-2.5 rounded-lg bg-black/20 text-center">
                                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Interest</p>
                                                            <p className="text-sm font-bold text-amber-400 mt-0.5">{fmt(totalInterestOverLife)}</p>
                                                        </div>
                                                        <div className="p-2.5 rounded-lg bg-black/20 text-center">
                                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Principal</p>
                                                            <p className="text-sm font-bold text-white mt-0.5">{fmt(totalInvested)}</p>
                                                        </div>
                                                        <div className="p-2.5 rounded-lg bg-black/20 border border-amber-500/20 text-center">
                                                            <p className="text-[10px] text-amber-300/80 uppercase tracking-wider font-semibold">Grand Total</p>
                                                            <p className="text-sm font-bold text-amber-300 mt-0.5">{fmt(totalOwedAtEnd)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            <p className="text-[10px] text-muted-foreground/60">
                                                Interest payments are periodic. Principal is returned at maturity. Exact amounts depend on actual amount raised.
                                            </p>
                                        </div>
                                    );
                                }
                            })()}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Minimum Investment (USD)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                        <Input
                                            type="number"
                                            min="0"
                                            placeholder="100"
                                            value={formData.min_investment}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === '' || parseFloat(val) >= 0) {
                                                    updateFormData({ min_investment: val });
                                                }
                                            }}
                                            className="pl-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Maximum Investment (USD)</label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                            <Input
                                                type="number"
                                                min={formData.min_investment || "0"}
                                                max={(parseFloat(formData.total_supply || '0') * parseFloat(formData.unit_price || '0')).toString()}
                                                placeholder="No limit"
                                                value={formData.max_investment}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const totalRaise = parseFloat(formData.total_supply || '0') * parseFloat(formData.unit_price || '0');

                                                    // Allow clearing
                                                    if (val === '') {
                                                        updateFormData({ max_investment: '' });
                                                        return;
                                                    }

                                                    // Strict positive number check
                                                    if (parseFloat(val) < 0) return;

                                                    // Check against total raise if supply/price are set
                                                    if (totalRaise > 0 && parseFloat(val) > totalRaise) {
                                                        // Cap at total raise visually or just let them type? 
                                                        // User asked to cap it. Let's strictly cap it.
                                                        updateFormData({ max_investment: totalRaise.toString() });
                                                    } else {
                                                        updateFormData({ max_investment: val });
                                                    }
                                                }}
                                                className="pl-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-white/10 hover:bg-white/5 hover:text-emerald-400"
                                            onClick={() => {
                                                const totalRaise = parseFloat(formData.total_supply || '0') * parseFloat(formData.unit_price || '0');
                                                if (totalRaise > 0) {
                                                    updateFormData({ max_investment: totalRaise.toString() });
                                                }
                                            }}
                                            disabled={!formData.total_supply || !formData.unit_price}
                                        >
                                            Max
                                        </Button>
                                    </div>
                                    {formData.max_investment && formData.min_investment && parseFloat(formData.max_investment) < parseFloat(formData.min_investment) && (
                                        <p className="text-xs text-red-400">
                                            Must be greater than minimum ({new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(formData.min_investment))})
                                        </p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </>
                )}

                {step === 3 && (
                    <>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-primary" />
                                Asset Details
                            </CardTitle>
                            <CardDescription>Describe the underlying asset — location, type, and characteristics</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Yield Decomposition */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-white">Yield Breakdown (optional)</label>
                                <p className="text-xs text-muted-foreground -mt-1">
                                    How the yield is distributed between rental income and value growth
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-muted-foreground">Rental Income (%)</label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                step="0.1"
                                                placeholder="8.0"
                                                value={formData.rental_yield_rate}
                                                onChange={(e) => updateFormData({ rental_yield_rate: e.target.value })}
                                                className="pr-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-muted-foreground">Value Growth (%)</label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                step="0.1"
                                                placeholder="4.0"
                                                value={formData.value_growth_rate}
                                                onChange={(e) => updateFormData({ value_growth_rate: e.target.value })}
                                                className="pr-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                                        </div>
                                    </div>
                                </div>
                                {formData.rental_yield_rate && formData.value_growth_rate && (
                                    <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-muted-foreground">
                                        Rental {formData.rental_yield_rate}% + Growth {formData.value_growth_rate}% ={' '}
                                        <span className="text-emerald-400 font-medium">
                                            {(parseFloat(formData.rental_yield_rate) + parseFloat(formData.value_growth_rate)).toFixed(1)}% total
                                        </span>
                                        {formData.annual_interest_rate && (
                                            <span className="text-muted-foreground/60">
                                                {' '}(APY: {formData.annual_interest_rate}%)
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Location */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-white">Location (optional)</label>
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-muted-foreground">Address</label>
                                        <Input
                                            placeholder="Rua Example 123, São Paulo, SP"
                                            value={formData.location_address}
                                            onChange={(e) => updateFormData({ location_address: e.target.value })}
                                            className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-muted-foreground">Latitude</label>
                                            <Input
                                                type="number"
                                                step="0.0000001"
                                                placeholder="-23.5505"
                                                value={formData.latitude}
                                                onChange={(e) => updateFormData({ latitude: e.target.value })}
                                                className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-muted-foreground">Longitude</label>
                                            <Input
                                                type="number"
                                                step="0.0000001"
                                                placeholder="-46.6333"
                                                value={formData.longitude}
                                                onChange={(e) => updateFormData({ longitude: e.target.value })}
                                                className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Property Metadata — collateral only */}
                            {formData.offer_type === 'collateral' && (
                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-white">Property Details (optional)</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-muted-foreground">Property Type</label>
                                            <select
                                                value={formData.asset_metadata.propertyType || ''}
                                                onChange={(e) => updateFormData({
                                                    asset_metadata: { ...formData.asset_metadata, propertyType: (e.target.value || undefined) as AssetMetadata['propertyType'] }
                                                })}
                                                className="w-full h-10 px-3 rounded-md bg-black/20 border border-white/10 focus:border-teal-500/50 focus:outline-none text-white text-sm"
                                            >
                                                <option value="">Select type</option>
                                                <option value="house">House</option>
                                                <option value="apartment">Apartment</option>
                                                <option value="townhouse">Townhouse</option>
                                                <option value="land">Land</option>
                                                <option value="commercial">Commercial</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-muted-foreground">Size (m²)</label>
                                            <Input
                                                type="number"
                                                placeholder="120"
                                                value={formData.asset_metadata.sizeM2 || ''}
                                                onChange={(e) => updateFormData({
                                                    asset_metadata: { ...formData.asset_metadata, sizeM2: e.target.value }
                                                })}
                                                className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-muted-foreground">Rooms</label>
                                            <Input
                                                type="number"
                                                placeholder="5"
                                                value={formData.asset_metadata.rooms || ''}
                                                onChange={(e) => updateFormData({
                                                    asset_metadata: { ...formData.asset_metadata, rooms: e.target.value }
                                                })}
                                                className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-muted-foreground">Bedrooms</label>
                                            <Input
                                                type="number"
                                                placeholder="3"
                                                value={formData.asset_metadata.bedrooms || ''}
                                                onChange={(e) => updateFormData({
                                                    asset_metadata: { ...formData.asset_metadata, bedrooms: e.target.value }
                                                })}
                                                className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-muted-foreground">Year Built</label>
                                        <Input
                                            type="number"
                                            placeholder="2020"
                                            min="1900"
                                            max={new Date().getFullYear()}
                                            value={formData.asset_metadata.yearBuilt || ''}
                                            onChange={(e) => updateFormData({
                                                asset_metadata: { ...formData.asset_metadata, yearBuilt: e.target.value }
                                            })}
                                            className="glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground w-32"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Phase 3: Asset Stage */}
                            <div className="space-y-1.5 pt-4 border-t border-white/5">
                                <label className="text-sm font-medium text-white">Asset Stage</label>
                                <select
                                    value={formData.asset_stage}
                                    onChange={(e) => updateFormData({ asset_stage: e.target.value })}
                                    className="w-full h-10 px-3 rounded-md bg-black/20 border border-white/10 focus:border-teal-500/50 focus:outline-none text-white text-sm"
                                >
                                    <option value="">Select stage (optional)</option>
                                    <option value="under_development">Under Development</option>
                                    <option value="completed">Completed</option>
                                    <option value="income_producing">Income Producing</option>
                                </select>
                            </div>

                            <p className="text-xs text-muted-foreground/60 pt-2">
                                All fields on this step are optional during beta. They will be required at production launch.
                            </p>
                        </CardContent>
                    </>
                )}

                {step === 4 && (
                    <>
                        <CardHeader>
                            <CardTitle>Legal Documents</CardTitle>
                            <CardDescription>Upload required legal documents (optional for draft)</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                {(['contract', 'terms', 'prospectus'] as const).map((docType) => (
                                    <div key={docType} className={`p-4 rounded-xl border transition-colors ${formData.legal_documents[docType] ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-dashed border-white/20'}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${formData.legal_documents[docType] ? 'bg-emerald-500/15' : 'bg-muted/30'}`}>
                                                    {formData.legal_documents[docType] ? (
                                                        <Check className="w-5 h-5 text-emerald-400" />
                                                    ) : (
                                                        <FileText className="w-5 h-5 text-muted-foreground" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-medium ${formData.legal_documents[docType] ? 'text-emerald-300' : 'text-white'}`}>
                                                        {docType === 'contract' ? 'Investment Contract' :
                                                            docType === 'terms' ? 'Terms & Conditions' : 'Prospectus'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                        {formData.legal_documents[docType]?.name || 'No file selected'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="relative flex items-center gap-2">
                                                <input
                                                    type="file"
                                                    id={`file-${docType}`}
                                                    className="hidden"
                                                    onChange={(e) => handleFileChange(docType, e.target.files?.[0])}
                                                    accept=".pdf,.doc,.docx"
                                                />
                                                {formData.legal_documents[docType] ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                        onClick={() => {
                                                            const newDocs = { ...formData.legal_documents };
                                                            delete newDocs[docType];
                                                            updateFormData({ legal_documents: newDocs });
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="border-white/10 hover:bg-white/5 cursor-pointer h-8 w-8"
                                                        onClick={() => document.getElementById(`file-${docType}`)?.click()}
                                                    >
                                                        <Upload className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="text-center space-y-1 pt-2">
                                <p className="text-xs text-muted-foreground">
                                    Documents will be stored on IPFS for immutability and transparency
                                </p>
                                <a
                                    href="/company/ipfs-info"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 transition-colors inline-block"
                                >
                                    Learn more about IPFS and document privacy →
                                </a>
                            </div>
                        </CardContent>
                    </>
                )}

                {step === 5 && (
                    <>
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <Check className="w-5 h-5 text-primary" />
                                Review & Submit
                            </CardTitle>
                            <CardDescription>Confirm your offer details before submitting for approval</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {error && (
                                <div className="p-4 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <p className="text-sm">{error}</p>
                                </div>
                            )}

                            {/* Offer Type Badge */}
                            <div className={`p-4 rounded-xl border flex items-center gap-4 ${formData.offer_type === 'collateral'
                                ? 'bg-gradient-to-r from-blue-500/10 to-transparent border-blue-500/30'
                                : 'bg-gradient-to-r from-emerald-500/10 to-transparent border-emerald-500/30'
                                }`}>
                                <div className={`p-3 rounded-lg ${formData.offer_type === 'collateral' ? 'bg-blue-500/20' : 'bg-emerald-500/20'
                                    }`}>
                                    {formData.offer_type === 'collateral'
                                        ? <Landmark className="w-6 h-6 text-blue-400" />
                                        : <TrendingUp className="w-6 h-6 text-emerald-400" />
                                    }
                                </div>
                                <div>
                                    <p className={`text-lg font-semibold ${formData.offer_type === 'collateral' ? 'text-blue-300' : 'text-emerald-300'
                                        }`}>
                                        {formData.offer_type === 'collateral' ? 'Debt Offering (Collateral)' : 'Equity Offering (Sale)'}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {formData.offer_type === 'collateral'
                                            ? 'Fixed interest payments with principal return at maturity'
                                            : 'Ownership stake with variable dividends based on performance'
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Key Metrics Summary */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Target Raise</p>
                                    <p className="text-xl font-bold text-white mt-1">
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(parseFloat(formData.total_supply || '0'))}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{new Intl.NumberFormat('en-US').format(parseFloat(formData.total_supply || '0'))} tokens @ $1.00</p>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                        {formData.offer_type === 'collateral' ? 'Interest Rate' : 'Dividend Yield'}
                                    </p>
                                    <p className="text-xl font-bold text-emerald-400 mt-1">{formData.annual_interest_rate}% APY</p>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Min Investment</p>
                                    <p className="text-xl font-bold text-white mt-1">${formData.min_investment || '100'}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Max Investment</p>
                                    <p className="text-xl font-bold text-white mt-1">{formData.max_investment ? `$${formData.max_investment}` : '∞'}</p>
                                </div>
                            </div>

                            {/* Detailed Sections */}
                            <div className="space-y-4">
                                {/* Basic Info */}
                                <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                                    <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-primary" />
                                        Basic Information
                                    </h4>
                                    <div className="grid gap-4">
                                        <div className="flex justify-between items-start border-b border-white/5 pb-3">
                                            <span className="text-sm text-muted-foreground">Offer Name</span>
                                            <span className="text-sm text-white font-medium text-right">{formData.offer_name}</span>
                                        </div>
                                        <div className="flex justify-between items-start border-b border-white/5 pb-3">
                                            <span className="text-sm text-muted-foreground">Asset Code</span>
                                            <span className="text-sm text-white font-mono bg-white/5 px-2 py-0.5 rounded">{formData.asset_code}</span>
                                        </div>
                                        <div>
                                            <span className="text-sm text-muted-foreground block mb-2">Description</span>
                                            <p className="text-sm text-white/80 bg-white/5 p-3 rounded-lg">{formData.description}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment / Dividend Schedule */}
                                <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                                    <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-primary" />
                                        {formData.offer_type === 'collateral' ? 'Payment Schedule' : 'Dividend Schedule'}
                                    </h4>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Frequency</span>
                                        <span className="text-sm text-primary font-medium capitalize">
                                            {formData.payment_type.replace('_', '-')}
                                            {formData.payment_type !== 'bullet' && ` (Day ${formData.payment_day})`}
                                        </span>
                                    </div>
                                    {formData.offer_type === 'sale' && (
                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                                            <span className="text-sm text-muted-foreground">Duration</span>
                                            <span className="text-sm text-white font-medium">Perpetual (no maturity)</span>
                                        </div>
                                    )}
                                </div>

                                {/* Important Dates */}
                                <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                                    <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-primary" />
                                        Important Dates
                                    </h4>
                                    <div className="grid gap-4">
                                        <div className="flex justify-between items-start border-b border-white/5 pb-3">
                                            <span className="text-sm text-muted-foreground">Created Date</span>
                                            <span className="text-sm text-white font-medium">{new Date().toLocaleDateString()}</span>
                                        </div>
                                        {formData.offer_type === 'collateral' && (() => {
                                            const maturityStr = formData.payment_type !== 'bullet'
                                                ? computeMaturityDate(formData.payment_type, parseInt(formData.payment_day) || 1, parseInt(formData.payment_count) || 1)
                                                : formData.maturity_date;
                                            const maturityDate = maturityStr ? new Date(maturityStr) : null;
                                            return (
                                                <>
                                                    <div className="flex justify-between items-start border-b border-white/5 pb-3">
                                                        <span className="text-sm text-muted-foreground">Payment Schedule</span>
                                                        <span className="text-sm text-white font-medium">
                                                            {formData.payment_type === 'bullet'
                                                                ? 'Lump sum at maturity'
                                                                : `${formData.payment_count} ${formData.payment_type.replace('_', '-')} payments (Day ${formData.payment_day})`}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-sm text-muted-foreground">Maturity Date</span>
                                                        <span className="text-sm text-white font-medium">
                                                            {maturityDate ? maturityDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                                                        </span>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                        {formData.offer_type === 'sale' && (
                                            <div className="flex justify-between items-start border-b border-white/5 pb-3">
                                                <span className="text-sm text-muted-foreground">Dividend Cycle</span>
                                                <span className="text-sm text-white font-medium capitalize">
                                                    {formData.payment_type.replace('_', '-')} — {formData.annual_interest_rate}% APY
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Documents */}
                                <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                                    <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                        <Upload className="w-4 h-4 text-primary" />
                                        Legal Documents
                                    </h4>
                                    {Object.entries(formData.legal_documents).length > 0 ? (
                                        <div className="space-y-3">
                                            {Object.entries(formData.legal_documents).map(([key, doc]) => (
                                                <div
                                                    key={key}
                                                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
                                                >
                                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                                                        <FileText className="w-5 h-5 text-emerald-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-white capitalize">{key}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{doc?.name}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {doc?.file && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    // Create a temporary URL for the file and open it
                                                                    const url = URL.createObjectURL(doc.file!);
                                                                    window.open(url, '_blank');
                                                                    // Clean up URL after a short delay
                                                                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                                                                }}
                                                                className="h-8 px-3 text-xs gap-1.5"
                                                            >
                                                                <Eye className="w-3.5 h-3.5" />
                                                                Review
                                                            </Button>
                                                        )}
                                                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <p className="text-xs text-muted-foreground pt-2">
                                                Click "Review" to preview each document before submitting
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-6 text-center">
                                            <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center mb-3">
                                                <FileText className="w-6 h-6 text-muted-foreground/50" />
                                            </div>
                                            <p className="text-sm text-muted-foreground">No documents uploaded</p>
                                            <p className="text-xs text-muted-foreground/70 mt-1">Documents are optional for submission</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Approval Notice */}
                            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="text-amber-300 font-medium">Approval Required</p>
                                    <p className="text-amber-200/70 mt-1">
                                        Your offer will be reviewed by platform administrators before going live.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </>
                )}

                {/* Step 6 (internal) = Confirmation */}
                {step === 6 && (
                    <>
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2 text-emerald-400">
                                <Check className="w-6 h-6" />
                                Offer Submitted Successfully
                            </CardTitle>
                            <CardDescription>Your offer has been submitted and is pending admin approval</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Success Banner */}
                            <div className="p-6 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <Check className="w-8 h-8 text-emerald-400" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Thank You!</h3>
                                <p className="text-muted-foreground">
                                    Your offer "{formData.offer_name}" has been submitted for review.
                                </p>
                            </div>

                            {/* Submission Summary */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-white">Submission Summary</h4>

                                <div className="grid gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Offer Name</span>
                                        <span className="text-sm text-white font-medium">{formData.offer_name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Asset Code</span>
                                        <span className="text-sm text-white font-mono">{formData.asset_code}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Type</span>
                                        <span className={`text-sm font-medium ${formData.offer_type === 'collateral' ? 'text-blue-400' : 'text-emerald-400'}`}>
                                            {formData.offer_type === 'collateral' ? 'Debt (Collateral)' : 'Equity (Sale)'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Total Supply</span>
                                        <span className="text-sm text-white">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(parseFloat(formData.total_supply || '0'))}
                                        </span>
                                    </div>
                                    {formData.offer_type === 'collateral' && (
                                        <div className="flex justify-between">
                                            <span className="text-sm text-muted-foreground">Interest Rate</span>
                                            <span className="text-sm text-emerald-400">{formData.annual_interest_rate}% APY</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* What's Next */}
                            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                <h4 className="text-sm font-semibold text-blue-300 mb-2">What happens next?</h4>
                                <ul className="space-y-2 text-sm text-blue-200/70">
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-400 mt-0.5">1.</span>
                                        Platform administrators will review your offer
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-400 mt-0.5">2.</span>
                                        You'll receive a notification once approved
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-400 mt-0.5">3.</span>
                                        Your offer will be listed on the marketplace for investors
                                    </li>
                                </ul>
                            </div>

                            {/* Action Button */}
                            <Button
                                onClick={() => navigate('/company/offers')}
                                className="w-full bg-primary hover:bg-primary/90"
                            >
                                View My Offers
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </CardContent>
                    </>
                )}

                {/* Navigation Buttons - Hide on confirmation step */}
                {step < 6 && (
                    <div className="flex justify-between p-6 border-t border-white/5">
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={step === 1}
                            className="text-muted-foreground hover:text-white"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>

                        {step < 5 ? (
                            <Button
                                onClick={handleNext}
                                disabled={!isStepValid()}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                Next
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4 mr-2" />
                                        Submit for Review
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}
