# Deploy Layer — Full Deep Read

> Read date: 2026-03-17
> Files: `Dockerfile` (33L), `frontend/Dockerfile` (45L), `docker-compose.yml` (154L), `docker-compose.prod.yml` (268L), `docker-compose.dev.yml` (dev: `npx prisma generate` on backend start; optional Cloudflare tunnel via `--profile cf-tunnel`; mount `${CLOUDFLARED_CONFIG_DIR:-$HOME/.cloudflared}`), `deploy/Caddyfile` (48L), `deploy/setup-vm.sh` (77L), `deploy/bootstrap-admin.sh` (45L), `frontend/nginx.conf` (38L), `.env.production.template` (92L)

---

## Architecture

```
Internet → Caddy (auto-HTTPS, ports 80/443)
           ├→ radox.net         → static landing (/srv/landing)
           │  └ /.well-known/*  → backend:3000 (SEP-1 stellar.toml)
           ├→ app.radox.net     → frontend:80 (nginx, React SPA)
           │  └ /api/*          → backend:3000 (nginx proxy_pass)
           └→ api.radox.net     → backend:3000 (direct, Swagger + mobile)

Internal:  backend → postgres:5432 (Prisma ORM)
           backend → redis:6379 (session blocklist, rate limiting)
```

## Services (5 in production)

| Service | Image | Memory | CPU | Health Check |
|---------|-------|--------|-----|-------------|
| **postgres** | postgres:15-alpine | 1G | 1 | `pg_isready -U stellar_prod` |
| **redis** | redis:7-alpine | 256M | 0.5 | `redis-cli ping` |
| **backend** | node:22-alpine + pg_dump | 2G | 2 | `wget --spider /health` |
| **frontend** | nginx (multi-stage Vite→nginx) | 256M | 0.5 | `curl || wget /` |
| **caddy** | caddy:2-alpine | 128M | 0.25 | — |

## Domain Routing

| Domain | Caddy Target | Nginx Proxy | Purpose |
|--------|-------------|-------------|---------|
| `radox.net` | Static `/srv/landing` + `/.well-known/*` → backend | — | Landing + SEP-1 stellar.toml |
| `app.radox.net` | frontend:80 | `/api/*` → backend:3000 | React SPA (investor/company/admin portals) |
| `api.radox.net` | backend:3000 | — | API + Swagger + future mobile |
| `www.radox.net` | 301 → `radox.net` | — | WWW redirect |
| `dev.radox.net` ⭐ | `/.well-known/*` → backend, else redirect to `radox.net` | — | SEP-1 stellar.toml for dev issuer account |

## Security (Production)

### Secrets Architecture

| Secret | Location | Protection |
|--------|----------|------------|
| `.env.production` | `/root/radox/.env.production` | `chmod 600` + `.gitignore` (`*.env*` glob) |
| Operations key | Host: `/root/.secrets/operations_key` → Container: `/run/secrets/operations_key` | Docker Secrets (tmpfs, never on disk in container) |
| Issuer/Treasury/Distributor keys | **Not on server** | Client-side only (Freighter/Ledger multisig) |
| Channel keys (×5) | `.env.production` | `chmod 600`, production only |

### Infrastructure Hardening

- `KEY_MANAGEMENT_MODE=multisig` — blocks all server-side signing except Operations hot wallet
- DB: no external port exposure, password required (`?` guard)
- Redis: internal only, optional password
- JWT_SECRET: required, no insecure default (`?` guard)
- WebAuthn: RP_ID + ORIGIN required (`?` guards, must match domain exactly)
- `ports: !override []` prevents frontend external exposure (only Caddy exposes 80/443)
- Caddy DNS: `8.8.8.8` + `1.1.1.1` (avoids Ubuntu systemd-resolved loopback trap)
- Log rotation: `json-file` driver — 50M/5 files (backend), 10M/3 files (all others)
- `sameSite: 'lax'` cookies (CSRF prevention in proxied architecture)
- `trust proxy: 'loopback, linklocal, uniquelocal'` (multi-hop rate limiting fix)

## Startup Sequence (Backend)

```
1. Wait 5s for DB (depends_on: service_healthy)
2. Run Prisma migrations (node --import tsx src/database/migrate.js)
3. Start server (node --import tsx src/index.js)
4. Auto-verify issuer flags (skip if multisig)
5. Start 5 cron jobs + payment monitor + Soroban services
```

## Environment Variables (Key Groups)

| Group | Variables | Prod Default | Guard |
|-------|-----------|-------------|-------|
| Database | POSTGRES_DB/USER/PASSWORD, DATABASE_URL | stellar_tokens/stellar_prod | `?` |
| Stellar | STELLAR_NETWORK, HORIZON_URL, SOROBAN_RPC_URL | testnet | — |
| Accounts | ISSUER/DISTRIBUTOR/OPERATIONS/TREASURY_PUBLIC_KEY | — | `?` |
| Key Mgmt | KEY_MANAGEMENT_MODE | `multisig` | — |
| Auth | JWT_SECRET, API_KEY | — | `?` |
| WebAuthn | WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN | — | `?` |
| Smart Wallets | CHANNELS_API_KEY, ACCOUNT_WASM_HASH, WEBAUTHN_VERIFIER_ADDRESS | — | `?` on CHANNELS |
| Soroban | ENABLE_SOROBAN_SALE, SALE_WASM_HASH, XLM/USDC_SAC_CONTRACT_ID | `false` / — | `?` on SACs |
| SEP-1 | STELLAR_HOME_DOMAIN | `radox.net` | — |
| Email | RESEND_API_KEY, EMAIL_FROM | Radox noreply | — |
| Frontend | FRONTEND_URL | — | `?` |
| Channels | CHANNEL_1..5_SECRET_KEY | — | — |

> **Template**: `.env.production.template` is the single source of truth for all production variables.

## The 7-Layer Consequence Chain

A change in domain structure or network config triggers failures across the entire stack:

1. **DNS & SSL**: Cloudflare must be "DNS Only" (grey cloud) for Caddy ACME
2. **Reverse Proxy**: Multi-hop trust proxy must accept private ranges
3. **Docker / Vite**: `VITE_*` vars are build-time — baked into JS bundle
4. **Database**: `POSTGRES_PASSWORD` in `.env.production` must match `?` guard
5. **Cookies**: Production uses `sameSite: 'lax'`, not `'none'`
6. **WebAuthn**: `WEBAUTHN_ORIGIN` must exactly match ceremony domain
7. **Stellar On-Chain**: SEP-1 `stellar.toml` served by backend via Caddy handle

## Key Differences: Dev vs Prod vs Mainnet

| Aspect | Dev | Prod (Testnet) | Prod (Mainnet) |
|--------|-----|----------------|----------------|
| Network | testnet | testnet | `public` |
| Signing | env keys (server-side) | Freighter/Ledger multisig | Freighter/Ledger multisig |
| HTTPS | none | Caddy + Let's Encrypt | Caddy + Let's Encrypt |
| Port exposure | 3000, 80, 5432 | 80, 443 only (Caddy) | 80, 443 only (Caddy) |
| Secrets | `.env` file | Docker Secrets + `chmod 600` | Secrets Manager (Vault) |
| Frontend | hot-reload (Vite dev) | nginx static (baked bundle) | nginx static (baked bundle) |
| Test login | enabled | disabled | disabled |
| Passphrase | `Test SDF Network ; September 2015` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| USDC Issuer | auto-detected | auto-detected | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| Horizon | horizon-testnet.stellar.org | horizon-testnet.stellar.org | horizon.stellar.org |
| RPC | soroban-testnet.stellar.org | soroban-testnet.stellar.org | soroban-rpc.mainnet.stellar.org |

## Deployment Commands

```bash
# === SSH Access ===
ssh root@134.209.73.154    # Key: ~/.ssh/id_ed25519

# === Production (always use the double-file + env-file pattern) ===

# Start / rebuild
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build

# Status (MUST include --env-file due to ? guards)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production ps

# Logs
docker logs stellar_backend --tail 50 -f

# Update code
git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build

# Manual backup
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production exec postgres \
  pg_dump -U stellar_prod stellar_tokens > backup_$(date +%Y%m%d).sql

# === Development ===
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
# Optional tunnel: add `--profile cf-tunnel` (needs `cloudflared login`; ~/.cloudflared/cert.pem).
# Backend: dev override runs prisma generate before migrate (bind mount hides image-generated client).
```

## First Deploy Checklist

```
[ ] VM provisioned (4GB RAM, SSH key, Ubuntu 24.04)
[ ] DNS records: radox.net, app.radox.net, api.radox.net → VM IP (Cloudflare DNS Only / grey cloud)
[ ] Docker installed (deploy/setup-vm.sh)
[ ] Repo cloned (private PAT)
[ ] .env.production created from template (chmod 600)
[ ] /root/.secrets/operations_key created (chmod 600)
[ ] docker compose up -d --build
[ ] All 5 containers healthy
[ ] deploy/bootstrap-admin.sh (seed platform_admins + Freighter key)
[ ] Verify: api.radox.net/health → {"status":"ok"}
[ ] Verify: app.radox.net → HTTP/2 200
[ ] Verify: radox.net/.well-known/stellar.toml → correct NETWORK_PASSPHRASE
[ ] Backend logs: no errors, PaymentMonitor started, channel pool initialized
```

## Deploy Skill

> For the interactive, gate-checked deployment protocol, use the **plan-deploy-review** skill:
> `/plan-deploy-review` or read `~/.gemini/antigravity/skills/plan-deploy-review/SKILL.md`

## Verified Deployment (2026-03-17)

All 5 containers healthy on `Radox-Prod`. Endpoints verified:
- `https://api.radox.net/health` → `{"status":"ok"}`
- `https://app.radox.net` → HTTP/2 200
- `https://radox.net/.well-known/stellar.toml` → `NETWORK_PASSPHRASE="Test SDF Network"`

## Production Issuer (Testnet)

| Setting | Value |
|---------|-------|
| **Key** | `GAA7F6YI4BCMJKMWASGGW5A644RXPONHIHISQESR3YHKPB6MGBCXAY2U` |
| **home_domain** | `radox.net` (set via Laboratory `setOptions`) |
| **Flags** | `auth_required + auth_revocable + auth_clawback_enabled` |
| **Droplet IP** | `134.209.73.154` |

## Deployment Gotchas

### `restart` ≠ `recreate`

`docker compose restart` does NOT reload `.env` files — it only restarts the process inside the existing container. Env vars are baked at container creation time. After changing `.env.production`, always use:

```bash
# ✅ CORRECT — recreates container with new env
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build backend

# ❌ WRONG — does NOT pick up env changes
docker compose ... restart backend
```

### Never blind-SCP `.env.production`

Local `.env.production` may have empty values for secrets that only exist on the droplet. Always diff before SCP:

```bash
diff <(grep -v '^#\|^$' .env.production | sort) \
     <(ssh root@134.209.73.154 "grep -v '^#\|^$' ~/radox/.env.production" | sort)
```

Protected production-only vars: `ACCOUNT_WASM_HASH`, `WEBAUTHN_VERIFIER_ADDRESS`, `ED25519_VERIFIER_ADDRESS`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `REDIS_PASSWORD`, `API_KEY`.

### DB Truncation — Protected Tables

When cleaning the DB, **NEVER truncate these**:
- `platform_admins` — admin accounts
- `platform_admin_webauthn_credentials` — admin login credentials
- `_prisma_migrations` — migration history
