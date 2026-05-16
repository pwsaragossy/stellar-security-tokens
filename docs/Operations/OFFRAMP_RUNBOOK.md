# Off-Ramp Operational Runbook

> Operator playbook for the EtherFuse fiat off-ramp (TESOURO / USDC → BRL via PIX)
> Status: v1 — implemented; **disabled by default** (`ENABLE_OFFRAMP=false`)
> until `OFFRAMP_KEYRING_SECRET` is set and backed up.
> Owner: Pedro · Last updated: 2026-05-15 (per-investor relayer pivot)

---

## What this flow does

An investor converts TESOURO or USDC held in their Soroban smart wallet into BRL
paid out via PIX to a registered bank account.

**Architecture — per-investor relayer bridge** (Option A from the off-ramp
custody discussion):

EtherFuse confirmed (2026-05-15) that their anchor monitor does **not** detect
SAC `transfer()` credits from Soroban C-addresses. The fix is a two-hop bridge
that ends with a classic `payment` op the monitor recognizes. **Each investor
has their own classic G-account** as the bridge intermediate; the keypair is
platform-held but per-user, AES-256-GCM-encrypted under `OFFRAMP_KEYRING_SECRET`.

1. Frontend creates a quote: `POST /api/ramp/offramp/quotes`
2. Frontend creates an order with `useAnchor: true`:
   `POST /api/ramp/offramp/orders`. EtherFuse returns `withdrawAnchorAccount`,
   `withdrawMemo`, `withdrawMemoType="hash"`.
3. Frontend asks backend to prepare TX 1: `POST /offramp/orders/:id/prepare-tx`.
   Backend calls `InvestorRelayerWalletService.ensureProvisioned(investorId)`:
   - If the investor has no relayer G yet: generates a fresh Stellar keypair,
     AES-256-GCM-encrypts the seed, persists, and submits a sponsored
     multi-op TX (BeginSponsoring → CreateAccount → ChangeTrust × 2 →
     EndSponsoring) so the new G exists on-chain with TESOURO + USDC
     trustlines. **This adds ~3-5s to the first-ever off-ramp.**
   - If trustlines already established: fast-path, no on-chain work.
   - Backend then builds a SAC `transfer()` from the investor's C-address to
     the per-investor relayer G. **No memo on TX 1.**
4. Investor signs TX 1 with passkey.
5. Frontend submits the signed TX: `POST /offramp/orders/:id/submit-tx`.
   Backend runs the bridge **synchronously**:
   - **TX 1**: submits the SAC transfer. The investor's per-investor G
     gains `amount` of the asset.
   - **TX 2**: backend decrypts the investor's relayer keypair, builds an
     inner classic `payment` op from that G to `withdrawAnchorAccount`
     with `Memo.hash(decode(withdrawMemo))`, signs with the investor's
     keypair, and wraps the whole thing in a **fee bump** signed by the
     ops keypair (so per-investor Gs never need to hold XLM).
6. EtherFuse's anchor monitor detects the classic payment credit, marks the
   order `funded`, and initiates the PIX payout.
7. PIX clears → order → `completed` → `finalized` after the reversal window.

Hash storage on `RampOrder`:
- `pixInstructions.relayerHoldTxHash` — TX 1 (Soroban SAC transfer)
- `burnTransaction` — TX 2 (classic fee-bumped anchor payment; the hash
  EtherFuse references)
- `confirmedTxSignature` — set by EtherFuse via webhook

## ⚠ The master key

`OFFRAMP_KEYRING_SECRET` is the AES-256-GCM key encrypting every per-investor
relayer seed. **Loss of this key = permanent loss of access to every relayer
G = stranded funds, forever.** This is the highest-severity operational risk
on the platform.

Per-investor relayer Gs only ever hold tokens for ~10 seconds during an
off-ramp, so the blast radius of key loss is "in-flight off-ramps" (small)
plus "any tokens previously stranded on per-investor relayers" (should be
zero, since we run the recovery procedure on strands). But the key is also
needed for any future recovery, so don't lose it.

### Generating the master key

One-time:

```bash
openssl rand -base64 32
```

Set as `OFFRAMP_KEYRING_SECRET` in the backend env. The value MUST be base64
of a 32-byte buffer — the service rejects anything else.

### Backing it up

The key must exist in at least two trusted, non-overlapping locations. Suggested
v1 setup:

1. Primary: env var on production backend (loaded from secret manager / vault)
2. Backup #1: encrypted file in a separate org-controlled vault (e.g.
   1Password Business "Master Keys" vault, restricted to founder + 1 trusted
   ops)
3. Backup #2: offline copy (printed QR code in a safe deposit box, or split
   via Shamir 2-of-3 across hardware security keys)

Document who has which backup in your security register. Test recovery
quarterly.

### Rotation

The schema includes `encryptionVersion` for forward-compat:

- v1 (current): direct AES-256-GCM under `OFFRAMP_KEYRING_SECRET`
- v2 (planned, see ROADMAP): KMS-managed envelope encryption

Rotation procedure (when needed):
1. Stand up a re-encryption script that reads all rows with version=N,
   decrypts under the old scheme, re-encrypts under the new, writes back
   with version=N+1.
2. Run during low-traffic window with backups taken.
3. Decommission the old key only after every row is on N+1 AND a backfill
   reconciliation pass confirms it.

## Enabling off-ramp in production

Pre-flight checklist:

- [ ] **`OFFRAMP_KEYRING_SECRET` set** and backed up to at least 2 locations
- [ ] Ops keypair holds ≥ 10 XLM (covers provisioning sponsorship for
      ~5 investors at 2 XLM each + fee bumps; top up monthly based on usage)
- [ ] `ENABLE_OFFRAMP=true` set in production env
- [ ] `ETHERFUSE_TESOURO_ASSET_IDENTIFIER` matches mainnet asset (same env
      var used by the on-ramp — verify it's mainnet TESOURO, not sandbox)
- [ ] `USDC_CONTRACT_ID` and `USDC_ISSUER` point at mainnet Circle USDC
- [ ] At least one investor onboarded with mainnet-grade KYC for smoke test
- [ ] Webhook delivery verified for off-ramp events (`order_updated` with
      `offramp` orderType)
- [ ] Frontend deployed with `WithdrawDialog` mounted

After enabling:

- Smoke-test with one ~R$ 1 off-ramp using the operator's own account
- Verify `investor_relayer_wallets` row appears with `trustlines_established=true`
- Verify the on-chain provisioning TX completed (`provisioning_tx_hash`
  populated)
- Monitor logs for `RELAYER_STRANDED`, `RampOfframpError`, and
  `EtherFuseApiError` for 24 hours
- Verify webhook latency p95 stays < 30s (anchor → funded)

## Incident: RELAYER_STRANDED (TX 1 succeeded, TX 2 failed)

**Symptom**: Investor signed and submitted TX 1, but `submitOfframpTx`
returned a `relayer_stranded` error. The order shows
`pixInstructions.relayerHoldTxHash` set but `burnTransaction` null. The
investor's C-address balance decreased; the per-investor G has the tokens.

This is the highest-severity off-ramp incident, but lower-blast-radius than
the shared-relayer version: funds are stranded **on the investor's own G**,
not commingled with other investors' funds.

**Diagnosis**:

1. Pull the order: `SELECT id, status, pix_instructions, burn_transaction, withdraw_anchor_account, source_asset, amount_in_tokens FROM ramp_order WHERE id = ?;`
2. Pull the relayer: `SELECT public_key, trustlines_established FROM investor_relayer_wallets WHERE investor_id = ?;`
3. Read the `RELAYER_STRANDED` log line — it has TX 1 hash + recovery details.
4. Confirm on Stellar Expert that the per-investor G has the asset balance.
5. Read the original TX 2 error: what did it fail on?
   - `op_no_trust` on the anchor → EtherFuse's anchor doesn't have a
     trustline for the asset. Should never happen for TESOURO/USDC.
   - `tx_failed` with `op_underfunded` → TX 1 didn't actually credit the G
     (race with sequence numbers). Retry after a few seconds.
   - `tx_bad_seq` → sequence collision; retry.
   - `tx_internal_error` → Stellar protocol issue; retry.

**Recovery**: re-run TX 2 manually with the investor's relayer keypair.

```js
// One-shot from a Node REPL inside the backend container:
const [orderId, investorId] = [INPUT_ORDER_ID, INPUT_INVESTOR_ID];
import('./src/services/passkeyWallet.service.js').then(async ({ PasskeyWalletService }) => {
  const { InvestorRelayerWalletService } = await import('./src/services/investorRelayerWallet.service.js');
  const prisma = (await import('./src/config/prisma.js')).default;

  const order = await prisma.rampOrder.findUnique({ where: { id: orderId } });
  const assetCode = (order.sourceAsset || '').split(':')[0];
  const memoHashHex = Buffer.from(order.withdrawMemo, 'base64').toString('hex');
  const signingKeypair = await InvestorRelayerWalletService.getKeypair(investorId);

  const result = await PasskeyWalletService.submitRelayerAnchorPayment({
    anchorAccountId: order.withdrawAnchorAccount,
    assetCode,
    amount: order.amountInTokens,
    memoHashHex,
    signingKeypair,
  });
  await prisma.rampOrder.update({
    where: { id: orderId },
    data: { burnTransaction: result.hash, updatedAt: new Date() },
  });
  console.log('Recovered TX 2 hash:', result.hash);
});
```

EtherFuse's webhook will eventually fire `order_updated` with `funded`,
and the normal happy path resumes.

**If recovery is impossible** (e.g. master key lost — see disaster scenario
below — or anchor changed addresses): contact EtherFuse support with
`etherfuseOrderId` and the TX 1 hash for either a manual credit or an
off-platform refund to the investor.

## Incident: order stuck at `created`, TX 1 didn't land

**Symptom**: Investor signed but `submitOfframpTx` returned a non-success
response that's NOT `relayer_stranded`. `RampOrder.pixInstructions.relayerHoldTxHash`
is null. Nothing on-chain.

**Diagnosis**: TX 1 never landed. Common causes:
- Investor's C-address balance changed between quote and signing
- Investor's passkey signing was rejected
- Soroban RPC was unreachable transiently
- **First-off-ramp provisioning failed** — `investor_relayer_wallets` row
  exists with `trustlines_established=false`. Check ops XLM balance and
  Stellar network status.

**Resolution**: investor retries (same order, prepare-tx + sign + submit-tx
again). Tokens never left the wallet. If the provisioning is what's stuck,
the next `ensureProvisioned()` call will re-attempt the multi-op TX.

If they want to abandon: cancel via
`POST /api/ramp/offramp/orders/:id/cancel`. Valid in `created` state only.

## Incident: order stuck at `funded`

**Symptom**: TX 2 confirmed, anchor credited (webhook → `funded`), but PIX
never arrives.

**Diagnosis**:
1. Check EtherFuse status page — what does THEIR side say?
2. Check `RampBankAccount.status` for the investor's bank account. If
   `inactive`, EtherFuse may have rejected the payout.
3. Inspect `RampWebhookEvent` rows for the order — any failed processing?

**Resolution**:
- Bank account issue: contact investor, have them re-register the PIX key
- EtherFuse-side issue: support ticket with `etherfuseOrderId`

## Disaster scenario: `OFFRAMP_KEYRING_SECRET` lost

If the master key is lost AND backups are unrecoverable, every per-investor
relayer G's encrypted seed becomes plaintext-but-undecryptable. The funds on
those Gs are stranded forever from the platform's perspective.

The good news: investor-controlled tokens (in their Soroban C-address) are
unaffected — the smart wallet is passkey-controlled, independent of the
relayer.

The bad news: any tokens currently mid-flight in off-ramp (sitting on a
relayer G) cannot be moved by the platform. And no future off-ramp can be
initiated for existing investors (new investors can be onboarded under a
new master key, but old investors keep referencing the dead one).

Mitigation procedure:
1. Generate a new `OFFRAMP_KEYRING_SECRET` and back it up properly this time.
2. For every existing investor with a relayer wallet row, mark the row as
   `trustlines_established=false` and the row will be re-provisioned on
   next off-ramp (with a fresh keypair under the new key).
3. For any stranded tokens on dead relayer Gs: contact EtherFuse to see if
   they can credit the investor via the still-known order ID; if not,
   manual refund from platform treasury.

This is why the master key backup is critical. **Treat it like the deploy
SSH key for production**.

## Cancellation flow

An investor can cancel an order while `status=created` AND no signing has
occurred. After they submit TX 1, cancellation isn't possible — the tokens
are already on the relayer heading for the anchor.

`/api/ramp/offramp/orders/:id/cancel` calls EtherFuse's cancel endpoint and
updates the local mirror.

## Useful queries

```sql
-- All off-ramp orders for an investor (incl. relayer hashes)
SELECT id, status, source_asset, amount_in_tokens, amount_in_fiat,
       pix_instructions->>'relayerHoldTxHash' AS tx1,
       burn_transaction AS tx2,
       created_at, updated_at
FROM ramp_order
WHERE investor_id = ? AND order_type = 'offramp'
ORDER BY created_at DESC;

-- Investors with provisioned relayer Gs
SELECT i.id, i.email, w.public_key, w.trustlines_established,
       w.provisioning_tx_hash, w.created_at
FROM investors i
JOIN investor_relayer_wallets w ON w.investor_id = i.id
ORDER BY w.created_at DESC;

-- Stranded relayers: TX 1 done, TX 2 not done
SELECT o.id, o.etherfuse_order_id, o.status,
       o.pix_instructions->>'relayerHoldTxHash' AS tx1,
       o.amount_in_tokens, o.source_asset, o.withdraw_anchor_account,
       w.public_key AS relayer_g,
       o.updated_at
FROM ramp_order o
JOIN investor_relayer_wallets w ON w.investor_id = o.investor_id
WHERE o.order_type = 'offramp'
  AND o.status = 'created'
  AND o.pix_instructions->>'relayerHoldTxHash' IS NOT NULL
  AND o.burn_transaction IS NULL;

-- Orders that have not transitioned in > 1 hour
SELECT id, etherfuse_order_id, status, created_at,
       EXTRACT(EPOCH FROM (NOW() - updated_at))/60 AS minutes_since_update
FROM ramp_order
WHERE order_type = 'offramp'
  AND status IN ('created', 'funded')
  AND updated_at < NOW() - INTERVAL '1 hour';
```

## Code map (for the on-call engineer)

| Concern | File |
|---|---|
| Per-investor relayer G management (encrypt/decrypt/provision) | `backend/src/services/investorRelayerWallet.service.js` |
| TX 1 builder (investor C → relayer G SAC transfer) | `backend/src/services/passkeyWallet.service.js#buildWithdrawalTx` |
| TX 1 submit + validator | `backend/src/services/passkeyWallet.service.js#submitWithdrawalTx` (+ `#validateWithdrawalTx`) |
| TX 2 builder + submit (relayer → anchor, classic payment, fee-bumped) | `backend/src/services/passkeyWallet.service.js#submitRelayerAnchorPayment` |
| Classic Asset resolver (used by TX 2 + relayer trustline setup) | `backend/src/services/passkeyWallet.service.js#resolveClassicAsset` |
| Off-ramp orchestration (the bridge) | `backend/src/services/rampOfframp.service.js` (`prepareSigningTx`, `submitSignedTx`) |
| Endpoint handlers | `backend/src/controllers/rampController.js` (`createOfframpQuote` … `cancelOfframpOrder`) |
| Route gate | `backend/src/routes/rampRoutes.js` (`if (process.env.ENABLE_OFFRAMP === 'true')`) |
| Webhook state machine | `backend/src/services/rampOrder.service.js#applyWebhookTransition` |
| Frontend dialog | `frontend/src/components/wallet/WithdrawDialog.tsx#PixOfframpPanel` |
| API client | `frontend/src/api/ramp.ts` (`createOfframpQuote` … `cancelOfframpOrder`) |
| Readiness flag exposure | `backend/src/services/rampKyc.service.js#getReadiness` (`offrampEnabled` field) |
| Schema (DB) | `backend/prisma/schema.prisma` (`InvestorRelayerWallet` model) |
| Roadmap (KMS, PRF, etc.) | `docs/Operations/ROADMAP.md` (Off-Ramp Hardening section) |
