import { Server, Networks, Keypair, Asset, Operation, TransactionBuilder, BASE_FEE } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

const network = process.env.STELLAR_NETWORK || 'testnet';
const horizonUrl = process.env.STELLAR_HORIZON_URL || process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';

export const stellarServer = new Server(horizonUrl);

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
 * @returns {Promise<Transaction>} Transação construída e pronta para assinatura
 * @throws {Error} Se houver erro ao carregar a conta ou construir a transação
 */
export const buildTransaction = async (sourceKeypair, operations) => {
  const sourceAccount = await stellarServer.loadAccount(sourceKeypair.publicKey());
  
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  });

  operations.forEach(op => transaction.addOperation(op));

  transaction.setTimeout(30);
  
  return transaction.build();
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
      return {
        success: false,
        error: errorMessage,
        resultCodes: errorResult,
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

