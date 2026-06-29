
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
    Loader2, User, Check, Copy, CheckCircle2,
    ShieldCheck, ExternalLink, Plus, KeyRound, AlertTriangle
} from 'lucide-react';
import { api } from '@/lib/api';
import { authStorage } from '@/utils/authStorage';
import { passkeyClient } from '@/lib/passkey';

type BackupSigner = {
    type: 'Delegated' | 'External';
    publicKey: string;
};

export function Settings() {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Backup signer state
    const [showAddSigner, setShowAddSigner] = useState(false);
    const [signerInput, setSignerInput] = useState('');
    const [addingError, setAddingError] = useState<string | null>(null);
    const [addingStep, setAddingStep] = useState<'idle' | 'connecting' | 'signing' | 'submitting' | 'done' | 'error'>('idle');
    const [backupSigners, setBackupSigners] = useState<BackupSigner[]>([]);
    const [loadingSigners, setLoadingSigners] = useState(false);

    useEffect(() => {
        async function fetchSettings() {
            try {
                const storedUser = authStorage.getUser<any>('investor') || {};

                if (storedUser.id) {
                    try {
                        const userResponse = await api.get(`/investors/${storedUser.id}`);
                        const freshUser = userResponse.data || userResponse;
                        const updatedUser = { ...storedUser, ...freshUser };
                        authStorage.setUser(updatedUser, 'investor');
                        setUser(updatedUser);
                        return;
                    } catch {
                        console.log('Could not fetch fresh user data, using cached');
                    }
                }

                setUser(storedUser);
            } catch (err) {
                console.error('Failed to fetch settings:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchSettings();
    }, []);

    // Fetch on-chain signers when wallet contract ID is available
    const fetchSigners = useCallback(async () => {
        if (!user?.stellarContractId) return;

        setLoadingSigners(true);
        try {
            await passkeyClient.init();
            const kit = (passkeyClient as any).kit;
            if (!kit) return;

            // Connect silently (no passkey prompt) to read contract state
            try {
                const cachedCredential = sessionStorage.getItem('radox_passkey_credential');
                await kit.connectWallet({
                    contractId: user.stellarContractId,
                    ...(cachedCredential ? { credentialId: cachedCredential } : {}),
                });
            } catch {
                // May fail if no cached credential — that's ok for read-only
            }

            // Fetch ALL Default context rules to find recovery signers
            // kit v0.7.1: rules.getAll returns the ContextRule[] array directly (no .result wrapper)
            const allRules = (await kit.rules.getAll({ tag: 'Default', values: undefined } as any)) || [];

            const delegatedSigners: BackupSigner[] = [];
            for (const rule of allRules) {
                const signers = rule?.signers || [];
                for (const s of signers) {
                    if (s.tag === 'Delegated') {
                        delegatedSigners.push({
                            type: 'Delegated' as const,
                            publicKey: s.values[0],
                        });
                    }
                }
            }

            setBackupSigners(delegatedSigners);
        } catch (err) {
            console.log('Could not fetch on-chain signers:', err);
        } finally {
            setLoadingSigners(false);
        }
    }, [user?.stellarContractId]);

    useEffect(() => {
        fetchSigners();
    }, [fetchSigners]);



    const handleAddBackupSigner = async () => {
        const pubKey = signerInput.trim();

        // Validate G... address format
        if (!pubKey.startsWith('G') || pubKey.length !== 56) {
            setAddingError('Please enter a valid Stellar public key (starts with G, 56 characters)');
            return;
        }

        // Note: we don't block duplicate keys here — the contract will reject
        // true duplicates. The same key on the shared multisig rule (id 0) is
        // useless for recovery, so we allow creating a dedicated recovery rule.

        setAddingError(null);

        try {
            // Step 1: Initialize kit
            setAddingStep('connecting');
            await passkeyClient.init();
            const kit = (passkeyClient as any).kit;
            if (!kit) throw new Error('SmartAccountKit not initialized');

            // Step 2: Connect wallet using cached credential from login session
            // The credential was stored in sessionStorage during login
            const cachedCredential = sessionStorage.getItem('radox_passkey_credential');
            if (cachedCredential) {
                await kit.connectWallet({ contractId: user.stellarContractId, credentialId: cachedCredential });
            } else {
                // Fallback: prompt user for passkey selection (Touch ID)
                await kit.connectWallet({ contractId: user.stellarContractId, prompt: true });
            }

            // Step 3: Create a SEPARATE Default context rule with ONLY the backup signer.
            // This is critical: adding to the existing rule (id=0) would require ALL signers.
            // A dedicated rule allows the backup key to authorize independently.
            setAddingStep('signing');
            const delegatedSigner = { tag: 'Delegated' as const, values: [pubKey] };
            const tx = await kit.rules.add(
                { tag: 'Default', values: undefined } as any,
                'recovery',
                [delegatedSigner] as any,
                new Map(),
            );

            // Step 4: Sign auth entries with passkey and submit (Touch ID)
            setAddingStep('submitting');
            const result = await kit.signAndSubmit(tx);

            if (result?.success || result?.hash) {
                setAddingStep('done');
                // Refresh signer list
                await fetchSigners();
                // Auto-close after success
                setTimeout(() => {
                    setShowAddSigner(false);
                    setAddingStep('idle');
                    setSignerInput('');
                }, 2000);
            } else {
                throw new Error(result?.error || 'Transaction failed on-chain');
            }
        } catch (err: any) {
            console.error('Add signer failed:', err);
            setAddingStep('error');
            setAddingError(
                err.message?.includes('NotAllowedError')
                    ? 'Passkey authentication was cancelled'
                    : err.message?.includes('DuplicateSigner')
                        ? 'This signer is already registered on-chain'
                        : err.message || 'Failed to add backup signer'
            );
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[hsl(76_86%_63%)]" />
                    <p className="text-muted-foreground text-sm">Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-2xl">
            {/* Header */}
            <div className="space-y-1 animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">Manage your account and preferences</p>
            </div>

            {/* Account Information - Read Only */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-1">
                <CardHeader>
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <User className="w-5 h-5 text-[hsl(76_86%_63%)]" />
                            Account Information
                        </CardTitle>
                        <CardDescription>Your verified personal details</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Name</p>
                            <p className="font-medium">{user?.name || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Email</p>
                            <p className="font-medium">{user?.email || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Document</p>
                            <p className="font-medium font-mono">{user?.document || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">KYC Status</p>
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${user?.kycStatus === 'approved'
                                ? 'bg-[hsl(160_60%_40%/0.15)] text-[hsl(160_60%_40%)] border-[hsl(160_60%_40%/0.3)]'
                                : 'bg-[hsl(35_90%_50%/0.15)] text-[hsl(35_90%_50%)] border-[hsl(35_90%_50%/0.3)]'
                                }`}>
                                {user?.kycStatus === 'approved' && <Check className="w-3 h-3" />}
                                {user?.kycStatus || 'pending'}
                            </span>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                        🔒 Your KYC data is verified and cannot be changed. Contact support if you need to update your information.
                    </p>
                </CardContent>
            </Card>


            {/* Wallet Recovery */}
            <Card className="glass-panel rounded-2xl animate-fade-in-up animate-delay-4">
                <CardHeader>
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-[hsl(76_86%_63%)]" />
                            Wallet Recovery
                        </CardTitle>
                        <CardDescription>Your on-chain identity and backup signers</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Contract ID */}
                    {user?.stellarContractId && (
                        <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Wallet Contract ID</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-3 py-2 rounded-xl bg-muted/30 border border-border/50 text-xs font-mono break-all">
                                    {user.stellarContractId}
                                </code>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl shrink-0"
                                    onClick={() => {
                                        navigator.clipboard.writeText(user.stellarContractId);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }}
                                >
                                    {copied ? (
                                        <CheckCircle2 className="w-4 h-4 text-[hsl(160_60%_40%)]" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                            <a
                                href={`https://stellar.expert/explorer/testnet/contract/${user.stellarContractId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[hsl(76_86%_63%)] hover:underline"
                            >
                                View on Stellar Expert <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    )}

                    {/* Backup Signers */}
                    <div className="space-y-3 pt-2 border-t border-border/50">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium">Backup Signers</p>
                                <p className="text-xs text-muted-foreground">
                                    Ed25519 keys registered on your smart wallet for emergency recovery
                                </p>
                            </div>
                            {user?.stellarContractId && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl gap-1.5"
                                    onClick={() => {
                                        setShowAddSigner(true);
                                        setAddingStep('idle');
                                        setAddingError(null);
                                        setSignerInput('');
                                    }}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Signer
                                </Button>
                            )}
                        </div>

                        {loadingSigners ? (
                            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Loading on-chain signers...
                            </div>
                        ) : backupSigners.length > 0 ? (
                            <div className="space-y-2">
                                {backupSigners.map((signer) => (
                                    <div
                                        key={signer.publicKey}
                                        className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/20 border border-border/30"
                                    >
                                        <KeyRound className="w-4 h-4 text-[hsl(160_60%_40%)] shrink-0" />
                                        <code className="flex-1 text-xs font-mono truncate" title={signer.publicKey}>
                                            {signer.publicKey.substring(0, 8)}...{signer.publicKey.substring(48)}
                                        </code>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(160_60%_40%/0.15)] text-[hsl(160_60%_40%)] border border-[hsl(160_60%_40%/0.3)]">
                                            Active
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-[hsl(35_90%_50%/0.08)] border border-[hsl(35_90%_50%/0.2)]">
                                <AlertTriangle className="w-4 h-4 text-[hsl(35_90%_50%)] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-[hsl(35_90%_50%)]">No backup signer</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Add a backup signer to ensure you can access your funds even if this platform is unavailable.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Recovery info */}
                    <div className="space-y-3 pt-2 border-t border-border/50">
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/20">
                            <span className="text-lg">🔑</span>
                            <div>
                                <p className="text-sm font-medium">Passkey Sync</p>
                                <p className="text-xs text-muted-foreground">
                                    Your passkey is synced across your devices via iCloud Keychain (Apple) or Google Password Manager.
                                    Signing into a new device with the same account restores access automatically.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/20">
                            <span className="text-lg">🛟</span>
                            <div>
                                <p className="text-sm font-medium">Emergency Recovery</p>
                                <p className="text-xs text-muted-foreground">
                                    If you lose access to all devices, your backup signer can move funds independently using the{' '}
                                    <a href="https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli" target="_blank" rel="noopener noreferrer" className="text-[hsl(76_86%_63%)] hover:underline">
                                        Stellar CLI
                                    </a>{' '}
                                    or a compatible rescue tool — no Radox servers required.
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        🔐 Your passkey's private key never leaves your device's secure enclave. Radox cannot access it.
                    </p>
                </CardContent>
            </Card>

            {/* Add Backup Signer Dialog */}
            <Dialog open={showAddSigner} onOpenChange={(open) => {
                if (!open && addingStep !== 'connecting' && addingStep !== 'signing' && addingStep !== 'submitting') {
                    setShowAddSigner(false);
                    setAddingStep('idle');
                }
            }}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="w-5 h-5 text-[hsl(76_86%_63%)]" />
                            Add Backup Signer
                        </DialogTitle>
                        <DialogDescription>
                            Enter a Stellar public key (G...) to register as a backup signer on your wallet.
                            This key will be able to authorize transactions if this platform is unavailable.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Public Key</label>
                            <Input
                                placeholder="GABC...XYZ"
                                value={signerInput}
                                onChange={(e) => {
                                    setSignerInput(e.target.value);
                                    setAddingError(null);
                                }}
                                disabled={addingStep !== 'idle' && addingStep !== 'error'}
                                className="font-mono text-xs rounded-xl"
                            />
                            <p className="text-xs text-muted-foreground">
                                Use your Freighter wallet address, or generate a key from a BIP39 recovery phrase.
                            </p>
                        </div>

                        {/* Progress steps */}
                        {addingStep !== 'idle' && addingStep !== 'error' && (
                            <div className="space-y-2 p-3 rounded-xl bg-muted/20 border border-border/30">
                                <StepIndicator
                                    label="Connecting to wallet"
                                    status={addingStep === 'connecting' ? 'active' : 'done'}
                                />
                                <StepIndicator
                                    label="Signing transaction (Touch ID)"
                                    status={
                                        addingStep === 'connecting' ? 'pending'
                                            : addingStep === 'signing' ? 'active'
                                                : 'done'
                                    }
                                />
                                <StepIndicator
                                    label="Submitting to Stellar"
                                    status={
                                        ['connecting', 'signing'].includes(addingStep) ? 'pending'
                                            : addingStep === 'submitting' ? 'active'
                                                : 'done'
                                    }
                                />
                                {addingStep === 'done' && (
                                    <div className="flex items-center gap-2 text-sm text-[hsl(160_60%_40%)] font-medium pt-1">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Backup signer registered on-chain!
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error */}
                        {addingError && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                {addingError}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        {addingStep === 'done' ? (
                            <Button
                                className="rounded-xl w-full"
                                onClick={() => {
                                    setShowAddSigner(false);
                                    setAddingStep('idle');
                                    setSignerInput('');
                                }}
                            >
                                Done
                            </Button>
                        ) : (
                            <Button
                                className="rounded-xl w-full gap-2"
                                onClick={handleAddBackupSigner}
                                disabled={!signerInput.trim() || (addingStep !== 'idle' && addingStep !== 'error')}
                            >
                                {addingStep !== 'idle' && addingStep !== 'error' ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {addingStep === 'connecting' && 'Connecting...'}
                                        {addingStep === 'signing' && 'Waiting for Touch ID...'}
                                        {addingStep === 'submitting' && 'Submitting...'}
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="w-4 h-4" />
                                        Register Backup Signer
                                    </>
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Step indicator for the multi-step signer registration flow */
function StepIndicator({ label, status }: { label: string; status: 'pending' | 'active' | 'done' }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            {status === 'pending' && (
                <div className="w-3.5 h-3.5 rounded-full border border-border/50" />
            )}
            {status === 'active' && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[hsl(76_86%_63%)]" />
            )}
            {status === 'done' && (
                <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(160_60%_40%)]" />
            )}
            <span className={status === 'pending' ? 'text-muted-foreground' : status === 'done' ? 'text-[hsl(160_60%_40%)]' : ''}>
                {label}
            </span>
        </div>
    );
}
