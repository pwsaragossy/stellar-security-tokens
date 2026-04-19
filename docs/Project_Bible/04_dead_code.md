# 04 — Dead Code Inventory

> Code that is unused, unreachable, or superseded
> Generated: 2026-03-10
> Last audited: 2026-04-19

---

## Deleted (Audit 2026-04-19)

| File | Code | Lines | Commit |
|------|------|-------|--------|
| `frontend/src/api/auth.ts` | Entire file (password login) | 18 | `696f300` |
| `frontend/src/pages/auth/VerifyEmail.tsx` | Entire file (Gen 1 link verification) | 75 | `696f300` |
| `frontend/src/types/index.ts` | 7 dead interfaces + `password_hash` field + `CompanyUser` | 102 | `3d84edd` |
| `backend/src/services/payment.service.js` | 5 dead methods + 6 cascade imports | 365 | `3d84edd` |
| `backend/src/services/notification.service.js` | Dead `AlertService` import | 1 | `3d84edd` |
| `backend/src/services/yieldDistributor.service.js` | Dead `AlertService` import | 1 | `3d84edd` |
| `backend/src/routes/investorRoutes.js` | `POST /verify-email` + `POST /resend-verification` | 60 | `3d84edd` |
| `backend/src/controllers/investorController.js` | `verifyEmail` + `resendVerificationEmail` | 126 | `3d84edd` |
| `frontend/src/pages/investor/Settings.tsx` | Zombie "Email Verification" card + handler | 60 | `3d84edd` |
| `frontend/src/api/companyUsers.ts` | Entire file (password-based registration) | 40 | `7aad8c3` |
| `frontend/src/api/notifications.ts` | Entire file (never wired into UI) | 34 | `7aad8c3` |
| `frontend/src/App.css` | Entire file (Vite scaffold leftover) | 1 | `7aad8c3` |
| `frontend/src/components/admin/approvals/details/TokenDetail.tsx` | Entire file (never imported) | 37 | `7aad8c3` |
| `frontend/src/components/admin/FreighterConnect.tsx` | Entire file (unused wrapper — pages use hook directly) | 152 | `7aad8c3` |
| `frontend/src/components/ui/dropdown-menu.tsx` | Entire file (scaffolded, never used) | 126 | `7aad8c3` |
| `frontend/src/hooks/usePortfolio.ts` | Entire file (replaced by direct API calls) | 77 | `7aad8c3` |
| `frontend/src/lib/pusher.ts` | Entire file (WebSocket plan abandoned) | 46 | `7aad8c3` |
| `frontend/src/utils/autoAuth.ts` | Entire file (dev auto-login killed by passkeys) | 150 | `7aad8c3` |
| `frontend/src/utils/debugData.ts` | Entire file (only consumer was autoAuth) | 120 | `7aad8c3` |
| `frontend/src/utils/ipfs.ts` | Entire file (IPFS doc storage never shipped) | 36 | `7aad8c3` |
| `frontend/src/utils/validation.ts` | Entire file (validation moved server-side) | 99 | `7aad8c3` |
| `frontend/src/utils/webauthn.ts` | Entire file (replaced by stellar-smart-wallet-sdk) | 198 | `7aad8c3` |
| **Total** | | **~1,826** | |

**Dependencies removed:** `@radix-ui/react-dropdown-menu`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `pusher-js`

---

## False Positives Corrected

Items that were listed as dead/potentially dead in prior versions of this doc but are **alive**:

| File | Previously Listed As | Actual Status |
|------|---------------------|---------------|
| `transactionManager.service.js` | "Entire file — DELETE" | **ALIVE** — 32 call sites across the codebase |
| `payment.service.js` | "Entire file — likely DELETE" | **PARTIALLY ALIVE** — 5 methods dead (deleted), remaining methods alive (maturity cron, active payment flows) |
| `investorController.js` legacy registration | "Old flow — verify no routes" | **ALIVE** — passkey registration flow still uses `registerInvestorWithPasskey` |

---

## Remaining Known Dead (Deferred)

| File | Code | Reason Deferred |
|------|------|----------------|
| `backend/src/services/alert.service.js` | `distributionQueueFailed()` | Needs method-level audit (file is alive, method may be dead) |

---

## Redundancy (Not Dead, But Should Consolidate)

| Redundancy | Files | Recommendation |
|------------|-------|----------------|
| Passkey config endpoint | 4 route files return same config | Single shared endpoint |
| Wallet status endpoint | investorRoutes, companyRoutes, companyUserRoutes | Shared utility |
| SAC sponsor code | platformAdminRoutes L1055-1207 vs L1403-1555 (~300L duplicated) | Extract to SponsorService |
| Challenge store | authRoutes (in-memory Map) + platformAdminRoutes (in-memory Map) | Move to Redis |
| `lib/api.ts` ApiClient | Duplicate of `api/client.ts` (Axios). Only used by `lib/passkey.ts` | Migrate passkey.ts to Axios → DELETE |

---

## Superseded Patterns

| Pattern | Old | New | Files Affected |
|---------|-----|-----|----------------|
| Password auth | `bcrypt` hash + compare | Passkey (WebAuthn) | investorController, authRoutes |
| Manual token distribution | TransactionManagerService | Soroban sale contract `trade()` | transactionManager.service.js |
| Bull job queue | Bull + Redis queues | Direct async + SorobanEventIndexer | References in alert.service.js |
| Single-step registration | Direct /register | Email-first 3-step flow | investorRoutes, companyRoutes |
| Link-based email verification | JWT token in email link | 6-digit code via Redis | investorRoutes, email.service.js |
| Platform-pushed payments | PaymentService batch USDC | Company-initiated Soroban yield distributor | payment.service.js |
