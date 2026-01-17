# Project Instructions

This file provides context and rules for AI coding assistants working on this project.

## Project Overview

Stellar Security Tokens - A blockchain-based security token platform with:
- **Backend**: Node.js/Express API with Prisma ORM, Stellar SDK integration
- **Frontend**: React/TypeScript with Vite, TailwindCSS

---

## Auto-Invoked Skills

### Frontend Design Skill (Auto-Detect)

**When working on any files in `frontend/src/` involving UI components, pages, or styling, automatically apply the `/frontend-design` workflow principles:**

1. **Design Thinking**: Before coding, consider purpose, tone, and what makes it unforgettable
2. **Typography**: Never use generic fonts (Inter, Roboto, Arial). Choose distinctive, characterful fonts
3. **Color**: Cohesive palettes with CSS custom properties. Avoid cliché purple-to-pink gradients
4. **Motion**: High-impact animations at key moments (page load, hover states, transitions)
5. **Spatial Composition**: Embrace asymmetry, overlap, unexpected layouts
6. **Visual Details**: Create atmosphere with gradients, textures, shadows - never solid colors

**Anti-patterns to avoid:**
- Generic Bootstrap/Tailwind default aesthetics
- Cookie-cutter card grids
- Predictable component patterns
- Lack of distinctive character

See `.agent/workflows/frontend-design.md` for full guidelines.

### Security Guidance Skill (Auto-Detect)

**When writing or editing code, automatically check for these security anti-patterns and warn if detected:**

| Pattern | Trigger | Guidance |
|---------|---------|----------|
| **GitHub Actions Injection** | `.github/workflows/*.yml` | Never use untrusted input (issue titles, PR descriptions) directly in `run:` commands. Use `env:` with proper quoting. |
| **Command Injection** | `child_process.exec`, `exec()`, `execSync()` | Use `execFile` instead of `exec` to prevent shell injection. Never pass user input to shell commands. |
| **Code Injection** | `new Function()`, `eval()` | Avoid evaluating arbitrary code. Use `JSON.parse()` for data, consider alternative designs. |
| **XSS via React** | `dangerouslySetInnerHTML` | Sanitize all content with DOMPurify before rendering. |
| **XSS via DOM** | `document.write`, `.innerHTML =` | Use `textContent` for plain text, or safe DOM methods with sanitization. |
| **Pickle Deserialization** | `pickle` | Can lead to arbitrary code execution. Use JSON or other safe formats. |
| **OS Command Injection** | `os.system` | Only use with static arguments, never with user-controlled input. |

**Format for warnings:**
```
⚠️ Security Warning: [Pattern detected]. [Brief explanation]. [Safer alternative].
```

### Explanatory Output Style (Auto-Invoke)

**Provide educational insights about implementation choices as you help with tasks.**

When writing or modifying code, include brief educational explanations using this format:

```
★ Insight ─────────────────────────────────────
[2-3 key educational points about the implementation]
─────────────────────────────────────────────────
```

Focus on:
- Specific implementation choices for THIS codebase
- Patterns and conventions in the existing code
- Trade-offs and design decisions
- Codebase-specific details (not general programming concepts)

Provide insights as you write code, not just at the end.

---

## Code Style

### Backend (JavaScript)
- Use ES modules (`import`/`export`)
- Async/await for all async operations
- JSDoc comments for public functions
- Error handling with try/catch and proper logging

### Frontend (TypeScript/React)
- Functional components with hooks
- Type all props and state
- Use React Query for server state
- Tailwind for styling (but make it distinctive, not generic)

---

## Testing

- Backend: Jest with `*.test.js` naming
- Mocked integration tests: `*.mocked.test.js` (for CI)
- Real integration tests: `*.integration.test.js` (for local Stellar testnet)

---

## Key Directories

```
backend/
├── src/
│   ├── routes/       # Express route handlers
│   ├── services/     # Business logic
│   ├── middleware/   # Auth, rate limiting, etc.
│   └── utils/        # Helpers
frontend/
├── src/
│   ├── pages/        # Route pages
│   ├── components/   # Reusable components
│   ├── lib/          # API clients, utilities
│   └── hooks/        # Custom React hooks
```

---

## Stellar Documentation Reference

> ⚠️ **SKIP DURING CODEBASE SCANNING**: The folder `Stellar Docs (...)` is **NOT part of the codebase** - it's the complete official Stellar developer documentation for reference only. Do not index or analyze when understanding the project structure.

### Contents

This folder contains the **full scraped Stellar developer docs** including:
- **Build**: Smart contracts, apps, how-to guides
- **Learn**: Fundamentals, transactions, consensus protocol, data structures
- **Tokens**: Asset issuance, SAC, token interface, access control
- **Data**: Horizon API, RPC, Hubble analytics, indexers
- **Tools**: SDKs, CLI, Stellar Lab, developer tools
- **Networks**: Mainnet, Testnet, Futurenet config
- **Validators**: Running and maintaining nodes
- **Platforms**: Anchor Platform, Disbursement Platform

### Key Files by Task

| Task | Reference File |
|------|---------------|
| **Multisig Setup** | `learn/fundamentals/transactions/signatures-multisig.md` |
| **Asset Issuance** | `tokens/how-to-issue-an-asset.md` |
| **Asset Flags** | `tokens/control-asset-access.md` |
| **Transactions** | `learn/fundamentals/transactions/` |
| **Smart Contracts** | `build/smart-contracts/` |
| **Horizon API** | `data/apis/horizon/` |
| **JavaScript SDK** | `tools/sdks/client-sdks.md` |
| **CLI Reference** | `tools/cli/stellar-cli.md` |
| **Network Config** | `networks.md` |

### Quick Reference

- **Testnet Passphrase**: `Test SDF Network ; September 2015`
- **Mainnet Passphrase**: `Public Global Stellar Network ; September 2015`
- **Horizon Testnet**: `https://horizon-testnet.stellar.org`
- **Stellar Lab**: `https://lab.stellar.org`

