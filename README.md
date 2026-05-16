# Stellar Security Tokens

Platform for tokenizing real-world assets on Stellar, with USDC-based investments, Passkey smart wallets, Soroban contracts, and Etherfuse-powered Pix on-ramp/off-ramp flows for the Brazilian market.

## Features

- **Real-world asset tokenization**: offers, investments, settlement, and investor payouts in USDC.
- **Pix on-ramp through Etherfuse**: BRL quotes, Pix payment instructions, and delivery of TESOURO by default or USDC through `targetAsset=USDC`.
- **Pix off-ramp through Etherfuse**: TESOURO/USDC to BRL withdrawals to registered bank accounts.
- **Smart wallets**: Passkey/WebAuthn onboarding with Freighter support where applicable.
- **Backend**: Express.js, service-oriented modules, Prisma ORM, and PostgreSQL.
- **Frontend**: React 19 dashboards for investors, companies, and platform administrators.
- **Blockchain**: Stellar SDK v14 and Soroban contracts for sales, distribution, and settlement.

## Ramp Flows: Pix, USDC, and Etherfuse

The ramp module connects Brazilian fiat rails to the assets used by the platform:

1. **KYC and Pix account**: investors submit KYC data and register a Pix-enabled bank account.
2. **On-ramp**: investors request a BRL quote and receive Pix payment instructions. Etherfuse delivers TESOURO by default; USDC quotes are requested with `targetAsset=USDC`.
3. **Investing**: USDC balances can be used to buy security tokens and pay configured platform fees.
4. **Off-ramp**: when `ENABLE_OFFRAMP=true`, investors quote TESOURO/USDC to BRL, sign the on-chain transfer with Passkey, and track the Pix payout.

These flows depend on Etherfuse credentials, webhook delivery, operational liquidity, USDC/TESOURO SAC contract configuration, and reconciliation. See [`docs/Operations/OFFRAMP_RUNBOOK.md`](./docs/Operations/OFFRAMP_RUNBOOK.md).

## Mock API Examples

All `/api/ramp` routes require an authenticated investor JWT:

```bash
export API_URL=http://localhost:3000
export JWT=mock-investor-jwt
```

Check ramp readiness:

```bash
curl -s "$API_URL/api/ramp/readiness" \
  -H "Authorization: Bearer $JWT"
```

```json
{
  "success": true,
  "data": {
    "ready": true,
    "kycStatus": "approved",
    "walletRegistered": true,
    "offrampEnabled": true
  }
}
```

Submit KYC and register a Pix bank account:

```bash
curl -s -X POST "$API_URL/api/ramp/kyc" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "12345678901",
    "fullName": "Maria Investor",
    "email": "maria@example.com"
  }'

curl -s -X POST "$API_URL/api/ramp/bank-accounts" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "pixKey": "maria@example.com",
    "pixKeyType": "email",
    "bankName": "Mock Bank",
    "holderName": "Maria Investor"
  }'
```

Create an on-ramp quote for USDC and execute it:

```bash
curl -s -X POST "$API_URL/api/ramp/quotes" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAmount": "500.00",
    "sourceAsset": "BRL",
    "targetAsset": "USDC"
  }'
```

```json
{
  "success": true,
  "data": {
    "quote": {
      "id": 101,
      "orderType": "onramp",
      "sourceAsset": "BRL",
      "targetAsset": "USDC",
      "sourceAmount": "500.00",
      "status": "quoted"
    }
  }
}
```

```bash
curl -s -X POST "$API_URL/api/ramp/orders" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": 101,
    "bankAccountId": 77,
    "memo": "mock-onramp-001"
  }'
```

Mock order response:

```json
{
  "success": true,
  "data": {
    "order": {
      "id": 501,
      "orderType": "onramp",
      "status": "created",
      "pixInstructions": {
        "qrCode": "00020101021226880014br.gov.bcb.pix...",
        "copyPaste": "00020101021226880014br.gov.bcb.pix..."
      }
    }
  }
}
```

Create an off-ramp quote, create the order, prepare signing, and submit the signed XDR:

```bash
curl -s -X POST "$API_URL/api/ramp/offramp/quotes" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAsset": "USDC",
    "sourceAmount": "25.00"
  }'

curl -s -X POST "$API_URL/api/ramp/offramp/orders" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": 202,
    "bankAccountId": 77
  }'

curl -s -X POST "$API_URL/api/ramp/offramp/orders/601/prepare-tx" \
  -H "Authorization: Bearer $JWT"

curl -s -X POST "$API_URL/api/ramp/offramp/orders/601/submit-tx" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "signedXdr": "AAAAAgAAA...mock-signed-envelope..."
  }'
```

Mock off-ramp status:

```json
{
  "success": true,
  "data": {
    "id": 601,
    "orderType": "offramp",
    "sourceAsset": "USDC",
    "targetAsset": "BRL",
    "status": "funded",
    "burnTransaction": "mock-stellar-tx-hash",
    "confirmedTxSignature": "mock-etherfuse-signature"
  }
}
```

## Critical Configuration

Validate these before enabling production ramp flows:

- `ENABLE_ETHERFUSE_ANCHOR=true`: mounts the Etherfuse ramp routes.
- `ENABLE_OFFRAMP=true`: enables the off-ramp route surface.
- `ETHERFUSE_API_BASE_URL`, `ETHERFUSE_API_KEY`, `ETHERFUSE_ORG_ID`, `ETHERFUSE_WEBHOOK_SECRET`: connect the backend to Etherfuse.
- `ETHERFUSE_TESOURO_ASSET_IDENTIFIER`: pins the TESOURO asset identifier from Etherfuse.
- `USDC_SAC_CONTRACT_ID` / `USDC_CONTRACT_ID` and `USDC_ISSUER`: configure USDC.
- `OFFRAMP_KEYRING_SECRET`: base64 32-byte AES-256-GCM key for per-investor off-ramp relayers. Back it up before enabling off-ramp.

## Fee System

The platform implements configurable fees:

1. **Blockchain operation fee**: fixed 5.0 USDC per investment by default.
2. **Investment fee (%)**: deducted from gross invested amount; default is 0%.
3. **Dividend fee (%)**: deducted from investor payout distributions; default is 0%.

Administrators can update fees through:

- `PUT /api/platform-admins/system-config`
- Keys: `INVESTMENT_FEE_PERCENT`, `DIVIDEND_FEE_PERCENT`, `BLOCKCHAIN_OPERATION_FEE_FIXED`

## Quick Start

### Docker

```bash
docker-compose up -d --build
```

### Manual Setup

Install dependencies:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Configure environment variables:

```bash
cp .env.template .env
# Set Stellar, Etherfuse, database, webhook, and ramp feature flags.
```

Start the apps:

```bash
cd backend && npm start
cd frontend && npm run dev
```

## Documentation

- [Feature Matrix](./docs/Project_Bible/02_feature_matrix.md)
- [Data Flow](./docs/Project_Bible/03_data_flow.md)
- [Smart Contract Layer](./docs/Project_Bible/smart_contract_layer.md)
- [Services Layer](./docs/Project_Bible/services_layer.md)
- [Monetization](./docs/Operations/MONETIZATION.md)
- [Off-ramp Runbook](./docs/Operations/OFFRAMP_RUNBOOK.md)
- [Security Audit](./docs/Project_Bible/06_security_audit.md)
- [Environment Map](./docs/Project_Bible/05_config_env_map.md)
- [Mainnet Checklist](./docs/Operations/MAINNET_CHECKLIST.md)
- [Technical Index](./docs/Project_Bible/00_index.md)

## Tests

```bash
cd backend && npm test
cd ../frontend && npm test
```

---

Updated May 2026.
