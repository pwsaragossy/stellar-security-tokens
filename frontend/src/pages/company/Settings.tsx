import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, CheckCircle, Clock, AlertCircle, Building2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { companiesApi } from "@/api/companies";

export function Settings() {
    const { company, loading, error, refetch } = useCompany();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const [formData, setFormData] = useState({
        address: '',
        phone: '',
    });

    const handleEdit = () => {
        setFormData({
            address: company?.address || '',
            phone: company?.phone || '',
        });
        setIsEditing(true);
        setSaveSuccess(false);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setSaveError(null);
    };

    const handleSave = async () => {
        if (!company) return;

        setIsSaving(true);
        setSaveError(null);

        try {
            const response = await companiesApi.update(company.id, {
                address: formData.address,
                phone: formData.phone,
            });

            if (response.success) {
                setSaveSuccess(true);
                setIsEditing(false);
                await refetch();
            } else {
                setSaveError(response.error || 'Failed to save changes');
            }
        } catch (err: any) {
            console.error('Failed to save:', err);
            setSaveError(err.message || 'Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20">
                Failed to load settings: {error}
            </div>
        );
    }

    const getStatusIcon = (status?: string) => {
        switch (status) {
            case 'approved':
                return <CheckCircle className="w-5 h-5 text-success" />;
            case 'pending':
                return <Clock className="w-5 h-5 text-warning" />;
            case 'rejected':
                return <AlertCircle className="w-5 h-5 text-destructive" />;
            default:
                return <Clock className="w-5 h-5 text-muted-foreground" />;
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'approved': return 'text-success bg-success/10 border-success/20';
            case 'pending': return 'text-warning bg-warning/10 border-warning/20';
            case 'rejected': return 'text-destructive bg-destructive/10 border-destructive/20';
            case 'active': return 'text-success bg-success/10 border-success/20';
            default: return 'text-muted-foreground bg-white/5 border-white/10';
        }
    };

    return (
        <div className="max-w-4xl space-y-6">
            <div className="animate-fade-in">
                <h2 className="text-2xl font-bold font-heading text-white">Settings</h2>
                <p className="text-muted-foreground">Manage your company profile and settings</p>
            </div>

            {saveSuccess && (
                <div className="p-4 bg-success/10 border border-success/20 rounded-lg flex items-center gap-3 animate-fade-in">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <p className="text-success">Changes saved successfully!</p>
                </div>
            )}

            {/* Company Status Cards */}
            <div className="grid gap-4 md:grid-cols-2 animate-fade-in-up animate-delay-1">
                <Card className={`border ${getStatusColor(company?.status)}`}>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            {getStatusIcon(company?.status)}
                            <div>
                                <p className="text-sm text-muted-foreground">Account Status</p>
                                <p className="text-lg font-semibold capitalize">{company?.status || 'Unknown'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className={`border ${getStatusColor(company?.kyc_status)}`}>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            {getStatusIcon(company?.kyc_status)}
                            <div>
                                <p className="text-sm text-muted-foreground">KYC Status</p>
                                <p className="text-lg font-semibold capitalize">{company?.kyc_status || 'Unknown'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Company Profile */}
            <Card className="glass-panel border-white/5 bg-white/5 animate-fade-in-up animate-delay-2">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="font-heading">Company Profile</CardTitle>
                        <CardDescription>Your company information on the platform</CardDescription>
                    </div>
                    {!isEditing && (
                        <Button
                            variant="outline"
                            onClick={handleEdit}
                            className="border-white/10 hover:bg-white/5"
                        >
                            Edit Profile
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-muted/20 rounded-lg">
                        <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold text-white">{company?.name}</h3>
                            <p className="text-muted-foreground">{company?.cnpj}</p>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Legal Representative</label>
                            <p className="text-white">{company?.legal_representative}</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Email</label>
                            <p className="text-white">{company?.email}</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Address</label>
                            {isEditing ? (
                                <Input
                                    value={formData.address}
                                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                    placeholder="Enter company address"
                                    className="glass-panel text-foreground bg-black/20 focus:border-primary/50"
                                />
                            ) : (
                                <p className="text-white">{company?.address || 'Not provided'}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Phone</label>
                            {isEditing ? (
                                <Input
                                    value={formData.phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                    placeholder="Enter phone number"
                                    className="glass-panel text-foreground bg-black/20 focus:border-primary/50"
                                />
                            ) : (
                                <p className="text-white">{company?.phone || 'Not provided'}</p>
                            )}
                        </div>
                    </div>

                    {saveError && (
                        <div className="p-3 bg-red-500/10 text-red-400 rounded-lg text-sm">
                            {saveError}
                        </div>
                    )}

                    {isEditing && (
                        <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                            <Button
                                variant="ghost"
                                onClick={handleCancel}
                                className="text-muted-foreground hover:text-white"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Registration Info */}
            <Card className="glass-panel border-white/5 bg-white/5 animate-fade-in-up animate-delay-3">
                <CardHeader>
                    <CardTitle className="text-base font-heading">Registration Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 text-sm">
                        <div>
                            <p className="text-muted-foreground">Registered On</p>
                            <p className="text-white">
                                {company?.created_at ? new Date(company.created_at).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                }) : 'Unknown'}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Last Updated</p>
                            <p className="text-white">
                                {company?.updated_at ? new Date(company.updated_at).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                }) : 'Unknown'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
