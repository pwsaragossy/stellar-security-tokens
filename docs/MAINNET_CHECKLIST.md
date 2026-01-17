# Mainnet Migration Checklist

This document details all specific actions required to transition the **Stellar Security Tokens** platform from Testnet to Mainnet (Production).

## ✅ Code Changes (Already Complete)

### Backend Logic
- [x] **Friendbot Calls (`backend/src/services/stellar.service.js`):** Already wrapped in `if (process.env.STELLAR_NETWORK === 'testnet')` blocks.
- [x] **CORS Policy (`backend/src/app.js`):** Already uses `process.env.FRONTEND_URL`.
- [x] **JWT Fail-Fast (`backend/src/middleware/auth.js`):** App crashes if `JWT_SECRET` is missing.
- [x] **Network-Aware Config (`passkeyWallet.service.js`):** Uses centralized `getSorobanRpcUrl()` and `isTestnet()`.

### Hardcoded Values
- [x] **Asset Code:** Configurable via env vars.
- [x] **USDC Issuer:** Uses `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` (Circle's official issuer, same for testnet/mainnet).

---

## 🌍 Environment Variables Configuration

Create a production `.env` file with the following changes:

### Network Settings
| Variable | Testnet Value | **Production Value** |
|----------|---------------|----------------------|
| `STELLAR_NETWORK` | `testnet` | `public` |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | `https://soroban-rpc.mainnet.stellar.org` |
| `VITE_STELLAR_NETWORK` | `testnet` | `public` |
| `VITE_SOROBAN_RPC_URL` | *(Testnet URL)* | `https://soroban-rpc.mainnet.stellar.org` |
| `VITE_STELLAR_NETWORK_PASSPHRASE`| `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |

### Keys & Accounts (Action Required)
> **WARNING:** Do not use Testnet keys on Mainnet. Generate new keys offline.

- [ ] **`ISSUER_SECRET_KEY`**: Rotated to Mainnet Key (Funded with XLM).
- [ ] **`DISTRIBUTOR_SECRET_KEY`**: Rotated to Mainnet Key (Funded with XLM).
- [ ] **`TREASURY_SECRET_KEY`**: Rotated to Mainnet Key (Funded with XLM).

### Smart Contracts (Passkey Wallet)
- [ ] **`FACTORY_CONTRACT_ID`**: Deploy Factory to Mainnet and update this ID.
- [ ] **`VITE_FACTORY_CONTRACT_ID`**: Update in Frontend `.env`.

### Infrastructure & Security
- [ ] **`DB_SSL`**: Set to `true` (Required for cloud databases).
- [ ] **`JWT_SECRET`**: Generate with `openssl rand -hex 32`.
- [ ] **`WEBAUTHN_RP_ID`**: Change `localhost` to your domain (e.g., `yourdomain.com`).
- [ ] **`WEBAUTHN_ORIGIN`**: Change to `https://dashboard.yourdomain.com`.
- [ ] **`FRONTEND_URL`**: Update to `https://dashboard.yourdomain.com`.
- [ ] **`API_URL`**: Update to `https://api.yourdomain.com`.
- [ ] **`VITE_API_URL`**: Update in frontend to `https://api.yourdomain.com/api`.

### Third Party Services
- [ ] **Launchtube**: Get Mainnet JWT from Stellar Discord #launchtube.

---

## 📧 Email Configuration (SMTP)

For production, configure real SMTP to send verification emails:

- [ ] `SMTP_HOST` (e.g., `smtp.sendgrid.net`)
- [ ] `SMTP_USER` 
- [ ] `SMTP_PASSWORD`
- [ ] `SMTP_FROM` (verified sender domain)

---

## 🏗️ Build & Deployment

### Frontend
- Run `npm run build` in the `frontend` directory.
- Set `VITE_*` env vars before building.

### Database
- Run `npm run migrate` to apply migrations.
- Enable SSL for production databases.

### Key Generation
```bash
# JWT Secret
openssl rand -hex 32

# Stellar Keypairs (run for Issuer, Distributor, Treasury)
node -e "const {Keypair} = require('@stellar/stellar-sdk'); const kp = Keypair.random(); console.log('SECRET=' + kp.secret()); console.log('PUBLIC=' + kp.publicKey());"
```

---

## 🔒 Security Audit (Before Launch)

### Dependency Audit
```bash
cd backend && npm audit
cd frontend && npm audit
```

- [ ] **No critical vulnerabilities** in production dependencies
- [ ] **Review high severity issues** - ensure none are exploitable in our code paths
- [ ] **Document exceptions** for non-exploitable transitive dependencies

### Multisig Setup
```bash
cd backend
npm run multisig:inspect  # Verify account configuration
npm run multisig:setup    # Configure production signers
```

- [ ] **Treasury account** - 2-of-3 multisig with Ledger keys
- [ ] **Issuer account** - Locked after initial token setup
- [ ] **Master keys disabled** on all production accounts

### Error Monitoring
- [ ] **SENTRY_DSN** configured in backend `.env`
- [ ] **VITE_SENTRY_DSN** configured in frontend `.env`

### Stellar-Specific Security (CRITICAL)

> ⚠️ **Read the full audit:** [STELLAR_SECURITY_AUDIT.md](./STELLAR_SECURITY_AUDIT.md)

- [ ] **Verify issuer flags** - Run `npm run multisig:inspect` to confirm:
  - `auth_required: true`
  - `auth_revocable: true`
  - `auth_clawback_enabled: true`
  
- [ ] **Lock issuer account AFTER initial token minting**
  ```bash
  # WARNING: This is IRREVERSIBLE! Only do after all tokens are minted.
  npm run multisig:setup -- -a issuer --lock
  ```
  This sets `masterWeight: 0` preventing any further minting.

- [ ] **Remove secret keys from production .env** when using multisig mode
  - Only public keys needed when `KEY_MANAGEMENT_MODE=multisig`
  - All transactions require Ledger signatures

### Post-Launch Verification
```bash
# Verify account configuration on Stellar Explorer
# https://stellarchain.io/accounts/GXXXX (your issuer public key)
# Should show: 
#   - Flags: auth_required, auth_revocable, auth_clawback_enabled
#   - Master Weight: 0 (if locked)
#   - Signers: Your Ledger public keys
```
