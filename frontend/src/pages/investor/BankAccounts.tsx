/**
 * BankAccounts — investor's PIX keys for BR ramp.
 *
 * List of registered PIX keys with status pill, default marker, and a soft-
 * delete affordance. New keys via an inline form (no modal — modals are the
 * lazy answer for a single short input set).
 *
 * Status states: pending | awaiting_deposit_verification | active | inactive.
 * Only `active` keys can be used in deposits.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Trash2, Check, AlertTriangle, ArrowLeft, KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { rampApi, type PixKeyType, type RampBankAccount, type RampBankAccountStatus } from '@/api/ramp';

const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'Email',
  phone: 'Phone',
  evp: 'Random',
};

const STATUS_TONE: Record<RampBankAccountStatus, string> = {
  active:
    'text-[hsl(160_60%_55%)] bg-[hsl(160_60%_40%/0.12)] border-[hsl(160_60%_40%/0.3)]',
  pending:
    'text-[hsl(35_90%_60%)] bg-[hsl(35_90%_50%/0.1)] border-[hsl(35_90%_50%/0.3)]',
  awaiting_deposit_verification:
    'text-[hsl(35_90%_60%)] bg-[hsl(35_90%_50%/0.1)] border-[hsl(35_90%_50%/0.3)]',
  inactive: 'text-white/40 bg-white/[0.04] border-white/10',
};

const STATUS_COPY: Record<RampBankAccountStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  awaiting_deposit_verification: 'Verifying',
  inactive: 'Inactive',
};

export function BankAccounts() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<RampBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await rampApi.listBankAccounts();
        if (!alive) return;
        if (res.success && res.data) setAccounts(res.data);
        else setError(res.error ?? 'Failed to load PIX keys');
      } catch (err: any) {
        if (!alive) return;
        setError(err?.response?.data?.error ?? err?.message ?? 'Network error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function refreshList() {
    const res = await rampApi.listBankAccounts();
    if (res.success && res.data) setAccounts(res.data);
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this PIX key? Past deposits using it will still appear in your history.')) return;
    try {
      await rampApi.deleteBankAccount(id);
      await refreshList();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed to remove');
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-[12px] text-white/50 hover:text-white/80 transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 mb-3 text-[10px] uppercase tracking-[0.18em] text-[hsl(43_45%_55%)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(43_45%_55%)]" />
            Brazil — PIX
          </div>
          <h1
            className="text-[2.1rem] sm:text-[2.4rem] leading-[1.05] font-semibold text-white"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}
          >
            PIX keys
          </h1>
          <p className="mt-2 text-sm text-white/55 max-w-[52ch]">
            Bank accounts you can send BRL from. PIX out to third parties is not supported yet.
          </p>
        </div>

        {!addOpen && (
          <Button
            onClick={() => setAddOpen(true)}
            className="h-10 px-4 rounded-xl bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_62%)] text-[hsl(220_60%_8%)] font-medium"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add key
          </Button>
        )}
      </header>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-red-300 text-sm flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {addOpen && (
        <AddPixKeyForm
          onCancel={() => setAddOpen(false)}
          onSuccess={async () => {
            setAddOpen(false);
            await refreshList();
          }}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(43_45%_55%)]" />
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} hidden={addOpen} />
      ) : (
        <ul className="space-y-2.5">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="group flex items-center gap-4 px-4 py-4 rounded-xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.05] transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-[hsl(43_45%_55%/0.12)] border border-[hsl(43_45%_55%/0.25)] flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4 text-[hsl(43_45%_55%)]" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                    {PIX_KEY_TYPE_LABELS[a.pixKeyType]}
                  </span>
                  {a.isDefault && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/15 text-white/60">
                      Default
                    </span>
                  )}
                  <span
                    className={
                      'text-[10px] px-1.5 py-0.5 rounded border ' + STATUS_TONE[a.status]
                    }
                  >
                    {STATUS_COPY[a.status]}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[13px] text-white/85 truncate">
                  {a.abbrPixKey ?? a.pixKey}
                </div>
                {a.label && (
                  <div className="text-[12px] text-white/45 mt-0.5">{a.label}</div>
                )}
              </div>

              <button
                onClick={() => handleDelete(a.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-md hover:bg-red-500/10 text-red-400/70 hover:text-red-300"
                aria-label="Remove PIX key"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ onAdd, hidden }: { onAdd: () => void; hidden: boolean }) {
  if (hidden) return null;
  return (
    <div className="text-center py-14 px-6 rounded-2xl border border-dashed border-white/10">
      <KeyRound className="w-7 h-7 text-white/30 mx-auto" />
      <p className="mt-4 text-[15px] text-white/70">No PIX keys yet</p>
      <p className="mt-1 text-[13px] text-white/40 max-w-[40ch] mx-auto">
        Add one to deposit BRL by PIX.
      </p>
      <Button
        onClick={onAdd}
        className="mt-5 h-9 px-4 rounded-lg bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_62%)] text-[hsl(220_60%_8%)] font-medium"
      >
        <Plus className="w-4 h-4 mr-1.5" /> Add PIX key
      </Button>
    </div>
  );
}

const PIX_KEY_HINT: Record<PixKeyType, string> = {
  cpf: '11 digits, no punctuation',
  cnpj: '14 digits, no punctuation',
  email: 'Same address registered with your bank',
  phone: '+55 11 9 8765-4321',
  evp: 'UUID from your bank app',
};

function AddPixKeyForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('cpf');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await rampApi.createBankAccount({
        pixKey: pixKey.trim(),
        pixKeyType,
        label: label.trim() || undefined,
        makeDefault: false,
      });
      if (!res.success) throw new Error(res.error ?? 'Failed to add PIX key');
      await onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 px-5 py-5 rounded-xl bg-white/[0.04] border border-white/10 space-y-5"
    >
      <div className="flex items-baseline gap-3">
        <h2
          className="text-[1.05rem] font-semibold text-white"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Add a PIX key
        </h2>
        <div className="flex-1 h-px bg-white/8" />
      </div>

      <div>
        <Label className="text-[10px] uppercase tracking-[0.14em] text-white/50">Type</Label>
        <Tabs
          value={pixKeyType}
          onValueChange={(v) => {
            setPixKeyType(v as PixKeyType);
            setPixKey('');
          }}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2">
          <Label className="text-[10px] uppercase tracking-[0.14em] text-white/50">PIX key</Label>
          <Input
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder={PIX_KEY_HINT[pixKeyType]}
            className="mt-1.5"
            required
          />
          <p className="mt-1.5 text-[11px] text-white/35">{PIX_KEY_HINT[pixKeyType]}</p>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[10px] uppercase tracking-[0.14em] text-white/50">Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional — e.g. Banco do Brasil"
            className="mt-1.5"
          />
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-red-300 text-[13px] flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3 justify-end pt-1">
        <Button
          type="button"
          onClick={onCancel}
          variant="ghost"
          className="h-9 px-4 text-white/60 hover:text-white hover:bg-white/[0.06]"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="h-9 px-5 rounded-lg bg-[hsl(43_45%_55%)] hover:bg-[hsl(43_45%_62%)] text-[hsl(220_60%_8%)] font-medium disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding…
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" /> Add key
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export default BankAccounts;
