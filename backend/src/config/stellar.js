import {
  Horizon,
  Networks,
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Memo,
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

const network = process.env.STELLAR_NETWORK || 'testnet';
const horizonUrl = process.env.STELLAR_HORIZON_URL || process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';

export const stellarServer = new Horizon.Server(horizonUrl);

/**
 * Obtém o passphrase da rede Stellar baseado na configuração
 * @returns {string} Passphrase da rede (TESTNET ou PUBLIC)
 */
export const getNetworkPassphrase = () => {
  return network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
};

/**
 * Obtém o keypair da conta emissora a partir das variáveis de ambiente
 * @returns {Keypair} Keypair da conta emissora
 * @throws {Error} Se ISSUER_SECRET_KEY não estiver configurada
 */
export const getIssuerKeypair = () => {
  const secretKey = process.env.ISSUER_SECRET_KEY;
  if (!secretKey) {
    throw new Error('ISSUER_SECRET_KEY não configurada no .env');
  }
  return Keypair.fromSecret(secretKey);
};

/**
 * Obtém o keypair da conta distribuidora a partir das variáveis de ambiente
 * Suporta tanto DISTRIBUTOR_SECRET_KEY quanto DISTRIBUTION_SECRET_KEY
 * @returns {Keypair} Keypair da conta distribuidora
 * @throws {Error} Se nenhuma das chaves estiver configurada
 */
export const getDistributorKeypair = () => {
  const secretKey = process.env.DISTRIBUTOR_SECRET_KEY || process.env.DISTRIBUTION_SECRET_KEY;
  if (!secretKey) {
    throw new Error('DISTRIBUTOR_SECRET_KEY ou DISTRIBUTION_SECRET_KEY não configurada no .env');
  }
  return Keypair.fromSecret(secretKey);
};

/**
 * Obtém o keypair da conta treasury a partir das variáveis de ambiente
 * @returns {Keypair} Keypair da conta treasury
 * @throws {Error} Se TREASURY_SECRET_KEY não estiver configurada
 */
export const getTreasuryKeypair = () => {
  const secretKey = process.env.TREASURY_SECRET_KEY;
  if (!secretKey) {
    throw new Error('TREASURY_SECRET_KEY não configurada no .env');
  }
  return Keypair.fromSecret(secretKey);
};

/**
 * Cria um objeto Asset do Stellar SDK
 * @param {string} code - Código do asset (ex: 'SIN01', 'USDC')
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

  transaction.setTimeout(30);
  
  return transaction.build();
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
 * @returns {Promise<Object>} Resultado da submissão com hash, ledger e status
 * @returns {boolean} returns.success - Indica se a transação foi bem-sucedida
 * @returns {string} returns.hash - Hash da transação (se sucesso)
 * @returns {number} returns.ledger - Número do ledger (se sucesso)
 * @returns {string} returns.error - Mensagem de erro (se falhou)
 * @returns {string} returns.userFriendlyError - Mensagem de erro amigável (se falhou)
 * @returns {Object} returns.resultCodes - Códigos de erro detalhados (se falhou)
 */
export const signAndSubmitTransaction = async (transaction, keypair) => {
  transaction.sign(keypair);
  
  try {
    const result = await stellarServer.submitTransaction(transaction);
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
        transactionError: parsedCodes.transactionError,
        operationErrors: parsedCodes.operationErrors,
      };
    }
    throw error;
  }
};

export default {
  stellarServer,
  getNetworkPassphrase,
  getIssuerKeypair,
  getDistributorKeypair,
  getTreasuryKeypair,
  createAsset,
  buildTransaction,
  signAndSubmitTransaction,
};

