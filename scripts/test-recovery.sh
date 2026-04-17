#!/bin/bash
# ============================================================
# SMART WALLET RECOVERY TEST — End-to-End
#
# Proves: A user can recover funds from their smart wallet
# using only a backup ed25519 key + Stellar CLI,
# WITHOUT Radox servers running.
# ============================================================

STELLAR="/opt/homebrew/Cellar/stellar-cli/26.0.0/bin/stellar"
NETWORK="testnet"
USDC_CONTRACT="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"

echo "╔══════════════════════════════════════════════════════╗"
echo "║    SMART WALLET RECOVERY TEST — 3 Steps             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  STEP 1: Generate backup ed25519 keypair"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Generate a random keypair for backup
$STELLAR keys generate recovery-backup --network $NETWORK --overwrite 2>/dev/null
RECOVERY_ADDR=$($STELLAR keys address recovery-backup 2>/dev/null)

echo "✅ Backup keypair generated."
echo ""
echo "   Public key:  $RECOVERY_ADDR"
echo "   Stored as:   'recovery-backup' in stellar CLI keystore"
echo ""
echo "   Copy this public key for Step 2."
echo ""
read -p "Press ENTER to continue..."
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  STEP 2: Add backup signer (via Radox browser)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  You need Radox running for this step."
echo ""
echo "  1. Log in as a test investor"
echo "  2. Check Settings page for your Wallet Contract ID (C...)"
echo "  3. Open browser console (F12 → Console tab)"
echo "  4. Paste this script:"
echo ""
echo "────────────────── COPY FROM HERE ──────────────────"
cat << 'BROWSER_SCRIPT'
(async () => {
  // ====== REPLACE THESE ======
  const BACKUP_PUBLIC_KEY = "PASTE_YOUR_G_ADDRESS_HERE";
  const WALLET_CONTRACT_ID = "PASTE_YOUR_C_ADDRESS_HERE";
  // ===========================

  const { SmartAccountKit, IndexedDBStorage } = await import('/node_modules/smart-account-kit/dist/index.js');

  const kit = new SmartAccountKit({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    accountWasmHash: 'a12e8fa9621efd20315753bd4007d974390e31fbcb4a7ddc4dd0a0dec728bf2e',
    webauthnVerifierAddress: 'CBSHV66WG7UV6FQVUTB67P3DZUEJ2KJ5X6JKQH5MFRAAFNFJUAJVXJYV',
    storage: new IndexedDBStorage(),
    rpId: location.hostname,
    rpName: 'Radox',
    relayerUrl: '/api/wallets/relay',
  });

  // Connect to wallet — will prompt for passkey
  console.log('🔐 Connecting to wallet (will prompt for passkey)...');
  await kit.connectWallet({ contractId: WALLET_CONTRACT_ID, prompt: true });
  console.log('✅ Connected to wallet:', kit.contractId);

  // Add the ed25519 backup signer to context rule 0
  console.log('📝 Adding backup signer...');
  const result = await kit.signers.addDelegated(0, BACKUP_PUBLIC_KEY);
  console.log('✅ Backup signer added!', result);

  // Verify
  console.log('🔍 Verifying signers on context rule 0...');
  const rule = (await kit.rules.get(0)).result;
  console.log('Context rule 0:', JSON.stringify(rule, null, 2));
})();
BROWSER_SCRIPT
echo ""
echo "────────────────── COPY TO HERE ───────────────────"
echo ""
echo "  5. Your passkey will be prompted — authenticate with Touch ID"
echo "  6. You should see '✅ Backup signer added!' in console"
echo ""
read -p "Did it work? Press ENTER when the signer is added..."
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  STEP 3: RECOVERY — No Radox, CLI only"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ⛔ STOP Docker. Close the browser. Radox is 'dead'."
echo ""
read -p "Radox is stopped? Press ENTER to attempt recovery..."
echo ""

read -p "Enter your Wallet Contract ID (C...): " WALLET_ID
read -p "Enter destination address (G...): " DESTINATION
read -p "Enter amount (in stroops, e.g., 1000000 = 0.1 USDC): " AMOUNT

echo ""
echo "🔍 Checking USDC balance in smart wallet..."
$STELLAR contract invoke \
  --id $USDC_CONTRACT \
  --network $NETWORK \
  --source-account recovery-backup \
  -- \
  balance \
  --id $WALLET_ID

echo ""
echo "💸 Attempting transfer from smart wallet..."
echo "   From: $WALLET_ID (smart wallet)"
echo "   To:   $DESTINATION"
echo "   Amount: $AMOUNT stroops"
echo ""

$STELLAR contract invoke \
  --id $WALLET_ID \
  --network $NETWORK \
  --source-account recovery-backup \
  -- \
  execute \
  --target $USDC_CONTRACT \
  --fn transfer \
  --from $WALLET_ID \
  --to $DESTINATION \
  --amount $AMOUNT

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ✅ RECOVERY SUCCESSFUL                             ║"
  echo "║                                                      ║"
  echo "║  Funds transferred without Radox servers.            ║"
  echo "║  The backup signer + CLI approach WORKS.             ║"
  echo "╚══════════════════════════════════════════════════════╝"
else
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ❌ TRANSFER FAILED (exit code: $EXIT_CODE)          ║"
  echo "║                                                      ║"
  echo "║  Check error above. Possible causes:                ║"
  echo "║  - Wrong contract method name (check ABI)           ║"
  echo "║  - Signer not on correct context rule               ║"
  echo "║  - Contract args format issue                       ║"
  echo "║  - Insufficient funds                               ║"
  echo "║                                                      ║"
  echo "║  We may need to adjust the CLI invocation.           ║"
  echo "╚══════════════════════════════════════════════════════╝"
fi
