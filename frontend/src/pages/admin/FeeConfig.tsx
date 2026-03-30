import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { platformAdminsApi } from '@/api/platformAdmins';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { HELP_CONTENT } from '@/constants/help-content';

const FEE_KEYS = [
    {
        key: 'BLOCKCHAIN_OPERATION_FEE_FIXED',
        label: 'Blockchain Operation Fee (USDC)',
        description: 'Fixed fee per transaction to cover network costs (set to 0 until routing is active)',
        type: 'fixed',
    },
];

export function FeeConfig() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [config, setConfig] = useState<Record<string, string>>({});

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await platformAdminsApi.getSystemConfig();
            const configMap: Record<string, string> = (response.data as any) || {};
            FEE_KEYS.forEach((fee) => {
                if (!configMap[fee.key]) {
                    configMap[fee.key] = fee.type === 'fixed' ? '5.0' : '0';
                }
            });
            setConfig(configMap);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (key: string, value: string) => {
        setConfig((prev) => ({ ...prev, [key]: value }));
        setSuccess('');
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const settings = FEE_KEYS.map((fee) => ({
                key: fee.key,
                value: config[fee.key] || '0',
                description: fee.description,
            }));
            await platformAdminsApi.updateSystemConfig(settings);
            setSuccess('Configuration saved successfully!');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Fee Configuration
                        <InfoTooltip content={HELP_CONTENT.feeConfigAdditions.systemFeeOverview.content} side="right" />
                    </CardTitle>
                    <CardDescription>
                        Configure platform fees. Changes take effect immediately for new transactions.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {error && (
                        <div className="p-3 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            {success}
                        </div>
                    )}

                    {FEE_KEYS.map((fee) => (
                        <div key={fee.key} className="space-y-2">
                            <Label htmlFor={fee.key} className="flex items-center gap-1.5">
                                {fee.label}
                                <InfoTooltip
                                    content={HELP_CONTENT.feeConfigAdditions.blockchainFee.content}
                                    side="right"
                                />
                            </Label>
                            <div className="flex gap-2 items-center">
                                <Input
                                    id={fee.key}
                                    type="number"
                                    step={fee.type === 'percent' ? '0.1' : '0.01'}
                                    min="0"
                                    max={fee.type === 'percent' ? '100' : undefined}
                                    value={config[fee.key] || ''}
                                    onChange={(e) => handleChange(fee.key, e.target.value)}
                                    className="bg-white/5 border-white/10 max-w-32"
                                />
                                <span className="text-muted-foreground text-sm">
                                    {fee.type === 'percent' ? '%' : 'USDC'}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{fee.description}</p>
                        </div>
                    ))}

                    <div className="pt-4 border-t border-white/10">
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {saving ? (
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
                </CardContent>
            </Card>

            {/* Fee Model Overview */}
            <Card className="glass-panel border-white/5 bg-white/5">
                <CardHeader>
                    <CardTitle className="text-base">Fee Model</CardTitle>
                    <CardDescription>How the platform earns revenue</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Trade Fee</span>
                            <span className="text-white">$5.00 USDC fixed per trade (on-chain)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Yield Spread</span>
                            <span className="text-white">annualInterestRate − investorRate → treasury</span>
                        </div>
                        <div className="pt-2 border-t border-white/10 text-xs text-zinc-500">
                            Trade fee is deducted on-chain by the Soroban contract.
                            Yield spread is calculated at payout time — company pays full rate, investor receives their rate, delta goes to treasury.
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
