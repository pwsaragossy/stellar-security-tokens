# Radox — Stellar Security Tokens

Radox is a private rail for cross-border real-world asset tokenization on Stellar. An investment office — or two partner offices — uses Radox to run tokenized offerings for its own KYC-gated clients, settling in dollar-denominated security tokens over Stellar/Soroban. Radox provides the rail and creates/tokenizes the offering (KYC + light due diligence); it is not the issuer — the contracting office is. Funds move only within each office's KYC list.

## What's here

This repository contains the application source code only. Operational documentation, internal guides, architecture notes, and business context live in a private mirror.

## Stellar integrations

- **Soroban contracts** (Rust): primary issuance, yield distribution, and maturity settlement
- **Passkey smart wallets** (WebAuthn): keyless onboarding via OpenZeppelin Smart Account Kit
- **Etherfuse anchor**: BRL ↔ USDC / TESOURO ramp over Pix (in integration)
- **Stellar SDK v15**: account management, asset operations, TOML publishing

## Tech stack

- **Backend**: Node.js 22 + Express + Prisma + PostgreSQL + Redis
- **Frontend**: React 19 + TypeScript + Vite + Tailwind
- **Contracts**: Soroban (Rust, wasm32v1-none)
- **Infra**: Docker + Caddy

## License

All rights reserved.
