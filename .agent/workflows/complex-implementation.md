---
description: Playbook for one-shotting complex code implementations without errors
---

# Complex Implementation Playbook

A repeatable framework for executing large, risky code changes in a single pass without regressions. Derived from real-world success patterns.

---

## Phase 0: Set the Stage (before any code)

### 0.1 — Give the AI full source access to external dependencies

If the task involves a new library, SDK, or external codebase:
- Clone/download the repo locally so the AI can `view_file` into source code
- Docs and READMEs are not enough — the AI needs to read constructors, types, and method signatures directly

> **Why:** The #1 cause of failed implementations is guessing an API shape. Reading source eliminates guessing.

### 0.2 — Ensure codebase knowledge is loaded

If this is the first session on this codebase:
- Point the AI to `CLAUDE.md` or equivalent project context file
- Share relevant Knowledge Items or past conversation context
- Let the AI read (not skim) the core files it will modify

> **Why:** The AI can't make sound design decisions without understanding existing patterns.

---

## Phase 1: Deep Read (no writing allowed)

### 1.1 — Read ALL affected files end-to-end

Not grep. Not "show me the relevant parts." Full file reads of every file that will change.

- For large files (500+ lines): read in chunks, annotate learnings per chunk
- For each file, note: what it imports, what imports it, what external APIs it calls

### 1.2 — Map the dependency graph

Run import/require grep across the codebase to understand:
- Who calls the code you're changing?
- What breaks if the interface changes?
- Are there dead files nobody imports? (free scope reduction)

### 1.3 — Snapshot the "before" state

Create a document capturing the current state of everything that will change:
- Config values and their shapes
- API response formats
- Env vars and their defaults
- Current method signatures

> **Why:** You can't verify a migration without a "before" to diff against.

---

## Phase 2: Plan Before Executing

### 2.1 — Classify everything by risk

For every function/file/component in scope, assign a tier:

| Tier | Definition | Action |
|------|-----------|--------|
| **KEEP** | Zero dependencies on the thing being changed | Don't touch |
| **EASY** | Config/naming changes only | Quick swap |
| **MEDIUM** | Same logic, different API | Careful rewrite |
| **HARD** | Fundamentally different approach needed | Deep rewrite |

> **Why:** This typically reveals that 30-50% of the surface area doesn't need changes at all. That cuts risk in half immediately.

### 2.2 — Surface unknowns and resolve them

Before greenlighting execution, the user should ask:

- "What don't we know that could blow this up?"
- "Are there API shapes we're assuming but haven't verified?"
- "What happens to existing data/users?"

Resolve every unknown during planning. Discovering them mid-execution causes rework.

### 2.3 — Define verification commands upfront

Write the exact commands you'll run to verify success. Examples:
- `node -e "require('./module')"` — catches import errors
- `tsc --noEmit` — catches type errors
- `vite build` / `next build` — catches bundling issues
- `grep -rn "old_term"` — catches stale references
- `npm test` — catches regressions

> **Why:** If you can't define how you'll verify, you don't understand the change well enough.

---

## Phase 3: Execute in Risk Order

### 3.1 — Kill dead code first

If Phase 1 revealed dead files/functions, delete them before starting the real work. This is free scope reduction with zero risk.

### 3.2 — Execute tier by tier, not file by file

Go in order: EASY → MEDIUM → HARD. Within each tier:
- Make the change
- Mentally verify it doesn't break callers
- Move to next

### 3.3 — Don't defer doc/config cleanup

In the same pass, update:
- All `.env` files (template, production, example)
- All documentation references
- All comments mentioning old terms
- Docker/CI configuration

Run the stale-reference grep after each phase.

---

## Phase 4: Verify Mechanically

Run every verification command from step 2.3. Each must produce a binary pass/fail:

```
✅ Module loads without errors
✅ TypeScript: zero errors
✅ Build: succeeds
✅ Tests: exit 0 (expected failures documented)
✅ Stale references: zero hits
```

If any check fails, fix and re-verify before declaring done.

---

## User's Role: What Makes the Difference

The user's behavior is just as critical as the AI's. What worked:

| User Action | Why It Mattered |
|-------------|-----------------|
| Cloned external SDK repo locally | AI could read source, not guess |
| Said "fully read the file, it's huge" | Prevented the AI from skimming |
| Asked "is this ULTRATHINKED?" | Forced deeper analysis before execution |
| Said "figure these unknowns out before proceeding" | Prevented mid-execution rework |
| Provided API keys / credentials when asked | Didn't block progress on external dependencies |
| Let the AI run npm install and track deps | Single source of truth for dependency management |
| Verified E2E in Docker while AI was documenting | Parallel validation, faster feedback |

### Anti-patterns to avoid:

- ❌ "Just do it" without letting the AI read files first
- ❌ Skipping the planning phase for "simple" changes
- ❌ Approving a plan without asking about unknowns
- ❌ Deferring doc updates to "later" (they never happen)
- ❌ Not providing access to external library source code

---

## Checklist Summary

```
BEFORE (Phase 0-1):
□ External dependencies cloned locally
□ Project context file (CLAUDE.md) read
□ All affected files read end-to-end
□ Dependency graph mapped (import grep)
□ "Before" state snapshotted
□ Dead code identified

PLAN (Phase 2):
□ Every method/file classified by risk tier
□ All unknowns surfaced and resolved
□ Verification commands defined

EXECUTE (Phase 3):
□ Dead code killed first
□ Changes applied tier by tier (easy → hard)
□ Docs and config updated in same pass
□ Stale reference grep after each phase

VERIFY (Phase 4):
□ Module/import check passes
□ Type check passes
□ Build succeeds
□ Tests pass (expected failures documented)
□ Zero stale references in source
□ E2E test in running environment
```
