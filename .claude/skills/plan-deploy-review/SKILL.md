---
name: plan-deploy-review
version: 2.0.0
description: |
  Zero-error deployment engineer. Interactive preflight → execution → post-flight
  checklist for FIRST DEPLOY, CODE UPDATE, and MAINNET MIGRATION. Every step has a
  gate-check. No step skipped, no variable forgotten, no container left unhealthy.
  v2.0 (Apr 2026): Added Upgrade Safety Gates — migration data audit, Soroban contract
  version verification, Stellar account readiness, and tokenomics consistency checks.
  Born from the pre-Soroban-Settlement VM deploy near-miss.
---

# Radox Deployment Skill — Zero-Error Protocol

> **Philosophy**: Every deploy failure in Radox's history was caused by a skipped step or an unchecked assumption. This skill makes skipping impossible.

## Activation

When the user triggers `/plan-deploy-review` or asks to deploy, follow this protocol **exactly**.

---

## Phase 0 — MODE DETECTION

Ask the user which mode they need. **Do not proceed until confirmed.**

| Mode | Trigger | Description |
|------|---------|-------------|
| **FIRST_DEPLOY** | Fresh VM, no containers exist | Full provisioning from zero |
| **CODE_UPDATE** | Codebase changed, push to existing prod | Hot-swap with zero downtime goal |
| **MAINNET_MIGRATION** | Moving from `testnet` → `public` | Network switch + fresh keys + security hardening |
| **LOCAL_DEV** | Local development environment | Docker Compose dev stack with hot-reload |

---

## Phase 1 — PREFLIGHT CHECKLIST (Gate: ALL must pass before Phase 2)

### 1.1 Environment Identification

Ask the user to confirm:

```
1. Target environment: [ local | testnet-prod | mainnet-prod ]
2. Server IP (prod only): ___
3. SSH access verified: [ yes | no ]
   - Command: `ssh root@134.209.73.154`
   - Key: `~/.ssh/id_ed25519` (ed25519, generated with `ssh-keygen -t ed25519 -C "pedro@radox"`)
4. Git branch to deploy: ___
5. Any .env changes since last deploy: [ yes | no — list them ]
```

### 1.2 The 7-Layer Consequence Chain

> Every deployment touches 7 layers. A mistake in ANY layer cascades into silent failures.

Run through each layer mentally and verify:

| # | Layer | What can break | How to verify |
|---|-------|----------------|---------------|
| 1 | **DNS & SSL** | Cloudflare must be **DNS Only** (grey cloud). Orange cloud breaks Caddy's ACME. | `dig +short radox.net` → returns VM IP |
| 2 | **Reverse Proxy (Caddy)** | Multi-hop `trust proxy` misconfiguration → rate limiter uses internal IP | Check `app.set('trust proxy', 'loopback, linklocal, uniquelocal')` in `app.js` |
| 3 | **Docker / Vite Build** | `VITE_*` vars are **build-time**. Wrong passphrase = frontend talks to wrong network | Verify `docker-compose.prod.yml` → `frontend.build.args` section |
| 4 | **Database** | `POSTGRES_PASSWORD` in `.env.production` must match `POSTGRES_PASSWORD` expected by compose `?` guard | `grep POSTGRES_PASSWORD .env.production` |
| 5 | **Cookies** | Production must use `sameSite: 'lax'`. `'none'` is a CSRF vector. | Check `backend/src/middleware/auth.js` |
| 6 | **WebAuthn** | `WEBAUTHN_ORIGIN` must **exactly** match the ceremony domain (`https://app.radox.net`) | Compare `.env.production` value vs actual domain |
| 7 | **Stellar On-Chain (SEP-1)** | `radox.net/.well-known/stellar.toml` must be served by backend, not static | Verify Caddyfile `handle /.well-known/*` routes to `backend:3000` |

### 1.3 Environment Variable Audit

> **Source of Truth**: `.env.production.template` in repo root.

#### Required Variables (compose `?` guards — will CRASH if missing)

```
✅ POSTGRES_PASSWORD        — openssl rand -base64 24
✅ JWT_SECRET               — openssl rand -hex 32
✅ ISSUER_PUBLIC_KEY         — G...
✅ DISTRIBUTOR_PUBLIC_KEY    — G...
✅ OPERATIONS_PUBLIC_KEY     — G...
✅ TREASURY_PUBLIC_KEY       — G...
✅ XLM_SAC_CONTRACT_ID       — C...
✅ USDC_SAC_CONTRACT_ID      — C...
✅ FRONTEND_URL              — https://app.radox.net
✅ WEBAUTHN_RP_ID            — radox.net
✅ WEBAUTHN_ORIGIN           — https://app.radox.net
✅ CHANNELS_API_KEY          — from OpenZeppelin
```

#### Important Variables (no `?` guard but WILL cause runtime failures if wrong)

```
⚠️  KEY_MANAGEMENT_MODE     — MUST be 'multisig' in production
⚠️  STELLAR_NETWORK         — 'testnet' or 'public'
⚠️  STELLAR_HORIZON_URL     — must match STELLAR_NETWORK
⚠️  SOROBAN_RPC_URL          — must match STELLAR_NETWORK
⚠️  STELLAR_HOME_DOMAIN     — 'radox.net'
⚠️  API_KEY                  — openssl rand -hex 16
⚠️  REDIS_PASSWORD           — openssl rand -base64 16
⚠️  RESEND_API_KEY           — from Resend dashboard
⚠️  PINATA_JWT               — from Pinata dashboard
⚠️  ENABLE_SOROBAN_SALE      — 'false' unless investments active
⚠️  SALE_WASM_HASH           — WASM hash of deployed sale contract (v6)
⚠️  SETTLEMENT_WASM_HASH     — WASM hash of maturity settlement contract
```

#### Network-Specific Values

| Variable | Testnet | Mainnet |
|----------|---------|---------|
| `STELLAR_NETWORK` | `testnet` | `public` |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | `https://soroban-rpc.mainnet.stellar.org` |
| `VITE_STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| `USDC_ISSUER` | *(auto-detected, leave empty)* | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| `CHANNELS_API_KEY` | testnet key | mainnet key |

### 1.4 Secrets Verification

```
✅ /root/.secrets/operations_key exists  (chmod 600)
✅ .env.production exists                (chmod 600)
✅ No secret keys in .env.production (only OPERATIONS via Docker Secrets)
✅ KEY_MANAGEMENT_MODE=multisig
```

**Verify the Operations key Docker Secrets flow:**
```
Host: /root/.secrets/operations_key (chmod 600)
  ↓ Docker Secrets mount (tmpfs)
Container: /run/secrets/operations_key (in-memory)
  ↓ KeyManager.#readOperationsSecret()
Runtime: Keypair.fromSecret(secret)
```

### 1.5 Upgrade Safety Gates (CODE_UPDATE & MAINNET_MIGRATION only)

> **Why this exists:** In Apr 2026, a deploy from a pre-Soroban-Settlement VM nearly
> corrupted production data because destructive enum removals hit rows still using
> those enum values. These gates prevent that class of failure.

**Run ALL gates. ANY failure = STOP. Fix before proceeding to Phase 2.**

#### Gate A — Migration Data Audit (destructive schema changes)

Before running `prisma migrate deploy`, check which migrations are pending:

```bash
# 1. What's the last migration on the target DB?
docker exec stellar_db psql -U stellar_prod -d stellar_tokens -c \
  "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"

# 2. Compare against local migrations list:
ls backend/prisma/migrations/ | tail -20
```

For EACH pending migration, check if it **removes enum values or drops columns**:

```bash
# Search pending migrations for destructive operations
grep -r "DROP\|ALTER.*DROP\|REMOVE\|DELETE.*FROM.*enum" backend/prisma/migrations/ --include="*.sql"
```

If any pending migration removes enum values (e.g., removing `maturity_clawback` from
`MultiSigOperationType`), **verify that no rows use those values**:

```sql
-- Template: replace TABLE, COLUMN, and VALUE with the specific enum being removed
SELECT count(*) FROM <TABLE> WHERE <COLUMN> = '<REMOVED_VALUE>';

-- Known examples from the platform:
SELECT count(*) FROM multi_sig_transactions WHERE operation_type = 'maturity_clawback';
SELECT count(*) FROM multi_sig_transactions WHERE status = 'batch_pending';
```

**If count > 0:** Archive or migrate those rows BEFORE applying the migration.
Never run a destructive migration against live data without this check.

**Gate**: All destructive migration queries return `count = 0`.

#### Gate B — Soroban Contract Version Verification

The platform uses multiple WASM contracts. A version mismatch between the WASM hash
in `.env` and the code's expected contract ABI is **silent and catastrophic** — the
contract deploys fine, but every function call fails with an opaque error.

```bash
# 1. Verify SALE_WASM_HASH points to v6 (additive fixedFee model)
#    The v6 contract's create_sale() accepts fixedFee (i128) instead of fee_bps (u32).
#    If your WASM hash points to v4/v5, create_sale() will fail with mismatched args.
docker exec stellar_backend printenv SALE_WASM_HASH

# 2. Check if settlement contract WASM is deployed (for bullet maturity)
#    Without this, no bullet maturity offer can settle.
grep -n "SETTLEMENT_WASM\|settlement.*wasm\|settlementWasm" backend/src/services/*.js
```

Verify contract version compatibility:

| Contract | Env Var | Expected ABI | How to verify |
|----------|---------|--------------|---------------|
| Sale (v6) | `SALE_WASM_HASH` | `create_sale(fixedFee: i128)` — additive fee, NOT `fee_bps` | Deploy a test sale on testnet first |
| Settlement | `SETTLEMENT_WASM_HASH` or hardcoded | `deposit + settle_batch + burn` (atomic) | Check `sorobanSettlement.service.js` for expected functions |
| Smart Account | `ACCOUNT_WASM_HASH` | OZ Smart Account (WebAuthn + Ed25519) | Verify on stellar.expert |

**Gate**: All WASM hashes resolve to the correct contract version on the target network.

#### Gate C — Stellar Account Readiness

These on-chain configurations are **invisible to Docker** — containers will start
healthy, but every investor purchase will fail if these are wrong.

```bash
# 1. Verify issuer flags
npm run multisig:inspect
# Must show:
#   auth_required: true
#   auth_revocable: true
#   auth_clawback_enabled: true

# 2. Verify issuer thresholds (REQUIRED for SAC auto-authorization)
# Must show:
#   master_weight: 10 (or 0 if locked)
#   low_threshold: 1
#   med_threshold: 2
#   high_threshold: 10
#   Signer: Operations public key with weight = 2

# 3. Verify channel accounts are funded
# Each CHANNEL_*_SECRET_KEY must correspond to a funded account (≥2 XLM)
docker logs stellar_backend 2>&1 | grep -i "channel pool"
# Expected: "Initialized channel pool with 5 accounts"
```

**Without threshold setup**: Every purchase → `INSUFFICIENT_SIGNERS` on `set_authorized()`.
**Without channel accounts**: Every Soroban trade → timeout/failure.

**Gate**: `multisig:inspect` shows correct flags + thresholds. Channel pool log present.

#### Gate D — Tokenomics Consistency (existing offers)

When deploying new fee models or yield logic, existing offers in the DB may have
null or legacy values. Verify fallback behavior is correct:

```sql
-- Check offers missing investorRate (will use annualRate fallback → spread = 0)
SELECT id, name, "annualInterestRate", "investorRate", status
FROM offers
WHERE "investorRate" IS NULL AND status IN ('active', 'matured');

-- Check offers missing processingFee (will use default $5)
SELECT id, name, "processingFee", status
FROM offers
WHERE "processingFee" IS NULL AND status IN ('active', 'approved');
```

**If results exist:** Decide intentionally —
- `investorRate = null` → platform takes $0 spread on those offers. Is this OK?
- `processingFee = null` → falls back to $5 default in contract. Verify this matches.

**Gate**: All active/approved offers have consistent fee configuration, or explicit acceptance of fallback behavior.

---

## Phase 2 — EXECUTION

### MODE: FIRST_DEPLOY

Execute steps **in order**. Each step has a gate-check.

#### Step 1: VM Provisioning
```bash
# SSH into fresh Ubuntu 24.04 VM (4GB RAM minimum)
ssh root@<DROPLET_IP>

# Run setup script (installs Docker, clones repo)
export GITHUB_PAT=ghp_your_token
bash deploy/setup-vm.sh
```
**Gate**: `docker --version` returns a valid version.

#### Step 2: Environment Configuration
```bash
cd ~/radox

# Copy template
cp .env.production.template .env.production

# Generate secrets
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" 
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 16)"
echo "API_KEY=$(openssl rand -hex 16)"

# Fill ALL values in .env.production
nano .env.production

# CRITICAL: Lock permissions
chmod 600 .env.production
```
**Gate**: `ls -la .env.production` shows `-rw-------` and `root root`.

#### Step 3: Operations Key Setup
```bash
mkdir -p /root/.secrets
echo 'SXXXX...' > /root/.secrets/operations_key
chmod 600 /root/.secrets/operations_key
```
**Gate**: `ls -la /root/.secrets/operations_key` shows `-rw-------` and `root root`.

#### Step 4: Landing Page (if applicable)
```bash
# From LOCAL machine, copy landing page dist
scp -r /path/to/landing/dist/* root@<IP>:~/radox/deploy/landing/
```

#### Step 5: Launch Services
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build
```
**Gate**: Wait ~3 minutes, then:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production ps
```
All 5 containers must show **"Up"** and **"healthy"**.

#### Step 6: Database Deployment
```bash
# Prisma migrations run automatically on backend startup.
# Verify by checking backend logs:
docker logs stellar_backend --tail 20
```
**Gate**: Logs show `Prisma migrate deploy` success and `Server running on port 3000`.

#### Step 7: Admin Bootstrap
```bash
# Option A: Use the script
chmod +x deploy/bootstrap-admin.sh
./deploy/bootstrap-admin.sh

# Option B: Direct SQL (if script fails due to env mismatch)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production exec postgres \
  psql -U stellar_prod -d stellar_tokens -c "
INSERT INTO platform_admins (
    email, name, password_hash, role, is_active,
    stellar_public_key, created_at, updated_at
) VALUES (
    'psaragossy@gmail.com',
    'Pedro Saragossy',
    'FREIGHTER_ONLY',
    'super_admin',
    true,
    'YOUR_FREIGHTER_G_PUBLIC_KEY',
    NOW(), NOW()
) ON CONFLICT (email) DO UPDATE SET
    stellar_public_key = EXCLUDED.stellar_public_key,
    is_active = true;
"
```
**Gate**: Query returns `INSERT 0 1` or `UPDATE`.

> [!IMPORTANT]
> **Database Schema Notes:**
> - Table name is `platform_admins` (snake_case, Prisma `@map`)
> - `id` column is **integer** (auto-increment), NOT UUID
> - `role` enum values are **lowercase** (`'super_admin'`)
> - `stellar_public_key` must be the **Freighter** G... key for the admin to log in

---

### MODE: CODE_UPDATE

The most common deployment. Code changed, push to existing production.

#### Step 1: Pre-Update Backup
```bash
ssh root@<DROPLET_IP>
cd ~/radox

# Database backup
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production exec postgres \
  pg_dump -U stellar_prod stellar_tokens > backup_$(date +%Y%m%d_%H%M%S).sql
```
**Gate**: Backup file exists and has non-zero size.

#### Step 2: Pull Code
```bash
git pull origin main
```
**Gate**: `git status` shows clean working tree.

#### Step 3: Check for .env Changes
```bash
# Compare template against current .env
diff .env.production.template .env.production
```
If there are NEW variables in the template, add them to `.env.production` **before rebuilding**.

#### Step 4: Rebuild and Restart
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build
```
**Gate**: All 5 containers healthy (check with `ps` command).

#### Step 5: Verify Migrations
```bash
docker logs stellar_backend --tail 30
```
**Gate**: No Prisma migration errors. Server started successfully.

---

### MODE: MAINNET_MIGRATION

> [!CAUTION]
> This mode involves **real money on the Stellar public network**. Every step is irreversible.

#### Step 1: Generate Fresh Mainnet Keypairs
```bash
# NEVER reuse testnet keys on mainnet
node -e "
const {Keypair} = require('@stellar/stellar-sdk');
['Issuer', 'Distributor', 'Treasury', 'Operations'].forEach(name => {
  const kp = Keypair.random();
  console.log(name + '_PUBLIC_KEY=' + kp.publicKey());
  console.log(name + '_SECRET_KEY=' + kp.secret());
  console.log();
});
"
```
**Gate**: 4 new keypairs generated. Store secrets **offline** (paper/hardware wallet), except Operations.

#### Step 2: Generate Channel Account Keypairs
```bash
node -e "
const {Keypair} = require('@stellar/stellar-sdk');
for(let i=1; i<=5; i++){
  const k = Keypair.random();
  console.log('CHANNEL_'+i+'_SECRET_KEY='+k.secret());
  console.log('# Public: '+k.publicKey());
  console.log();
}
"
```
**Gate**: 5 channel keypairs generated. Fund each with 2 XLM.

#### Step 3: Fund Accounts
Fund each mainnet account:
- **Issuer**: 10 XLM (base reserve + signers)
- **Distributor**: 10 XLM
- **Treasury**: 10 XLM 
- **Operations**: 50 XLM (gas station — keep minimal)
- **Channels (×5)**: 2 XLM each

#### Step 4: Update .env.production
Change ALL network-related variables per the table in Phase 1.3.

#### Step 5: Deploy Smart Contracts to Mainnet
- Deploy `ACCOUNT_WASM_HASH` (Smart Account)
- Deploy `WEBAUTHN_VERIFIER_ADDRESS`
- Deploy `ED25519_VERIFIER_ADDRESS`
- Update `.env.production` with new addresses
- Get **mainnet** `CHANNELS_API_KEY` from OpenZeppelin

#### Step 6: Configure Issuer Flags On-Chain
```bash
# Via Stellar Laboratory or CLI
# Set on the Issuer account:
# - AUTH_REQUIRED: true
# - AUTH_REVOCABLE: true
# - AUTH_CLAWBACK_ENABLED: true
```

#### Step 7: Set Up Multisig
```bash
npm run multisig:setup    # Configure Ledger signers
npm run multisig:inspect  # Verify configuration
```

#### Step 8: Rebuild with Mainnet Config
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build
```

#### Step 9: Lock Issuer (POST-MINTING ONLY)
```bash
# WARNING: IRREVERSIBLE! Only after all initial tokens are minted.
npm run multisig:setup -- -a issuer --lock
# Sets masterWeight: 0 — no further minting possible
```

---

### MODE: LOCAL_DEV

#### Step 1: Start Dev Stack
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

#### Step 2: Verify
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```
**Gate**: postgres, redis, backend, frontend, tunnel all "Up".

#### Key Dev Differences
| Aspect | Dev | Prod |
|--------|-----|------|
| `.env` file | `.env` (auto-loaded) | `.env.production` (explicit `--env-file`) |
| `KEY_MANAGEMENT_MODE` | `env` (server-side signing) | `multisig` (Freighter/Ledger) |
| Secret keys | Present in `.env` | Operations only (Docker Secrets) |
| Frontend | Hot-reload (Vite dev) | nginx static (baked bundle) |
| Port exposure | 3000, 80, 5432 | 80, 443 only (via Caddy) |
| HTTPS | None | Caddy + Let's Encrypt |
| `VITE_ENABLE_TEST_LOGIN` | `true` | `false` |
| Tunnel | Cloudflare tunnel container | Direct DNS → VM |

---

## Phase 3 — POST-FLIGHT VERIFICATION

**Every deploy must pass ALL of these checks. No exceptions.**

### 3.1 Container Health
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production ps
```
**Gate**: All 5 containers: `Up` + `healthy`.

### 3.2 Endpoint Verification
```bash
# API health
curl -sf https://api.radox.net/health
# Expected: {"status":"ok"}

# Frontend loads
curl -sf -o /dev/null -w "%{http_code}" https://app.radox.net
# Expected: 200

# SEP-1 stellar.toml
curl -sf https://radox.net/.well-known/stellar.toml | head -5
# Expected: Contains NETWORK_PASSPHRASE

# SSL certificates valid
curl -vI https://api.radox.net 2>&1 | grep "SSL certificate verify ok"
curl -vI https://app.radox.net 2>&1 | grep "SSL certificate verify ok"
curl -vI https://radox.net 2>&1 | grep "SSL certificate verify ok"
```

### 3.3 Backend Logs
```bash
docker logs stellar_backend --tail 50
```
**Gate**: No errors. Look for:
- `Prisma migrate deploy` success
- `Server running on port 3000`
- `[KeyManager]` loaded without errors
- `[PaymentMonitor] Stream started successfully`
- `Initialized channel pool with N accounts`

### 3.4 Stellar On-Chain Verification (Mainnet only)
```bash
# Verify issuer flags
# Visit: https://stellar.expert/explorer/public/account/<ISSUER_PUBLIC_KEY>
# Confirm: auth_required, auth_revocable, auth_clawback_enabled
# Confirm: home_domain = radox.net
```

---

## KNOWN FAILURE MODES — The Kill List

> These are the 10 failures we have encountered in production. Memorize them.

### 1. Port 80 Allocation Conflict
**Symptom**: Caddy fails: `Bind for 0.0.0.0:80 failed: port is already allocated`
**Cause**: Frontend inherits `ports: 80:80` from base compose.
**Fix**: Verify `docker-compose.prod.yml` has `ports: !override []` for frontend.
```bash
docker compose down --remove-orphans
# Then restart
```

### 2. Caddy DNS Resolution Failure (ACME)
**Symptom**: `dial tcp: lookup acme-v02.api.letsencrypt.org on 127.0.0.53:53: connection refused`
**Cause**: Container inherits Ubuntu `systemd-resolved` loopback stub.
**Fix**: Verify `caddy` service in prod compose has:
```yaml
dns:
  - 8.8.8.8
  - 1.1.1.1
```

### 3. Network Unreachable (Dead Hooks)
**Symptom**: Containers can't reach external APIs despite host connectivity.
**Cause**: Stale iptables/NAT after many `down`/`up` cycles.
**Fix**:
```bash
systemctl restart docker
docker run --rm alpine ping -c 2 8.8.8.8  # verify
```

### 4. Frontend Health Check Failure
**Symptom**: `stellar_frontend` stays "Starting" or "Unhealthy".
**Cause**: `nginx:alpine` may lack `curl` or `wget`.
**Fix**: Verify combined check in prod compose:
```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -sf http://localhost:80/ > /dev/null || wget -q --spider http://localhost:80/ || exit 1"]
```

### 5. Missing Operations Key
**Symptom**: Backend crashes: `[KeyManager] Missing OPERATIONS_SECRET_KEY`
**Cause**: Key not in Docker Secrets path or file permissions wrong.
**Fix**: 
```bash
cat /root/.secrets/operations_key   # exists?
ls -la /root/.secrets/operations_key  # chmod 600?
docker compose exec backend cat /run/secrets/operations_key  # mounted?
```

### 6. 504 Gateway Timeout (SMTP Block)
**Symptom**: Registration hangs, returns 504. nginx error page in response.
**Cause**: DigitalOcean blocks SMTP ports (25, 465, 587).
**Fix**: Already migrated to Resend (HTTP API, port 443). Verify `RESEND_API_KEY` is set.

### 7. Frontend Wrong Network
**Symptom**: Frontend connects to testnet while backend is on mainnet (or vice versa).
**Cause**: `VITE_*` vars are **build-time** — baked into the JS bundle during `docker build`.
**Fix**: Verify `docker-compose.prod.yml` frontend build args match `.env.production`:
```yaml
frontend:
  build:
    args:
      VITE_STELLAR_NETWORK: ${STELLAR_NETWORK:-testnet}
      VITE_SOROBAN_RPC_URL: ${SOROBAN_RPC_URL:-...}
      VITE_STELLAR_NETWORK_PASSPHRASE: "${VITE_STELLAR_NETWORK_PASSPHRASE:-...}"
```

### 8. Prisma Migration Failure
**Symptom**: Backend container restarts in loop.
**Cause**: Schema drift, locked migration table, or DB credentials mismatch.
**Fix**:
```bash
docker logs stellar_backend --tail 30
# Check for Prisma errors
# If needed, run manually:
docker compose exec backend sh -c "cd /app/backend && npx prisma migrate deploy"
```

### 9. `docker compose restart` Does NOT Reload Env Files
**Symptom**: Changed `.env.production` on the droplet, ran `restart`, but container still uses old values.
**Cause**: `docker compose restart` only restarts the process inside the EXISTING container — it does NOT re-read the env file. The env vars are baked into the container at creation time.
**Fix**: Always use `up -d --build` or `up -d --force-recreate` after changing `.env.production`:
```bash
# ❌ WRONG — does NOT pick up env changes
$PROD restart backend

# ✅ CORRECT — recreates container with new env
$PROD up -d --build backend
# or
$PROD up -d --force-recreate backend
```
**Verify**: After recreate, confirm the var is loaded:
```bash
docker exec stellar_backend printenv ACCOUNT_WASM_HASH
```

### 10. SCP Overwriting Production-Only Secrets
**Symptom**: After SCP'ing local `.env.production` to the droplet, runtime errors like `accountWasmHash is required`.
**Cause**: Local `.env.production` may have empty values for secrets that were only filled on the droplet (e.g., `ACCOUNT_WASM_HASH`, `WEBAUTHN_VERIFIER_ADDRESS`, `ED25519_VERIFIER_ADDRESS`). SCP replaces the entire file.
**Fix**: Always diff local vs remote BEFORE SCP'ing:
```bash
# ALWAYS run this BEFORE scp
diff <(grep -v '^#\|^$' .env.production | sort) \
     <(ssh root@<IP> "grep -v '^#\|^$' ~/radox/.env.production" | sort)
```
If the remote has values that the local doesn't, **merge manually** instead of a blind SCP.
**Protected vars** (often only set on the server):
- `ACCOUNT_WASM_HASH`
- `WEBAUTHN_VERIFIER_ADDRESS`
- `ED25519_VERIFIER_ADDRESS`
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `REDIS_PASSWORD`, `API_KEY`

### 11. Destructive Enum Migration Against Live Data
**Symptom**: `prisma migrate deploy` fails mid-sequence: `ERROR: cannot drop enum value "X" because it is still used`.
**Cause**: A migration removes an enum value (e.g., `maturity_clawback` from `MultiSigOperationType`) but rows in the DB still reference that value.
**Why it's dangerous**: Prisma runs migrations **in sequence**. If migration #15 of 18 fails, migrations 1-14 are already applied. The DB is now in a **partially migrated state** that neither the old nor new code understands.
**Fix**: Always run Gate A from Section 1.5 before deploying. If rows exist with the old enum value:
```sql
-- Option 1: Archive to a JSON dump + delete
COPY (SELECT * FROM multi_sig_transactions WHERE operation_type = 'maturity_clawback')
  TO '/tmp/archived_maturity_clawback.csv' CSV HEADER;
DELETE FROM multi_sig_transactions WHERE operation_type = 'maturity_clawback';

-- Option 2: Update to a valid current enum value
UPDATE multi_sig_transactions SET operation_type = 'token_clawback'
  WHERE operation_type = 'maturity_clawback';
```
**Prevention**: This gate is now permanent in Section 1.5 — Gate A.

### 12. WASM Hash Version Mismatch (silent contract ABI failure)
**Symptom**: `create_sale()` or `trade()` calls fail with opaque Soroban errors (host function error, unexpected args). Containers are healthy. Backend logs show no startup errors.
**Cause**: `SALE_WASM_HASH` points to an old contract version (v4/v5 with `fee_bps`) but the code expects v6 (with `fixedFee`). The function signatures don't match.
**Why it's dangerous**: This is 100% silent at deploy time. You only discover it when an admin tries to activate an offer or an investor tries to buy.
**Fix**: Verify WASM hash version before deploy (Gate B in Section 1.5). If wrong:
```bash
# Re-deploy the correct WASM to the network
soroban contract install --wasm contracts/token_sale/target/wasm32-unknown-unknown/release/token_sale.wasm \
  --source-account $OPERATIONS_SECRET_KEY --network testnet
# Update SALE_WASM_HASH in .env.production with the new hash
```
**Prevention**: This gate is now permanent in Section 1.5 — Gate B.

---

## Operations Cheat Sheet

### SSH Access
```bash
# Connect to production droplet
ssh root@134.209.73.154

# Key type: ed25519 (~/.ssh/id_ed25519)
# If connection fails: verify key is added to DigitalOcean droplet settings
# If timeout: verify droplet is running in DigitalOcean dashboard
```

### Compose Commands (Production)
All production commands require the double-file + env-file pattern:

```bash
# Prefix for ALL prod commands
PROD="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production"

# Status
$PROD ps

# Logs (follow)
$PROD logs -f backend

# Restart single service
$PROD restart backend

# Rebuild single service
$PROD up -d --build --no-deps backend

# Force recreate (env changes)
$PROD up -d --force-recreate backend

# Full rebuild
$PROD up -d --build

# Stop everything
$PROD down

# Stop + remove orphans
$PROD down --remove-orphans

# ⚠️ DESTRUCTIVE: Stop + delete volumes (wipes DB)
$PROD down -v
```

### Database Operations
```bash
# Backup
$PROD exec postgres pg_dump -U stellar_prod stellar_tokens > backup_$(date +%Y%m%d).sql

# Restore
$PROD exec -T postgres psql -U stellar_prod -d stellar_tokens < backup.sql

# Interactive psql
$PROD exec postgres psql -U stellar_prod -d stellar_tokens

# Check record counts
$PROD exec postgres psql -U stellar_prod -d stellar_tokens -c "
  SELECT 'admins' as t, count(*) FROM platform_admins
  UNION ALL SELECT 'investors', count(*) FROM investors
  UNION ALL SELECT 'companies', count(*) FROM companies
  UNION ALL SELECT 'offers', count(*) FROM offers;
"
```

### Debugging
```bash
# Verify env vars in container
docker exec stellar_backend env | grep STELLAR_NETWORK
docker exec stellar_backend env | grep KEY_MANAGEMENT

# Verify secrets mount
docker exec stellar_backend cat /run/secrets/operations_key | head -c 10

# Check container resources
docker stats --no-stream

# Network debugging
docker exec stellar_backend wget -qO- http://localhost:3000/health
docker exec stellar_caddy wget -qO- http://backend:3000/health
```

---

## Architecture Reference

```
Internet → Caddy (auto-HTTPS, ports 80/443)
           ├→ radox.net         → static landing (/srv/landing)
           │  └ /.well-known/*  → backend:3000 (SEP-1 stellar.toml)
           ├→ app.radox.net     → frontend:80 (nginx, React SPA)
           │  └ /api/*          → backend:3000 (nginx proxy_pass)
           └→ api.radox.net     → backend:3000 (direct, Swagger + mobile)

Internal:
  backend → postgres:5432 (Prisma ORM)
  backend → redis:6379 (session blocklist, rate limiting)
```

### Services (5 in production)

| Service | Image | Memory | CPU | Health Check |
|---------|-------|--------|-----|-------------|
| postgres | postgres:15-alpine | 1G | 1 | `pg_isready -U stellar_prod` |
| redis | redis:7-alpine | 256M | 0.5 | `redis-cli ping` |
| backend | node:22-alpine + pg_dump | 2G | 2 | `wget --spider /health` |
| frontend | nginx (built with Vite) | 256M | 0.5 | `curl \|\| wget /` |
| caddy | caddy:2-alpine | 128M | 0.25 | — |

### Startup Sequence (Backend)
```
1. Wait 5s for DB
2. Run Prisma migrations (node --import tsx src/database/migrate.js)
3. Start server (node --import tsx src/index.js)
4. Auto-verify issuer flags (skip if multisig)
5. Start 5 cron jobs + payment monitor + Soroban services
```

---

## ABSOLUTE RULES

1. **Never deploy without a backup** — even for "simple" code changes.
2. **Never skip the env audit** — a missing `?` variable crashes the entire stack silently.
3. **Never reuse testnet keys on mainnet** — generate fresh keypairs for every environment.
4. **Always verify ALL 5 containers are healthy** — don't trust `up -d` alone.
5. **Always check backend logs** — a healthy container doesn't mean a healthy app (migration failures, key errors).
6. **Frontend is build-time** — `VITE_*` changes require a full `--build`, not just a restart.
7. **Lock .env.production** — `chmod 600` immediately after creation or edit.
8. **Document what you deployed** — timestamp, git hash, what changed, any issues.
9. **`restart` ≠ `recreate`** — `docker compose restart` does NOT reload `.env` files. Always use `up -d --build` or `--force-recreate` after env changes.
10. **Never blind-SCP `.env.production`** — always `diff` local vs remote first. The droplet may have secrets that only exist on the server.
11. **Never run destructive migrations blind** — always audit enum removals and column drops against live data (Section 1.5, Gate A).
12. **Always verify WASM hash version** — a v4 hash on v6 code is silent and catastrophic (Section 1.5, Gate B).
13. **Issuer thresholds are invisible killers** — containers start fine, but every purchase fails without OPS signer weight on the issuer (Section 1.5, Gate C).
