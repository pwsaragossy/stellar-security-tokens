# 09 — Service Internals

> **⚠️ AUTO-GENERATED — DO NOT EDIT MANUALLY**  
> Generated: `2026-05-16T16:42:53.041Z`  
> Source: `backend/src/services/` (31 files)  
> Regenerate: `npm run docs:services`

**31 services · 290 methods · 11 static fields**

---
## 1. KeyManager

**File:** `backend/src/services/KeyManager.js` · **465 lines**
**Export:** `export const = new KeyManager()`

**External packages:** `@stellar/stellar-sdk`, `dotenv`, `fs`
**Internal imports:** `logger`

**Constructor**

- `constructor()` _(line 34)_ — KeyManager Service

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 87 | `isMultisigMode()` | – |
| 97 | `getSecretKey(role)` | – |
| 194 | `getPublicKey(role)` | – |
| 221 | `getKeypairForRole(role)` | – |
| 229 | `getIssuerKeypair()` | – |
| 233 | `getDistributorKeypair()` | – |
| 237 | `getTreasuryKeypair()` | – |
| 241 | `getOperationsKeypair()` | – |
| 249 | `getNextChannelKeypair()` | – |
| 262 | `getIssuerPublicKey()` | – |
| 266 | `getDistributorPublicKey()` | – |
| 270 | `getTreasuryPublicKey()` | – |
| 274 | `getOperationsPublicKey()` | – |
| 287 | `getRequiredSigners(operationType)` | – |
| 359 | `getSignerRoles(operationType)` | – |
| 385 | `getSignatureThreshold(operationType)` | – |
| 433 | `getTreasurySigners()` | – |
| 446 | `requiresMultisigApproval(operationType)` | – |

**Private Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 54 | `#initializeChannels()` | – |
| 139 | `#readOperationsSecret()` | – |

**JSDoc Descriptions**

- **`constructor`** — KeyManager Service
- **`#initializeChannels`** — Initializes the channel pool from environment variables (CHANNEL_1_SECRET_KEY, etc.)
- **`isMultisigMode`** — Check if running in multisig mode
- **`getSecretKey`** — Safe retrieval of a secret key (ENV mode only)
- **`#readOperationsSecret`** — Read operations secret key with mode-aware priority:
- **`getPublicKey`** — Get public key for a role (works in both modes)
- **`getKeypairForRole`** — Get a keypair by role name. Used by TransactionManager for auto-signing in ENV mode.
- **`getIssuerKeypair`** — Get a keypair by role name. Used by TransactionManager for auto-signing in ENV mode.
- **`getDistributorKeypair`** — Get a keypair by role name. Used by TransactionManager for auto-signing in ENV mode.
- **`getNextChannelKeypair`** — Get the next channel keypair from the pool (Round-Robin)
- **`getRequiredSigners`** — Get required signers for an operation type
- **`getSignerRoles`** — Get a mapping of public key → role name for the required signers of an operation.
- **`getSignatureThreshold`** — Get threshold for an operation type
- **`getTreasurySigners`** — Get treasury signers for multisig
- **`requiresMultisigApproval`** — Check if an operation requires multisig approval

---
## 2. ConfigService

**File:** `backend/src/services/config.service.js` · **59 lines**
**Export:** `export class`

**Internal imports:** `prisma`, `logger`
**Prisma models:** `feeLog`, `systemConfig`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 12 | `static async get(key, defaultValue = "0")` | ✓ |
| 25 | `static async getFloat(key, defaultValue = 0)` | ✓ |
| 40 | `static async logFee({ amount, assetCode, category, sourceId, description, transactionHash })` | ✓ |

**JSDoc Descriptions**

- **`get`** — Obtém valor de configuração ou padrão
- **`getFloat`** — Obtém valor numérico ou padrão (float)
- **`logFee`** — Loga uma taxa cobrada no banco de dados

---
## 3. TransactionManager

**File:** `backend/src/services/transactionManager.service.js` · **89 lines**
**Export:** `export class`

**Service dependencies:** `keyManager`, `MultiSigTransactionService`
**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `signAndSubmitTransaction, getNetworkPassphrase`, `logger`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 31 | `static async submit({ transaction, xdr: rawXdr, signingRole, operationType, metadata, description, initiatorId, requiredSigners: overrideSigners = null, thresholdRequired: overrideThreshold = null })` | ✓ |

**JSDoc Descriptions**

- **`submit`** — Submits or queues a transaction based on the current environment and operation type.

---
## 4. AlertService

**File:** `backend/src/services/alert.service.js` · **132 lines**
**Export:** `export class`

**Internal imports:** `logger`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 29 | `static async notify(level, message, metadata = {})` | ✓ |
| 66 | `static async info(message, metadata = {})` | ✓ |
| 75 | `static async warning(message, metadata = {})` | ✓ |
| 84 | `static async error(message, metadata = {})` | ✓ |
| 93 | `static async critical(message, metadata = {})` | ✓ |
| 101 | `static async paymentMonitorFailed(errorMessage)` | ✓ |
| 117 | `static async investmentStuck(investmentId, status, minutesPending)` | ✓ |

**JSDoc Descriptions**

- **`notify`** — Envia um alerta
- **`info`** — Alerta de informação
- **`warning`** — Alerta de aviso
- **`error`** — Alerta de erro
- **`critical`** — Alerta crítico
- **`paymentMonitorFailed`** — Alerta de falha no monitoramento de pagamentos
- **`investmentStuck`** — Alerta de investimento pendente há muito tempo

---
## 5. AlertRouter

**File:** `backend/src/services/alertRouter.service.js` · **136 lines**
**Export:** `export class`

**Internal imports:** `logger`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 33 | `static async send({ title, message, severity, source })` | ✓ |
| 61 | `static async _sendSlack({ title, message, severity, config, source })` | ✓ |
| 92 | `static async _sendPagerDuty({ title, message, severity, config, source })` | ✓ |
| 121 | `static async _sendDbNotification({ title, message, severity })` | ✓ |

**JSDoc Descriptions**

- **`send`** — Send alert to all configured channels.
- **`_sendSlack`** — Slack via incoming webhook
- **`_sendPagerDuty`** — PagerDuty via Events API v2
- **`_sendDbNotification`** — DB notification (existing system)

---
## 6. BackupService

**File:** `backend/src/services/backup.service.js` · **182 lines**
**Export:** `export const = { }`

**External packages:** `node:child_process`, `node:fs/promises`, `node:path`, `node:util`, `node:fs`, `node:stream/promises`, `node:zlib`
**Internal imports:** `logger`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 23 | `BACKUP_ROOT` | `…` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 41 | `async snapshotUserCreation(model, data)` | ✓ |
| 67 | `async fullDatabaseDump()` | ✓ |
| 134 | `async rotateBackups()` | ✓ |
| 157 | `async listBackups()` | ✓ |

**JSDoc Descriptions**

- **`snapshotUserCreation`** — Tier 1 — JSON snapshot on user creation
- **`fullDatabaseDump`** — Tier 2 — Full pg_dump compressed with gzip
- **`rotateBackups`** — Keep only the N most recent daily backups
- **`listBackups`** — List existing backups (for admin dashboard)

---
## 7. TomlService

**File:** `backend/src/services/toml.service.js` · **185 lines**
**Export:** `export class`

**Service dependencies:** `keyManager`, `ipfsService`
**Internal imports:** `getNetworkPassphrase`, `prisma`
**Prisma models:** `systemConfig`, `token`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 36 | `static async generateToml()` | ✓ |

**JSDoc Descriptions**

- **`generateToml`** — Generates the stellar.toml content dynamically (SEP-1 compliant).

---
## 8. SorobanMetrics

**File:** `backend/src/services/sorobanMetrics.service.js` · **104 lines**
**Export:** `class (not directly exported)`

**Internal imports:** `prisma`, `logger`
**Prisma models:** `systemConfig`

**Constants & Static Fields**

| Line | Name | Value |
|------|------|-------|
| 17 | `_tradeLatencies` | `[]` |
| 18 | `_tradeErrors` | `0` |
| 19 | `_flushInterval` | `null` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 24 | `static recordTrade({ durationMs, success, gasUsed, investmentId })` | – |
| 33 | `static getStats()` | – |
| 64 | `static async flush()` | ✓ |
| 80 | `static start()` | – |
| 86 | `static stop()` | – |
| 97 | `static reset()` | – |

**JSDoc Descriptions**

- **`recordTrade`** — Record a Soroban trade() execution
- **`getStats`** — Get comparison stats
- **`flush`** — Flush metrics to SystemConfig for persistence
- **`start`** — Start periodic flush (every 10 min)
- **`stop`** — Start periodic flush (every 10 min)
- **`reset`** — Reset in-memory metrics

---
## 9. NotificationService

**File:** `backend/src/services/notification.service.js` · **122 lines**
**Export:** `export class`

**Internal imports:** `prisma`, `logger`
**Prisma models:** `notification`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 15 | `static async createNotification(userId, userType, type, title, message, actionLink = null)` | ✓ |
| 43 | `static async getUserNotifications(userId, userType, limit = 20, offset = 0)` | ✓ |
| 78 | `static async markAsRead(id, userId, userType)` | ✓ |
| 106 | `static async markAllAsRead(userId, userType)` | ✓ |

**JSDoc Descriptions**

- **`createNotification`** — Create a new notification
- **`getUserNotifications`** — Get notifications for a user
- **`markAsRead`** — Mark notification as read
- **`markAllAsRead`** — Mark all notifications as read for a user

---
## 10. MaintenanceService

**File:** `backend/src/services/maintenance.service.js` · **141 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`
**External packages:** `node-cron`
**Internal imports:** `prisma`, `logger`
**Prisma models:** `investor`, `offer`, `token`

**Constants & Static Fields**

| Line | Name | Value |
|------|------|-------|
| 9 | `TTL_THRESHOLD` | `50000` |
| 10 | `EXTEND_AMOUNT` | `500000` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 15 | `static init()` | – |
| 39 | `static async checkAndExtendAllTTLs()` | ✓ |

**JSDoc Descriptions**

- **`init`** — Initializes the maintenance cron jobs
- **`checkAndExtendAllTTLs`** — Iterates through all project-related Soroban entries and extends TTL if needed

---
## 11. WalletMonitorService

**File:** `backend/src/services/walletMonitor.service.js` · **154 lines**
**Export:** `export const = { }`

**Service dependencies:** `keyManager`, `EmailService`
**Internal imports:** `stellarServer`, `logger`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 27 | `CHECK_INTERVAL_MS` | `5 * 60 * 1000` |
| 28 | `STARTUP_DELAY_MS` | `10000` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 111 | `start()` | – |
| 145 | `stop()` | – |

**JSDoc Descriptions**

- **`start`** — Start the wallet monitor. Idempotent — safe to call multiple times.
- **`stop`** — Stop the wallet monitor. Cancels the recurring interval.

---
## 12. YieldPaymentReconciler

**File:** `backend/src/services/yieldPaymentReconciler.js` · **151 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`, `AlertService`
**Internal imports:** `prisma`, `logger`
**Prisma models:** `yieldPaymentJob`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 16 | `STALE_THRESHOLD_MS` | `10 * 60 * 1000` |
| 17 | `POLL_INTERVAL_MS` | `5 * 60 * 1000` |
| 18 | `MAX_AGE_MS` | `60 * 60 * 1000` |

**Constants & Static Fields**

| Line | Name | Value |
|------|------|-------|
| 21 | `intervalId` | `null` |
| 22 | `isRunning` | `false` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 27 | `static async reconcile()` | ✓ |
| 123 | `static start()` | – |
| 143 | `static stop()` | – |

**JSDoc Descriptions**

- **`reconcile`** — Single reconciliation pass.
- **`start`** — Start the reconciliation loop. Call once during server startup.
- **`stop`** — Stop the reconciler.

---
## 13. IpfsService

**File:** `backend/src/services/ipfs.service.js` · **146 lines**
**Export:** `export class`

**External packages:** `pinata-web3`, `dotenv`, `buffer`, `path`
**Internal imports:** `logger`

### IpfsService

**Constructor**

- `constructor()` _(line 19)_ — Service for interacting with IPFS via Pinata

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 43 | `async uploadFile(fileBuffer, fileName, metadata = {})` | ✓ |
| 92 | `getGatewayUrl(hash)` | – |
| 102 | `async testConnection()` | ✓ |
| 121 | `isValidHash(hash)` | – |
| 131 | `async fetchFile(hash)` | ✓ |

**JSDoc Descriptions**

- **`constructor`** — Service for interacting with IPFS via Pinata
- **`uploadFile`** — Upload file to IPFS
- **`getGatewayUrl`** — Get public gateway URL for an IPFS hash
- **`testConnection`** — Test connection to Pinata
- **`isValidHash`** — Check if string is a valid IPFS hash (CID)
- **`fetchFile`** — Fetch file content from IPFS gateway

### ipfsService

**Constructor**

- `constructor()` _(line 19)_ — Service for interacting with IPFS via Pinata

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 43 | `async uploadFile(fileBuffer, fileName, metadata = {})` | ✓ |
| 92 | `getGatewayUrl(hash)` | – |
| 102 | `async testConnection()` | ✓ |
| 121 | `isValidHash(hash)` | – |
| 131 | `async fetchFile(hash)` | ✓ |

**JSDoc Descriptions**

- **`constructor`** — Service for interacting with IPFS via Pinata
- **`uploadFile`** — Upload file to IPFS
- **`getGatewayUrl`** — Get public gateway URL for an IPFS hash
- **`testConnection`** — Test connection to Pinata
- **`isValidHash`** — Check if string is a valid IPFS hash (CID)
- **`fetchFile`** — Fetch file content from IPFS gateway

---
## 14. DepositRelayService

**File:** `backend/src/services/depositRelay.service.js` · **215 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`
**External packages:** `@stellar/stellar-sdk`, `crypto`
**Internal imports:** `prisma`, `logger`
**Prisma models:** `deposit`, `investor`

**Constants & Static Fields**

| Line | Name | Value |
|------|------|-------|
| 10 | `MEMO_PREFIX` | `"DEP"` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 20 | `static async initiateDeposit(investorId)` | ✓ |
| 45 | `static computeMemo(investorId)` | – |
| 58 | `static async handleIncomingPayment(memoText, amount, txHash, assetCode = "USDC")` | ✓ |
| 126 | `static async forwardAsset(depositId, assetCode = "USDC")` | ✓ |
| 208 | `static async getInvestorDeposits(investorId)` | ✓ |

**JSDoc Descriptions**

- **`initiateDeposit`** — Initiate a new deposit request
- **`computeMemo`** — Compute the deterministic memo for an investor (utility).
- **`handleIncomingPayment`** — Process a received payment matching a deposit memo.
- **`forwardAsset`** — Forward asset (XLM or USDC) to the investor's smart wallet
- **`getInvestorDeposits`** — Get all deposits for an investor

---
## 15. SorobanEventIndexer

**File:** `backend/src/services/sorobanEventIndexer.js` · **330 lines**
**Export:** `export class`

**External packages:** `@stellar/stellar-sdk`, `node-cron`
**Internal imports:** `getSorobanRpcUrl`, `prisma`, `logger`
**Prisma models:** `offer`, `platformAdmin`, `systemConfig`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 23 | `INITIAL_LOOKBACK_LEDGERS` | `60` |
| 25 | `MAX_EVENTS` | `100` |
| 28 | `CURSOR_PREFIX` | `"eidx_"` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 49 | `static async getTrackedContracts()` | ✓ |
| 73 | `static async getCursor(contractId)` | ✓ |
| 84 | `static async setCursor(contractId, ledger)` | ✓ |
| 98 | `static async pollContract(contract)` | ✓ |
| 187 | `static parseEvent(event)` | – |
| 222 | `static async handleAlert(parsed, contract, config)` | ✓ |
| 272 | `static async pollAll()` | ✓ |
| 298 | `static start()` | – |
| 322 | `static stop()` | – |

**JSDoc Descriptions**

- **`getTrackedContracts`** — Get all active contracts to monitor (offers with sorobanContractId).
- **`getCursor`** — Get the last processed ledger for a contract from SystemConfig.
- **`setCursor`** — Persist the last processed ledger for a contract.
- **`pollContract`** — Poll events for a single contract.
- **`parseEvent`** — Parse a raw Soroban event into a structured object.
- **`handleAlert`** — Handle an alert-worthy event: create admin notifications + log.
- **`pollAll`** — Run one full polling cycle across all tracked contracts.
- **`start`** — Start the cron job. Call once during server startup.
- **`stop`** — Stop the cron job.

---
## 16. SorobanReconciler

**File:** `backend/src/services/sorobanReconciler.js` · **207 lines**
**Export:** `export class`

**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `getSorobanRpcUrl`, `prisma`, `logger`
**Prisma models:** `investment`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 20 | `ORPHAN_TIMEOUT_MS` | `10 * 60 * 1000` |
| 21 | `PENDING_TTL_MS` | `30 * 60 * 1000` |
| 22 | `POLL_INTERVAL_MS` | `5 * 60 * 1000` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 30 | `static async reconcile()` | ✓ |
| 152 | `static async expirePending()` | ✓ |
| 181 | `static start()` | – |
| 199 | `static stop()` | – |

**JSDoc Descriptions**

- **`reconcile`** — Find and fix all orphaned investments.
- **`expirePending`** — Expire stale pending_payment investments that were never signed.
- **`start`** — Start the reconciliation loop. Call once during server startup.

---
## 17. WebAuthnService

**File:** `backend/src/services/webauthn.service.js` · **391 lines**
**Export:** `export class`

**External packages:** `@simplewebauthn/server`
**Internal imports:** `prisma`
**Prisma models:** `companyUser`, `investor`, `model`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 9 | `rpName` | `"Stellar Security Tokens"` |
| 10 | `rpID` | `…` |
| 11 | `origin` | `…` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 25 | `static async generateRegistrationOptions(userType, userId, userName, userEmail)` | ✓ |
| 66 | `static async verifyRegistration(userType, userId, registrationResponse, expectedChallenge, deviceName = null)` | ✓ |
| 100 | `static async generateAuthenticationOptions(userType, userId)` | ✓ |
| 126 | `static async generateDiscoverableAuthOptions()` | ✓ |
| 142 | `static async findUserByHandle(userHandle)` | ✓ |
| 180 | `static async verifyAuthentication(userType, userId, authenticationResponse, expectedChallenge)` | ✓ |
| 222 | `static async getUserCredentials(userType, userId)` | ✓ |
| 250 | `static async getCredentialById(userType, credentialId)` | ✓ |
| 278 | `static async saveCredential(userType, userId, credentialId, publicKey, counter, deviceName)` | ✓ |
| 317 | `static async updateCredentialCounter(userType, credentialId, newCounter)` | ✓ |
| 329 | `static async updateCredentialLastUsed(userType, credentialId)` | ✓ |
| 341 | `static getPrismaModel(userType)` | – |
| 354 | `static getUserIdFieldName(userType)` | – |
| 368 | `static getCredentialsTableName(userType)` | – |
| 381 | `static getUserIdColumnName(userType)` | – |

**JSDoc Descriptions**

- **`generateRegistrationOptions`** — Gera opções de registro para um usuário
- **`verifyRegistration`** — Verifica resposta de registro
- **`generateAuthenticationOptions`** — Gera opções de autenticação
- **`generateDiscoverableAuthOptions`** — Gera opções de autenticação para login sem username (discoverable credentials)
- **`findUserByHandle`** — Encontra usuário pelo userHandle (userId encoded durante registro)
- **`verifyAuthentication`** — Verifica resposta de autenticação
- **`getUserCredentials`** — Obtém credenciais de um usuário
- **`getCredentialById`** — Obtém credencial por ID
- **`saveCredential`** — Salva uma nova credencial
- **`updateCredentialCounter`** — Atualiza contador de uma credencial
- **`updateCredentialLastUsed`** — Atualiza última utilização de uma credencial
- **`getPrismaModel`** — Obtém nome do modelo Prisma
- **`getUserIdFieldName`** — Obtém nome do campo de ID do usuário no Prisma
- **`getCredentialsTableName`** — Obtém nome da tabela de credenciais (legacy, mantido para compatibilidade)
- **`getUserIdColumnName`** — Obtém nome da coluna de ID do usuário (legacy, mantido para compatibilidade)

---
## 18. InvestmentMetricsService

**File:** `backend/src/services/investmentMetrics.service.js` · **284 lines**
**Export:** `export class`

**Internal imports:** `prisma`, `Investment`
**Prisma models:** `feeLog`, `investment`, `investor`, `offer`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 16 | `static async getMetrics(filters = {})` | ✓ |
| 100 | `static async getStatisticsByPeriod(startDate, endDate, offerId = null)` | ✓ |
| 168 | `static async getPendingInvestments(limit = 50)` | ✓ |
| 194 | `static async getFundraisingProgress()` | ✓ |
| 235 | `static async getRevenueBreakdown()` | ✓ |
| 261 | `static async getInvestorCohorts()` | ✓ |

**JSDoc Descriptions**

- **`getMetrics`** — Obtém métricas gerais de investimentos
- **`getStatisticsByPeriod`** — Obtém estatísticas por período (agrupado por dia)
- **`getPendingInvestments`** — Obtém investimentos pendentes que precisam de atenção
- **`getFundraisingProgress`** — Obtém progresso de captação das ofertas ativas
- **`getRevenueBreakdown`** — Obtém breakdown de receita por categoria
- **`getInvestorCohorts`** — Obtém coortes de investidores (Ativos vs Inativos)

---
## 19. CollateralDistributionService

**File:** `backend/src/services/collateralDistribution.service.js` · **353 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`, `PaymentService`, `NotificationService`, `EmailService`
**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `prisma`, `getIssuerKeypair, getDistributorKeypair`, `logger`
**Prisma models:** `companyPenalty`, `offer`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 25 | `static async getDefaultedOffers()` | ✓ |
| 92 | `static async _getDefaultedOfferOnChain(offer)` | ✓ |
| 170 | `static async getDefaultedOfferDetails(offerId)` | ✓ |
| 181 | `static async prepareCollateralDistribution(offerId)` | ✓ |
| 247 | `static async processCollateralDistribution(signedXDR, offerId, adminId)` | ✓ |
| 330 | `static async getDefaultStatistics()` | ✓ |

**JSDoc Descriptions**

- **`getDefaultedOffers`** — Get all defaulted offers awaiting admin action
- **`_getDefaultedOfferOnChain`** — Get defaulted offer details using on-chain balances (for unlocked tokens)
- **`getDefaultedOfferDetails`** — Get single defaulted offer details
- **`prepareCollateralDistribution`** — Prepare collateral distribution transaction for admin signing
- **`processCollateralDistribution`** — Process signed collateral distribution transaction
- **`getDefaultStatistics`** — Get default statistics for admin dashboard

---
## 20. PaymentMonitor

**File:** `backend/src/services/paymentMonitor.service.js` · **351 lines**
**Export:** `export class`

**Service dependencies:** `DepositRelayService`
**Internal imports:** `stellarServer, createFreshServer`, `logger`

**Constructor**

- `constructor()` _(line 14)_ — Serviço para monitorar pagamentos USDC em tempo real usando Horizon streaming

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 29 | `async start(treasuryPublicKey = null)` | ✓ |
| 57 | `async startStream()` | ✓ |
| 120 | `async handleStreamError(error)` | ✓ |
| 200 | `isRateLimitError(error)` | – |
| 229 | `isAccountNotFoundError(error)` | – |
| 256 | `async handlePayment(payment)` | ✓ |
| 307 | `stop()` | – |
| 332 | `isActive()` | – |

**JSDoc Descriptions**

- **`constructor`** — Serviço para monitorar pagamentos USDC em tempo real usando Horizon streaming
- **`start`** — Inicia o monitoramento de pagamentos USDC
- **`startStream`** — Inicia o stream de pagamentos
- **`handleStreamError`** — Trata erros do stream e reconecta
- **`isRateLimitError`** — Check if error is a rate limit (429) error from Horizon
- **`isAccountNotFoundError`** — Check if error is an account not found (404) error from Horizon
- **`handlePayment`** — Processa um pagamento recebido
- **`stop`** — Para o monitoramento de pagamentos
- **`isActive`** — Verifica se o monitoramento está ativo

**Exported Functions**

- `getPaymentMonitor()` _(line 344)_ — Obtém instância singleton do PaymentMonitor

---
## 21. PaymentReminderService

**File:** `backend/src/services/paymentReminder.service.js` · **410 lines**
**Export:** `export class`

**Service dependencies:** `CompanyPaymentService`, `EmailService`, `NotificationService`
**External packages:** `node-cron`
**Internal imports:** `prisma`, `logger`
**Prisma models:** `companyUser`, `offer`, `paymentReminder`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 46 | `static startReminderScheduler()` | – |
| 72 | `static stopReminderScheduler()` | – |
| 84 | `static async processReminders()` | ✓ |
| 155 | `static async sendReminder(offer, reminderType, dueDate)` | ✓ |
| 247 | `static async sendOverdueReminder(offer, daysOverdue, dueDate)` | ✓ |
| 333 | `static async updatePaymentDueStatus(offer, daysUntilDue)` | ✓ |
| 358 | `static getPeriodsPerYear(paymentType)` | – |
| 368 | `static getReminderTitle(reminderType, offerName)` | – |
| 382 | `static getReminderMessage(reminderType, amountDue, dueDate)` | – |

**JSDoc Descriptions**

- **`startReminderScheduler`** — Start the payment reminder scheduler
- **`stopReminderScheduler`** — Stop the reminder scheduler
- **`processReminders`** — Process all pending reminders
- **`sendReminder`** — Send a payment reminder
- **`sendOverdueReminder`** — Send overdue payment reminder with escalating urgency
- **`updatePaymentDueStatus`** — Update the payment due status of an offer

---
## 22. PaymentService

**File:** `backend/src/services/payment.service.js` · **514 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`, `ConfigService`, `keyManager`, `TransactionManager`
**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `prisma`, `getSorobanRpcUrl, getUsdcIssuer`, `logger`
**Prisma models:** `companyUser`, `notification`, `offer`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 92 | `static getBalanceSource(offer)` | – |
| 110 | `static async getOnChainTokenBalance(assetCode, investorAddress)` | ✓ |
| 174 | `static async processBulletPayments(assetCode = null)` | ✓ |
| 278 | `static async getExpiredBulletOffers()` | ✓ |
| 311 | `static async getInvestorsWithBalancesByOffer(offerId)` | ✓ |
| 406 | `static async processAllScheduledPayments()` | ✓ |

**JSDoc Descriptions**

- **`getBalanceSource`** — Determines the balance source for dividend calculations.
- **`getOnChainTokenBalance`** — Query on-chain token balance for a given investor/wallet on a SAC (Stellar Asset Contract).
- **`processBulletPayments`** — Processa ofertas bullet que atingiram a maturidade
- **`getExpiredBulletOffers`** — Busca ofertas bullet expiradas (data de vencimento chegou)
- **`getInvestorsWithBalancesByOffer`** — Busca investidores com saldos em uma oferta específica
- **`processAllScheduledPayments`** — Processa todos os pagamentos agendados (Bullet e Periódicos)

---
## 23. OfferService

**File:** `backend/src/services/offer.service.js` · **575 lines**
**Export:** `export class`

**Internal imports:** `Offer`, `Token`, `Company`, `prisma`, `logger`
**Prisma models:** `investment`, `offer`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 17 | `static validateAssetCode(assetCode)` | – |
| 36 | `static validatePaymentFields(paymentType, paymentFields)` | – |
| 106 | `static validateOfferRules(offerRules, offerType)` | – |
| 153 | `static async getActiveOffers(limit = 100, offset = 0, offerType = null)` | ✓ |
| 164 | `static async getOffersByType(offerType, limit = 100, offset = 0)` | ✓ |
| 173 | `static async createOffer(offerData)` | ✓ |
| 276 | `static async reviewOffer(offerId, status, reviewedBy, rejectionReason = null)` | ✓ |
| 295 | `static async issueTokenFromOffer(offerId, issuedBy, issuerPublicKey, transactionHash = null)` | ✓ |
| 333 | `static async activateOffer(offerId)` | ✓ |
| 371 | `static async retrySorobanInit(offerId)` | ✓ |
| 526 | `static async getOfferInvestors(offerId)` | ✓ |

**Private Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 392 | `static async #initSorobanDeploy(offer, token)` | ✓ |

**JSDoc Descriptions**

- **`validateAssetCode`** — Valida código do asset
- **`validatePaymentFields`** — Valida tipo de pagamento e campos associados
- **`validateOfferRules`** — Valida regras da oferta
- **`getActiveOffers`** — Busca ofertas ativas
- **`getOffersByType`** — Busca ofertas por tipo
- **`createOffer`** — Cria uma nova oferta
- **`reviewOffer`** — Revisa uma oferta (apenas platform_admin)
- **`issueTokenFromOffer`** — Emite token a partir de uma oferta aprovada
- **`activateOffer`** — Ativa uma oferta: inicia o pipeline de Soroban deploy → create → activate.
- **`retrySorobanInit`** — Retry Soroban init for a failed sale offer
- **`#initSorobanDeploy`** — Internal: Build + queue the Soroban deploy TX
- **`getOfferInvestors`** — Busca investidores de uma oferta (Cap Table)

---
## 24. YieldDistributorService

**File:** `backend/src/services/yieldDistributor.service.js` · **486 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`, `keyManager`
**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `getNetworkPassphrase, getSorobanRpcUrl`, `getRedisClient`, `logger`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 37 | `MAX_BATCH_SIZE` | `30` |
| 38 | `LOCK_TTL_SECONDS` | `1800` |
| 39 | `MAX_RETRIES` | `3` |
| 40 | `BASE_DELAY_MS` | `3000` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 73 | `static async buildDistributeXdr(payerAddress, investors, feeAmount)` | ✓ |
| 135 | `static async buildMultiBatchXdrs(payerAddress, breakdown, spreadRatio)` | ✓ |
| 197 | `static async submitSingleBatch(signedXdr)` | ✓ |
| 312 | `static async submitBatches(signedXDRs, batchDetails)` | ✓ |
| 358 | `static classifyError(error)` | – |
| 397 | `static async acquireLock(offerId, jobId)` | ✓ |
| 418 | `static async releaseLock(offerId)` | ✓ |
| 433 | `static getContractId()` | – |
| 439 | `static getUsdcSacId()` | – |
| 454 | `static async extendContractTtl()` | ✓ |

**JSDoc Descriptions**

- **`buildDistributeXdr`** — Build a single distribute() invocation XDR for one batch.
- **`buildMultiBatchXdrs`** — Build multi-batch XDRs for all investors.
- **`submitSingleBatch`** — Submit a single batch using the relay pattern.
- **`submitBatches`** — Submit all signed batch XDRs sequentially.
- **`classifyError`** — Classify a Soroban/Stellar error as retryable or fatal.
- **`acquireLock`** — Acquire a Redis lock for an offer. Prevents concurrent prepare() calls.
- **`releaseLock`** — Release the Redis lock for an offer.
- **`extendContractTtl`** — Extend the contract instance TTL to prevent expiry.

---
## 25. CompanyPaymentService

**File:** `backend/src/services/companyPayment.service.js` · **1315 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`, `YieldDistributorService`, `PaymentService`, `EmailService`, `AlertService`, `MultiSigTransactionService`, `keyManager`
**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `prisma`, `getUsdcIssuer, getNetworkPassphrase, getSorobanRpcUrl`, `logger`
**Prisma models:** `companyPenalty`, `feeLog`, `interestPayment`, `offer`, `yieldPaymentJob`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 25 | `LATE_FEE_PERCENT_PER_DAY` | `0` |
| 26 | `GRACE_PERIOD_DAYS` | `10` |
| 27 | `DEFAULT_FEE_PERCENT` | `0` |
| 29 | `USDC_ASSET_CODE` | `"USDC"` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 50 | `static async calculateOwedAmount(offerId)` | ✓ |
| 159 | `static async _calculateOwedAmountOnChain(offer)` | ✓ |
| 233 | `static async calculateBulletPayment(offerId)` | ✓ |
| 319 | `static async _calculateBulletPaymentOnChain(offer)` | ✓ |
| 399 | `static async getUpcomingPayments(companyId)` | ✓ |
| 437 | `static async createPaymentTransaction(offerId, companyUserId, options = {})` | ✓ |
| 649 | `static async processSignedPayment(signedXDR, offerId)` | ✓ |
| 746 | `static async processSignedBatches(signedXDRs, offerId, batchDetails = null)` | ✓ |
| 940 | `static async _recordPayments(offer, breakdown, txHash, spreadPct, isBullet)` | ✓ |
| 1014 | `static async checkOverduePayments()` | ✓ |
| 1227 | `static getPeriodsPerYear(paymentType)` | – |
| 1239 | `static _advanceByPeriod(date, paymentType, paymentDay)` | – |
| 1255 | `static computeTotalExpectedPayments(offer)` | – |
| 1287 | `static calculateNextPaymentDate(offer)` | – |

**JSDoc Descriptions**

- **`calculateOwedAmount`** — Calculate the current payment owed for an offer
- **`_calculateOwedAmountOnChain`** — Calculate owed amount using on-chain token balances (for unlocked tokens)
- **`calculateBulletPayment`** — Calculate bullet payment (principal + all accrued interest)
- **`_calculateBulletPaymentOnChain`** — Calculate bullet payment using on-chain token balances (for unlocked tokens)
- **`getUpcomingPayments`** — Get all upcoming payments for a company
- **`createPaymentTransaction`** — Create a payment transaction for company to sign
- **`processSignedPayment`** — Process a signed payment transaction
- **`processSignedBatches`** — Process signed multi-batch payment XDRs (YieldDistributor path).
- **`_recordPayments`** — Record InterestPayments + FeeLog for a completed payment.
- **`checkOverduePayments`** — Check for overdue payments and apply penalties

---
## 26. MultiSigTransactionService

**File:** `backend/src/services/multiSigTransaction.service.js` · **1206 lines**
**Export:** `export class`

**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `prisma`, `getNetworkPassphrase, stellarServer, createFreshServer`, `logger`
**Prisma models:** `deposit`, `feeLog`, `interestPayment`, `investment`, `multiSigTransaction`, `offer`, `token`, `tokenDistribution`

**Constants & Static Fields**

| Line | Name | Value |
|------|------|-------|
| 26 | `DEFAULT_EXPIRATION_MINUTES` | `72 * 60` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 41 | `static async create({ operationType, xdr, requiredSigners, thresholdRequired, metadata, description, initiatorId, initiatorType })` | ✓ |
| 90 | `static async getById(id)` | ✓ |
| 108 | `static async listPending(options = {})` | ✓ |
| 133 | `static async addSignature(txId, publicKey, signature)` | ✓ |
| 237 | `static async submit(txId)` | ✓ |
| 336 | `static async reject(txId, reason = null)` | ✓ |
| 368 | `static async markExpired(txId)` | ✓ |
| 389 | `static async expireOldTransactions()` | ✓ |
| 428 | `static async getStats()` | ✓ |
| 453 | `static async rebuildSorobanXdr(tx)` | ✓ |
| 576 | `static async processEffects(tx, txHashOverride = null)` | ✓ |
| 1105 | `static async processRejectionEffects(tx)` | ✓ |

**JSDoc Descriptions**

- **`create`** — Create a new pending transaction awaiting signatures
- **`getById`** — Get a pending transaction by ID
- **`listPending`** — List all pending transactions
- **`addSignature`** — Add a signature to a pending transaction
- **`submit`** — Submit a fully-signed transaction to the Stellar network
- **`reject`** — Reject/cancel a pending transaction
- **`markExpired`** — Mark a transaction as expired
- **`expireOldTransactions`** — Cron job to expire old pending transactions
- **`getStats`** — Get transaction statistics
- **`rebuildSorobanXdr`** — Rebuild a Soroban TX XDR with fresh time bounds and simulation data.
- **`processEffects`** — Executes post-transaction side effects (database updates)
- **`processRejectionEffects`** — Propagate rejection/expiration/failure to linked domain records.

---
## 27. UserType

**File:** `backend/src/services/passkeyWallet.service.js` · **1434 lines**
**Export:** `export const = { }`

**Service dependencies:** `StellarService`
**External packages:** `@openzeppelin/relayer-plugin-channels`, `smart-account-kit-bindings`, `@stellar/stellar-sdk`
**Internal imports:** `getNetworkPassphrase, getOperationsKeypair, getSorobanRpcUrl, isTestnet, getTreasuryKeypair`, `prisma`, `logger`
**Prisma models:** `company`, `credentialModel`, `model`, `signerModel`, `userModel`

### UserType

_No members extracted._

### PasskeyWalletService

**Constants & Static Fields**

| Line | Name | Value |
|------|------|-------|
| 88 | `#rpcServer` | `null` |
| 91 | `#channelsClient` | `null` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 101 | `static getRpcServer()` | – |
| 112 | `static getChannelsClient()` | – |
| 132 | `static getClientConfig()` | – |
| 210 | `static async sendTransaction(transaction)` | ✓ |
| 237 | `static async sendSorobanTransaction(funcXdr, authXdrs = [])` | ✓ |
| 269 | `static async submitWithSponsorship(txOrXdr)` | ✓ |
| 446 | `static async deploySmartWallet(credentialId, publicKey)` | ✓ |
| 522 | `static async createSmartWallet(userType, userId, credentialId, publicKey)` | ✓ |
| 589 | `static async hasSmartWallet(userType, userId)` | ✓ |
| 607 | `static async getWalletStatus(userType, userId)` | ✓ |
| 717 | `static async getTesouroMarketData()` | ✓ |
| 763 | `static async getSorobanWalletBalances(walletContractId)` | ✓ |
| 855 | `static async buildWithdrawalTx(userId, destinationAddress, amount, assetCode = "USDC", userType = UserType.INVESTOR, options = {})` | ✓ |
| 984 | `static resolveClassicAsset(assetCode)` | – |
| 1037 | `static async submitRelayerAnchorPayment({ anchorAccountId, assetCode, amount, memoHashHex, signingKeypair })` | ✓ |
| 1099 | `static async buildInvestmentTx(investorContractId, companyWallet, amount)` | ✓ |
| 1175 | `static async submitWithdrawalTx(signedXdr)` | ✓ |
| 1255 | `static async buildWithdrawalTxForCompany(companyId, destinationAddress, amount, assetCode = "USDC")` | ✓ |
| 1333 | `static async listUserPasskeys(userType, userId)` | ✓ |
| 1397 | `static async listEd25519Signers(userType, userId)` | ✓ |

**Private Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 155 | `static #getPrismaModel(userType)` | – |
| 167 | `static #getCredentialModel(userType)` | – |
| 179 | `static #getCredentialFkField(userType)` | – |
| 191 | `static #getEd25519SignerModel(userType)` | – |
| 951 | `static #resolveAssetSacContractId(assetCode)` | – |
| 1197 | `static #validateWithdrawalTx(tx)` | – |

**JSDoc Descriptions**

- **`getRpcServer`** — Get or create Soroban RPC Server instance
- **`getChannelsClient`** — Get or create OpenZeppelin Channels Client for fee-sponsored transactions.
- **`getClientConfig`** — Get configuration for client-side SmartAccountKit initialization.
- **`#getPrismaModel`** — Get the Prisma model name for a user type
- **`#getCredentialModel`** — Get the WebAuthn credential table for a user type
- **`#getCredentialFkField`** — Get the FK field name for the credential table
- **`#getEd25519SignerModel`** — Get the Ed25519 signer model for a user type
- **`sendTransaction`** — Send a signed transaction via Stellar Channels (fee sponsorship).
- **`sendSorobanTransaction`** — Send a Soroban transaction via Channels using func + auth entries.
- **`submitWithSponsorship`** — Submit a transaction with backend sponsorship (Fee Bump).
- **`deploySmartWallet`** — Deploy a new smart wallet using OZ Smart Account Kit.
- **`createSmartWallet`** — Create a new smart wallet for a user (investor or company user).
- **`hasSmartWallet`** — Check if a user has a smart wallet
- **`getWalletStatus`** — Get wallet status for a user
- **`getTesouroMarketData`** — Fetch the TESOURO "market" data: current BRL-per-token price (from
- **`buildWithdrawalTx`** — Build a withdrawal transaction to be signed by the user's Passkey.
- **`#resolveAssetSacContractId`** — Resolve a Radox asset code to its Stellar Asset Contract (SAC) contract ID.
- **`resolveClassicAsset`** — Resolve a Radox asset code to its classic Stellar Asset (CODE:ISSUER).
- **`submitRelayerAnchorPayment`** — Build + submit the second half of the off-ramp relayer bridge: a CLASSIC
- **`buildInvestmentTx`** — Build an investment SAC transfer transaction to be signed by investor's Passkey.
- **`submitWithdrawalTx`** — Submit a signed withdrawal transaction.
- **`#validateWithdrawalTx`** — Validate that a withdrawal transaction only contains expected operations.
- **`buildWithdrawalTxForCompany`** — Build a withdrawal transaction for a Company entity.
- **`listUserPasskeys`** — List all passkeys registered for a user
- **`listEd25519Signers`** — List all Ed25519 recovery signers for a user

---
## 28. EmailService

**File:** `backend/src/services/email.service.js` · **977 lines**
**Export:** `export class`

**External packages:** `resend`, `crypto`, `dotenv`
**Internal imports:** `logger`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 12 | `RESEND_API_KEY` | `process.env.RESEND_API_KEY` |
| 13 | `EMAIL_FROM` | `…` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 72 | `static async sendInterestPaymentConfirmation(investorEmail, investorName, amount, transactionHash, paymentDate)` | ✓ |
| 126 | `static generateVerificationToken()` | – |
| 134 | `static getVerificationExpiry()` | – |
| 147 | `static async send6DigitVerificationCode(email, code)` | ✓ |
| 215 | `static async sendVerificationEmail(investorEmail, investorName, verificationToken)` | ✓ |
| 286 | `static async resendVerificationEmail(investorEmail, investorName, verificationToken)` | ✓ |
| 293 | `static async sendWelcomeEmail(investorEmail, investorName, contractId)` | ✓ |
| 394 | `static async sendBulletPaymentConfirmation(email, data)` | ✓ |
| 448 | `static async sendQuarterlyPaymentConfirmation(email, data)` | ✓ |
| 502 | `static async sendSemiAnnualPaymentConfirmation(email, data)` | ✓ |
| 556 | `static async sendInvestmentConfirmation(investorEmail, investment, distribution)` | ✓ |
| 611 | `static async sendKYCApprovalEmail(investorEmail, investorName)` | ✓ |
| 683 | `static async sendKYCRejectionEmail(investorEmail, investorName, reason)` | ✓ |
| 735 | `static async sendCompanyStatusUpdate(email, companyName, status, reason = "")` | ✓ |
| 838 | `static async sendOfferStatusUpdate(email, offerTitle, status, reason = "")` | ✓ |
| 900 | `static async sendAdminAlert(adminEmail, adminName, opts)` | ✓ |

**JSDoc Descriptions**

- **`sendInterestPaymentConfirmation`** — Envia email de confirmação de pagamento de juros para investidor
- **`generateVerificationToken`** — Generate a secure email verification token
- **`getVerificationExpiry`** — Get verification token expiry date
- **`send6DigitVerificationCode`** — Send 6-digit verification code email for email-first registration
- **`sendVerificationEmail`** — Send email verification email to new investor
- **`resendVerificationEmail`** — Resend verification email
- **`sendWelcomeEmail`** — Send welcome email after email verification and wallet creation
- **`sendBulletPaymentConfirmation`** — Send bullet payment confirmation email
- **`sendQuarterlyPaymentConfirmation`** — Send quarterly payment confirmation email
- **`sendSemiAnnualPaymentConfirmation`** — Send semi-annual payment confirmation email
- **`sendInvestmentConfirmation`** — Envia email de confirmação de investimento
- **`sendKYCApprovalEmail`** — Envia email de aprovação de KYC
- **`sendKYCRejectionEmail`** — Envia email de rejeição de KYC
- **`sendCompanyStatusUpdate`** — Envia email de atualização de status da empresa
- **`sendOfferStatusUpdate`** — Envia email de atualização de status da oferta
- **`sendAdminAlert`** — Send an alert email to a platform admin.

---
## 29. StellarService

**File:** `backend/src/services/stellar.service.js` · **2102 lines**
**Export:** `export class`

**Service dependencies:** `keyManager`, `TransactionManager`
**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `stellarServer, createFreshServer, createAsset, buildTransactionWithAccount, signAndSubmitTransaction, getNetworkPassphrase, getOperationsKeypair, getSorobanRpcUrl, getUsdcIssuer`, `logger`
**Prisma models:** `multiSigTransaction`, `token`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 46 | `static async getAccountRPC(publicKey)` | ✓ |
| 67 | `static async buildUnsignedTransaction(sourcePublicKey, operations, memo)` | ✓ |
| 79 | `static async submitTransaction(signedXdr)` | ✓ |
| 126 | `static async createIssuerAccount()` | ✓ |
| 301 | `static async unlockToken(assetCode)` | ✓ |
| 375 | `static async issueSecurityToken(code, amount, options = {})` | ✓ |
| 584 | `static async deploySACForAsset(code, issuer = null, chainMetadata = {})` | ✓ |
| 642 | `static async ensureSACDeployed(assetCode, issuer = null, chainMetadata = {})` | ✓ |
| 731 | `static async distributeTokens(investorPublicKey, amount, assetCode, options = {})` | ✓ |
| 928 | `static async withdrawFromTreasury(destination, amount, assetCode, description, extraMetadata = {}, operationType = "treasury_payment")` | ✓ |
| 1044 | `static getSACContractId(asset)` | – |
| 1077 | `static async freezeAccount(investorPublicKey, assetCode)` | ✓ |
| 1158 | `static async authorizeInvestor(investorPublicKey, assetCode)` | ✓ |
| 1238 | `static async setupSponsoredTrustline(investorPublicKey, assetCode)` | ✓ |
| 1330 | `static async unfreezeAccount(investorPublicKey, assetCode)` | ✓ |
| 1399 | `static async disableClawbackForTrustline(investorPublicKey, assetCode)` | ✓ |
| 1463 | `static buildDisableClawbackOp(investorPublicKey, assetCode)` | – |
| 1492 | `static async clawbackTokens(investorPublicKey, amount, assetCode)` | ✓ |
| 1593 | `static async getTokenBalance(assetCode, publicKey)` | ✓ |
| 1628 | `static async getAccountInfo(publicKey)` | ✓ |
| 1663 | `static async verifyUSDCPayment(investorPublicKey, expectedAmount, treasuryPublicKey = null, windowMinutes = 2, expectedMemo = null)` | ✓ |
| 1786 | `static async listAssetHolders(assetCode)` | ✓ |
| 1819 | `static async authorizeAllUserTrustlines(investorPublicKey)` | ✓ |
| 1892 | `static async simulateSorobanTransaction(transaction)` | ✓ |
| 1913 | `static async prepareSorobanTransaction(transaction)` | ✓ |
| 1961 | `static async extendContractTTL(contractId, ledgersToExtend = 500000)` | ✓ |
| 2051 | `static async getContractTTL(contractId)` | ✓ |
| 2085 | `static async listAccountAssets(publicKey)` | ✓ |

**JSDoc Descriptions**

- **`getAccountRPC`** — Helper to fetch account via Soroban RPC (removes dependency on Horizon loadAccount)
- **`buildUnsignedTransaction`** — Helper to build an unsigned transaction using RPC for sequence number fetching.
- **`submitTransaction`** — Submit a pre-signed transaction XDR directly to Horizon.
- **`createIssuerAccount`** — Cria conta emissora com flags de compliance
- **`unlockToken`** — Unlock a token for DEX trading by clearing AUTH_REQUIRED flag on the Issuer.
- **`issueSecurityToken`** — Emite tokens de segurança e transfere para a conta distribuidora
- **`deploySACForAsset`** — Deploys the Stellar Asset Contract (SAC) for an existing asset.
- **`ensureSACDeployed`** — Ensures the SAC is deployed for an asset before attempting transfers.
- **`distributeTokens`** — Distribui tokens para investidor
- **`withdrawFromTreasury`** — Realiza uma retirada do Tesouro (OpEx)
- **`getSACContractId`** — Obtém o Contract ID do Stellar Asset Contract (SAC) para um asset
- **`freezeAccount`** — Congela conta do investidor revogando a autorização da trustline
- **`authorizeInvestor`** — Authorize an investor to hold a specific asset (White-listing)
- **`setupSponsoredTrustline`** — Configura uma trustline patrocinada para um investidor.
- **`unfreezeAccount`** — Descongela conta do investidor restaurando a autorização da trustline
- **`disableClawbackForTrustline`** — Desabilita permanentemente a capacidade de clawback para uma trustline específica.
- **`buildDisableClawbackOp`** — Builds the operation to disable clawback for a trustline (Internal helper)
- **`clawbackTokens`** — Recupera tokens (clawback) do investidor
- **`getTokenBalance`** — Obtém saldo de tokens de uma conta Stellar
- **`getAccountInfo`** — Obtém informações completas de uma conta Stellar
- **`verifyUSDCPayment`** — Verifica se um pagamento USDC foi recebido na Treasury Account
- **`listAssetHolders`** — Lista todos os holders de um determinado asset
- **`authorizeAllUserTrustlines`** — Automations: Authorize all project trustlines for a specific investor
- **`simulateSorobanTransaction`** — Simulates a Soroban transaction to estimate resources and fees.
- **`prepareSorobanTransaction`** — Simulates and prepares a Soroban transaction by applying resource limits and fees.
- **`extendContractTTL`** — Extends the TTL (Time-To-Live) of a Soroban contract (instance and wasm code).
- **`getContractTTL`** — Checks the current TTL (Time-To-Live) of a contract.
- **`listAccountAssets`** — Lists all assets held by a specific account (usually the Distributor)

---
## 30. SorobanSaleService

**File:** `backend/src/services/sorobanSale.service.js` · **922 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`
**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `getNetworkPassphrase, getSorobanRpcUrl, buildTransactionWithAccount`, `logger`

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 70 | `static async buildDeployXdr(issuerPublicKey, wasmHash, salt)` | ✓ |
| 106 | `static precomputeContractId(issuerPublicKey, salt)` | – |
| 136 | `static async contractExistsOnChain(contractId)` | ✓ |
| 159 | `static async buildCreateSaleXdr(contractId, issuerPublicKey, { admin, seller, sellToken, buyToken, treasury, company, fixedFee, sellPrice, buyPrice, deadlineLedger, minBuyAmount, maxBuyPerBuyer })` | ✓ |
| 226 | `static async buildTradeXdr(contractId, buyerAddress, usdcAmount)` | ✓ |
| 325 | `static async getOffer(contractId)` | ✓ |
| 334 | `static async getBalance(contractId)` | ✓ |
| 344 | `static async getBuyerSpent(contractId, buyerAddress)` | ✓ |
| 356 | `static async isFrozen(contractId, buyerAddress)` | ✓ |
| 367 | `static async getVersion(contractId)` | ✓ |
| 414 | `static async buildEmergencyDrainXdr(contractId)` | ✓ |
| 421 | `static async buildSetActiveXdr(contractId, active)` | ✓ |
| 430 | `static async buildFreezeBuyerXdr(contractId, buyerAddress, frozen)` | ✓ |
| 440 | `static async buildWithdrawXdr(contractId, tokenAddress, amount)` | ✓ |
| 450 | `static async buildProposeAdminXdr(contractId, newAdmin)` | ✓ |
| 459 | `static async buildAcceptAdminXdr(contractId)` | ✓ |
| 466 | `static async buildUpdatePriceXdr(contractId, sellPrice, buyPrice)` | ✓ |
| 510 | `static async buildUpgradeXdr(contractId, newWasmHash)` | ✓ |
| 525 | `static async buildSacAuthorizeXdr(sacContractId, targetAddress, authorize)` | ✓ |
| 578 | `static async authorizeBuyerOnSac(sacContractId, targetAddress)` | ✓ |
| 767 | `static async buildIssuerThresholdSetupXdr()` | ✓ |
| 808 | `static async buildSacTransferXdr(sacContractId, from, to, amount)` | ✓ |
| 849 | `static parseContractError(txResult)` | – |
| 910 | `static toHttpError(code)` | – |

**Private Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 287 | `static #boostResourcesForPasskey(tx)` | – |
| 375 | `static async #simulateReadOnly(contractId, method, args = [])` | ✓ |
| 479 | `static async #buildAdminOpXdr(contractId, method, args = [])` | ✓ |

**JSDoc Descriptions**

- **`buildDeployXdr`** — Build an unsigned deploy TX for the token_sale contract.
- **`precomputeContractId`** — Deterministically compute a contract ID from deployer + salt + network.
- **`contractExistsOnChain`** — Check if a contract exists on-chain via getLedgerEntries.
- **`buildCreateSaleXdr`** — Initialize a sale on an already-deployed contract via create().
- **`buildTradeXdr`** — Build a trade() invocation XDR for passkey signing.
- **`#boostResourcesForPasskey`** — Boost Soroban resource budget for smart wallet passkey auth.
- **`getOffer`** — Get the current offer state from the contract.
- **`getBalance`** — Get the contract's balance of the sell token.
- **`getBuyerSpent`** — Get cumulative buy_token spent by a buyer.
- **`isFrozen`** — Check if a buyer is frozen/blocked.
- **`getVersion`** — Get contract version.
- **`#simulateReadOnly`** — Simulate a read-only contract call (no TX submission).
- **`buildEmergencyDrainXdr`** — Build emergency_drain() XDR. Admin signs with multisig.
- **`buildSetActiveXdr`** — Build set_active() XDR. Seller signs.
- **`buildFreezeBuyerXdr`** — Build freeze_buyer() XDR. Admin signs with multisig.
- **`buildWithdrawXdr`** — Build withdraw() XDR. Admin signs with multisig.
- **`buildProposeAdminXdr`** — Build propose_admin() XDR.
- **`buildAcceptAdminXdr`** — Build accept_admin() XDR.
- **`buildUpdatePriceXdr`** — Build updt_price() XDR. Seller signs.
- **`#buildAdminOpXdr`** — Generic admin/seller operation builder.
- **`buildUpgradeXdr`** — Build upgrade() XDR — replaces contract WASM. Admin only (high-privilege).
- **`buildSacAuthorizeXdr`** — Build SAC set_authorized() XDR — authorize/deauthorize an address on a SAC.
- **`authorizeBuyerOnSac`** — Auto-authorize an address's balance on a SAC using the operations key.
- **`buildIssuerThresholdSetupXdr`** — Build a setOptions TX that adds the operations key as a signer on the issuer
- **`buildSacTransferXdr`** — Build SAC transfer() XDR — transfer tokens via SAC (Soroban invocation).
- **`parseContractError`** — Parse a failed Soroban transaction result to extract the SaleError code.
- **`toHttpError`** — Convert a SaleError code to an HTTP-ready error response.

---
## 31. SorobanSettlementService

**File:** `backend/src/services/sorobanSettlement.service.js` · **580 lines**
**Export:** `export class`

**Service dependencies:** `StellarService`, `keyManager`
**External packages:** `@stellar/stellar-sdk`
**Internal imports:** `getNetworkPassphrase, getSorobanRpcUrl`, `prisma`, `logger`
**Prisma models:** `offer`

**Module Constants**

| Line | Name | Value |
|------|------|-------|
| 43 | `MAX_BATCH_SIZE` | `30` |

**Methods**

| Line | Signature | Async |
|------|-----------|-------|
| 77 | `static getSettlementWasmHash()` | – |
| 93 | `static async deployForOffer(offerId)` | ✓ |
| 162 | `static async buildInitializeXdr(offerId, maxFeeBps = 500)` | ✓ |
| 222 | `static async buildDepositXdr(offerId, amount)` | ✓ |
| 277 | `static async buildSettleBatchXdr(offerId, investors, totalFee)` | ✓ |
| 338 | `static async executeFullSettlement(offerId)` | ✓ |
| 483 | `static async buildWithdrawXdr(offerId, tokenAddress, amount, destination)` | ✓ |
| 517 | `static async getContractBalance(offerId)` | ✓ |
| 547 | `static parseContractError(error)` | – |
| 560 | `static _precomputeContractId(issuerPublicKey, salt)` | – |

**JSDoc Descriptions**

- **`getSettlementWasmHash`** — Get the WASM hash for the MaturitySettlement contract.
- **`deployForOffer`** — Deploy a MaturitySettlement contract for a debt offer.
- **`buildInitializeXdr`** — Build initialize TX for a deployed settlement contract.
- **`buildDepositXdr`** — Build a deposit TX: company USDC → settlement contract.
- **`buildSettleBatchXdr`** — Build settle_batch XDR for a batch of investors.
- **`executeFullSettlement`** — Execute full settlement for an offer (all investors, multi-batch).
- **`buildWithdrawXdr`** — Build withdraw XDR: pull leftover USDC from contract.
- **`getContractBalance`** — Query contract USDC balance.
- **`parseContractError`** — Parse a contract invocation error into a human-readable SettleError.
- **`_precomputeContractId`** — Precompute contract ID from deployer + salt.

---
