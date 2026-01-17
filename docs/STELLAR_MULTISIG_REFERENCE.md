# Stellar Multisig Reference for Security Tokens Platform

This document summarizes the key Stellar concepts relevant to our Ledger/Multisig implementation.

---

## Account Thresholds & Weights

Stellar accounts use **thresholds** to determine authorization requirements:

| Threshold | Operations | Default |
|-----------|-----------|---------|
| **Low** | Allow trust, set trustline flags | 0 |
| **Medium** | All other operations (payments, create offers) | 0 |
| **High** | Set options, change thresholds, account merge | 0 |

Each signer has a **weight** (0-255). Transaction is authorized when `sum(weights) >= threshold`.

---

## Recommended Account Setup for Production

### Treasury Account (2-of-3 Multisig)
```
Master Key Weight: 0 (disabled - use hardware wallets only)
Low Threshold: 2
Medium Threshold: 2
High Threshold: 3

Ledger Key 1 Weight: 1
Ledger Key 2 Weight: 1
Ledger Key 3 Weight: 1
```
This requires 2 Ledger signatures for payments, 3 for changing signers.

### Issuer Account (Locked after setup)
```
Master Key Weight: 0 (locked after initial asset issuance)
AUTH_REQUIRED: true
AUTH_REVOCABLE: true
AUTH_CLAWBACK_ENABLED: true
```
⚠️ Once locked, no new tokens can be minted.

### Distributor Account (Hot wallet for testnet, multisig for production)
```
In development: Single key (from .env)
In production: 2-of-2 multisig with automation + Ledger approval
```

---

## Asset Control Flags

| Flag | Hex | Purpose |
|------|-----|---------|
| `AUTH_REQUIRED` | 0x1 | Require issuer approval for trustlines |
| `AUTH_REVOCABLE` | 0x2 | Allow freezing account balances |
| `AUTH_CLAWBACK_ENABLED` | 0x8 | Allow clawback (requires revocable) |
| `AUTH_IMMUTABLE` | 0x4 | Lock all flags permanently |

### Setting Flags (JavaScript)
```javascript
const transaction = new StellarSdk.TransactionBuilder(issuer, { 
  fee: 100, 
  networkPassphrase 
})
  .addOperation(StellarSdk.Operation.setOptions({
    setFlags: StellarSdk.AuthRevocableFlag | StellarSdk.AuthRequiredFlag
  }))
  .setTimeout(30)
  .build();
```

---

## Multisig Setup Script Pattern

### Adding a Signer
```javascript
// Add Ledger public key as signer with weight 1
const transaction = new StellarSdk.TransactionBuilder(account, opts)
  .addOperation(StellarSdk.Operation.setOptions({
    signer: {
      ed25519PublicKey: ledgerPublicKey,
      weight: 1
    }
  }))
  .setTimeout(30)
  .build();
```

### Setting Thresholds
```javascript
const transaction = new StellarSdk.TransactionBuilder(account, opts)
  .addOperation(StellarSdk.Operation.setOptions({
    lowThreshold: 2,
    medThreshold: 2,
    highThreshold: 3,
    masterWeight: 0 // Disable master key
  }))
  .setTimeout(30)
  .build();
```

⚠️ **Order matters!** Add signers BEFORE setting masterWeight to 0, or you'll lock yourself out.

---

## Transaction Limits

| Limit | Value |
|-------|-------|
| Max signatures per transaction | 20 |
| Transaction timeout | 5 min recommended for multisig |
| Extra signatures | Causes `TX_BAD_AUTH_EXTRA` error |

---

## Key Implementation Notes

### For Our Platform

1. **KEY_MANAGEMENT_MODE=env**: Current behavior, single key from .env
2. **KEY_MANAGEMENT_MODE=multisig**: Production mode
   - No secret keys in .env
   - Only public keys configured
   - All transactions go through pending queue
   - Requires Ledger signatures

### Signature Flow
```
1. Admin initiates operation (e.g., token issuance)
2. Backend creates unsigned XDR, stores in MultiSigTransaction
3. Admin 1 connects Ledger, signs XDR
4. Signature stored in collectedSignatures
5. Admin 2 connects Ledger, signs XDR
6. Threshold met → transaction submitted to Stellar
```

---

## References

- [Signatures and Multisig](learn/fundamentals/transactions/signatures-multisig.md)
- [Asset Access Control](tokens/control-asset-access.md)
- [How to Issue an Asset](tokens/how-to-issue-an-asset.md)
