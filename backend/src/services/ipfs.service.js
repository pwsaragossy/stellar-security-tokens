import { PinataSDK } from 'pinata-web3';
import dotenv from 'dotenv';
import { Blob } from 'buffer';
import path from 'path';
import logger from '../utils/logger.js';
const log = logger.scope('IPFSService');

// Load env vars if not already loaded
if (!process.env.PINATA_JWT) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
  dotenv.config();
}

/**
 * Service for interacting with IPFS via Pinata
 * Used for storing legal documents and collateral evidence
 */
export class IpfsService {
  constructor() {
    const pinataJwt = process.env.PINATA_JWT;
    const pinataGateway = process.env.PINATA_GATEWAY || 'gateway.pinata.cloud';

    if (pinataJwt) {
      this.pinata = new PinataSDK({
        pinataJwt: pinataJwt,
        pinataGateway: pinataGateway,
      });
      this.isEnabled = true;
    } else {
      log.warn('PINATA_JWT not found in environment variables. IPFS service running in mock mode.');
      log.warn('Please migrate from PINATA_API_KEY/SECRET to PINATA_JWT for the new SDK.');
      this.isEnabled = false;
    }
  }

  /**
   * Upload file to IPFS
   * @param {Buffer} fileBuffer - File content
   * @param {string} fileName - Original file name
   * @param {Object} metadata - Key-value metadata (companyId, offerId, type)
   * @returns {Promise<{ipfsHash: string, url: string}>}
   */
  async uploadFile(fileBuffer, fileName, metadata = {}) {
    if (!this.isEnabled) {
      // Mock implementation for development without keys
      const mockHash = 'Qm' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      log.info(`[MOCK IPFS] Uploaded ${fileName} with metadata:`, metadata);
      return {
        ipfsHash: mockHash,
        url: this.getGatewayUrl(mockHash),
      };
    }

    try {
      // Convert Buffer to Blob/File for pinata-web3
      const blob = new Blob([fileBuffer]);
      // Iterate to add file object property if needed or just pass blob
      // pinata-web3 upload.file accepts File or Blob

      // Construct metadata keyvalues ensuring strings
      const keyValues = {};
      for (const [key, value] of Object.entries(metadata)) {
        keyValues[key] = String(value);
      }
      keyValues.uploadedAt = new Date().toISOString();

      // For Node.js we can create a File-like object or just pass blob with name
      // The SDK signature: upload.file(file: File | Blob)
      // We attach the name via a File object construction or hacked blob if File is not global
      const file = new File([blob], fileName, { type: 'application/octet-stream' });

      const upload = await this.pinata.upload.file(file).addMetadata({
        name: fileName,
        keyValues: keyValues,
      });

      return {
        ipfsHash: upload.IpfsHash,
        url: this.getGatewayUrl(upload.IpfsHash),
      };
    } catch (error) {
      log.error('IPFS upload failed:', error);
      throw new Error(`Failed to upload file to IPFS: ${error.message}`);
    }
  }

  /**
   * Get public gateway URL for an IPFS hash
   * @param {string} hash - IPFS hash (CID)
   * @returns {string}
   */
  getGatewayUrl(hash) {
    // Determine gateway domain from env or default
    const gateway = process.env.PINATA_GATEWAY || 'gateway.pinata.cloud';
    return `https://${gateway}/ipfs/${hash}`;
  }

  /**
   * Test connection to Pinata
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    if (!this.isEnabled) {
      log.warn('Cannot test connection: IPFS service is in mock mode (missing PINATA_JWT)');
      return false;
    }
    try {
      const result = await this.pinata.testAuthentication();
      return result.message === 'Congratulations! You are communicating with the Pinata API!';
    } catch (error) {
      log.error('Pinata authentication failed:', error.message);
      return false;
    }
  }

  /**
   * Check if string is a valid IPFS hash (CID)
   * @param {string} hash 
   * @returns {boolean}
   */
  isValidHash(hash) {
    // Basic check for CIDv0 (Qm...) or CIDv1 (b...)
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[A-Za-z2-7]{58,}|B[A-Z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,})$/.test(hash);
  }

  /**
   * Fetch file content from IPFS gateway
   * @param {string} hash 
   * @returns {Promise<Buffer>}
   */
  async fetchFile(hash) {
    const url = this.getGatewayUrl(hash);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch IPFS file: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

// Export singleton instance
export const ipfsService = new IpfsService();


