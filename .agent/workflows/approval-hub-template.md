---
description: Reusable master-detail "Approval Hub" UI pattern — filter chips, queue list, detail panel, action footer, dialogs
---

# Approval Hub Template

A proven split-pane layout for any queue-based admin workflow (approvals, tickets, moderation, etc.). Reference implementation: `frontend/src/pages/admin/Approvals.tsx`.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Filter Chips (category tabs with counts + refresh)         │
├─────────────────────┬────────────────────────────────────────┤
│  Master List        │  Detail Panel                          │
│  (scrollable queue) │  ┌──────────────────────────────────┐  │
│                     │  │ Header (icon + title + status)   │  │
│  ┌───────────────┐  │  │ Section blocks (key-value rows)  │  │
│  │ Icon  Title ● │  │  │ Type-specific content            │  │
│  │   Subtitle    │  │  │                                  │  │
│  └───────────────┘  │  │ ─── Action Footer ──────────── │  │
│  ┌───────────────┐  │  │ [Approve]  [Reject]  [Sponsor]  │  │
│  │ ...           │  │  └──────────────────────────────────┘  │
│  └───────────────┘  │                                        │
├─────────────────────┴────────────────────────────────────────┤
│  Modals (reject reason, sponsor amount, confirmation)        │
└──────────────────────────────────────────────────────────────┘
```

---

## Design Tokens Pattern

Define a `TYPE_CONFIG` record mapping each category to its visual identity:

```tsx
const TYPE_CONFIG: Record<ItemType, {
  icon: typeof Users;
  label: string;
  color: string;           // text color class
  badgeCls: string;         // badge styling
}> = {
  investor: {
    icon: Users,
    label: 'Investors',
    color: 'text-teal-400',
    badgeCls: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  },
  // ... more categories
};
```

**Status badges** follow the same `bg-{color}/15 text-{color} border-{color}/30` pattern:

```tsx
const STATUS_BADGE: Record<string, string> = {
  pending:     'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  resolved:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};
```

---

## Key Components

### 1. Filter Chips

Capsule-shaped buttons with icon + label + count badge. Active state uses `bg-white/10 text-white border-white/20`.

```tsx
function FilterChip({ active, count, label, icon, onClick }: {
  active: boolean;
  count: number;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-white/10 text-white border border-white/20'
          : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06]'
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
          active ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-zinc-500'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
```

### 2. Split Pane Layout

The grid uses `grid-cols-[minmax(340px,2fr)_3fr]` — narrower list, wider detail.

```tsx
<div className="grid grid-cols-[minmax(340px,2fr)_3fr] gap-4 min-h-[calc(100vh-260px)]">
  {/* Left: master list */}
  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
    {/* Queue header */}
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
        Queue · {count} items
      </h2>
    </div>
    {/* Scrollable list */}
    <div className="flex-1 overflow-y-auto">
      <div className="divide-y divide-white/[0.04]">
        {items.map(item => <QueueRow key={item.id} ... />)}
      </div>
    </div>
  </div>

  {/* Right: detail panel */}
  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
    {!selected ? <EmptyState /> : <DetailPanel item={selected} />}
  </div>
</div>
```

### 3. Queue Row

Each row: icon → title + badge → subtitle → time-ago. Selected state has a blue left border.

```tsx
<button
  className={`w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.04] ${
    isSelected
      ? 'bg-white/[0.06] border-l-2 border-l-blue-500'
      : 'border-l-2 border-l-transparent'
  }`}
>
  <div className="flex items-start gap-3">
    <div className={`mt-0.5 ${cfg.color}`}><Icon className="w-4 h-4" /></div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white truncate">{item.label}</span>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${statusCls}`}>
          {item.status}
        </Badge>
      </div>
      <p className="text-xs text-zinc-500 truncate mt-0.5">{item.subtitle}</p>
    </div>
    <span className="text-[11px] text-zinc-600 shrink-0 mt-0.5">{timeAgo(item.createdAt)}</span>
  </div>
</button>
```

### 4. Detail Panel Header

Icon + title + subtitle + status badge, all in a sticky header bar.

```tsx
<div className="px-6 py-4 border-b border-white/[0.06] flex items-start gap-4">
  <div className={`p-2 rounded-lg bg-white/[0.04] ${cfg.color}`}>
    <Icon className="w-5 h-5" />
  </div>
  <div className="flex-1 min-w-0">
    <h3 className="text-lg font-semibold text-white">{item.label}</h3>
    <p className="text-sm text-zinc-500">{cfg.label} · {item.subtitle} · {timeAgo(item.createdAt)}</p>
  </div>
  <Badge variant="outline" className={STATUS_BADGE[item.normalizedStatus]}>
    {item.normalizedStatus}
  </Badge>
</div>
```

### 5. Detail Section Blocks

Key-value rows organized in labeled sections:

```tsx
<div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[calc(100vh-380px)]">
  <Section title="SECTION TITLE">
    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
      <KVRow label="Label" value={value} />
      <KVRow label="Label" value={value} />
    </div>
  </Section>
</div>

// Reusable row
function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-white mt-0.5">{value}</dd>
    </div>
  );
}
```

### 6. Sticky Action Footer

Pinned to bottom of the detail panel with contextual buttons:

```tsx
<div className="px-6 py-4 border-t border-white/[0.06] space-y-2">
  <Button className="w-full bg-emerald-600 hover:bg-emerald-500" disabled={loading}>
    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle ... />}
    Approve
  </Button>
  <Button variant="outline" className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10">
    <XCircle className="w-4 h-4 mr-2" /> Reject
  </Button>
</div>
```

### 7. Empty States

Two empty states: queue empty + no selection.

```tsx
// Queue empty
<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
  <CheckCircle className="w-10 h-10 text-emerald-500/50 mb-3" />
  <p className="text-sm text-zinc-400">All caught up</p>
  <p className="text-xs text-zinc-600 mt-1">No pending approvals</p>
</div>

// No selection
<div className="flex flex-col items-center justify-center h-full text-center px-6">
  <Inbox className="w-12 h-12 text-zinc-700 mb-3" />
  <p className="text-sm text-zinc-500">Select an item to review</p>
</div>
```

---

## Data Architecture

### Normalization Pattern

Use a custom hook (`useApprovalQueue`) that fetches from multiple APIs in parallel and normalizes into a unified `ApprovalItem` type:

```tsx
interface ApprovalItem {
  id: string;              // 'multisig-7', 'investor-42'
  originalId: number;      // raw DB id for API calls
  type: ApprovalType;      // category key for TYPE_CONFIG
  label: string;           // display name
  subtitle: string;        // secondary info line
  status: string;          // raw status
  normalizedStatus: 'pending' | 'in_progress' | 'resolved';
  createdAt: string;       // ISO timestamp
  raw: any;                // original API response
}
```

### State Management

```tsx
const [filter, setFilter]     = useState<ApprovalType | 'all'>('all');
const [selected, setSelected] = useState<ApprovalItem | null>(null);
const [actionLoading, setActionLoading] = useState(false);
```

Keep `selected` in sync after refresh:

```tsx
useEffect(() => {
  if (selected) {
    const updated = items.find(i => i.id === selected.id);
    if (updated) setSelected(updated);
    else setSelected(null);
  }
}, [items]);
```

---

## Color System Reference

| Category   | Icon Color       | Badge Background       |
|------------|------------------|------------------------|
| Teal       | `text-teal-400`  | `bg-teal-500/15`       |
| Amber      | `text-amber-400` | `bg-amber-500/15`      |
| Blue       | `text-blue-400`  | `bg-blue-500/15`       |
| Emerald    | `text-emerald-400`| `bg-emerald-500/15`   |
| Purple     | `text-purple-400`| `bg-purple-500/15`     |
| Slate      | `text-slate-300` | `bg-slate-500/15`      |

Pattern: `bg-{color}-500/15 text-{color}-400 border-{color}-500/30`

---

## Surface & Border System

| Surface               | Class                                    |
|-----------------------|------------------------------------------|
| Panel background      | `bg-white/[0.03]`                        |
| Panel border          | `border border-white/[0.06]`             |
| Dividers              | `divide-white/[0.04]` or `border-white/[0.06]` |
| Hover                 | `hover:bg-white/[0.04]`                  |
| Selected              | `bg-white/[0.06]`                        |
| Input background      | `bg-white/5 border-white/10`             |
| Dialog background     | `bg-slate-900 border-white/10`           |

---

## Helpers

```tsx
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
```
