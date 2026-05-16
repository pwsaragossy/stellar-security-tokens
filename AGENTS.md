# Repository Guidelines

## Project Structure & Module Organization

This monorepo is organized by runtime boundary. `backend/` contains the Express API, Prisma schema/migrations, services, controllers, routes, middleware, and Node tests. `frontend/` contains the React/Vite app under `frontend/src`, including `api/`, `components/`, `hooks/`, `layouts/`, `pages/`, `lib/`, `utils/`, and `assets/`. `contracts/` contains Soroban Rust crates (`token_sale`, `yield_distributor`, `maturity_settlement`) with source, tests, and snapshots. Operational docs live in `docs/`; deployment assets live in `deploy/`.

## Build, Test, and Development Commands

- `npm run dev`: start the backend API from `backend/`.
- `npm run frontend:dev`: start Vite with `/api` proxied to `localhost:3000`.
- `npm test`: run backend and frontend tests.
- `npm run test:unit` / `npm run test:integration`: run backend unit or integration suites.
- `npm run frontend:build`: type-check and build the frontend.
- `npm run frontend:lint`: lint the frontend.
- `cd backend && npm run lint`: lint backend `src` and `tests`.
- `cd backend && npm run prisma:migrate`: apply development Prisma migrations using root `.env`.
- `cd contracts/<crate> && cargo test`: run Soroban contract tests for one crate.

## Coding Style & Naming Conventions

Backend code is ESM JavaScript on Node `>=22`. Use 2-space indentation, semicolons, single quotes, trailing commas, and `printWidth: 100` per `backend/.prettierrc`. Frontend code is TypeScript/TSX; use the `@/` alias for `frontend/src` imports when it improves clarity. React components and pages use `PascalCase`; hooks use `useThing`; tests use `*.test.js`, `*.test.ts`, or `*.test.tsx`.

## Testing Guidelines

Backend tests use Node’s test runner plus Supertest/mocks. Keep unit tests in `backend/tests/unit`, integration tests in `backend/tests/integration`, and e2e flows in `backend/tests/e2e`. Frontend tests use Vitest with jsdom and setup in `frontend/src/test/setup.ts`. Contract tests live beside each Soroban crate in `src/test.rs`; update snapshots only for intentional behavior changes. Cover error paths for auth, payments, wallets, contracts, and database transitions.

## Commit & Pull Request Guidelines

Recent history uses short imperative summaries such as `UI fix`; prefer clearer scoped messages like `fix: validate off-ramp wallet ownership`. PRs should include the problem, implementation summary, test results, migration notes, linked issue when available, and screenshots for frontend changes.

## Security & Configuration

Do not commit secrets. Use `.env.template` and `.env.production.template` as references. Treat Stellar keys, admin credentials, webhook secrets, ramp integrations, and Prisma migrations as security-sensitive changes requiring review and rollback notes.

## Agent-Specific Instructions

Start from the spec before code. Identify assumptions, failure modes, ownership, observability, rollout, and rollback for non-trivial changes. Schema-validate downstream LLM output.
