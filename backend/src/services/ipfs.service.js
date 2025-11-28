import pinataSDK from '@pinata/sdk';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

/**
 * Service for interacting with IPFS via Pinata
 * Used for storing legal documents and collateral evidence
 */
export class IpfsService {
  constructor() {
    const apiKey = process.env.PINATA_API_KEY;
    const secretKey = process.env.PINATA_SECRET_API_KEY;

    if (apiKey && secretKey) {
      this.pinata = new pinataSDK(apiKey, secretKey);
      this.isEnabled = true;
    } else {
      console.warn('Pinata API keys not found. IPFS service running in mock mode.');
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
      console.log(`[MOCK IPFS] Uploaded ${fileName} with metadata:`, metadata);
      return {
        ipfsHash: mockHash,
        url: this.getGatewayUrl(mockHash),
      };
    }

    try {
      // Create readable stream from buffer
      const stream = Readable.from(fileBuffer);
      stream.path = fileName; // Pinata needs a path/name

      const options = {
        pinataMetadata: {
          name: fileName,
          keyvalues: {
            ...metadata,
            uploadedAt: new Date().toISOString(),
          },
        },
        pinataOptions: {
          cidVersion: 0,
        },
      };

      const result = await this.pinata.pinFileToIPFS(stream, options);

      return {
        ipfsHash: result.IpfsHash,
        url: this.getGatewayUrl(result.IpfsHash),
      };
    } catch (error) {
      console.error('IPFS upload failed:', error);
      throw new Error(`Failed to upload file to IPFS: ${error.message}`);
    }
  }

  /**
   * Get public gateway URL for an IPFS hash
   * @param {string} hash - IPFS hash (CID)
   * @returns {string}
   */
  getGatewayUrl(hash) {
    return `https://gateway.pinata.cloud/ipfs/${hash}`;
  }

  /**
   * Test connection to Pinata
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    if (!this.isEnabled) return true;
    try {
      const result = await this.pinata.testAuthentication();
      return result.authenticated;
    } catch (error) {
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


