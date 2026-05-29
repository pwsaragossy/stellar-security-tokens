import {
  Horizon,
  Networks,
  Asset,
  TransactionBuilder,
  BASE_FEE,
  Memo,
  rpc,
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

const network = process.env.STELLAR_NETWORK || 'testnet';
const isMainnetNetwork = () => network === 'public' || network === 'mainnet';

/**
 * Resolve Soroban RPC URL. Mainnet requires an explicit SOROBAN_RPC_URL — no public default.
 * @returns {string}
 */
function resolveSorobanRpcUrl() {
  const explicit = process.env.SOROBAN_RPC_URL?.trim();
  if (explicit) {
    return explicit;
  }
  if (isMainnetNetwork()) {
    throw new Error(
      '[StellarConfig] SOROBAN_RPC_URL is required when STELLAR_NETWORK=public. ' +
        'Configure a trusted mainnet RPC provider (e.g. gateway.fm) — do not rely on implicit defaults.',
    );
  }
  return 'https://soroban-testnet.stellar.org';
}

let rawHorizonUrl = (process.env.STELLAR_HORIZON_URL || process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org').trim();
console.log(`[StellarConfig] Raw Horizon URL from ENV: '${rawHorizonUrl}'`);

// ULTRATHINK FIX: Sanitize URL to prevent double pathing (SDK appends /transactions)
// Removes trailing /transactions (with or without slash) and all trailing slashes
// Regex explanation:
// \/transactions\/?$ matches /transactions or /transactions/ at the end
// \/+$ matches one or more slashes at the end
const horizonUrl = rawHorizonUrl.replace(/\/transactions\/?$/, '').replace(/\/+$/, '');
const sorobanRpcUrl = resolveSorobanRpcUrl();

console.log(`[StellarConfig] Using Horizon URL: ${horizonUrl} (${network})`);
export const stellarServer = new Horizon.Server(horizonUrl);

/**
 * Creates a fresh Horizon.Server instance.
 * Use this after transaction submission to avoid connection state issues.
 * @returns {Horizon.Server} Fresh Horizon server instance
 */
export const createFreshServer = () => new Horizon.Server(horizonUrl);

/**
 * Get the Soroban RPC URL for smart contract interactions
 * @returns {string} Soroban RPC URL (testnet default or explicit mainnet URL)
 */
export const getSorobanRpcUrl = () => sorobanRpcUrl;

/**
 * Optional HTTP headers for Soroban RPC (mainnet providers often require X-API-Key).
 * SOROBAN_RPC_API_KEY → X-API-Key header.
 * SOROBAN_RPC_HEADER → arbitrary header as "Name: value".
 * @returns {Record<string, string>}
 */
export const getSorobanRpcHeaders = () => {
  const headers = {};
  const apiKey = process.env.SOROBAN_RPC_API_KEY?.trim();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  const rawHeader = process.env.SOROBAN_RPC_HEADER?.trim();
  if (rawHeader) {
    const colonIdx = rawHeader.indexOf(':');
    if (colonIdx === -1) {
      throw new Error('[StellarConfig] SOROBAN_RPC_HEADER must be formatted as "Name: value"');
    }
    const name = rawHeader.slice(0, colonIdx).trim();
    const value = rawHeader.slice(colonIdx + 1).trim();
    if (!name) {
      throw new Error('[StellarConfig] SOROBAN_RPC_HEADER must include a header name');
    }
    headers[name] = value;
  }
  return headers;
};

/**
 * Create a configured Soroban RPC client (central factory for all backend services).
 * @param {Object} [options]
 * @param {boolean} [options.allowHttp] - Allow http:// RPC URLs (auto-detected when unset)
 * @returns {rpc.Server}
 */
export const getSorobanServer = (options = {}) => {
  const headers = getSorobanRpcHeaders();
  const allowHttp =
    options.allowHttp ??
    (process.env.SOROBAN_RPC_ALLOW_HTTP === 'true' || sorobanRpcUrl.startsWith('http://'));

  /** @type {{ allowHttp: boolean, headers?: Record<string, string> }} */
  const serverOptions = { allowHttp };
  if (Object.keys(headers).length > 0) {
    serverOptions.headers = headers;
  }
  return new rpc.Server(sorobanRpcUrl, serverOptions);
};

/**
 * Check if currently configured for testnet
 * @returns {boolean} True if on testnet, false if on mainnet/public
 */
export const isTestnet = () => network === 'testnet';

/**
 * Obtém o passphrase da rede Stellar baseado na configuração
 * @returns {string} Passphrase da rede (TESTNET ou PUBLIC)
 */
export const getNetworkPassphrase = () => {
  return network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
};

// Circle USDC Issuer addresses (official)
// https://developers.circle.com/stablecoins/usdc-on-stellar
const USDC_ISSUERS = {
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
};

/**
 * Get the USDC issuer for the current network
 * Uses env variable if explicitly set, otherwise auto-detects based on STELLAR_NETWORK
 * @returns {string} USDC issuer public key
 */
export const getUsdcIssuer = () => {
  // Allow env override for custom USDC (testing), but default to Circle
  // Check for non-empty to allow automatic detection when not explicitly set
  if (process.env.USDC_ISSUER && process.env.USDC_ISSUER.trim()) {
    return process.env.USDC_ISSUER.trim();
  }
  // Auto-detect based on network
  const selectedIssuer = network === 'testnet' ? USDC_ISSUERS.testnet : USDC_ISSUERS.mainnet;
  console.log(`[StellarConfig] Auto-detected USDC issuer for ${network}: ${selectedIssuer}`);
  return selectedIssuer;
};

/**
 * Get the USDC Asset object for the current network
 * @returns {Asset} USDC Asset configured for current network
 */
export const getUsdcAsset = () => {
  return new Asset('USDC', getUsdcIssuer());
};

import { keyManager } from '../services/KeyManager.js';

/**
 * Obtém o keypair da conta emissora usando o KeyManager
 * @returns {Keypair} Keypair da conta emissora
 */
export const getIssuerKeypair = () => {
  return keyManager.getIssuerKeypair();
};

/**
 * Obtém o keypair da conta distribuidora usando o KeyManager
 * @returns {Keypair} Keypair da conta distribuidora
 */
export const getDistributorKeypair = () => {
  return keyManager.getDistributorKeypair();
};

/**
 * Obtém o keypair da conta treasury usando o KeyManager
 * @returns {Keypair} Keypair da conta treasury
 */
export const getTreasuryKeypair = () => {
  return keyManager.getTreasuryKeypair();
};

/**
 * Get the treasury public key (works in both env and multisig modes)
 * Use this when you only need the address, not signing capability
 * @returns {string} Treasury public key
 */
export const getTreasuryPublicKey = () => {
  return keyManager.getPublicKey('TREASURY');
};

/**
 * Obtém o keypair da conta de operações (Gas/Taxas) usando o KeyManager
 * @returns {Keypair} Keypair da conta de operações
 */
export const getOperationsKeypair = () => {
  return keyManager.getOperationsKeypair();
};

/**
 * Cria um objeto Asset do Stellar SDK
 * @param {string} code - Código do asset (ex: 'REIT01', 'USDC')
 * @param {string} issuerPublicKey - Chave pública da conta emissora
 * @returns {Asset} Objeto Asset configurado
 */
export const createAsset = (code, issuerPublicKey) => {
  return new Asset(code, issuerPublicKey);
};

/**
 * Constrói uma transação Stellar com as operações fornecidas
 * @param {Keypair} sourceKeypair - Keypair da conta origem
 * @param {Operation[]} operations - Array de operações Stellar a incluir na transação
 * @param {Object} [options] - Opções adicionais
 * @param {string|Memo} [options.memo] - Memo para a transação (string ou objeto Memo)
 * @returns {Promise<Transaction>} Transação construída e pronta para assinatura
 * @throws {Error} Se houver erro ao carregar a conta ou construir a transação
 */
export const buildTransaction = async (sourceKeypair, operations, options = {}) => {
  const sourceAccount = await stellarServer.loadAccount(sourceKeypair.publicKey());
  return buildTransactionWithAccount(sourceAccount, operations, options);
};

/**
 * Build a transaction using an already-loaded account (avoids redundant loadAccount calls)
 * @param {AccountResponse} sourceAccount - Already loaded Stellar account
 * @param {Operation[]} operations - Array of Stellar operations
 * @param {Object} [options] - Additional options
 * @param {string|Memo} [options.memo] - Memo for the transaction
 * @returns {Transaction} Transaction ready for signing
 */
export const buildTransactionWithAccount = (sourceAccount, operations, options = {}) => {
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  });

  operations.forEach(op => transaction.addOperation(op));

  // Adicionar memo se fornecido
  if (options.memo) {
    if (typeof options.memo === 'string') {
      transaction.addMemo(Memo.text(options.memo));
    } else if (options.memo instanceof Memo) {
      transaction.addMemo(options.memo);
    }
  }

  // Default 8h (28800s) — direct-signing completes in <1s so long window is harmless.
  // Multisig TXs need a wide window since admins may take time to review and sign.
  // Per Stellar docs: timebounds should always be finite.
  transaction.setTimeout(options.timeout || 28800);

  return transaction.build();
};

/**
 * Build transaction WITHOUT signing (for multisig/Ledger mode)
 * Returns XDR string for later signing by hardware wallet
 * @param {string} sourcePublicKey - Public key of source account
 * @param {Operation[]} operations - Array of Stellar operations
 * @param {Object} [options] - Additional options
 * @param {string|Memo} [options.memo] - Memo for the transaction
 * @param {number} [options.timeout=300] - Timeout in seconds (5 min default for multisig)
 * @returns {Promise<string>} Unsigned transaction XDR
 */
export const buildUnsignedTransaction = async (sourcePublicKey, operations, options = {}) => {
  const sourceAccount = await stellarServer.loadAccount(sourcePublicKey);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  });

  operations.forEach(op => transaction.addOperation(op));

  // Add memo if provided
  if (options.memo) {
    if (typeof options.memo === 'string') {
      transaction.addMemo(Memo.text(options.memo));
    } else if (options.memo instanceof Memo) {
      transaction.addMemo(options.memo);
    }
  }

  // 8h default — matches buildTransactionWithAccount for multisig compatibility
  transaction.setTimeout(options.timeout || 28800);

  return transaction.build().toXDR();
};

/**
 * Submit a pre-signed transaction to the Stellar network
 * Used for transactions signed externally (Ledger, multisig)
 * @param {string} signedXDR - Signed transaction XDR
 * @returns {Promise<Object>} Submission result
 */
export const submitSignedTransaction = async (signedXDR) => {
  const transaction = TransactionBuilder.fromXDR(signedXDR, getNetworkPassphrase());

  // CRITICAL: Use a fresh server instance to avoid URL mutation issues
  // The SDK modifies stellarServer.serverURL internally during operations,
  // which can cause double /transactions path (405 errors)
  const freshServer = createFreshServer();
  console.log(`[submitSignedTransaction] Using fresh server: ${freshServer.serverURL}`);

  try {
    const result = await freshServer.submitTransaction(transaction);
    return {
      success: true,
      hash: result.hash,
      ledger: result.ledger,
      result: result,
    };
  } catch (error) {
    console.error('Transaction submission error:', error);
    if (error.response && error.response.data) {
      const errorResult = error.response.data.extras?.result_codes;
      const errorMessage = error.response.data.detail || error.message;
      const parsedCodes = parseStellarErrorCodes(errorResult);

      return {
        success: false,
        error: errorMessage,
        userFriendlyError: parsedCodes.userFriendlyMessage,
        resultCodes: errorResult,
      };
    }
    throw error;
  }
};


/**
 * Parse Stellar error codes into user-friendly messages
 * @param {Object} codes - Result codes from Stellar error response
 * @returns {Object} Parsed error information
 * @returns {string} returns.transactionError - User-friendly transaction error message
 * @returns {Array} returns.operationErrors - Array of user-friendly operation error messages
 * @returns {string} returns.userFriendlyMessage - Complete formatted error message
 */
const parseStellarErrorCodes = (codes) => {
  if (!codes) {
    return {
      transactionError: null,
      operationErrors: [],
      userFriendlyMessage: 'Unknown error',
    };
  }

  const errorMap = {
    // Transaction codes
    'tx_failed': 'Transaction failed',
    'tx_bad_seq': 'Sequence number mismatch - please retry',
    'tx_too_early': 'Transaction submitted too early',
    'tx_too_late': 'Transaction submitted too late',
    'tx_missing_operation': 'Transaction missing required operation',
    'tx_bad_auth': 'Transaction authorization failed',
    'tx_insufficient_fee': 'Transaction fee too low',
    'tx_no_source_account': 'Source account does not exist',

    // Operation codes
    'op_underfunded': 'Insufficient balance for operation',
    'op_no_trust': 'Trustline not established',
    'op_not_authorized': 'Account not authorized for this asset',
    'op_line_full': 'Trustline limit exceeded',
    'op_no_issuer': 'Asset issuer account does not exist',
    'op_bad_auth': 'Operation authorization failed',
    'op_success': 'Operation succeeded',
  };

  const txCode = codes.transaction || codes.transaction_code;
  const opCodes = codes.operations || codes.operation_codes || [];

  const transactionError = txCode ? (errorMap[txCode] || txCode) : null;
  const operationErrors = opCodes.map((code, i) => {
    const friendlyMsg = errorMap[code] || code;
    return `Operation ${i + 1}: ${friendlyMsg}`;
  });

  let userFriendlyMessage = '';
  if (transactionError) {
    userFriendlyMessage = `Stellar transaction error: ${transactionError}`;
  }
  if (operationErrors.length > 0) {
    userFriendlyMessage += operationErrors.length > 0
      ? `. ${operationErrors.join('. ')}`
      : '';
  }
  if (!userFriendlyMessage) {
    userFriendlyMessage = 'Unknown Stellar error';
  }

  return {
    transactionError,
    operationErrors,
    userFriendlyMessage,
  };
};

/**
 * Assina e submete uma transação Stellar para a rede
 * @param {Transaction} transaction - Transação a ser assinada e submetida
 * @param {Keypair} keypair - Keypair para assinar a transação
 * @param {Horizon.Server} [server] - Optional server instance (uses default if not provided)
 * @returns {Promise<Object>} Resultado da submissão com hash, ledger e status
 * @returns {boolean} returns.success - Indica se a transação foi bem-sucedida
 * @returns {string} returns.hash - Hash da transação (se sucesso)
 * @returns {number} returns.ledger - Número do ledger (se sucesso)
 * @returns {string} returns.error - Mensagem de erro (se falhou)
 * @returns {string} returns.userFriendlyError - Mensagem de erro amigável (se falhou)
 * @returns {Object} returns.resultCodes - Códigos de erro detalhados (se falhou)
 */
export const signAndSubmitTransaction = async (transaction, keypair, server = null) => {
  // 1. Sign the inner transaction (Business Logic Signature)
  transaction.sign(keypair);

  // 2. Wrap in Fee Bump Transaction (Gas Station Logic)
  // We pick a Channel Account from the pool to act as the source for this transaction.
  // This prevents sequence number collisions during concurrent operations.
  const channelKeypair = keyManager.getNextChannelKeypair();

  // For Soroban, the inner transaction fee might be higher than BASE_FEE.
  // The fee-bump fee must be at least (inner_fee + BASE_FEE).
  const innerFee = parseInt(transaction.fee);
  const feeBumpFee = Math.max(parseInt(BASE_FEE), innerFee + parseInt(BASE_FEE));

  // Create Fee Bump Transaction
  const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
    channelKeypair.publicKey(),
    feeBumpFee.toString(),
    transaction,
    getNetworkPassphrase()
  );

  // 3. Sign the outer Fee Bump Transaction (Gas Signature)
  feeBumpTx.sign(channelKeypair);

  // Use provided server or fall back to default
  let targetServer = server || stellarServer;

  // ULTRATHINK FIX: Runtime check for malformed URL
  // If the server URL contains /transactions, it will cause a 405 error because the SDK appends it again.
  try {
    // In some SDK versions serverURL is a URI object, in others a string. Safest is to cast to string then URL.
    if (targetServer.serverURL) {
      const urlStr = targetServer.serverURL.toString();
      const parsedUrl = new URL(urlStr);

      if (parsedUrl.pathname && parsedUrl.pathname.includes('transactions')) {
        console.warn(`[signAndSubmitTransaction] DETECTED MALFORMED URL: ${urlStr}. Fixing...`);
        // Remove /transactions and trailing slashes
        const cleanUrl = urlStr.replace(/\/transactions\/?$/, '').replace(/\/+$/, '');
        console.warn(`[signAndSubmitTransaction] Fixed URL to: ${cleanUrl}`);
        targetServer = new Horizon.Server(cleanUrl);
      }
    }
  } catch (err) {
    console.error('[signAndSubmitTransaction] Error checking server URL:', err);
  }

  if (targetServer.serverURL) {
    console.log(`[signAndSubmitTransaction] Submitting to: ${targetServer.serverURL}`);
  }

  try {
    const result = await targetServer.submitTransaction(feeBumpTx);
    return {
      success: true,
      hash: result.hash,
      ledger: result.ledger,
      result: result,
    };
  } catch (error) {
    if (error.response && error.response.data) {
      console.dir(error.response.data, { depth: null });
      const errorResult = error.response.data.extras?.result_codes;
      const errorMessage = error.response.data.detail || error.message;
      const parsedCodes = parseStellarErrorCodes(errorResult);

      return {
        success: false,
        error: errorMessage,
        userFriendlyError: parsedCodes.userFriendlyMessage,
        resultCodes: errorResult,
        transactionError: parsedCodes.transactionError,
        operationErrors: parsedCodes.operationErrors,
      };
    }
    throw error;
  }
};

/**
 * Get the WASM hash for the token_sale Soroban contract
 * @returns {string} WASM hash (hex)
 * @throws {Error} If SALE_WASM_HASH is not set
 */
export const getSaleWasmHash = () => {
  const hash = process.env.SALE_WASM_HASH;
  if (!hash) {
    throw new Error('[StellarConfig] SALE_WASM_HASH environment variable is required for Soroban sale contract deployment');
  }
  return hash;
};

/**
 * Get the WASM hash for the MaturitySettlement Soroban contract
 * @returns {string} WASM hash (hex)
 * @throws {Error} If SETTLEMENT_WASM_HASH is not set
 */
export const getSettlementWasmHash = () => {
  const h = process.env.SETTLEMENT_WASM_HASH;
  if (!h) {
    throw new Error('[StellarConfig] SETTLEMENT_WASM_HASH environment variable is required for settlement contract deployment');
  }
  return h;
};

export default {
  stellarServer,
  createFreshServer,
  getNetworkPassphrase,
  getSorobanRpcUrl,
  getSorobanRpcHeaders,
  getSorobanServer,
  getIssuerKeypair,
  getDistributorKeypair,
  getTreasuryKeypair,
  getTreasuryPublicKey,
  getOperationsKeypair,
  createAsset,
  buildTransaction,
  buildTransactionWithAccount,
  buildUnsignedTransaction,
  submitSignedTransaction,
  signAndSubmitTransaction,
  getUsdcIssuer,
  getUsdcAsset,
  getSaleWasmHash,
  getSettlementWasmHash,
};
