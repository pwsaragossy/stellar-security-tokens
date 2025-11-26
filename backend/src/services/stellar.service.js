import {
  stellarServer,
  getIssuerKeypair,
  getDistributorKeypair,
  createAsset,
  buildTransaction,
  signAndSubmitTransaction,
  getNetworkPassphrase,
} from '../config/stellar.js';
import {
  Operation,
  Keypair,
  Asset,
  AuthRequiredFlag,
  AuthRevocableFlag,
  AuthClawbackEnabledFlag,
  TransactionBuilder,
  BASE_FEE,
} from '@stellar/stellar-sdk';

export class StellarService {
  /**
   * Cria conta emissora com flags de compliance
   * Configura AuthRequiredFlag, AuthRevocableFlag e AuthClawbackEnabledFlag
   * @returns {Promise<Object>} Resultado da criação da conta
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.publicKey - Chave pública da conta
   * @returns {string} returns.secretKey - Chave secreta da conta
   * @returns {boolean} returns.alreadyExists - Se a conta já existia
   * @returns {string} returns.transactionHash - Hash da transação (se criada)
   * @returns {number} returns.ledger - Número do ledger (se criada)
   * @returns {Object} returns.flags - Flags configuradas
   * @throws {Error} Se houver erro ao criar ou configurar a conta
   */
  static async createIssuerAccount() {
    try {
      const issuerKeypair = getIssuerKeypair();
      
      try {
        const account = await stellarServer.loadAccount(issuerKeypair.publicKey());
        console.log('Issuer account already exists:', issuerKeypair.publicKey());
        return {
          success: true,
          publicKey: issuerKeypair.publicKey(),
          secretKey: issuerKeypair.secret(),
          alreadyExists: true,
        };
      } catch (error) {
        if (error.status !== 404) {
          throw error;
        }
      }

      const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(issuerKeypair.publicKey())}`;
      
      try {
        const response = await fetch(friendbotUrl);
        if (!response.ok) {
          throw new Error(`Friendbot failed: ${response.statusText}`);
        }
        await response.json();
      } catch (error) {
        throw new Error(`Failed to fund issuer account via Friendbot: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const account = await stellarServer.loadAccount(issuerKeypair.publicKey());
      
      const operations = [
        Operation.setOptions({
          source: issuerKeypair.publicKey(),
          setFlags: AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag,
        }),
      ];

      const transaction = await buildTransaction(issuerKeypair, operations);
      const result = await signAndSubmitTransaction(transaction, issuerKeypair);

      if (!result.success) {
        throw new Error(`Failed to set issuer account flags: ${result.error}`);
      }

      return {
        success: true,
        publicKey: issuerKeypair.publicKey(),
        secretKey: issuerKeypair.secret(),
        transactionHash: result.hash,
        ledger: result.ledger,
        flags: {
          authRequired: true,
          authRevocable: true,
          authClawbackEnabled: true,
        },
      };
    } catch (error) {
      console.error('Error creating issuer account:', error);
      throw new Error(`Issuer account creation failed: ${error.message}`);
    }
  }

  /**
   * Cria conta de distribuição
   * Financia a conta via Friendbot (testnet) e verifica sua criação
   * @returns {Promise<Object>} Resultado da criação da conta
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.publicKey - Chave pública da conta
   * @returns {string} returns.secretKey - Chave secreta da conta
   * @returns {boolean} returns.alreadyExists - Se a conta já existia
   * @throws {Error} Se houver erro ao criar ou financiar a conta
   */
  static async createDistributionAccount() {
    try {
      const distributorKeypair = getDistributorKeypair();
      
      try {
        const account = await stellarServer.loadAccount(distributorKeypair.publicKey());
        console.log('Distribution account already exists:', distributorKeypair.publicKey());
        return {
          success: true,
          publicKey: distributorKeypair.publicKey(),
          secretKey: distributorKeypair.secret(),
          alreadyExists: true,
        };
      } catch (error) {
        if (error.status !== 404) {
          throw error;
        }
      }

      const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(distributorKeypair.publicKey())}`;
      
      try {
        const response = await fetch(friendbotUrl);
        if (!response.ok) {
          throw new Error(`Friendbot failed: ${response.statusText}`);
        }
        await response.json();
      } catch (error) {
        throw new Error(`Failed to fund distribution account via Friendbot: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      return {
        success: true,
        publicKey: distributorKeypair.publicKey(),
        secretKey: distributorKeypair.secret(),
      };
    } catch (error) {
      console.error('Error creating distribution account:', error);
      throw new Error(`Distribution account creation failed: ${error.message}`);
    }
  }

  /**
   * Cria conta Stellar para investidor
   * Gera um novo keypair aleatório e financia via Friendbot (testnet)
   * @returns {Promise<Object>} Resultado da criação da conta
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.publicKey - Chave pública da conta criada
   * @returns {string} returns.secretKey - Chave secreta da conta criada
   * @throws {Error} Se houver erro ao criar ou financiar a conta
   */
  static async createInvestorAccount() {
    try {
      const keypair = Keypair.random();

      // Em ambiente de teste, não usar Friendbot
      if (process.env.NODE_ENV === 'test') {
        return {
          success: true,
          publicKey: keypair.publicKey(),
          secretKey: keypair.secret(),
        };
      }

      const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(keypair.publicKey())}`;

      try {
        const response = await fetch(friendbotUrl);
        if (!response.ok) {
          throw new Error(`Friendbot failed: ${response.statusText}`);
        }
        await response.json();
      } catch (error) {
        throw new Error(`Failed to fund investor account via Friendbot: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        await stellarServer.loadAccount(keypair.publicKey());
      } catch (error) {
        throw new Error('Account was not created successfully');
      }

      return {
        success: true,
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
      };
    } catch (error) {
      console.error('Error creating investor account:', error);
      throw new Error(`Investor account creation failed: ${error.message}`);
    }
  }

  /**
   * Emite tokens de segurança e transfere para a conta distribuidora
   * @param {string} code - Código do asset (padrão: 'SIN01')
   * @param {number|string} amount - Quantidade de tokens a emitir
   * @param {Object} [options] - Opções adicionais
   * @param {string} [options.homeDomain] - Home domain para stellar.toml
   * @returns {Promise<Object>} Resultado da emissão
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.assetCode - Código do asset emitido
   * @returns {string} returns.issuerPublicKey - Chave pública do emissor
   * @returns {string} returns.distributorPublicKey - Chave pública do distribuidor
   * @returns {string} returns.amount - Quantidade emitida
   * @returns {string} returns.transactionHash - Hash da transação
   * @returns {number} returns.ledger - Número do ledger
   * @returns {string} [returns.homeDomain] - Home domain configurado
   * @throws {Error} Se houver erro na emissão ou se amount for inválido
   */
  static async issueSecurityToken(code = 'SIN01', amount, options = {}) {
    try {
      const issuerKeypair = getIssuerKeypair();
      const distributorKeypair = getDistributorKeypair();
      
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Amount must be a positive number');
      }

      const issuerAccount = await stellarServer.loadAccount(issuerKeypair.publicKey());
      const distributorAccount = await stellarServer.loadAccount(distributorKeypair.publicKey());
      
      const asset = createAsset(code, issuerKeypair.publicKey());
      
      const operations = [
        Operation.payment({
          destination: distributorKeypair.publicKey(),
          asset: asset,
          amount: amount.toString(),
        }),
      ];

      // Configurar home domain se fornecido
      if (options.homeDomain) {
        operations.unshift(
          Operation.setOptions({
            source: issuerKeypair.publicKey(),
            homeDomain: options.homeDomain,
          })
        );
      }
      
      const transaction = await buildTransaction(issuerKeypair, operations);
      const result = await signAndSubmitTransaction(transaction, issuerKeypair);

      if (!result.success) {
        throw new Error(`Failed to issue token: ${result.error}`);
      }

      const returnData = {
        success: true,
        assetCode: code,
        issuerPublicKey: issuerKeypair.publicKey(),
        distributorPublicKey: distributorKeypair.publicKey(),
        amount: amount.toString(),
        transactionHash: result.hash,
        ledger: result.ledger,
      };

      if (options.homeDomain) {
        returnData.homeDomain = options.homeDomain;
      }

      return returnData;
    } catch (error) {
      console.error('Error issuing security token:', error);
      throw new Error(`Security token issuance failed: ${error.message}`);
    }
  }

  /**
   * Aprova trustline do investidor (whitelist)
   * Configura a flag AuthRequiredFlag na trustline, permitindo que o investidor receba tokens
   * @param {string} investorPublicKey - Chave pública do investidor (56 caracteres)
   * @param {string} assetCode - Código do asset (padrão: 'SIN01')
   * @returns {Promise<Object>} Resultado da aprovação
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.investorPublicKey - Chave pública do investidor
   * @returns {string} returns.assetCode - Código do asset
   * @returns {string} returns.transactionHash - Hash da transação
   * @returns {number} returns.ledger - Número do ledger
   * @returns {string} returns.message - Mensagem de confirmação
   * @throws {Error} Se a chave for inválida, conta não existir ou trustline não estabelecida
   */
  static async whitelistInvestor(investorPublicKey, assetCode = 'SIN01') {
    try {
      const issuerKeypair = getIssuerKeypair();
      
      if (!investorPublicKey || investorPublicKey.length !== 56) {
        throw new Error('Invalid investor public key');
      }

      let account;
      try {
        account = await stellarServer.loadAccount(investorPublicKey);
      } catch (error) {
        if (error.status === 404) {
          throw new Error('Investor account does not exist');
        }
        throw error;
      }

      // Verificar reserva XLM antes de criar trustline
      const xlmBalance = account.balances.find(b => b.asset_type === 'native');
      if (!xlmBalance) {
        throw new Error('Investor account has no XLM balance');
      }

      const currentXLM = parseFloat(xlmBalance.balance);
      const baseReserve = 1; // Base reserve per account (XLM)
      const numSubentries = account.subentry_count || 0;
      const newSubentries = numSubentries + 1; // Adicionando uma trustline
      const requiredReserve = baseReserve * (2 + newSubentries);
      const minRequired = requiredReserve + 0.5; // Buffer para fees

      if (currentXLM < minRequired) {
        const shortfall = (minRequired - currentXLM).toFixed(2);
        throw new Error(
          `Insufficient XLM for trustline. Required: ${minRequired} XLM (including reserves), ` +
          `Available: ${currentXLM} XLM. Please fund the account with at least ${shortfall} more XLM.`
        );
      }

      // Verificar se trustline já existe
      const existingTrust = account.balances.find(
        b => b.asset_code === assetCode && b.asset_issuer === issuerKeypair.publicKey()
      );

      if (existingTrust) {
        console.log(`Trustline already exists for ${investorPublicKey}`);
        return {
          success: true,
          investorPublicKey,
          assetCode,
          alreadyExists: true,
          message: 'Trustline already exists',
        };
      }

      const asset = createAsset(assetCode, issuerKeypair.publicKey());
      
      const operations = [
        Operation.setTrustLineFlags({
          trustor: investorPublicKey,
          asset: asset,
          setFlags: AuthRequiredFlag,
        }),
      ];

      const transaction = await buildTransaction(issuerKeypair, operations);
      const result = await signAndSubmitTransaction(transaction, issuerKeypair);

      if (!result.success) {
        // Usar mensagem amigável se disponível
        if (result.userFriendlyError) {
          throw new Error(result.userFriendlyError);
        }
        // Fallback para casos específicos conhecidos
        if (result.resultCodes && result.resultCodes.operation === 'op_no_trust') {
          throw new Error('Investor must establish trustline first before whitelisting');
        }
        throw new Error(`Failed to whitelist investor: ${result.error}`);
      }

      return {
        success: true,
        investorPublicKey,
        assetCode,
        transactionHash: result.hash,
        ledger: result.ledger,
        message: 'Investor trustline approved (whitelisted)',
      };
    } catch (error) {
      console.error('Error whitelisting investor:', error);
      throw new Error(`Investor whitelisting failed: ${error.message}`);
    }
  }

  /**
   * Distribui tokens para investidor
   * Envia tokens da conta distribuidora para o investidor
   * @param {string} investorPublicKey - Chave pública do investidor (56 caracteres)
   * @param {number|string} amount - Quantidade de tokens a distribuir
   * @param {string} assetCode - Código do asset (padrão: 'SIN01')
   * @returns {Promise<Object>} Resultado da distribuição
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.assetCode - Código do asset
   * @returns {string} returns.investorPublicKey - Chave pública do investidor
   * @returns {string} returns.amount - Quantidade distribuída
   * @returns {string} returns.transactionHash - Hash da transação
   * @returns {number} returns.ledger - Número do ledger
   * @throws {Error} Se chave inválida, conta não existir, trustline não autorizada ou amount inválido
   */
  static async distributeTokens(investorPublicKey, amount, assetCode = 'SIN01', options = {}) {
    try {
      const issuerKeypair = getIssuerKeypair();
      const distributorKeypair = getDistributorKeypair();
      
      if (!investorPublicKey || investorPublicKey.length !== 56) {
        throw new Error('Invalid investor public key');
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Amount must be a positive number');
      }

      try {
        await stellarServer.loadAccount(investorPublicKey);
      } catch (error) {
        if (error.status === 404) {
          throw new Error('Investor account does not exist');
        }
        throw error;
      }

      const asset = createAsset(assetCode, issuerKeypair.publicKey());
      
      const operations = [
        Operation.payment({
          destination: investorPublicKey,
          asset: asset,
          amount: amount.toString(),
          source: distributorKeypair.publicKey(),
        }),
      ];
      
      const transaction = await buildTransaction(distributorKeypair, operations, {
        memo: options.memo || null,
      });
      const result = await signAndSubmitTransaction(transaction, distributorKeypair);
      
      if (!result.success) {
        // Usar mensagem amigável se disponível
        if (result.userFriendlyError) {
          throw new Error(result.userFriendlyError);
        }
        // Fallback para casos específicos conhecidos
        if (result.resultCodes && result.resultCodes.operation === 'op_no_trust') {
          throw new Error('Investor must establish and be whitelisted for this asset trustline first');
        }
        if (result.resultCodes && result.resultCodes.operation === 'op_not_authorized') {
          throw new Error('Investor trustline is not authorized (not whitelisted)');
        }
        if (result.resultCodes && result.resultCodes.operation === 'op_underfunded') {
          throw new Error('Insufficient balance in distribution account');
        }
        throw new Error(`Failed to distribute tokens: ${result.error}`);
      }
      
      return {
        success: true,
        assetCode,
        investorPublicKey,
        amount: amount.toString(),
        transactionHash: result.hash,
        ledger: result.ledger,
      };
    } catch (error) {
      console.error('Error distributing tokens:', error);
      
      if (error.response) {
        const errorResult = error.response.data?.extras?.result_codes;
        if (errorResult) {
          if (errorResult.operation === 'op_no_trust') {
            throw new Error('Investor must establish trustline first');
          }
          if (errorResult.operation === 'op_not_authorized') {
            throw new Error('Investor trustline is not authorized (not whitelisted)');
          }
          throw new Error(`Token distribution failed: ${JSON.stringify(errorResult)}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Congela conta do investidor revogando a autorização da trustline
   * Remove a flag AuthRequiredFlag, impedindo transferências do asset
   * @param {string} investorPublicKey - Chave pública do investidor (56 caracteres)
   * @param {string} assetCode - Código do asset (padrão: 'SIN01')
   * @returns {Promise<Object>} Resultado do congelamento
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.investorPublicKey - Chave pública do investidor
   * @returns {string} returns.assetCode - Código do asset
   * @returns {string} returns.transactionHash - Hash da transação
   * @returns {number} returns.ledger - Número do ledger
   * @returns {string} returns.message - Mensagem de confirmação
   * @throws {Error} Se chave inválida, conta não existir ou trustline não existir
   */
  static async freezeAccount(investorPublicKey, assetCode = 'SIN01') {
    try {
      const issuerKeypair = getIssuerKeypair();
      
      if (!investorPublicKey || investorPublicKey.length !== 56) {
        throw new Error('Invalid investor public key');
      }

      try {
        await stellarServer.loadAccount(investorPublicKey);
      } catch (error) {
        if (error.status === 404) {
          throw new Error('Investor account does not exist');
        }
        throw error;
      }

      const asset = createAsset(assetCode, issuerKeypair.publicKey());
      
      const operations = [
        Operation.setTrustLineFlags({
          trustor: investorPublicKey,
          asset: asset,
          setFlags: 0,
          clearFlags: AuthRequiredFlag,
        }),
      ];

      const transaction = await buildTransaction(issuerKeypair, operations);
      const result = await signAndSubmitTransaction(transaction, issuerKeypair);

      if (!result.success) {
        if (result.resultCodes && result.resultCodes.operation === 'op_no_trust') {
          throw new Error('Investor does not have a trustline for this asset');
        }
        throw new Error(`Failed to freeze account: ${result.error}`);
      }

      return {
        success: true,
        investorPublicKey,
        assetCode,
        transactionHash: result.hash,
        ledger: result.ledger,
        message: 'Account frozen successfully (trustline authorization revoked)',
      };
    } catch (error) {
      console.error('Error freezing account:', error);
      throw new Error(`Account freeze failed: ${error.message}`);
    }
  }

  /**
   * Recupera tokens (clawback) do investidor
   * Retira tokens da conta do investidor e retorna para o emissor
   * Requer que o asset tenha AuthClawbackEnabledFlag habilitada
   * @param {string} investorPublicKey - Chave pública do investidor (56 caracteres)
   * @param {number|string} amount - Quantidade de tokens a recuperar
   * @param {string} assetCode - Código do asset (padrão: 'SIN01')
   * @returns {Promise<Object>} Resultado do clawback
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.investorPublicKey - Chave pública do investidor
   * @returns {string} returns.assetCode - Código do asset
   * @returns {string} returns.amount - Quantidade recuperada
   * @returns {string} returns.transactionHash - Hash da transação
   * @returns {number} returns.ledger - Número do ledger
   * @returns {string} returns.message - Mensagem de confirmação
   * @throws {Error} Se chave inválida, saldo insuficiente, conta não existir ou clawback não autorizado
   */
  static async clawbackTokens(investorPublicKey, amount, assetCode = 'SIN01') {
    try {
      const issuerKeypair = getIssuerKeypair();
      
      if (!investorPublicKey || investorPublicKey.length !== 56) {
        throw new Error('Invalid investor public key');
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Amount must be a positive number');
      }

      try {
        const account = await stellarServer.loadAccount(investorPublicKey);
        const balance = account.balances.find(
          (bal) => bal.asset_code === assetCode && bal.asset_issuer === issuerKeypair.publicKey()
        );
        
        if (!balance || parseFloat(balance.balance) < parseFloat(amount)) {
          throw new Error(`Insufficient balance. Available: ${balance ? balance.balance : '0'}, Requested: ${amount}`);
        }
      } catch (error) {
        if (error.status === 404) {
          throw new Error('Investor account does not exist');
        }
        throw error;
      }

      const asset = createAsset(assetCode, issuerKeypair.publicKey());
      
      const operations = [
        Operation.clawback({
          asset: asset,
          from: investorPublicKey,
          amount: amount.toString(),
        }),
      ];

      const transaction = await buildTransaction(issuerKeypair, operations);
      const result = await signAndSubmitTransaction(transaction, issuerKeypair);

      if (!result.success) {
        // Usar mensagem amigável se disponível
        if (result.userFriendlyError) {
          throw new Error(result.userFriendlyError);
        }
        // Fallback para casos específicos conhecidos
        if (result.resultCodes && result.resultCodes.operation === 'op_no_trust') {
          throw new Error('Investor does not have a trustline for this asset');
        }
        if (result.resultCodes && result.resultCodes.operation === 'op_not_authorized') {
          throw new Error('Clawback not authorized. Asset may not have clawback enabled or account may be frozen');
        }
        throw new Error(`Failed to clawback tokens: ${result.error}`);
      }

      return {
        success: true,
        investorPublicKey,
        assetCode,
        amount: amount.toString(),
        transactionHash: result.hash,
        ledger: result.ledger,
        message: 'Tokens clawed back successfully',
      };
    } catch (error) {
      console.error('Error clawing back tokens:', error);
      throw new Error(`Token clawback failed: ${error.message}`);
    }
  }

  /**
   * Obtém saldo de tokens de uma conta Stellar
   * @param {string} assetCode - Código do asset a consultar
   * @param {string} publicKey - Chave pública da conta (56 caracteres)
   * @returns {Promise<Object>} Informações do saldo
   * @returns {string} returns.assetCode - Código do asset
   * @returns {string} returns.publicKey - Chave pública consultada
   * @returns {string} returns.balance - Saldo do token (ou '0' se não houver)
   * @returns {string} returns.assetType - Tipo do asset ('none' se não houver)
   * @returns {boolean} returns.isAuthorized - Se a trustline está autorizada
   * @returns {boolean} returns.isAuthorizedToMaintainLiabilities - Se pode manter passivos
   * @throws {Error} Se houver erro ao carregar a conta
   */
  static async getTokenBalance(assetCode, publicKey) {
    try {
      const issuerKeypair = getIssuerKeypair();
      
      const account = await stellarServer.loadAccount(publicKey);
      
      const balance = account.balances.find(
        (bal) => bal.asset_code === assetCode && bal.asset_issuer === issuerKeypair.publicKey()
      );
      
      return {
        assetCode,
        publicKey,
        balance: balance ? balance.balance : '0',
        assetType: balance ? balance.asset_type : 'none',
        isAuthorized: balance ? balance.is_authorized : false,
        isAuthorizedToMaintainLiabilities: balance ? balance.is_authorized_to_maintain_liabilities : false,
      };
    } catch (error) {
      console.error('Error getting token balance:', error);
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }

  /**
   * Obtém informações completas de uma conta Stellar
   * @param {string} publicKey - Chave pública da conta (56 caracteres)
   * @returns {Promise<Object>} Informações da conta
   * @returns {string} returns.publicKey - Chave pública da conta
   * @returns {string} returns.accountId - ID da conta
   * @returns {Array} returns.balances - Array de saldos (XLM e assets)
   * @returns {string} returns.sequenceNumber - Número de sequência da conta
   * @returns {Object} returns.flags - Flags da conta (authRequired, authRevocable, etc.)
   * @throws {Error} Se houver erro ao carregar a conta
   */
  static async getAccountInfo(publicKey) {
    try {
      const account = await stellarServer.loadAccount(publicKey);
      return {
        publicKey,
        accountId: account.accountId(),
        balances: account.balances,
        sequenceNumber: account.sequenceNumber(),
        flags: {
          authRequired: account.flags.authRequired(),
          authRevocable: account.flags.authRevocable(),
          authImmutable: account.flags.authImmutable(),
          authClawbackEnabled: account.flags.authClawbackEnabled(),
        },
      };
    } catch (error) {
      console.error('Error getting account info:', error);
      throw new Error(`Failed to get account info: ${error.message}`);
    }
  }

  /**
   * Verifica se um pagamento USDC foi recebido na Treasury Account
   * Busca pagamentos recentes (últimos 10 minutos por padrão) e valida correspondência
   * @param {string} investorPublicKey - Chave pública do investidor que enviou o pagamento
   * @param {number|string} expectedAmount - Valor esperado em USDC
   * @param {string} [treasuryPublicKey] - Chave pública da Treasury Account (opcional, usa env var se não fornecido)
   * @param {number} [windowMinutes=10] - Janela de tempo em minutos para buscar pagamentos
   * @returns {Promise<Object|null>} Objeto com detalhes do pagamento encontrado ou null
   * @returns {string} returns.transactionHash - Hash da transação USDC
   * @returns {string} returns.amount - Valor do pagamento
   * @returns {string} returns.createdAt - Data de criação da transação
   * @returns {number} returns.ledger - Número do ledger
   * @throws {Error} Se houver erro ao buscar pagamentos
   */
  static async verifyUSDCPayment(investorPublicKey, expectedAmount, treasuryPublicKey = null, windowMinutes = 2) {
    try {
      const treasuryKey = treasuryPublicKey || process.env.TREASURY_PUBLIC_KEY;
      if (!treasuryKey) {
        throw new Error('TREASURY_PUBLIC_KEY not configured');
      }

      const USDC_ISSUER = process.env.USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
      const USDC_ASSET_CODE = 'USDC';

      // Buscar pagamentos recentes na Treasury Account
      const payments = await stellarServer
        .payments()
        .forAccount(treasuryKey)
        .order('desc')
        .limit(50)
        .call();

      const expectedAmountFloat = parseFloat(expectedAmount);
      const windowStartTime = new Date(Date.now() - windowMinutes * 60 * 1000);

      // Procurar pagamento correspondente
      const matchingPayment = payments.records.find(payment => {
        if (payment.type !== 'payment') {
          return false;
        }

        // Verificar asset
        if (payment.asset_code !== USDC_ASSET_CODE || payment.asset_issuer !== USDC_ISSUER) {
          return false;
        }

        // Verificar origem e destino
        if (payment.from !== investorPublicKey || payment.to !== treasuryKey) {
          return false;
        }

        // Verificar amount (permite pequena diferença por arredondamento)
        const paymentAmount = parseFloat(payment.amount);
        if (paymentAmount < expectedAmountFloat * 0.9999) { // 0.01% de tolerância
          return false;
        }

        // Verificar janela de tempo
        const paymentTime = new Date(payment.created_at);
        if (paymentTime < windowStartTime) {
          return false;
        }

        return true;
      });

      if (!matchingPayment) {
        return null;
      }

      return {
        transactionHash: matchingPayment.transaction_hash,
        amount: matchingPayment.amount,
        createdAt: matchingPayment.created_at,
        ledger: matchingPayment.ledger,
      };
    } catch (error) {
      console.error('Error verifying USDC payment:', error);
      throw new Error(`Failed to verify USDC payment: ${error.message}`);
    }
  }
}
