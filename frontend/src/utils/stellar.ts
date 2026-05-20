// Detect network from environment
export function getStellarNetwork(): 'testnet' | 'public' {
  const network = import.meta.env.VITE_STELLAR_NETWORK || 'testnet';
  return network === 'public' ? 'public' : 'testnet';
}

// Generate Stellar Explorer URL for transaction
export function getStellarExplorerTxUrl(txHash: string): string {
  const network = getStellarNetwork();
  const baseUrl = network === 'testnet' 
    ? 'https://stellar.expert/explorer/testnet/tx'
    : 'https://stellar.expert/explorer/public/tx';
  return `${baseUrl}/${txHash}`;
}

// Generate Stellar Explorer URL for account
export function getStellarExplorerAccountUrl(publicKey: string): string {
  const network = getStellarNetwork();
  const baseUrl = network === 'testnet'
    ? 'https://stellar.expert/explorer/testnet/account'
    : 'https://stellar.expert/explorer/public/account';
  return `${baseUrl}/${publicKey}`;
}

// Generate Stellar Explorer URL for asset
export function getStellarExplorerAssetUrl(assetCode: string, issuerPublicKey: string): string {
  const network = getStellarNetwork();
  const baseUrl = network === 'testnet'
    ? 'https://stellar.expert/explorer/testnet/asset'
    : 'https://stellar.expert/explorer/public/asset';
  return `${baseUrl}/${assetCode}-${issuerPublicKey}`;
}

/**
 * Format Stellar public key for display.
 *
 * @deprecated In React contexts, prefer `<AddressDisplay value={key} />` from
 * `@/components/ui/AddressDisplay` — it renders the full address on hover via
 * Radix Tooltip, which mitigates address-poisoning attacks (Caroline Cardoso,
 * Stellar 37º audit F-013). This helper is kept for non-React contexts (logs,
 * toast messages, plain string templates).
 */
export function formatStellarPublicKey(publicKey: string, start: number = 8, end: number = 8): string {
  if (!publicKey) return '';
  if (publicKey.length <= start + end) return publicKey;
  return `${publicKey.slice(0, start)}...${publicKey.slice(-end)}`;
}

// Validate Stellar memo (max 28 characters)
export function isValidStellarMemo(memo: string): boolean {
  return memo.length <= 28;
}

