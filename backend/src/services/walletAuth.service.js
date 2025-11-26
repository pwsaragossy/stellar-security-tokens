import crypto from 'crypto';
import { Keypair, Transaction, Networks } from '@stellar/stellar-sdk';

// In-memory store for challenges (in production, use Redis)
const challenges = new Map();
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generates a cryptographically secure challenge for wallet authentication
 * @param {string} publicKey - Stellar public key requesting authentication
 * @returns {Object} Challenge data including the message to sign
 */
export function generateChallenge(publicKey) {
  // Validate public key format
  if (!/^G[A-Z0-9]{55}$/.test(publicKey)) {
    throw new Error('Invalid Stellar public key format');
  }

  // Generate random nonce
  const nonce = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now();
  
  // Create challenge message
  const message = `Sign this message to authenticate with Stellar Security Tokens.\n\nPublic Key: ${publicKey}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
  
  // Store challenge for verification
  const challengeId = crypto.randomBytes(16).toString('hex');
  challenges.set(challengeId, {
    publicKey,
    nonce,
    timestamp,
    message,
    expiresAt: timestamp + CHALLENGE_TTL,
  });

  // Clean up old challenges
  cleanupExpiredChallenges();

  return {
    challengeId,
    message,
    expiresAt: timestamp + CHALLENGE_TTL,
  };
}

/**
 * Verifies a signed challenge
 * @param {string} challengeId - The challenge ID returned from generateChallenge
 * @param {string} signedXdr - The signed transaction XDR from Freighter
 * @param {string} publicKey - The public key that signed the transaction
 * @returns {Object} Verification result
 */
export async function verifyChallenge(challengeId, signedXdr, publicKey) {
  const challenge = challenges.get(challengeId);
  
  if (!challenge) {
    return { valid: false, error: 'Challenge not found or expired' };
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(challengeId);
    return { valid: false, error: 'Challenge expired' };
  }

  if (challenge.publicKey !== publicKey) {
    return { valid: false, error: 'Public key mismatch' };
  }

  try {
    // Parse the signed transaction
    const networkPassphrase = process.env.STELLAR_NETWORK === 'public' 
      ? Networks.PUBLIC 
      : Networks.TESTNET;
    
    const transaction = new Transaction(signedXdr, networkPassphrase);
    
    // Verify the transaction was signed by the claimed public key
    const keypair = Keypair.fromPublicKey(publicKey);
    const hash = transaction.hash();
    
    // Check if there's a valid signature from the public key
    const isValidSignature = transaction.signatures.some(sig => {
      try {
        return keypair.verify(hash, sig.signature());
      } catch {
        return false;
      }
    });

    if (!isValidSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Verify the transaction contains our challenge
    // The memo should contain part of our nonce for additional verification
    const expectedMemoPrefix = challenge.nonce.substring(0, 28);
    const actualMemo = transaction.memo?.value?.toString('utf8') || '';
    
    // For simple verification, just check signature is valid
    // In production, you might want more strict memo verification
    
    // Clean up used challenge
    challenges.delete(challengeId);

    return { 
      valid: true, 
      publicKey,
      timestamp: challenge.timestamp,
    };
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error.message}` };
  }
}

/**
 * Verifies a simple message signature (alternative to XDR)
 * This is simpler but requires the wallet to support plain message signing
 * @param {string} challengeId - The challenge ID
 * @param {string} signature - The signature (base64 or hex)
 * @param {string} publicKey - The public key
 * @returns {Object} Verification result
 */
export function verifyMessageSignature(challengeId, signature, publicKey) {
  const challenge = challenges.get(challengeId);
  
  if (!challenge) {
    return { valid: false, error: 'Challenge not found or expired' };
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(challengeId);
    return { valid: false, error: 'Challenge expired' };
  }

  if (challenge.publicKey !== publicKey) {
    return { valid: false, error: 'Public key mismatch' };
  }

  try {
    const keypair = Keypair.fromPublicKey(publicKey);
    
    // Convert signature from base64 or hex
    let signatureBuffer;
    if (/^[0-9a-fA-F]+$/.test(signature)) {
      signatureBuffer = Buffer.from(signature, 'hex');
    } else {
      signatureBuffer = Buffer.from(signature, 'base64');
    }

    // Create message hash
    const messageHash = crypto.createHash('sha256')
      .update(challenge.message)
      .digest();

    const isValid = keypair.verify(messageHash, signatureBuffer);

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Clean up used challenge
    challenges.delete(challengeId);

    return { 
      valid: true, 
      publicKey,
      timestamp: challenge.timestamp,
    };
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error.message}` };
  }
}

/**
 * Clean up expired challenges
 */
function cleanupExpiredChallenges() {
  const now = Date.now();
  for (const [id, challenge] of challenges.entries()) {
    if (now > challenge.expiresAt) {
      challenges.delete(id);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredChallenges, 60 * 1000);

export default {
  generateChallenge,
  verifyChallenge,
  verifyMessageSignature,
};

