# Radox — Stellar Security Tokens

Cross-border real-world asset tokenization platform built on Stellar — bridging Brazilian fiat (Pix/BRL) into dollar-denominated security tokens. Source code published as part of the Stellar Accelerator program.

## What's here

This repository contains the application source code only. Operational documentation, internal guides, architecture notes, and business context live in a private mirror.

## Stellar integrations

- **Soroban contracts** (Rust): primary issuance, yield distribution, and maturity settlement
- **Passkey smart wallets** (WebAuthn): keyless onboarding via OpenZeppelin Smart Account Kit
- **Etherfuse anchor**: BRL ↔ USDC / TESOURO ramps over Pix
- **Stellar SDK v14**: account management, asset operations, TOML publishing

## Tech stack

- **Backend**: Node.js 22 + Express + Prisma + PostgreSQL + Redis
- **Frontend**: React 19 + TypeScript + Vite + Tailwind
- **Contracts**: Soroban (Rust, wasm32-unknown-unknown)
- **Infra**: Docker + Caddy

## License

All rights reserved.
