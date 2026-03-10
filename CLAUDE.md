# Radox Platform — Project Context

## Identity
- **Product**: Radox — security token platform for real-world asset tokenization
- **Stack**: Node.js/Express + React/TypeScript/Vite + PostgreSQL + Redis + Stellar/Soroban
- **UI**: shadcn/ui + Radix primitives + Tailwind. Never rebuild what the library provides.
- **Auth**: Passkeys (WebAuthn) for all users. No passwords anywhere. Admin uses Freighter wallet.
- **Brand domain**: `radox.net` (landing), `app.radox.net` (SPA), `api.radox.net` (API)

## First Action — Every Session
1. Read `docs/Project_Bible/00_index.md` — master index linking 15 code-verified reference docs
2. Use the Bible question→artifact lookup table to find answers before grepping the codebase
3. If the Bible doesn't cover it, then read source files directly

## Project Bible (`docs/Project_Bible/`)
| I need to know... | Read |
|---|---|
| How X calls Y | `01_call_graph.md` |
| If feature X exists | `02_feature_matrix.md` |
| How data flows | `03_data_flow.md` |
| If code is dead | `04_dead_code.md` |
| What an env var does | `05_config_env_map.md` |
| If something is secure | `06_security_audit.md` |
| How errors propagate | `07_error_recovery.md` |
| What emails are sent | `08_email_inventory.md` |
| Backend internals | `services_layer.md` · `controllers_layer.md` · `routes_layer.md` |
| Frontend internals | `frontend_layer.md` |
| Smart contract | `smart_contract_layer.md` |
| Deployment | `deploy_layer.md` |

Operational runbooks, mainnet checklist → `docs/Operations/`

## Code Patterns (enforce these)
- **Backend**: ES modules, async/await, thin controllers → fat services → Prisma
- **Frontend**: Functional components + hooks, typed props/state, `types/index.ts` interfaces
- **Tests**: `*.test.js` (unit), `*.mocked.test.js` (CI), `*.integration.test.js` (testnet)
- **Security**: No `eval`, no `exec` (use `execFile`), no `dangerouslySetInnerHTML` without DOMPurify

## Frontend Design (auto-apply when touching UI)
No generic aesthetics. No default Tailwind. No cookie-cutter cards. Distinctive typography, cohesive color via CSS custom properties, micro-animations on interactions, gradients and layered shadows for atmosphere. Full spec: `.agent/workflows/frontend-design.md`

## Stellar Documentation
Stellar docs are available via the **Obsidian MCP tool** — no local folder. Use it to look up SDK methods, transaction operations, or protocol details. Never hallucinate Stellar SDK methods — always verify.

## Browser Testing — HARD RULES

> ⚠️ **This platform uses passkeys and Freighter. The browser agent CANNOT authenticate. Do not attempt to.**

**BEFORE launching the browser agent:**
1. Ask the user which portal they need (Admin / Investor / Company)
2. Ask them to login in their browser and confirm they're on an authenticated page
3. Only then launch the browser agent

**WHILE the browser agent is running — STOP IMMEDIATELY if you see ANY of these:**
- A login page or login form
- "Login with Passkey" or "Connect Freighter" buttons
- A WebAuthn/biometric prompt
- A redirect to `/login` or `/admin/login`
- Any "unauthorized" or "session expired" message
- The page is blank or shows a loading spinner that never resolves (likely auth redirect)

**When stopped:** Do NOT retry, do NOT try to click around it, do NOT attempt alternative auth flows. Return control to the user with: *"I hit an auth wall. Please login at [URL] and confirm when ready."*

| Portal | URL |
|--------|-----|
| Admin | `https://dev.radox.net/admin/login` |
| Investor / Company | `https://dev.radox.net/login` |
