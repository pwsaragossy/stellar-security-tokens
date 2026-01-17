# Stellar Security Token Best Practices Audit

**Audit Date:** 2026-01-17  
**Auditor:** AI CTO / Cyber Security Review  
**Scope:** Backend Stellar integration for security token issuance

---

## Executive Summary

The platform follows **most Stellar best practices** for security token issuance. Key strengths include proper account separation, compliance flags, and multisig infrastructure. There are **a few areas needing attention** before mainnet deployment.

| Category | Status | Notes |
|----------|--------|-------|
| Account Architecture | ✅ Excellent | Proper separation of concerns |
| Asset Control Flags | ✅ Excellent | All required flags set |
| Trustline Authorization | ✅ Good | `setTrustLineFlags` implemented |
| Multisig Infrastructure | ✅ Good | Ledger support ready |
| Fee Handling | ✅ Excellent | Fee-bump transactions |
| Smart Wallet Integration | ✅ Good | Soroban passkey wallets |
| ⚠️ Master Key Locking | 🟡 Needs Work | Not yet implemented |
| ⚠️ Authorization Sandwich | 🟡 Optional | Consider for regulated assets |

---

## Detailed Findings

### ✅ 1. Issuing & Distribution Account Separation

**Best Practice:** Use separate issuing and distribution accounts.  
**Status:** ✅ **Compliant**

The platform correctly separates:
- **Issuer Account** (`STELLAR_ISSUER_SECRET_KEY`) - Creates assets with compliance flags
- **Distribution Account** (`STELLAR_DISTRIBUTOR_SECRET_KEY`) - Holds inventory, distributes to investors
- **Treasury Account** (`STELLAR_TREASURY_SECRET_KEY`) - Receives USDC payments
- **Operations Account** (`STELLAR_OPERATIONS_SECRET_KEY`) - Gas station for fee bumps

**Code Reference:**
```javascript
// backend/src/config/stellar.js
export const getIssuerKeypair = () => keyManager.getIssuerKeypair();
export const getDistributorKeypair = () => keyManager.getDistributorKeypair();
export const getTreasuryKeypair = () => keyManager.getTreasuryKeypair();
export const getOperationsKeypair = () => keyManager.getOperationsKeypair();
```

---

### ✅ 2. Asset Control Flags

**Best Practice:** Set `AUTH_REQUIRED`, `AUTH_REVOCABLE`, and `AUTH_CLAWBACK_ENABLED` for security tokens.  
**Status:** ✅ **Compliant**

All three compliance flags are set on issuer account creation:

```javascript
// backend/src/services/stellar.service.js:108-113
const operations = [
  Operation.setOptions({
    source: issuerKeypair.publicKey(),
    setFlags: AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag,
  }),
];
```

**Impact:**
- `AUTH_REQUIRED` (0x1): Trustlines need explicit approval
- `AUTH_REVOCABLE` (0x2): Can freeze investor accounts
- `AUTH_CLAWBACK_ENABLED` (0x8): Can recover tokens if needed

---

### ✅ 3. Trustline Authorization Flow

**Best Practice:** Approve trustlines using `setTrustLineFlags` operation.  
**Status:** ✅ **Compliant**

The platform has proper trustline authorization:

```javascript
// backend/src/services/stellar.service.js:935-941
const operations = unauthorizedTrustlines.map(tl =>
  Operation.setTrustLineFlags({
    trustor: investorPublicKey,
    asset: createAsset(tl.asset_code, tl.asset_issuer),
    setFlags: 1, // AUTHORIZED_FLAG
  })
);
```

Automated whitelisting happens after KYC approval:
- `authorizeAllUserTrustlines(investorPublicKey)` called when KYC is approved
- All project trustlines for that investor are authorized in batch

---

### ✅ 4. Fee-Bump Transaction Pattern

**Best Practice:** Use fee-bump transactions to simplify user experience.  
**Status:** ✅ **Excellent Implementation**

Operations wallet pays fees via fee-bump:

```javascript
// backend/src/config/stellar.js:280-289
const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
  getOperationsKeypair(),
  BASE_FEE,
  transaction,
  getNetworkPassphrase()
);
feeBumpTx.sign(operationsKeypair);
```

**Benefits:**
- Investors don't need XLM for gas
- Business wallets don't need to hold XLM
- Centralized fee management

---

### ✅ 5. Freeze & Unfreeze Capability

**Best Practice:** Implement account freezing for compliance.  
**Status:** ✅ **Compliant**

```javascript
// backend/src/services/stellar.service.js:480
static async freezeAccount(investorPublicKey, assetCode) { ... }

// backend/src/services/stellar.service.js:545  
static async unfreezeAccount(investorPublicKey, assetCode) { ... }
```

Uses `setTrustLineFlags` with `clearFlags: 1` to revoke authorization.

---

### ✅ 6. Clawback Capability

**Best Practice:** Implement clawback for regulatory compliance.  
**Status:** ✅ **Compliant**

```javascript
// backend/src/services/stellar.service.js:600+
static async clawbackTokens(investorPublicKey, assetCode, amount) { ... }
```

Uses `Operation.clawback()` to recover tokens when needed.

---

### ✅ 7. Multisig Infrastructure

**Best Practice:** Use multisig with hardware wallets for production.  
**Status:** ✅ **Infrastructure Ready**

- `KEY_MANAGEMENT_MODE=multisig` support
- Ledger wallet integration (`frontend/src/lib/ledger.ts`)
- Unsigned transaction queue (`MultiSigTransaction` model)
- Scripts for multisig setup (`backend/scripts/setup-multisig.js`)

**Recommendation:** Enable before mainnet launch.

---

## 🟡 Areas for Improvement

### 1. Issuer Account Lock-Down (CRITICAL for Mainnet)

**Best Practice:** Lock issuer account after initial minting by setting `masterWeight: 0`.  
**Status:** 🟡 **Not Yet Implemented**

**Risk:** If issuer secret key is compromised, attacker can mint unlimited tokens.

**Recommend:**
```javascript
// Add to setup-multisig.js or create dedicated script
const lockIssuer = async () => {
  const transaction = new TransactionBuilder(issuerAccount, opts)
    .addOperation(Operation.setOptions({
      masterWeight: 0,
      lowThreshold: 0,
      medThreshold: 0,
      highThreshold: 0,
    }))
    .build();
};
```

> ⚠️ **Warning:** This is irreversible. Only do after all initial tokens are minted.

**Action Item:** Add to `MAINNET_CHECKLIST.md`:
- [ ] Lock issuer account after initial token issuance

---

### 2. Authorization Sandwich Pattern (Optional Enhancement)

**Best Practice:** For high-compliance scenarios, use "authorization sandwich" to approve only specific transactions.  
**Status:** 🟡 **Not Implemented** (Optional)

Current flow:
```
1. KYC approved → All trustlines authorized
2. Investor can transact freely
```

Enhanced flow (for stricter compliance):
```
1. KYC approved → trustline set to AUTHORIZED_TO_MAINTAIN_LIABILITIES_FLAG
2. Each transaction: temporary upgrade to AUTHORIZED_FLAG, then back
```

**Recommendation:** Consider for highly regulated securities. Current implementation is fine for most use cases.

---

### 3. Supply Verification Dashboard

**Best Practice:** Provide transparency on total supply vs circulating supply.  
**Status:** 🟡 **Partially Implemented**

Currently:
- `listAssetHolders()` shows who holds tokens
- Database tracks offer `totalSupply`

**Recommendation:** Add admin dashboard widget showing:
- Total minted (from Horizon)
- Total in distribution account
- Total circulating (in investor hands)
- Total clawed back/burned

---

## Security Checklist for Mainnet

Before going to mainnet, ensure:

- [ ] **Enable multisig** on all platform accounts (issuer, distributor, treasury)
- [ ] **Add Ledger signers** to treasury (2-of-3 recommended)
- [ ] **Lock issuer account** after initial token minting (masterWeight: 0)
- [ ] **Remove secret keys** from production .env (multisig mode only)
- [ ] **Audit npm dependencies** (`npm audit --production`)
- [ ] **Review Stellar toml** for proper home domain setup
- [ ] **Test clawback flow** on testnet fully
- [ ] **Document recovery procedures** for lost Ledger access

---

## Summary

| Requirement | Stellar Best Practice | Our Implementation | Status |
|-------------|----------------------|-------------------|--------|
| Separate accounts | ✅ Issuer + Distribution | ✅ 4 accounts | ✅ |
| AUTH_REQUIRED | ✅ For controlled assets | ✅ Set on issuer | ✅ |
| AUTH_REVOCABLE | ✅ For freeze capability | ✅ Set on issuer | ✅ |
| AUTH_CLAWBACK_ENABLED | ✅ For recovery | ✅ Set on issuer | ✅ |
| Trustline Authorization | ✅ setTrustLineFlags | ✅ After KYC approval | ✅ |
| Fee Bump Transactions | ✅ Better UX | ✅ Operations wallet | ✅ |
| Multisig for Production | ✅ Hardware wallets | ✅ Infrastructure ready | 🟡 |
| Lock Issuer Account | ✅ After minting | ❌ Not yet done | 🟡 |

**Overall Grade:** B+ (Excellent foundation, minor production hardening needed)

---

## References

- [Stellar: Control Asset Access](../docs/Stellar%20Docs.../tokens/control-asset-access.md)
- [Stellar: How to Issue an Asset](../docs/Stellar%20Docs.../tokens/how-to-issue-an-asset.md)
- [Platform: Multisig Reference](./STELLAR_MULTISIG_REFERENCE.md)
- [Platform: Mainnet Checklist](./MAINNET_CHECKLIST.md)
