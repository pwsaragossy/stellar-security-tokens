# Radox — Stellar Security Tokens

Radox is the internal rail an investment office — or two partner offices — uses to run private, tokenized, cross-border (Brazil↔US) offerings for its own KYC-gated clients, built on Stellar. Radox provides the rail and creates/tokenizes the offering (KYC + light due diligence); it is not the issuer — the contracting office is. Settlement is in dollar-denominated security tokens over Stellar/Soroban, and funds move only within each office's KYC list.

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
