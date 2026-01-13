import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, Check, FileText, Upload, Loader2, Landmark, TrendingUp, X, AlertTriangle, Calendar, Eye, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { offersApi } from "@/api/offers";

interface OfferFormData {
    offer_name: string;
    asset_code: string;
    description: string;
    offer_type: 'collateral' | 'sale';
    total_supply: string;
    annual_interest_rate: string;
    min_investment: string;
    max_investment: string;
    payment_type: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'bullet';
    payment_day: string;
    maturity_date: string; // Required for bullet payments
    // Legal documents will be handled separately via IPFS
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
    annual_interest_rate: '',
    min_investment: '100',
    max_investment: '',
    payment_type: 'monthly',
    payment_day: '1',
    maturity_date: '',
    legal_documents: {},
};

const STORAGE_KEY = 'createOffer_draft';

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

    // Track if we've restored the draft to prevent re-running
    const [draftRestored, setDraftRestored] = useState(false);

    // Load saved draft from sessionStorage when offerType is available
    useEffect(() => {
        if (draftRestored || !offerType) return;

        const savedDraft = sessionStorage.getItem(STORAGE_KEY);
        if (savedDraft) {
            try {
                const parsed: StoredDraft = JSON.parse(savedDraft);
                // Only restore if the offer type matches
                if (parsed.offerType === offerType) {
                    setFormData(prev => ({
                        ...prev,
                        ...parsed.formData,
                        offer_type: parsed.offerType,
                        legal_documents: {} // Files can't be persisted
                    }));
                    setStep(parsed.step);
                }
            } catch (e) {
                console.error('Failed to parse saved draft:', e);
            }
        }
        setDraftRestored(true);
    }, [offerType, draftRestored]);

    // Save draft to sessionStorage whenever formData or step changes
    useEffect(() => {
        if (offerType) {
            const { legal_documents, ...formDataWithoutFiles } = formData;
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
    const totalSteps = 5;
    const displayStep = step + 1;

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
                annual_interest_rate: formData.offer_type === 'collateral' ? parseFloat(formData.annual_interest_rate) : undefined,
                payment_type: formData.offer_type === 'collateral' ? formData.payment_type : undefined,
                payment_day: formData.offer_type === 'collateral' && formData.payment_type !== 'bullet' ? parseInt(formData.payment_day) : undefined,
                maturity_date: formData.offer_type === 'collateral' && formData.payment_type === 'bullet' && formData.maturity_date ? formData.maturity_date : undefined,
                offer_rules: {
                    min_investment: formData.min_investment ? Number(formData.min_investment) : undefined,
                    max_investment: formData.max_investment ? Number(formData.max_investment) : undefined,
                },
                legal_documents: {}, // Metadata is optional, relying on file fields
                contract: formData.legal_documents.contract?.file,
                terms: formData.legal_documents.terms?.file,
                prospectus: formData.legal_documents.prospectus?.file,
            });

            if (response.success) {
                // Clear draft from storage on success
                sessionStorage.removeItem(STORAGE_KEY);
                // Move to confirmation step (step 5 internal = displayStep 6)
                setStep(5);
            } else {
                setError(response.error || 'Failed to create offer');
            }
        } catch (err: any) {
            // ... error handling
            console.error('Failed to create offer:', err);
            setError(err.message || 'Failed to create offer');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isStepValid = () => {
        // ... existing validation
        switch (step) {
            case 1:
                return formData.offer_name && formData.asset_code && formData.description;
            case 2:
                return formData.total_supply &&
                    (formData.offer_type === 'sale' || formData.annual_interest_rate);
            case 3:
                return true; // Documents are optional for now
            case 4:
                return true;
            default:
                return false;
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            {/* ... */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => step > 1 ? setStep(step - 1) : navigate('/company/offers/new')}
                        className="text-muted-foreground hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Create New Offer</h2>
                        <p className="text-muted-foreground">Step {displayStep} of {totalSteps}</p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="text-muted-foreground hover:text-white"
                >
                    <X className="w-5 h-5" />
                </Button>
            </div>

            {/* Progress Indicator */}
            <div className="flex gap-2">
                {Array.from({ length: totalSteps }, (_, i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${i + 1 <= displayStep ? 'bg-primary' : 'bg-muted/20'}`}
                    />
                ))}
            </div>

            {/* Form Content */}
            <Card className="glass-panel border-white/5 bg-white/5">
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
                                    onChange={(e) => updateFormData({ asset_code: e.target.value.toUpperCase().slice(0, 12) })}
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
                                    placeholder="Describe your offer in detail..."
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
                                <label className="text-sm font-medium text-white">Total Supply (USD) *</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input
                                        type="number"
                                        placeholder="1000000"
                                        value={formData.total_supply}
                                        onChange={(e) => updateFormData({ total_supply: e.target.value })}
                                        className="pl-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Total value of tokens to be issued
                                </p>
                            </div>

                            {formData.offer_type === 'collateral' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Annual Interest Rate (%) *</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            step="0.1"
                                            placeholder="12.5"
                                            value={formData.annual_interest_rate}
                                            onChange={(e) => updateFormData({ annual_interest_rate: e.target.value })}
                                            className="pr-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Annual percentage yield paid to token holders
                                    </p>
                                </div>
                            )}

                            {formData.offer_type === 'collateral' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Payment Frequency *</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { value: 'monthly', label: 'Monthly' },
                                            { value: 'quarterly', label: 'Quarterly' },
                                            { value: 'semi_annual', label: 'Semi-Annual' },
                                            { value: 'annual', label: 'Annual' },
                                            { value: 'bullet', label: 'Bullet (at maturity)' },
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
                                        How often investors receive yield payments
                                    </p>
                                </div>
                            )}

                            {formData.offer_type === 'collateral' && formData.payment_type !== 'bullet' && (
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
                                        Day of the month when payments are distributed (1-28)
                                    </p>
                                </div>
                            )}

                            {formData.offer_type === 'collateral' && formData.payment_type === 'bullet' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Maturity Date *</label>
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
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Minimum Investment (USD)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                        <Input
                                            type="number"
                                            placeholder="100"
                                            value={formData.min_investment}
                                            onChange={(e) => updateFormData({ min_investment: e.target.value })}
                                            className="pl-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white">Maximum Investment (USD)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                        <Input
                                            type="number"
                                            placeholder="No limit"
                                            value={formData.max_investment}
                                            onChange={(e) => updateFormData({ max_investment: e.target.value })}
                                            className="pl-8 glass-panel bg-black/20 border-white/10 focus:border-primary/50 text-foreground"
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </>
                )}

                {step === 3 && (
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
                                <button
                                    type="button"
                                    onClick={() => navigate('/company/ipfs-info')}
                                    className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                                >
                                    Learn more about IPFS and document privacy →
                                </button>
                            </div>
                        </CardContent>
                    </>
                )}

                {step === 4 && (
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
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Supply</p>
                                    <p className="text-xl font-bold text-white mt-1">
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(parseFloat(formData.total_supply || '0'))}
                                    </p>
                                </div>
                                {formData.offer_type === 'collateral' && (
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Interest Rate</p>
                                        <p className="text-xl font-bold text-emerald-400 mt-1">{formData.annual_interest_rate}% APY</p>
                                    </div>
                                )}
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

                                {/* Payment Schedule (for Collateral only) */}
                                {formData.offer_type === 'collateral' && (
                                    <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                                        <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-primary" />
                                            Payment Schedule
                                        </h4>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-muted-foreground">Frequency</span>
                                            <span className="text-sm text-primary font-medium capitalize">
                                                {formData.payment_type.replace('_', '-')}
                                                {formData.payment_type !== 'bullet' && ` (Day ${formData.payment_day})`}
                                            </span>
                                        </div>
                                    </div>
                                )}

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

                {/* Step 5 (internal) = Step 6 (display): Confirmation */}
                {step === 5 && (
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
                {step < 5 && (
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

                        {step < 4 ? (
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
