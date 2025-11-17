import axios from 'axios';

/**
 * Serviço para integração com IPFS
 * Suporta múltiplos gateways IPFS
 */
export class IPFSService {
  /**
   * Gateways IPFS públicos disponíveis
   */
  static GATEWAYS = [
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://dweb.link/ipfs/',
  ];

  /**
   * Faz upload de arquivo para IPFS
   * @param {Buffer|string} fileContent - Conteúdo do arquivo (Buffer ou string)
   * @param {string} fileName - Nome do arquivo
   * @param {Object} options - Opções adicionais
   * @param {string} [options.pinataApiKey] - API Key do Pinata (opcional)
   * @param {string} [options.pinataSecretKey] - Secret Key do Pinata (opcional)
   * @returns {Promise<Object>} { hash, url, gateway }
   * @throws {Error} Se o upload falhar
   */
  static async uploadFile(fileContent, fileName, options = {}) {
    try {
      // Se Pinata credentials fornecidas, usar Pinata
      if (options.pinataApiKey && options.pinataSecretKey) {
        return await this.uploadToPinata(fileContent, fileName, options);
      }

      // Caso contrário, usar gateway público (requer IPFS node local ou outro serviço)
      // Por enquanto, retornamos estrutura para implementação futura
      throw new Error('IPFS upload requires Pinata credentials or local IPFS node');
    } catch (error) {
      console.error('IPFS upload error:', error);
      throw new Error(`Failed to upload to IPFS: ${error.message}`);
    }
  }

  /**
   * Faz upload para Pinata (serviço gerenciado de IPFS)
   * @param {Buffer|string} fileContent - Conteúdo do arquivo
   * @param {string} fileName - Nome do arquivo
   * @param {Object} options - Opções
   * @returns {Promise<Object>} { hash, url, gateway }
   * @private
   */
  static async uploadToPinata(fileContent, fileName, options) {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    formData.append('file', fileContent, {
      filename: fileName,
      contentType: this.getContentType(fileName),
    });

    // Metadados opcionais
    if (options.metadata) {
      formData.append('pinataMetadata', JSON.stringify({
        name: fileName,
        ...options.metadata,
      }));
    }

    try {
      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
          headers: {
            'pinata_api_key': options.pinataApiKey,
            'pinata_secret_api_key': options.pinataSecretKey,
            ...formData.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const hash = response.data.IpfsHash;
      const gateway = options.gateway || this.GATEWAYS[0];

      return {
        hash,
        url: `${gateway}${hash}`,
        gateway,
        pinataUrl: `https://gateway.pinata.cloud/ipfs/${hash}`,
      };
    } catch (error) {
      if (error.response) {
        throw new Error(`Pinata API error: ${error.response.data?.error || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Faz upload de múltiplos arquivos para IPFS
   * @param {Array<{content: Buffer|string, fileName: string}>} files - Array de arquivos
   * @param {Object} options - Opções
   * @returns {Promise<Array<Object>>} Array de resultados
   */
  static async uploadFiles(files, options = {}) {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.uploadFile(file.content, file.fileName, options);
        results.push({
          fileName: file.fileName,
          ...result,
        });
      } catch (error) {
        results.push({
          fileName: file.fileName,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Busca arquivo do IPFS
   * @param {string} hash - Hash IPFS (CID)
   * @param {string} [gateway] - Gateway específico (opcional)
   * @returns {Promise<Buffer>} Conteúdo do arquivo
   * @throws {Error} Se a busca falhar
   */
  static async fetchFile(hash, gateway = null) {
    const gateways = gateway ? [gateway] : this.GATEWAYS;

    for (const gw of gateways) {
      try {
        const url = `${gw}${hash}`;
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.warn(`Failed to fetch from gateway ${gw}:`, error.message);
        continue;
      }
    }

    throw new Error(`Failed to fetch IPFS file ${hash} from all gateways`);
  }

  /**
   * Verifica se hash IPFS é válido
   * @param {string} hash - Hash IPFS
   * @returns {boolean} True se válido
   */
  static isValidHash(hash) {
    if (!hash || typeof hash !== 'string') {
      return false;
    }
    // IPFS CID v0 (Qm...) ou CID v1 (bafy...)
    const cidV0Pattern = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const cidV1Pattern = /^b[a-z0-9]{58,}$/;
    const cidV1ZPattern = /^z[a-z0-9]{58,}$/;
    return cidV0Pattern.test(hash) || cidV1Pattern.test(hash) || cidV1ZPattern.test(hash);
  }

  /**
   * Gera URL IPFS
   * @param {string} hash - Hash IPFS
   * @param {string} [gateway] - Gateway específico
   * @returns {string} URL completa
   */
  static getIPFSURL(hash, gateway = null) {
    const gw = gateway || this.GATEWAYS[0];
    return `${gw}${hash}`;
  }

  /**
   * Detecta content type baseado na extensão do arquivo
   * @param {string} fileName - Nome do arquivo
   * @returns {string} Content type
   * @private
   */
  static getContentType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const types = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      json: 'application/json',
      xml: 'application/xml',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Valida estrutura de documentos legais
   * @param {Object} legalDocuments - Objeto com documentos
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  static validateLegalDocuments(legalDocuments) {
    const errors = [];
    const requiredFields = ['contract', 'terms'];

    if (!legalDocuments || typeof legalDocuments !== 'object') {
      return { valid: false, errors: ['Legal documents must be an object'] };
    }

    for (const field of requiredFields) {
      if (!legalDocuments[field]) {
        errors.push(`Missing required document: ${field}`);
      } else if (!legalDocuments[field].hash) {
        errors.push(`Missing IPFS hash for ${field}`);
      } else if (!this.isValidHash(legalDocuments[field].hash)) {
        errors.push(`Invalid IPFS hash for ${field}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

