/**
 * RampKyc — blocking onboarding for the BR PIX → TESOURO ramp.
 *
 * UX contract: investors land here the first time they try to deposit BRL,
 * stay here until /api/ramp/readiness returns isReady=true. After that the
 * flow auto-redirects to /wallet.
 *
 * Sections render conditionally based on what's missing:
 *   - Identity & address fields (if any KYC field on Investor is null)
 *   - PIX bank account (if no active bank account exists yet)
 *   - Customer provisioning happens implicitly inside POST /api/ramp/kyc
 *
 * Design choices:
 *   - No nested Card wrappers. Sections are semantic blocks separated by
 *     thin horizontal rules + generous spacing.
 *   - Editorial top line, ambient warm glow behind it. No "big number / small
 *     label" template.
 *   - PIX key type via shadcn Tabs (cpf | email | phone | evp). Format hints
 *     under the input.
 *   - Form errors inline, never as banners or modals.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, Check, ShieldCheck, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { rampApi, type PixKeyType } from '@/api/ramp';
import { useRampReadiness } from '@/hooks/useRampReadiness';

// ─────────────────────────────────────────────────────────────────────────────
// Form types
// ─────────────────────────────────────────────────────────────────────────────

interface IdentityFields {
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  phone: string;
  occupation: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
}

interface PixFields {
  pixKey: string;
  pixKeyType: PixKeyType;
  label: string;
}

const EMPTY_IDENTITY: IdentityFields = {
  givenName: '',
  familyName: '',
  dateOfBirth: '',
  phone: '',
  occupation: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
};

const EMPTY_PIX: PixFields = {
  pixKey: '',
  pixKeyType: 'cpf',
  label: '',
};

// Reflexive heuristic: which sections need to render?
function classifyMissing(missingFields: string[]) {
  const set = new Set(missingFields);
  return {
    needsIdentity:
      set.has('givenName') ||
      set.has('familyName') ||
      set.has('dateOfBirth') ||
      set.has('phone') ||
      set.has('occupation'),
    needsAddress:
      set.has('addressLine1') ||
      set.has('city') ||
      set.has('region') ||
      set.has('postalCode') ||
      set.has('country'),
  };
}

const PIX_KEY_HINT: Record<PixKeyType, string> = {
  cpf: '11 digits, no punctuation — e.g. 12345678901',
  cnpj: '14 digits, no punctuation',
  email: 'Same address you registered with your bank',
  phone: '+55 11 9 8765-4321',
  evp: 'Random PIX key (UUID) from your bank app',
};

const PIX_KEY_PLACEHOLDER: Record<PixKeyType, string> = {
  cpf: '12345678901',
  cnpj: '12345678000199',
  email: 'you@example.com',
  phone: '+5511999999999',
  evp: '123e4567-e89b-12d3-a456-426614174000',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RampKyc() {
  const navigate = useNavigate();
  const { readiness, isReady, loading: readinessLoading, refetch } = useRampReadiness();

  const [identity, setIdentity] = useState<IdentityFields>(EMPTY_IDENTITY);
  const [pix, setPix] = useState<PixFields>(EMPTY_PIX);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPulse, setSuccessPulse] = useState(false);

  // If the investor is already ready, defensive redirect — they shouldn't be here.
  useEffect(() => {
    if (isReady) {
      const t = setTimeout(() => navigate('/wallet', { replace: true }), 600);
      return () => clearTimeout(t);
    }
  }, [isReady, navigate]);

  const { needsIdentity, needsAddress } = useMemo(
    () => classifyMissing(readiness?.missingFields ?? []),
    [readiness]
  );
  const needsBankAccount =
    readiness?.blockedReason === 'no_active_bank_account' ||
    (readiness?.bankAccounts?.length ?? 0) === 0;

  const kycStatus = readiness?.customer?.kycStatus;
  const kycRejected = kycStatus === 'rejected';
  const kycInReview = kycStatus === 'proposed';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // 1. Identity + address (only if those sections are showing)
      if (needsIdentity || needsAddress) {
        const kycPayload = {
          givenName: identity.givenName.trim(),
          familyName: identity.familyName.trim(),
          dateOfBirth: identity.dateOfBirth,
          phone: identity.phone.trim(),
          occupation: identity.occupation.trim(),
          addressLine1: identity.addressLine1.trim(),
          addressLine2: identity.addressLine2.trim() || undefined,
          city: identity.city.trim(),
          region: identity.region.trim().toUpperCase(),
          postalCode: identity.postalCode.trim(),
          country: 'BR',
        };
        const kycRes = await rampApi.submitKyc(kycPayload);
        if (!kycRes.success) {
          throw new Error(kycRes.error ?? 'KYC submission failed');
        }
      }

      // 2. PIX bank account (only if missing)
      if (needsBankAccount) {
        const bankRes = await rampApi.createBankAccount({
          pixKey: pix.pixKey.trim(),
          pixKeyType: pix.pixKeyType,
          label: pix.label.trim() || undefined,
          makeDefault: true,
        });
        if (!bankRes.success) {
          throw new Error(bankRes.error ?? 'Failed to register PIX key');
        }
      }

      setSuccessPulse(true);
      await refetch();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        err?.message ??
        'Something went wrong submitting your onboarding';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  }

  if (readinessLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[hsl(43_45%_55%)]" />
      </div>
    );
  }

  return (
    <div className="relative max-w-3xl mx-auto px-6 py-10 sm:py-14">
      {/* Ambient warm glow behind the hero — no card, just atmosphere */}
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[320px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(closest-side, hsl(43 45% 55% / 0.18), hsl(43 45% 55% / 0.04), transparent 70%)',
          filter: 'blur(40px)',
        }}
        aria-hidden
      />

      {/* Editorial hero */}
      <header className="relative">
        <div className="inline-flex items-center gap-2 mb-4 text-[10px] uppercase tracking-[0.18em] text-[hsl(43_45%_55%)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(43_45%_55%)]" />
          Brazil — PIX on-ramp
        </div>
        <h1
          className="text-[2.4rem] sm:text-[2.9rem] leading-[1.05] font-semibold text-white"
          style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}
        >
          Linking Radox to PIX.
        </h1>
        <p className="mt-3 text-[15px] text-white/70 max-w-[44ch]">
          One-time onboarding. After this, you can deposit BRL anytime and receive
          <span className="text-white"> yield-bearing TESOURO</span> directly to your Radox wallet.
        </p>
      </header>

      {/* Status banner — only when something noteworthy is happening */}
      {(kycRejected || kycInReview) && (
        <div
          className={
            'relative mt-8 px-5 py-4 rounded-xl border ' +
            (kycRejected
              ? 'border-red-500/30 bg-red-500/[0.06] text-red-300'
              : 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200')
          }
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-[3px] shrink-0" />
            <div className="text-sm leading-relaxed">
              {kycRejected ? (
                <>
                  <span className="font-medium">Your KYC was rejected.</span>{' '}
                  {readiness?.customer?.kycRejectionReason ?? 'Please re-submit with corrected information.'}
                </>
              ) : (
                <>
                  <span className="font-medium">Your KYC is under review.</span>{' '}
                  This is automatic in sandbox; in production it can take a few minutes. The page will refresh once complete.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative mt-10 sm:mt-12 space-y-12">
        {/* ─── Section 1: Identity ─── */}
        {needsIdentity && (
          <section>
            <SectionHeader index="01" title="Who you are" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
              <FieldRow label="First name" required>
                <Input
                  value={identity.givenName}
                  onChange={(e) => setIdentity((p) => ({ ...p, givenName: e.target.value }))}
                  autoComplete="given-name"
                  required
                />
              </FieldRow>
              <FieldRow label="Last name" required>
                <Input
                  value={identity.familyName}
                  onChange={(e) => setIdentity((p) => ({ ...p, familyName: e.target.value }))}
                  autoComplete="family-name"
                  required
                />
              </FieldRow>
              <FieldRow label="Date of birth" required>
                <Input
                  type="date"
                  value={identity.dateOfBirth}
                  onChange={(e) => setIdentity((p) => ({ ...p, dateOfBirth: e.target.value }))}
                  required
                />
              </FieldRow>
              <FieldRow label="Phone" required hint="Include country code">
                <Input
                  type="tel"
                  value={identity.phone}
                  onChange={(e) => setIdentity((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+55 11 9 8765-4321"
                  autoComplete="tel"
                  required
                />
              </FieldRow>
              <FieldRow label="Occupation" required className="sm:col-span-2">
                <Input
                  value={identity.occupation}
                  onChange={(e) => setIdentity((p) => ({ ...p, occupation: e.target.value }))}
                  placeholder="e.g. Software Engineer"
                  required
                />
              </FieldRow>
            </div>
          </section>
        )}

        {/* ─── Section 2: Address ─── */}
        {needsAddress && (
          <section>
            <SectionHeader index="02" title="Where you live" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
              <FieldRow label="Street" required className="sm:col-span-2">
                <Input
                  value={identity.addressLine1}
                  onChange={(e) => setIdentity((p) => ({ ...p, addressLine1: e.target.value }))}
                  placeholder="Av. Paulista 1000"
                  autoComplete="address-line1"
                  required
                />
              </FieldRow>
              <FieldRow label="Complement" className="sm:col-span-2">
                <Input
                  value={identity.addressLine2}
                  onChange={(e) => setIdentity((p) => ({ ...p, addressLine2: e.target.value }))}
                  placeholder="Apt, suite, floor (optional)"
                  autoComplete="address-line2"
                />
              </FieldRow>
              <FieldRow label="City" required>
                <Input
                  value={identity.city}
                  onChange={(e) => setIdentity((p) => ({ ...p, city: e.target.value }))}
                  autoComplete="address-level2"
                  required
                />
              </FieldRow>
              <FieldRow label="State (UF)" required hint="2-letter code">
                <Input
                  value={identity.region}
                  onChange={(e) => setIdentity((p) => ({ ...p, region: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="SP"
                  maxLength={2}
                  required
                />
              </FieldRow>
              <FieldRow label="Postal code (CEP)" required className="sm:col-span-2">
                <Input
                  value={identity.postalCode}
                  onChange={(e) => setIdentity((p) => ({ ...p, postalCode: e.target.value }))}
                  placeholder="01310-100"
                  autoComplete="postal-code"
                  required
                />
              </FieldRow>
            </div>
          </section>
        )}

        {/* ─── Section 3: PIX bank account ─── */}
        {needsBankAccount && (
          <section>
            <SectionHeader index={needsIdentity || needsAddress ? '03' : '01'} title="Your PIX key" />
            <p className="mt-3 text-sm text-white/60 max-w-[60ch]">
              Where you'll send BRL from. The key must be registered to your own bank account
              (same CPF, same name). PIX out to third parties isn't supported yet.
            </p>

            <div className="mt-6">
              <Label className="text-[10px] uppercase tracking-[0.14em] text-white/50">Key type</Label>
              <Tabs
                value={pix.pixKeyType}
                onValueChange={(v) => setPix((p) => ({ ...p, pixKeyType: v as PixKeyType, pixKey: '' }))}
                className="mt-2"
              >
                <TabsList className="bg-white/[0.04] border border-white/10 p-1">
                  <TabsTrigger value="cpf">CPF</TabsTrigger>
                  <TabsTrigger value="email">Email</TabsTrigger>
                  <TabsTrigger value="phone">Phone</TabsTrigger>
                  <TabsTrigger value="evp">Random</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
              <FieldRow
                label="PIX key"
                required
                hint={PIX_KEY_HINT[pix.pixKeyType]}
                className="sm:col-span-2"
              >
                <Input
                  value={pix.pixKey}
                  onChange={(e) => setPix((p) => ({ ...p, pixKey: e.target.value }))}
                  placeholder={PIX_KEY_PLACEHOLDER[pix.pixKeyType]}
                  required
                />
              </FieldRow>
              <FieldRow label="Label" hint="Optional, just for your reference" className="sm:col-span-2">
                <Input
                  value={pix.label}
                  onChange={(e) => setPix((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Banco do Brasil"
                />
              </FieldRow>
            </div>
          </section>
        )}

        {/* Inline error */}
        {error && (
          <div className="relative px-5 py-4 rounded-xl border border-red-500/30 bg-red-500/[0.06] text-red-300 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 mt-[3px] shrink-0" />
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Submit affordance */}
        <div className="relative flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
          <p className="text-[12px] text-white/40 max-w-[44ch]">
            By submitting, you authorize Radox to share this information with EtherFuse to enable BRL → TESOURO transfers.
          </p>
          <Button
            type="submit"
            disabled={submitting}
            className={
              'h-11 px-6 rounded-xl bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_62%)] text-[hsl(220_60%_8%)] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
              (successPulse ? 'animate-[pulse_0.5s_ease-out_1]' : '')
            }
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…
              </>
            ) : isReady ? (
              <>
                <Check className="w-4 h-4 mr-2" /> All set — redirecting
              </>
            ) : (
              <>
                Finish onboarding <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {/* Trust footer */}
        <div className="relative flex items-center gap-2 text-[11px] text-white/35 pt-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Your information is sent over TLS to EtherFuse, a licensed Brazilian anchor.</span>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal sub-components — kept in the same file because they're not reused
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span
        className="text-[10px] tracking-[0.2em] text-[hsl(43_45%_55%)]"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {index}
      </span>
      <h2
        className="text-[1.35rem] sm:text-[1.55rem] font-semibold text-white"
        style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}
      >
        {title}
      </h2>
      <div className="flex-1 h-px bg-white/8" />
    </div>
  );
}

function FieldRow({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-[10px] uppercase tracking-[0.14em] text-white/50 flex items-center gap-1.5">
        {label}
        {required && <span className="text-[hsl(43_45%_55%)]">•</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[11px] text-white/35">{hint}</p>}
    </div>
  );
}

export default RampKyc;
