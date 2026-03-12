# Deploy Layer — Full Deep Read

> Read date: 2026-03-12
> Files: `Dockerfile` (34L), `docker-compose.yml` (147L), `docker-compose.prod.yml` (268L), `deploy/Caddyfile` (32L), `.env.production.template`

---

## Architecture

```
Internet → Caddy (auto-HTTPS) → ┬→ frontend:80 (nginx, React SPA)
                                 ├→ backend:3000 (Node.js Express)
                                 └→ radox.net (static landing page)

Internal:  backend → postgres:5432
           backend → redis:6379
```

## Services (5 in production)

| Service | Image | Memory | CPU | Health Check |
|---------|-------|--------|-----|-------------|
| **postgres** | postgres:15-alpine | 1G | 1 | `pg_isready` |
| **redis** | redis:7-alpine | 256M | 0.5 | `redis-cli ping` |
| **backend** | node:20-alpine + pg_dump | 2G | 2 | `wget --spider /health` |
| **frontend** | nginx (built with Vite) | 256M | 0.5 | `curl || wget /` |
| **caddy** | caddy:2-alpine | 128M | 0.25 | — |

## Domain Routing (Caddyfile)

| Domain | Target | Purpose |
|--------|--------|---------|
| `radox.net` | Static files + `/.well-known/*` → backend | Landing + SEP-1 stellar.toml |
| `app.radox.net` | frontend:80 | React SPA |
| `api.radox.net` | backend:3000 | API + Swagger + mobile |

## Security (Production)

### Secrets Architecture

| Secret | Location | Protection |
|--------|----------|------------|
| `.env.production` | `/root/radox/.env.production` | `chmod 600` + `.gitignore` blocks commit (`.env*` glob) |
| Operations key | `/root/.secrets/operations_key` | `chmod 600` → Docker Secrets → tmpfs at `/run/secrets/operations_key` |
| Issuer/Treasury/Distributor keys | **Not on server** | Client-side only (Freighter/Ledger multisig) |

### Infrastructure Hardening

- `KEY_MANAGEMENT_MODE=multisig` — blocks all server-side signing except Operations hot wallet
- DB: no external port exposure, required password (`?` guard)
- Redis: internal only, optional password
- JWT_SECRET: required, no insecure default
- WebAuthn: RP_ID + ORIGIN required (must match domain)
- `ports: !override []` prevents frontend external exposure (only Caddy exposes 80/443)
- Caddy DNS: `8.8.8.8` + `1.1.1.1` (avoids Ubuntu systemd-resolved loopback trap)
- Log rotation: `json-file` driver — 50M/5 files (backend), 10M/3 files (all others)

## Startup Sequence (Backend)

```
1. Wait 5s for DB
2. Run Prisma migrations (node --import tsx src/database/migrate.js)
3. Start server (node --import tsx src/index.js)
4. Auto-verify issuer flags (skip if multisig)
5. Start 5 cron jobs + payment monitor + Soroban services
```

## Environment Variables (Key Groups)

| Group | Variables | Prod Default |
|-------|-----------|--------------|
| Database | DATABASE_URL, DB_HOST/PORT/NAME/USER/PASSWORD | stellar_prod |
| Stellar | STELLAR_NETWORK, HORIZON_URL, SOROBAN_RPC_URL | testnet |
| Accounts | ISSUER/DISTRIBUTOR/OPERATIONS/TREASURY_PUBLIC_KEY | required |
| Key Mgmt | KEY_MANAGEMENT_MODE | `multisig` |
| Auth | JWT_SECRET, API_KEY | required, no default |
| WebAuthn | WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN | required |
| Passkey Kit | LAUNCHTUBE_URL/JWT, FACTORY_CONTRACT_ID | required |
| Soroban | ENABLE_SOROBAN_SALE, SALE_WASM_HASH, XLM/USDC_SAC_CONTRACT_ID | `false` (kill switch) |
| SEP-1 | STELLAR_HOME_DOMAIN | `radox.net` |
| Email | RESEND_API_KEY, EMAIL_FROM | Radox noreply |

> **Template**: `.env.production.template` is the single source of truth for all production variables. Copy to `.env.production`, fill secrets, `chmod 600`.

## Key Difference: Dev vs Prod

| Aspect | Dev (`docker-compose.dev.yml`) | Prod (`docker-compose.prod.yml`) |
|--------|-----|------|
| Network | testnet | testnet (override to `public` for mainnet) |
| Signing | env keys (server-side) | Freighter/Ledger multisig |
| HTTPS | none | Caddy + Let's Encrypt auto |
| Port exposure | 3000, 80, 5432 | 80, 443 only (via Caddy) |
| Secrets | `.env` file | Docker Secrets (tmpfs) + `chmod 600` |
| Frontend build | hot-reload (Vite dev server) | nginx static (baked bundle) |

## Deployment Commands

```bash
# Start
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build

# View status (MUST include --env-file due to ? guards)
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
```

## First Deploy Checklist

```
[ ] VM provisioned (4GB RAM, SSH key, Ubuntu 24.04)
[ ] DNS records: radox.net, app.radox.net, api.radox.net → VM IP (Cloudflare DNS Only)
[ ] Docker installed (deploy/setup-vm.sh)
[ ] Repo cloned (private PAT)
[ ] .env.production created from template (chmod 600)
[ ] /root/.secrets/operations_key created (chmod 600)
[ ] docker compose up -d --build
[ ] deploy/bootstrap-admin.sh (seed platform_admins + Freighter key)
[ ] Verify: api.radox.net/health, app.radox.net, radox.net/.well-known/stellar.toml
```

## Verified Deployment (2026-03-12)

All 5 containers healthy on `Radox-Prod`. Endpoints verified:
- `https://api.radox.net/health` → `{"status":"ok"}`
- `https://app.radox.net` → HTTP/2 200
- `https://radox.net/.well-known/stellar.toml` → `NETWORK_PASSPHRASE="Test SDF Network"`
