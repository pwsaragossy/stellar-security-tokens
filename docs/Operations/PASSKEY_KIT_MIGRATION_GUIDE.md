# Migration Guide: passkey-kit → smart-account-kit (OpenZeppelin)

> **Context:** `passkey-kit` by SDF is deprecated. This guide documents the complete migration to OpenZeppelin's `smart-account-kit` + Stellar Channels, as executed on our production codebase (Mar 2026).
>
> **Result:** Backend service cut from 1745 to ~950 lines. Zero regressions. Existing passkeys continue to work.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Infrastructure Changes](#2-infrastructure-changes)
3. [Backend Migration](#3-backend-migration)
4. [Frontend Migration](#4-frontend-migration)
5. [Dead Code Cleanup](#5-dead-code-cleanup)
6. [Verification Checklist](#6-verification-checklist)
7. [Key Differences Reference](#7-key-differences-reference)
8. [Gotchas & Lessons Learned](#8-gotchas--lessons-learned)

---

## 1. Prerequisites

### Node.js Version

`smart-account-kit` requires **Node.js ≥ 22**. If you're on Node 20, upgrade:

```dockerfile
# Dockerfile
- FROM node:20-alpine
+ FROM node:22-alpine
```

### OZ Channels API Key

Sign up at [OpenZeppelin Defender](https://defender.openzeppelin.com) and create a Stellar Channels API key. This replaces the Launchtube JWT.

### Deploy OZ Smart Account Contracts

Before migrating, you need three on-chain artifacts:

| Artifact | How to get | Env var |
|----------|-----------|---------|
| Smart Account WASM hash | Deploy the OZ smart-account WASM to Soroban | `ACCOUNT_WASM_HASH` |
| WebAuthn Verifier address | Deploy the secp256r1 verifier contract | `WEBAUTHN_VERIFIER_ADDRESS` |
| Ed25519 Verifier address | Deploy the ed25519 verifier contract | `ED25519_VERIFIER_ADDRESS` |

**Testnet defaults** (from `smart-account-kit` demo):

```env
ACCOUNT_WASM_HASH=a12e8fa9621efd20315753bd4007d974390e31fbcb4a7ddc4dd0a0dec728bf2e
WEBAUTHN_VERIFIER_ADDRESS=CBSHV66WG7UV6FQVUTB67P3DZUEJ2KJ5X6JKQH5MFRAAFNFJUAJVXJYV
ED25519_VERIFIER_ADDRESS=CDGMOL3BP6Y6LYOXXTRNXBNJ2SLNTQ47BGG3LOS2OBBE657E3NYCN54B
```

---

## 2. Infrastructure Changes

### 2.1 Dependencies

**Backend `package.json`:**

```diff
- "passkey-kit": "^0.11.3",
+ "smart-account-kit": "^0.2.10",
+ "smart-account-kit-bindings": "^0.1.2",
+ "@openzeppelin/relayer-plugin-channels": "^0.17.0",
```

**Frontend `package.json`:**

```diff
- "passkey-kit": "^0.11.3",
- "passkey-kit-sdk": "^0.4.0",
+ "smart-account-kit": "^0.2.10",
+ "smart-account-kit-bindings": "^0.1.2",
```

Run `npm install` in both directories after updating.

### 2.2 Environment Variables

**Remove:**

```env
LAUNCHTUBE_URL=https://launchtube.xyz
LAUNCHTUBE_JWT=<your-jwt>
FACTORY_CONTRACT_ID=<your-factory-id>
VITE_FACTORY_CONTRACT_ID=<your-factory-id>
```

**Add:**

```env
# OpenZeppelin Stellar Channels
CHANNELS_API_KEY=<your-api-key>

# OZ Smart Account Configuration
ACCOUNT_WASM_HASH=<deployed-wasm-hash>
WEBAUTHN_VERIFIER_ADDRESS=<deployed-verifier-address>
ED25519_VERIFIER_ADDRESS=<deployed-verifier-address>
```

> **Note:** `VITE_FACTORY_CONTRACT_ID` is eliminated entirely. The frontend now fetches `accountWasmHash` and `webauthnVerifierAddress` from the backend API at runtime via `/auth/config`.

### 2.3 Docker Compose

Update env var mappings in both `docker-compose.yml` and `docker-compose.prod.yml`:

```diff
  backend:
    environment:
-     - LAUNCHTUBE_URL=${LAUNCHTUBE_URL}
-     - LAUNCHTUBE_JWT=${LAUNCHTUBE_JWT}
-     - FACTORY_CONTRACT_ID=${FACTORY_CONTRACT_ID}
+     - CHANNELS_API_KEY=${CHANNELS_API_KEY}
+     - ACCOUNT_WASM_HASH=${ACCOUNT_WASM_HASH}
+     - WEBAUTHN_VERIFIER_ADDRESS=${WEBAUTHN_VERIFIER_ADDRESS}
+     - ED25519_VERIFIER_ADDRESS=${ED25519_VERIFIER_ADDRESS}
```

Remove any `VITE_FACTORY_CONTRACT_ID` from frontend build args.

---

## 3. Backend Migration

### 3.1 Strategy: Tier-Based Risk Classification

Don't rewrite the whole service at once. Classify methods by dependency:

| Tier | Risk | Methods | Action |
|------|------|---------|--------|
| **A** | Zero | DB-only methods (11 of 22) | **Keep as-is** |
| **B** | Low | `getServer()`, `getClientConfig()` | Replace init + config |
| **C** | Medium | `sendTransaction()`, `submitWithdrawalTx()` | Replace Launchtube → Channels |
| **D** | High | Deploy, build TX, signer management (10 methods) | Full rewrite |

Execute in order A → B → C → D, testing after each tier.

### 3.2 Tier B: Initialization & Config

**Before (passkey-kit):**

```js
import { PasskeyServer } from 'passkey-kit';

const server = new PasskeyServer({
  rpcUrl: getSorobanRpcUrl(),
  launchtubeUrl: process.env.LAUNCHTUBE_URL,
  launchtubeJwt: process.env.LAUNCHTUBE_JWT,
});
```

**After (smart-account-kit):**

```js
import { rpc } from '@stellar/stellar-sdk';
import { ChannelsClient } from '@openzeppelin/relayer-plugin-channels';

static #rpcServer = null;
static #channelsClient = null;

static getRpcServer() {
  if (!this.#rpcServer) {
    this.#rpcServer = new rpc.Server(getSorobanRpcUrl());
  }
  return this.#rpcServer;
}

static getChannelsClient() {
  if (!this.#channelsClient) {
    const apiKey = process.env.CHANNELS_API_KEY;
    if (!apiKey) throw new Error('CHANNELS_API_KEY is required');
    this.#channelsClient = new ChannelsClient({
      baseUrl: isTestnet()
        ? 'https://channels.openzeppelin.com/testnet'
        : 'https://channels.openzeppelin.com',
      apiKey,
    });
  }
  return this.#channelsClient;
}
```

**Config response shape change:**

```diff
  static getClientConfig() {
    return {
      rpcUrl: getSorobanRpcUrl(),
      networkPassphrase: getNetworkPassphrase(),
-     walletWasmHash: process.env.WALLET_WASM_HASH || DEFAULT_HASH,
+     accountWasmHash: process.env.ACCOUNT_WASM_HASH,
+     webauthnVerifierAddress: process.env.WEBAUTHN_VERIFIER_ADDRESS,
    };
  }
```

### 3.3 Tier C: Transaction Submission

**Before (Launchtube):**

```js
const result = await server.send(signedTransaction);
```

**After (Channels):**

Two methods depending on the transaction type:

```js
// For pre-signed XDR (e.g., deployment, withdrawal)
static async sendTransaction(transaction) {
  const channels = this.getChannelsClient();
  const xdr = typeof transaction === 'string' ? transaction : transaction.toXDR();
  return channels.submitTransaction({ xdr });
}

// For Soroban invocations (auto footprint discovery)
static async sendSorobanTransaction(funcXdr, authXdrs) {
  const channels = this.getChannelsClient();
  return channels.submitSorobanTransaction({
    func: funcXdr,
    auth: authXdrs,
  });
}
```

> **Critical win:** The Channels service handles footprint discovery and resource calculation automatically. This eliminates the 170-line manual footprint injection hack that passkey-kit required for `__check_auth`.

### 3.4 Tier D Phase 1: Wallet Deployment

**Before (passkey-kit Factory):**

```js
// Used FACTORY_CONTRACT_ID to deploy wallets
const contractId = await server.deploy(credentialId, publicKeyBuffer);
```

**After (OZ SmartAccountClient):**

```js
import { Client as SmartAccountClient } from 'smart-account-kit-bindings';
import { Address, hash, Keypair, StrKey } from '@stellar/stellar-sdk';

static async deploySmartWallet(credentialIdBuffer, publicKeyBytes, userType, userId) {
  const rpcServer = this.getRpcServer();
  const wasmHash = process.env.ACCOUNT_WASM_HASH;
  const webauthnVerifier = process.env.WEBAUTHN_VERIFIER_ADDRESS;

  // Salt is deterministic: hash(credentialId)
  const salt = hash(credentialIdBuffer);

  // Deterministic deployer keypair (same across all clients)
  const deployerKeypair = Keypair.fromRawEd25519Seed(
    hash(Buffer.from('openzeppelin-smart-account-kit'))
  );

  // Build the External signer for WebAuthn
  const keyData = Buffer.concat([
    StrKey.decodeContract(webauthnVerifier), // 32 bytes
    publicKeyBytes,                           // 65 bytes (uncompressed P-256)
    credentialIdBuffer,                       // variable length
  ]);

  const client = new SmartAccountClient({
    contractId: 'placeholder', // will be derived
    networkPassphrase: getNetworkPassphrase(),
    rpcUrl: getSorobanRpcUrl(),
    publicKey: deployerKeypair.publicKey(),
  });

  // Deploy the smart account contract
  const deployTx = await client.deploy({
    signers: [{ tag: 'External', values: [webauthnVerifier, keyData] }],
    policies: new Map(),
  }, {
    wasmHash,
    salt,
    publicKey: deployerKeypair.publicKey(),
  });

  // Sign with deployer
  deployTx.sign(deployerKeypair);

  // Submit via Channels
  const result = await this.sendTransaction(deployTx.toXDR());

  // Derive the contract address deterministically
  const contractId = Address.fromScAddress(
    Address.contract(
      hash(HashIdPreimage.envelopeTypeContractId({
        networkId: hash(Buffer.from(getNetworkPassphrase())),
        contractIdPreimage: ContractIdPreimage.fromAddress({
          address: Address.fromString(deployerKeypair.publicKey()),
          salt,
        }),
      }).toXDR())
    ).toScAddress()
  ).toString();

  return contractId;
}
```

### 3.5 Tier D Phase 2: Signer Management

**Before (passkey-kit `add_sig`/`rm_sig`):**

```js
// Adding a passkey signer
const tx = await server.getContractClient(contractId).add_sig(credentialId, pubKey);
// Removing a passkey signer  
const tx = await server.getContractClient(contractId).rm_sig(credentialId);
```

**After (OZ `add_signer`/`remove_signer` with signer types):**

```js
const client = new SmartAccountClient({
  contractId,
  networkPassphrase: getNetworkPassphrase(),
  rpcUrl: getSorobanRpcUrl(),
});

// Adding a passkey signer (External type)
const webauthnVerifier = process.env.WEBAUTHN_VERIFIER_ADDRESS;
const keyData = Buffer.concat([
  StrKey.decodeContract(webauthnVerifier),
  publicKeyBytes,
  credentialIdBuffer,
]);
const tx = await client.add_signer({
  context_rule_id: 0, // Default context rule
  signer: { tag: 'External', values: [webauthnVerifier, keyData] },
});

// Adding an Ed25519 signer (Delegated type)
const tx = await client.add_signer({
  context_rule_id: 0,
  signer: { tag: 'Delegated', values: [stellarPublicKey] },
});

// Removing any signer
const tx = await client.remove_signer({
  context_rule_id: 0,
  signer: signerObject, // same shape as add_signer
});
```

### 3.6 Tier D Phase 3: Investment TX Building

The biggest win in the migration. The 170-line footprint injection hack in `buildInvestmentTx()` is completely eliminated:

**Before (170 lines of footprint + resource hacking):**

```js
// Old: manually inject signer keys, contract instance, WASM code into footprint
// Old: boost CPU from 70M → 350M (5×) for secp256r1 verification
// Old: boost memory from 2MB → 6MB
// Old: inject temporary + persistent entries for signer storage
// ... 170 lines of this
```

**After (Channels handles it):**

```js
// Build standard SAC transfer
const tx = new TransactionBuilder(sourceAccount, { fee, networkPassphrase })
  .addOperation(contract.call('transfer', ...args))
  .setTimeout(300)
  .build();

// Submit via Channels — footprint + resources calculated server-side
const result = await this.sendSorobanTransaction(funcXdr, authXdrs);
```

---

## 4. Frontend Migration

### 4.1 `passkey.ts` — SDK Client Wrapper

**Before (passkey-kit):**

```ts
import { PasskeyKit } from 'passkey-kit';

const kit = new PasskeyKit({
  rpcUrl: config.rpcUrl,
  networkPassphrase: config.networkPassphrase,
  walletWasmHash: config.walletWasmHash,
});
```

**After (smart-account-kit):**

```ts
import { SmartAccountKit } from 'smart-account-kit';

const kit = new SmartAccountKit({
  rpcUrl: config.rpcUrl,
  networkPassphrase: config.networkPassphrase,
  accountWasmHash: config.accountWasmHash,
  webauthnVerifierAddress: config.webauthnVerifierAddress,
  relayerUrl: `${API_URL}/wallets/relay`,
  timeoutInSeconds: 300,
});
```

> **Key change:** Config is fetched from backend via `GET /auth/config` at runtime. No more `VITE_FACTORY_CONTRACT_ID` build-time env var.

### 4.2 Registration Flow

**Before:**

```ts
const { credentialId, contractId, xdr } = await kit.createWallet('AppName', username);
// Manual submission step needed
await submitToBackend(xdr);
```

**After:**

```ts
const result = await kit.createWallet('AppName', username, {
  autoSubmit: true, // SDK handles submission via Channels
});
// result.credentialId, result.contractId — done
```

### 4.3 Transaction Signing

**Before:**

```ts
const signedTx = await kit.sign(transaction);
// Manual re-simulation + submission needed
```

**After:**

```ts
// For sign-only (backend handles submission):
const signedTx = await kit.sign(transaction);

// Or for full flow (SDK handles everything):
const result = await kit.signAndSubmit(transaction);
```

### 4.4 Discover Login

**No changes needed.** The `discoverLogin()` flow uses raw WebAuthn browser APIs (`navigator.credentials.get()`), not the SDK. Passkeys are browser-native — switching SDKs doesn't affect them.

### 4.5 Dead Files

- **Delete** `utils/passkeyWallet.ts` — confirmed zero imports, dead code
- **Keep** `hooks/usePasskey.ts` — thin wrapper, imports same `passkeyClient` export
- **Keep** `hooks/usePasskeys.ts` — SDK-agnostic (raw WebAuthn + backend API calls)

---

## 5. Dead Code Cleanup

After the core migration, sweep the entire codebase for stale references:

```bash
# Find all stale references
grep -rn "FACTORY_CONTRACT_ID\|LAUNCHTUBE\|walletWasmHash\|passkey-kit\|PasskeyKit" \
  --include="*.{js,ts,tsx,md,yml,env*}" \
  --exclude-dir=node_modules .
```

### Files we updated:

| File | Changes |
|------|---------|
| `.env.template` | Replaced LAUNCHTUBE/FACTORY vars → CHANNELS/OZ vars |
| `.env.production` | Same |
| `frontend/.env` | Removed `VITE_FACTORY_CONTRACT_ID` |
| `frontend/.env.example` | Same |
| `docker-compose.yml` | Swapped env mappings |
| `docker-compose.prod.yml` | Swapped env mappings + build args |
| `docs/Project_Bible/deploy_layer.md` | Updated env var table |
| `docs/Project_Bible/services_layer.md` | Updated service description + architecture patterns |
| `docs/Project_Bible/05_config_env_map.md` | Updated variable inventory |
| `docs/Project_Bible/07_error_recovery.md` | Launchtube → Channels |
| `docs/Operations/MAINNET_CHECKLIST.md` | Updated smart contract + services sections |
| `docs/Operations/POST_MIGRATION_REMINDERS.md` | Updated env vars + code references |

---

## 6. Verification Checklist

Run these checks after migration:

```bash
# 1. Backend syntax check (module loads without errors)
cd backend && node -e "require('./src/services/passkeyWallet.service.js')"
# Expected: no errors

# 2. Frontend type check
cd frontend && npx tsc --noEmit
# Expected: zero errors

# 3. Frontend build
cd frontend && npx vite build
# Expected: builds successfully (chunk-size warnings are OK)

# 4. Grep for stale references
grep -rn "passkey-kit\|FACTORY_CONTRACT_ID\|LAUNCHTUBE" \
  --include="*.{js,ts,tsx}" \
  --exclude-dir=node_modules .
# Expected: zero hits

# 5. Backend tests
cd backend && npm test
# Expected: exit 0 (DB-dependent tests may fail without Postgres)

# 6. Docker stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# Test: login with existing passkey (should still work!)
# Test: register new account (uses new SDK)
```

---

## 7. Key Differences Reference

| Aspect | passkey-kit | smart-account-kit |
|--------|------------|-------------------|
| **Maintainer** | SDF (deprecated) | OpenZeppelin (active) |
| **Contracts** | Unaudited | OZ audited |
| **Fee Sponsor** | Launchtube (JWT auth) | Channels (API key) |
| **Discovery** | Mercury (paid RPC sub) | Indexer (free CF worker) |
| **Server SDK** | `PasskeyServer` | Same `SmartAccountKit` class |
| **Config** | `walletWasmHash` + `factoryContractId` | `accountWasmHash` + `webauthnVerifierAddress` |
| **Deploy** | `Factory.deploy(credId, pubKey)` | `SmartAccountClient.deploy({ signers, policies })` |
| **Signer Add** | `add_sig(credId, pubKey)` | `add_signer({ signer: { tag: 'External', ... } })` |
| **Signer Remove** | `rm_sig(credId)` | `remove_signer({ signer })` |
| **Signer Types** | Single type | `External` (passkey) + `Delegated` (Stellar account) |
| **Footprint** | Manual 170-line injection | Channels handles automatically |
| **Multi-sig** | Manual implementation | Built-in `multiSigners` manager |
| **Storage** | Manual localStorage | `IndexedDBStorage` / `LocalStorageStorage` / `MemoryStorage` |
| **Sessions** | None | 7-day auto-restore |
| **Events** | None | `events.on('walletConnected', ...)` |
| **Node.js** | Any | ≥ 22.0.0 |
| **Stellar SDK** | Any | ≥ 14.6.0 |

---

## 8. Gotchas & Lessons Learned

### ✅ Existing passkeys keep working

WebAuthn credentials are browser-native. They don't care which SDK you use — the private key lives in the user's OS keychain, and the `navigator.credentials.get()` API is standard. The `discoverLogin()` flow didn't need any changes.

### ⚠️ Config response shape is a breaking change

The backend's `/auth/config` endpoint returns different keys:

```diff
- { walletWasmHash: "...", rpcUrl: "...", networkPassphrase: "..." }
+ { accountWasmHash: "...", webauthnVerifierAddress: "...", rpcUrl: "...", networkPassphrase: "..." }
```

Frontend must be updated to match. If you have mobile clients or external consumers, coordinate the change.

### ⚠️ Deployer keypair is deterministic

`smart-account-kit` derives a deployer keypair from a fixed seed:

```js
Keypair.fromRawEd25519Seed(hash(Buffer.from("openzeppelin-smart-account-kit")))
```

This keypair **must be funded on-chain** before any wallet can be deployed. On testnet, the SDK can auto-fund via Friendbot.

### ⚠️ Frontend no longer needs build-time env vars for contracts

`VITE_FACTORY_CONTRACT_ID` is eliminated. The frontend fetches config from the backend at runtime. This simplifies Docker builds — no more passing contract IDs as build args.

### 💡 The footprint hack is the biggest win

The 170 lines of manual footprint injection, resource boosting (5× CPU, 3× memory), and `__check_auth` entry manipulation in `buildInvestmentTx()` are completely eliminated. The Channels service handles all of this automatically during transaction simulation.

### 💡 `submitWithSponsorship()` is SDK-agnostic

The fee-bump fallback method doesn't depend on any SDK — it's pure Stellar operations. Keep it as a fallback in case Channels is temporarily unavailable.

### 💡 Tier A methods = 50% of the service

11 out of 22 methods in the backend service had zero passkey-kit dependencies (DB-only operations). Identifying these first halved the blast radius and gave confidence that the migration wouldn't break unrelated flows.

---

## Timeline

Our migration took one session (~3 hours of active work):

| Phase | Time | What |
|-------|------|------|
| Infrastructure | 15 min | Deps, env vars, Docker Compose |
| Backend service | 90 min | Rewrite passkeyWallet.service.js (1745 → ~950 lines) |
| Frontend | 20 min | Rewrite passkey.ts, delete dead code |
| Dead code sweep | 20 min | .env files, 6 docs, config maps |
| Verification | 15 min | Module load, tsc, vite build, grep |

---

*Last updated: 2026-03-12*
