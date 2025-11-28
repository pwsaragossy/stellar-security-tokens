import axios from 'axios';
import { ipfsService } from './ipfs.service.js';

/**
 * Serviço para gerenciar stellar.toml e metadados de assets
 * Segue SEP-1 (Stellar Ecosystem Protocol)
 */
export class StellarTomlService {
  /**
   * Gera conteúdo do stellar.toml para um asset
   * @param {Object} assetInfo - Informações do asset
   * @param {string} assetInfo.code - Código do asset
   * @param {string} assetInfo.issuer - Chave pública do issuer
   * @param {string} assetInfo.name - Nome do asset
   * @param {string} assetInfo.description - Descrição
   * @param {string} [assetInfo.image] - URL da imagem
   * @param {Object} [assetInfo.ipfsDocuments] - Documentos IPFS
   * @param {Object} [assetInfo.conditions] - Condições e termos
   * @param {number} [assetInfo.decimals=7] - Casas decimais
   * @returns {string} Conteúdo do stellar.toml
   */
  static generateToml(assetInfo) {
    const {
      code,
      issuer,
      name,
      description,
      image,
      ipfsDocuments = {},
      conditions = {},
      decimals = 7,
    } = assetInfo;

    let toml = `# Stellar.toml for ${code}
# Generated automatically - DO NOT EDIT MANUALLY

VERSION="2.0.0"

# Asset Information
[[CURRENCIES]]
code = "${code}"
issuer = "${issuer}"
display_decimals = ${decimals}
name = "${name}"
desc = "${description || ''}"
`;

    if (image) {
      toml += `image = "${image}"\n`;
    }

    // Adicionar documentos IPFS
    if (ipfsDocuments.contract) {
      toml += `\n# Legal Documents (IPFS)\n`;
      toml += `ipfs_contract_hash = "${ipfsDocuments.contract.hash}"\n`;
      toml += `ipfs_contract_url = "${ipfsService.getGatewayUrl(ipfsDocuments.contract.hash)}"\n`;
    }

    if (ipfsDocuments.terms) {
      toml += `ipfs_terms_hash = "${ipfsDocuments.terms.hash}"\n`;
      toml += `ipfs_terms_url = "${ipfsService.getGatewayUrl(ipfsDocuments.terms.hash)}"\n`;
    }

    if (ipfsDocuments.prospectus) {
      toml += `ipfs_prospectus_hash = "${ipfsDocuments.prospectus.hash}"\n`;
      toml += `ipfs_prospectus_url = "${ipfsService.getGatewayUrl(ipfsDocuments.prospectus.hash)}"\n`;
    }

    // Adicionar condições e termos
    if (Object.keys(conditions).length > 0) {
      toml += `\n# Terms and Conditions\n`;
      if (conditions.annual_interest_rate) {
        toml += `annual_interest_rate = "${conditions.annual_interest_rate}"\n`;
      }
      if (conditions.min_investment) {
        toml += `min_investment = "${conditions.min_investment}"\n`;
      }
      if (conditions.max_investment) {
        toml += `max_investment = "${conditions.max_investment}"\n`;
      }
      if (conditions.loan_term) {
        toml += `loan_term_months = "${conditions.loan_term}"\n`;
      }
    }

    // Adicionar informações de compliance
    toml += `\n# Compliance\n`;
    toml += `auth_required = true\n`;
    toml += `auth_revocable = true\n`;
    toml += `auth_clawback_enabled = true\n`;

    // Timestamp de criação
    toml += `\n# Metadata\n`;
    toml += `created_at = "${new Date().toISOString()}"\n`;

    return toml;
  }

  /**
   * Resolve stellar.toml de um home domain
   * @param {string} homeDomain - Home domain do issuer
   * @returns {Promise<Object>} Conteúdo parseado do TOML
   * @throws {Error} Se não conseguir resolver
   */
  static async resolveToml(homeDomain) {
    try {
      const url = `https://${homeDomain}/.well-known/stellar.toml`;
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'Accept': 'text/plain, application/toml',
        },
      });

      return this.parseToml(response.data);
    } catch (error) {
      throw new Error(`Failed to resolve stellar.toml from ${homeDomain}: ${error.message}`);
    }
  }

  /**
   * Parse básico de TOML (simplificado)
   * Para produção, considere usar biblioteca como 'toml'
   * @param {string} tomlContent - Conteúdo do TOML
   * @returns {Object} Objeto parseado
   */
  static parseToml(tomlContent) {
    const result = {
      CURRENCIES: [],
    };

    const lines = tomlContent.split('\n');
    let currentCurrency = null;
    let inCurrencySection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Ignorar comentários e linhas vazias
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Detectar início de seção CURRENCIES
      if (trimmed === '[[CURRENCIES]]') {
        if (currentCurrency) {
          result.CURRENCIES.push(currentCurrency);
        }
        currentCurrency = {};
        inCurrencySection = true;
        continue;
      }

      // Parse de chave = valor
      if (inCurrencySection && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');

        if (key && value) {
          currentCurrency[key.trim()] = value;
        }
      }
    }

    if (currentCurrency) {
      result.CURRENCIES.push(currentCurrency);
    }

    return result;
  }

  /**
   * Busca informações de asset incluindo documentos IPFS
   * @param {string} assetCode - Código do asset
   * @param {string} issuerPublicKey - Chave pública do issuer
   * @param {string} homeDomain - Home domain do issuer
   * @returns {Promise<Object>} Informações completas do asset
   */
  static async getAssetInfo(assetCode, issuerPublicKey, homeDomain) {
    try {
      const toml = await this.resolveToml(homeDomain);
      const currency = toml.CURRENCIES.find(c =>
        c.code === assetCode && c.issuer === issuerPublicKey
      );

      if (!currency) {
        throw new Error(`Asset ${assetCode} not found in stellar.toml`);
      }

      // Extrair documentos IPFS
      const ipfsDocuments = {};
      if (currency.ipfs_contract_hash) {
        ipfsDocuments.contract = {
          hash: currency.ipfs_contract_hash,
          url: currency.ipfs_contract_url || ipfsService.getGatewayUrl(currency.ipfs_contract_hash),
        };
      }
      if (currency.ipfs_terms_hash) {
        ipfsDocuments.terms = {
          hash: currency.ipfs_terms_hash,
          url: currency.ipfs_terms_url || ipfsService.getGatewayUrl(currency.ipfs_terms_hash),
        };
      }
      if (currency.ipfs_prospectus_hash) {
        ipfsDocuments.prospectus = {
          hash: currency.ipfs_prospectus_hash,
          url: currency.ipfs_prospectus_url || ipfsService.getGatewayUrl(currency.ipfs_prospectus_hash),
        };
      }

      return {
        code: currency.code,
        issuer: currency.issuer,
        name: currency.name,
        description: currency.desc,
        image: currency.image,
        ipfsDocuments,
        conditions: {
          annual_interest_rate: currency.annual_interest_rate,
          min_investment: currency.min_investment,
          max_investment: currency.max_investment,
          loan_term_months: currency.loan_term_months,
        },
      };
    } catch (error) {
      throw new Error(`Failed to get asset info: ${error.message}`);
    }
  }

  /**
   * Verifica integridade de documento IPFS
   * @param {string} ipfsHash - Hash IPFS
   * @param {Buffer} expectedContent - Conteúdo esperado (opcional)
   * @returns {Promise<Object>} { valid: boolean, hash: string, content: Buffer }
   */
  static async verifyIPFSDocument(ipfsHash, expectedContent = null) {
    try {
      if (!ipfsService.isValidHash(ipfsHash)) {
        return { valid: false, error: 'Invalid IPFS hash format' };
      }

      const content = await ipfsService.fetchFile(ipfsHash);

      // Se conteúdo esperado fornecido, comparar
      if (expectedContent) {
        const isValid = Buffer.compare(content, expectedContent) === 0;
        return {
          valid: isValid,
          hash: ipfsHash,
          content,
          error: isValid ? null : 'Content mismatch',
        };
      }

      return {
        valid: true,
        hash: ipfsHash,
        content,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}

