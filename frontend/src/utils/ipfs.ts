// IPFS gateway URL
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

// Generate IPFS URL from hash
export function getIPFSUrl(hash: string): string {
  if (!hash) return '';
  if (hash.startsWith('http')) return hash;
  return `${IPFS_GATEWAY}${hash}`;
}

// Verify IPFS hash format (CID)
export function isValidIPFSHash(hash: string): boolean {
  // Basic CID validation (starts with Qm for v0 or has specific length for v1)
  return hash.length >= 32 && hash.length <= 64;
}

// Extract hash from IPFS URL
export function extractIPFSHash(url: string): string {
  if (!url) return '';
  const match = url.match(/ipfs\/([^\/]+)/);
  return match ? match[1] : url;
}

// Format IPFS document for display
export function formatIPFSDocument(doc: { hash: string; url: string; fileName?: string }): {
  hash: string;
  url: string;
  displayName: string;
} {
  return {
    hash: doc.hash,
    url: getIPFSUrl(doc.hash),
    displayName: doc.fileName || 'Documento',
  };
}

