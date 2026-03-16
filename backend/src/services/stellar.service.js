import {
  stellarServer,
  createFreshServer,
  createAsset,
  buildTransactionWithAccount,
  getNetworkPassphrase,
  getOperationsKeypair,
  getSorobanRpcUrl,
  getUsdcIssuer,
} from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import { TransactionManager } from './transactionManager.service.js';
import {
  Operation,
  Keypair,
  Asset,
  AuthRequiredFlag,
  AuthRevocableFlag,
  AuthClawbackEnabledFlag,
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
  BASE_FEE,
  xdr,
  StrKey,
  hash,
  Address,
  Contract,
  rpc,
  scValToNative,
  nativeToScVal,
  Account, // Imported Account class
} from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';
const log = logger.scope('StellarService');

export class StellarService {

  /**
   * Helper to fetch account via Soroban RPC (removes dependency on Horizon loadAccount)
   * This is critical for high-performance and future-proof sequence number fetching.
   * @param {string} publicKey
   * @returns {Promise<Account>} Stellar Account object with correct sequence number
   */
  static async getAccountRPC(publicKey) {
    try {
      const server = new rpc.Server(getSorobanRpcUrl());
      const account = await server.getAccount(publicKey);
      return account;
    } catch (error) {
      // Fallback to Horizon if RPC fails (during migration/testing)
      // or if account not found (404 handling differ between RPC/Horizon)
      log.warn(`[StellarService] RPC getAccount failed for ${publicKey}, falling back to Horizon: ${error.message}`);
      return stellarServer.loadAccount(publicKey);
    }
  }

  /**
   * Helper to build an unsigned transaction using RPC for sequence number fetching.
   * This is used by services that need to return XDR for later signing.
   * @param {string} sourcePublicKey
   * @param {Array<Operation>} operations
   * @param {string} [memo]
   * @returns {Promise<Transaction>} Unsigned transaction object
   */
  static async buildUnsignedTransaction(sourcePublicKey, operations, memo) {
    const sourceAccount = await this.getAccountRPC(sourcePublicKey);
    return buildTransactionWithAccount(sourceAccount, operations, { memo });
  }

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
      const issuerPublicKey = keyManager.getIssuerPublicKey();

      try {
        const account = await stellarServer.loadAccount(issuerPublicKey);
        log.info('Issuer account already exists:', issuerPublicKey);

        // Check if flags are set correctly
        const flags = account.flags;
        const expectedFlags = AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag;

        const currentFlagsValue =
          (flags.auth_required ? AuthRequiredFlag : 0) |
          (flags.auth_revocable ? AuthRevocableFlag : 0) |
          (flags.auth_clawback_enabled ? AuthClawbackEnabledFlag : 0);

        if ((currentFlagsValue & expectedFlags) !== expectedFlags) {
          log.info('[StellarService] Issuer flags are missing. Setting them now...');
          log.info('[StellarService] Current flags:', flags);
          const operations = [
            Operation.setOptions({
              source: issuerPublicKey,
              setFlags: expectedFlags,
            }),
          ];

          // Hybrid Pattern: Use RPC for accurate sequence number when building transaction
          const accountForTx = await this.getAccountRPC(issuerPublicKey);
          const transaction = await buildTransactionWithAccount(accountForTx, operations);
          const result = await TransactionManager.submit({
            transaction,
            signingRole: 'ISSUER',
            operationType: 'account_setup',
            description: 'Set issuer account flags',
          });

          if (!result.success) {
            log.error('[StellarService] Failed to set issuer flags:', result);
            throw new Error(`Failed to set issuer account flags: ${result.userFriendlyError || result.error}`);
          }
          log.info('[StellarService] Issuer flags updated successfully. TxHash:', result.hash);
        } else {
          log.info('[StellarService] Issuer flags already correct:', flags);
        }

        // Check and set home_domain if configured
        const expectedHomeDomain = process.env.STELLAR_HOME_DOMAIN;
        if (expectedHomeDomain && account.home_domain !== expectedHomeDomain) {
          log.info(`[StellarService] Setting home_domain to ${expectedHomeDomain}...`);
          const homeDomainOps = [
            Operation.setOptions({
              source: issuerPublicKey,
              homeDomain: expectedHomeDomain,
            }),
          ];

          const accountForDomainTx = await this.getAccountRPC(issuerPublicKey);
          const domainTx = await buildTransactionWithAccount(accountForDomainTx, homeDomainOps);
          const domainResult = await TransactionManager.submit({
            transaction: domainTx,
            signingRole: 'ISSUER',
            operationType: 'account_setup',
            description: `Set home_domain to ${expectedHomeDomain}`,
          });

          if (!domainResult.success) {
            log.error('[StellarService] Failed to set home_domain:', domainResult);
            // Non-fatal: log but continue
          } else {
            log.info('[StellarService] home_domain set successfully. TxHash:', domainResult.hash);
          }
        } else if (expectedHomeDomain) {
          log.info('[StellarService] home_domain already correct:', account.home_domain);
        }

        return {
          success: true,
          publicKey: issuerPublicKey,
          alreadyExists: true,
          flags: {
            authRequired: true,
            authRevocable: true,
            authClawbackEnabled: true,
          }
        };
      } catch (error) {
        if (error.status !== 404 && !error.message.includes('404')) {
          throw error;
        }
      }

      if (process.env.STELLAR_NETWORK === 'testnet') {
        const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(issuerPublicKey)}`;

        try {
          const response = await fetch(friendbotUrl);
          if (!response.ok) {
            throw new Error(`Friendbot failed: ${response.statusText}`);
          }
          await response.json();
        } catch (error) {
          throw new Error(`Failed to fund issuer account via Friendbot: ${error.message}`);
        }
      } else {
        // Mainnet: Verify account exists and has funds
        try {
          await stellarServer.loadAccount(issuerPublicKey);
        } catch (error) {
          throw new Error(`Issuer account not found on ${process.env.STELLAR_NETWORK || 'mainnet'}. Please fund it manually.`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const account = await stellarServer.loadAccount(issuerPublicKey);

      const homeDomain = process.env.STELLAR_HOME_DOMAIN;
      const operations = [
        Operation.setOptions({
          source: issuerPublicKey,
          setFlags: AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag,
          ...(homeDomain && { homeDomain }),
        }),
      ];

      // Hybrid Pattern: Use RPC for accurate sequence number when building transaction
      const accountForTx = await this.getAccountRPC(issuerPublicKey);
      const transaction = await buildTransactionWithAccount(accountForTx, operations);
      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'ISSUER',
        operationType: 'account_setup',
        description: 'Create issuer account with compliance flags',
      });

      if (!result.success) {
        throw new Error(`Failed to set issuer account flags: ${result.error}`);
      }

      return {
        success: true,
        publicKey: issuerPublicKey,
        transactionHash: result.hash,
        ledger: result.ledger,
        flags: {
          authRequired: true,
          authRevocable: true,
          authClawbackEnabled: true,
        },
      };
    } catch (error) {
      log.error('Error creating issuer account:', error);
      throw new Error(`Issuer account creation failed: ${error.message}`);
    }
  }


  /**
   * Unlock a token for DEX trading by clearing AUTH_REQUIRED flag on the Issuer.
   * 
   * When AUTH_REQUIRED is cleared:
   * - New trustlines are automatically authorized
   * - Token holders can freely transfer/trade without platform approval
   * - The blockchain becomes the source of truth for balances
   * 
   * NOTE: AUTH_REVOCABLE and AUTH_CLAWBACK_ENABLED are retained for compliance.
   * 
   * @param {string} assetCode - The asset code to unlock
   * @returns {Promise<Object>} Transaction result
   * @returns {boolean} returns.success - Whether the operation succeeded
   * @returns {string} returns.txHash - Transaction hash
   * @returns {number} returns.ledger - Ledger number
   * @throws {Error} If the operation fails
   */
  static async unlockToken(assetCode) {
    try {
      log.info(`[StellarService] Unlocking token ${assetCode} for DEX trading...`);

      const issuerPublicKey = keyManager.getIssuerPublicKey();

      // Verify the account currently has AUTH_REQUIRED set
      const account = await stellarServer.loadAccount(issuerPublicKey);
      if (!account.flags.auth_required) {
        log.info(`[StellarService] Token ${assetCode} is already unlocked (AUTH_REQUIRED not set)`);
        return {
          success: true,
          alreadyUnlocked: true,
          message: `Token ${assetCode} is already unlocked for DEX trading`,
        };
      }

      // Build transaction to clear AUTH_REQUIRED_FLAG
      // We use clearFlags (not setFlags) to remove the flag
      const operations = [
        Operation.setOptions({
          source: issuerPublicKey,
          clearFlags: AuthRequiredFlag, // 0x1 - only clear AUTH_REQUIRED
        }),
      ];

      // Build and submit transaction (handles multisig routing automatically)
      const accountForTx = await this.getAccountRPC(issuerPublicKey);
      const transaction = await buildTransactionWithAccount(accountForTx, operations);

      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'ISSUER',
        operationType: 'unlock_token',
        description: `Unlock ${assetCode} for DEX trading`,
        metadata: { assetCode },
      });

      // Handle multisig pending case
      if (result.status === 'pending_multisig') {
        log.info(`[StellarService] Token unlock queued for MultiSig approval. ID: ${result.multiSigTransactionId}`);
        return {
          success: true,
          pendingMultisig: true,
          multiSigTransactionId: result.multiSigTransactionId,
          message: `Token unlock request for ${assetCode} queued for MultiSig approval`,
        };
      }

      // Direct execution success
      log.info(`[StellarService] Token ${assetCode} unlocked successfully. TxHash: ${result.hash}`);

      return {
        success: true,
        txHash: result.hash,
        ledger: result.ledger,
        message: `Token ${assetCode} is now unlocked for DEX trading`,
      };
    } catch (error) {
      log.error(`[StellarService] Error unlocking token ${assetCode}:`, error);
      throw new Error(`Token unlock failed: ${error.message}`);
    }
  }


  /**
   * Emite tokens de segurança e transfere para a conta distribuidora
   * @param {string} code - Código do asset (REQUIRED)
   * @param {number|string} amount - Quantidade de tokens a emitir
   * @param {Object} [options] - Opções adicionais
   * @param {string} [options.homeDomain] - Home domain para stellar.toml
   * @returns {Promise<Object>} Resultado da emissão
   * @throws {Error} Se code não for fornecido, amount for inválido ou houver erro na emissão
   */
  static async issueSecurityToken(code, amount, options = {}) {
    if (!code) {
      throw new Error('Asset code is required');
    }
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();
      const distributorPublicKey = keyManager.getDistributorPublicKey();

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Amount must be a positive number');
      }

      const asset = createAsset(code, issuerPublicKey);

      // ─── Build classic operations ───
      const classicOperations = [];

      // Home domain is always applied if configured (regardless of placement strategy)
      if (options.homeDomain) {
        classicOperations.push(
          Operation.setOptions({
            source: issuerPublicKey,
            homeDomain: options.homeDomain,
          })
        );
      }

      if (options.forSaleContract) {
        // ─── Sale-bound offers: skip distributor entirely ───
        // Tokens will be minted directly into the sale contract via
        // SAC transfer(issuer → contract) during the sale_create chain.
        // No classic payment needed — avoids distributor custody exposure.
        log.info(`[StellarService] forSaleContract=true for ${code} — no distributor ops. Tokens will be minted into sale contract via SAC.`);

        // Ensure at least 1 op for the TX (flags re-assertion is idempotent)
        if (classicOperations.length === 0) {
          classicOperations.push(
            Operation.setOptions({
              source: issuerPublicKey,
              setFlags: AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag,
            })
          );
        }
      } else {
        // ─── Legacy path: trustline + auth + payment to distributor ───
        // Used for private placements, manual distributions, etc.

        // CRITICAL: Use fresh server instances to avoid stale URL bug
        const freshHorizon = createFreshServer();
        const issuerAccount = await freshHorizon.loadAccount(issuerPublicKey);
        const distributorAccount = await freshHorizon.loadAccount(distributorPublicKey);

        // 1. Trustline: Check if distributor needs one
        const trustline = distributorAccount.balances.find(
          (b) => b.asset_code === code && b.asset_issuer === issuerPublicKey
        );

        if (!trustline) {
          log.info(`[StellarService] Including trustline creation for distributor (${distributorPublicKey}) for asset ${code}`);
          classicOperations.push(
            Operation.changeTrust({
              asset: asset,
              source: distributorPublicKey,
            })
          );
        }

        // 2. Authorization: If issuer requires auth, authorize the distributor trustline
        const needsAuth = issuerAccount.flags.auth_required;
        const currentTrust = distributorAccount.balances.find(
          (b) => b.asset_code === code && b.asset_issuer === issuerPublicKey
        );

        if (needsAuth && (!currentTrust || !currentTrust.is_authorized)) {
          log.info(`[StellarService] Including trustline authorization for asset ${code}`);
          classicOperations.push(
            Operation.setTrustLineFlags({
              trustor: distributorPublicKey,
              asset: asset,
              flags: { authorized: true },
              source: issuerPublicKey,
            })
          );
        }

        // 3. Payment (the actual token issuance to distributor)
        classicOperations.push(
          Operation.payment({
            destination: distributorPublicKey,
            asset: asset,
            amount: amount.toString(),
            source: issuerPublicKey,
          })
        );
      }

      // ─── Submit the single atomic transaction ───
      log.info(`[StellarService] Submitting atomic issuance for asset ${code} (${classicOperations.length} ops)`);
      const issuerAccountForTx = await this.getAccountRPC(issuerPublicKey);
      const classicTx = buildTransactionWithAccount(issuerAccountForTx, classicOperations);

      const classicResult = await TransactionManager.submit({
        transaction: classicTx,
        signingRole: 'ISSUER',
        operationType: 'token_issue',
        description: options.forSaleContract
          ? `Register asset ${code} (flags only — tokens minted via SAC later)`
          : `Issue ${amount} ${code} (trustline + auth + payment)`,
        metadata: {
          assetCode: code,
          amount,
          totalSupply: amount,
          description: options.description || null,
          type: options.forSaleContract ? 'sale_registration' : 'classic_issuance',
          issuerPublicKey: issuerPublicKey,
          offerId: options.offerId,
          forSaleContract: options.forSaleContract || false,
        },
        // When forSaleContract, TX only has issuer ops — no distributor signature needed
        ...(options.forSaleContract && {
          requiredSigners: [issuerPublicKey],
          thresholdRequired: 1,
        }),
      });

      // If multisig is pending, return early — can't proceed to SAC until issuance is confirmed
      if (classicResult.status === 'pending_multisig') {
        log.info(`[StellarService] Token issuance queued for MultiSig. ID: ${classicResult.multiSigTransactionId}`);
        return {
          success: true,
          status: 'pending_multisig',
          multiSigTransactionId: classicResult.multiSigTransactionId,
          assetCode: code,
          issuerPublicKey,
          distributorPublicKey,
          amount: amount.toString(),
        };
      }

      if (!classicResult.success) {
        throw new Error(`Classic issuance failed: ${classicResult.userFriendlyError || classicResult.error}`);
      }

      // Wait for ledger close before SAC deployment
      await new Promise(resolve => setTimeout(resolve, 5000));

      // --- TRANSACTION 2: SOROBAN SAC DEPLOYMENT ---
      // This is a separate transaction to avoid simulation errors with multiple ops
      const sacContractId = this.getSACContractId(asset);
      log.info(`[StellarService] Deploying SAC for asset ${code} (${sacContractId})`);

      const sacOp = Operation.createStellarAssetContract({
        asset: asset,
        source: issuerPublicKey,
      });

      // Reload issuer account (sequence number increased)
      const issuerAccountSoroban = await this.getAccountRPC(issuerPublicKey);
      let sacTx = buildTransactionWithAccount(issuerAccountSoroban, [sacOp]);

      log.info(`[StellarService] Preparing Soroban SAC deployment for asset ${code}...`);
      sacTx = await this.prepareSorobanTransaction(sacTx);

      const sacResult = await TransactionManager.submit({
        transaction: sacTx,
        signingRole: 'ISSUER',
        operationType: 'sac_deploy',
        description: `Deploy SAC for asset ${code}`,
        metadata: {
          assetCode: code,
          type: 'sac_deployment',
          sacContractId,
          offerId: options.offerId,
        }
      });

      if (!sacResult.success && sacResult.status !== 'pending_multisig') {
        log.warn(`[StellarService] SAC deployment failed (classic succeeded): ${sacResult.error}`);
      }

      const returnData = {
        success: true,
        assetCode: code,
        issuerPublicKey: issuerPublicKey,
        distributorPublicKey: distributorPublicKey,
        amount: amount.toString(),
        transactionHash: classicResult.hash,
        ledger: classicResult.ledger,
        sacContractId,
        sacTransactionHash: sacResult.hash,
      };

      if (options.homeDomain) {
        returnData.homeDomain = options.homeDomain;
      }

      return returnData;
    } catch (error) {
      log.error('Error issuing security token:', error);
      throw new Error(`Security token issuance failed: ${error.message}`);
    }
  }

  /**
   * Deploys the Stellar Asset Contract (SAC) for an existing asset.
   * @param {string} code - Asset code
   * @param {string} [issuer] - Optional issuer public key (defaults to platform issuer)
   * @returns {Promise<Object>} Deployment result
   */
  static async deploySACForAsset(code, issuer = null, chainMetadata = {}) {
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();

      // Use provided issuer or default to platform issuer
      const assetIssuer = issuer || issuerPublicKey;
      const asset = new Asset(code, assetIssuer);
      const sacContractId = this.getSACContractId(asset);

      log.info(`[StellarService] Deploying SAC for existing asset ${code} (${sacContractId})`);

      const op = Operation.createStellarAssetContract({
        asset: asset,
        source: issuerPublicKey,
      });

      const issuerAccount = await this.getAccountRPC(issuerPublicKey);
      let transaction = buildTransactionWithAccount(issuerAccount, [op]);

      // SAC deployment is a Soroban operation, requires preparation
      transaction = await this.prepareSorobanTransaction(transaction);

      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'ISSUER',
        operationType: 'sac_deploy',
        description: `Deploy SAC for asset ${code}`,
        metadata: {
          assetCode: code,
          sacContractId,
          ...chainMetadata,
        },
      });

      return {
        success: result.success,
        status: result.status,
        sacContractId,
        transactionHash: result.hash,
        multiSigTransactionId: result.multiSigTransactionId,
        error: result.error,
        userFriendlyError: result.userFriendlyError
      };
    } catch (error) {
      log.error(`[StellarService] SAC deployment failed for ${code}:`, error);
      throw error;
    }
  }

  /**
   * Ensures the SAC is deployed for an asset before attempting transfers.
   * If already deployed, returns the contract ID immediately.
   * If not deployed, deploys it and updates the token DB record.
   * @param {string} assetCode - Asset code
   * @param {string} [issuer] - Optional issuer (defaults to platform issuer)
   * @param {Object} [chainMetadata={}] - Metadata for chaining (passed to SAC deploy for post-sign hooks)
   * @returns {Promise<string>} SAC contract ID
   */
  static async ensureSACDeployed(assetCode, issuer = null, chainMetadata = {}) {
    const issuerPublicKey = issuer || keyManager.getIssuerPublicKey();
    const asset = new Asset(assetCode, issuerPublicKey);
    const sacContractId = this.getSACContractId(asset);

    // Check if SAC exists on-chain via RPC
    try {
      const rpcServer = new rpc.Server(getSorobanRpcUrl());
      const instanceKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
        contract: Address.fromString(sacContractId).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }));
      const ledgerEntries = await rpcServer.getLedgerEntries(instanceKey);
      if (ledgerEntries.entries && ledgerEntries.entries.length > 0) {
        log.info(`[StellarService] SAC already deployed for ${assetCode}: ${sacContractId}`);
        return sacContractId;
      }
    } catch (checkError) {
      log.warn(`[StellarService] SAC existence check failed for ${assetCode}, attempting deploy: ${checkError.message}`);
    }

    // SAC not found — check if a deploy is already pending in multisig queue
    try {
      const { default: prisma } = await import('../config/prisma.js');
      const pendingSACDeploy = await prisma.multiSigTransaction.findFirst({
        where: {
          operationType: 'sac_deploy',
          status: 'pending',
          metadata: { path: ['assetCode'], equals: assetCode },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingSACDeploy) {
        log.info(`[StellarService] SAC deploy already pending for ${assetCode} (TX #${pendingSACDeploy.id}). Reusing.`);
        const err = new Error(`SAC deploy pending multisig for ${assetCode}`);
        err.code = 'SAC_PENDING_MULTISIG';
        err.multiSigTransactionId = pendingSACDeploy.id;
        err.sacContractId = sacContractId;
        throw err;
      }
    } catch (dbCheckError) {
      if (dbCheckError.code === 'SAC_PENDING_MULTISIG') throw dbCheckError;
      log.warn(`[StellarService] DB check for pending SAC deploy failed: ${dbCheckError.message}`);
    }

    // No existing pending deploy — create one through multisig
    log.info(`[StellarService] SAC not deployed for ${assetCode}. Deploying via multisig...`);
    const result = await this.deploySACForAsset(assetCode, issuerPublicKey, chainMetadata);

    if (result.status === 'pending_multisig') {
      // SAC deploy queued — throw a typed error so distribution can be chained after signing
      const err = new Error(`SAC deploy pending multisig for ${assetCode}`);
      err.code = 'SAC_PENDING_MULTISIG';
      err.multiSigTransactionId = result.multiSigTransactionId;
      err.sacContractId = sacContractId;
      throw err;
    }

    if (!result.success) {
      throw new Error(`Failed to deploy SAC for ${assetCode}: ${result.error || result.userFriendlyError}`);
    }

    // Update token DB record with sacContractId
    try {
      const { default: prisma } = await import('../config/prisma.js');
      await prisma.token.updateMany({
        where: { assetCode },
        data: { sacContractId },
      });
      log.info(`[StellarService] SAC deployed and DB updated for ${assetCode}: ${sacContractId}`);
    } catch (dbError) {
      log.warn(`[StellarService] SAC deployed but DB update failed for ${assetCode}: ${dbError.message}`);
    }

    return sacContractId;
  }


  /**
   * Distribui tokens para investidor
   * Detecta automaticamente se o destino é uma conta clássica ou Smart Wallet (Soroban)
   * 
   * @param {string} investorPublicKey - Chave pública do investidor (G... ou C...)
   * @param {number|string} amount - Quantidade de tokens a distribuir
   * @param {string} assetCode - Código do asset (REQUIRED)
   * @returns {Promise<Object>} Resultado da distribuição
   */
  static async distributeTokens(investorPublicKey, amount, assetCode, options = {}) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();
      const distributorPublicKey = keyManager.getDistributorPublicKey();

      if (!investorPublicKey || investorPublicKey.length !== 56) {
        throw new Error('Invalid investor public key');
      }

      const isContract = investorPublicKey.startsWith('C');
      const asset = createAsset(assetCode, issuerPublicKey);
      const amountStr = amount.toString();

      let result;

      if (isContract) {
        // --- SOROBAN SAC DISTRIBUTION ---
        log.info(`[StellarService] Distributing via SAC to contract ${investorPublicKey}`);

        // Chain metadata: if SAC deploy needs multisig, these fields let the post-sign
        // hook auto-queue the distribution after SAC is deployed
        const chainMeta = {
          chainAction: 'token_distribute',
          investorPublicKey,
          amount: amountStr,
          investorName: options.investorName,
          investorEmail: options.investorEmail,
          investorId: options.investorId,
          offerId: options.offerId,
          offerName: options.offerName,
          usdcAmount: options.usdcAmount,
          usdcPaymentHash: options.usdcPaymentHash,
          investmentId: options.investmentId,
        };

        let sacContractId;
        try {
          sacContractId = await this.ensureSACDeployed(assetCode, null, chainMeta);
        } catch (sacError) {
          if (sacError.code === 'SAC_PENDING_MULTISIG') {
            // SAC deploy queued for multisig — distribution will be chained after signing
            return {
              success: true,
              status: 'pending_multisig',
              step: 'sac_deploy',
              multiSigTransactionId: sacError.multiSigTransactionId,
              message: `SAC deploy queued (TX #${sacError.multiSigTransactionId}). Distribution will auto-queue after signing.`,
            };
          }
          throw sacError;
        }

        const contract = new Contract(sacContractId);

        // Build 'transfer' call: transfer(from, to, amount)
        const transferOp = contract.call(
          'transfer',
          new Address(distributorPublicKey).toScVal(),
          new Address(investorPublicKey).toScVal(),
          nativeToScVal(BigInt(Math.floor(parseFloat(amountStr) * 10000000)), { type: 'i128' })
        );

        const distributorAccount = await this.getAccountRPC(distributorPublicKey);
        let transaction = buildTransactionWithAccount(distributorAccount, [transferOp]);

        // Soroban Simulation & Preparation
        log.info(`[StellarService] Simulating Soroban SAC transfer...`);
        transaction = await this.prepareSorobanTransaction(transaction);

        result = await TransactionManager.submit({
          transaction,
          signingRole: 'DISTRIBUTOR',
          operationType: 'token_distribute',
          description: `Distribute ${amountStr} ${assetCode} to ${investorPublicKey}`,
          metadata: {
            assetCode,
            amount: amountStr,
            investorPublicKey,
            type: 'soroban_transfer',
            investorName: options.investorName,
            investorEmail: options.investorEmail,
            investorId: options.investorId,
            offerId: options.offerId,
            offerName: options.offerName,
            usdcAmount: options.usdcAmount,
            usdcPaymentHash: options.usdcPaymentHash,
            investmentId: options.investmentId,
          }
        });
      } else {
        // --- CLASSIC STELLAR DISTRIBUTION ---
        try {
          await stellarServer.loadAccount(investorPublicKey);
        } catch (error) {
          if (error.status === 404) {
            log.info(`[StellarService] Investor account ${investorPublicKey} not found. Attempting JIT sponsored trustline...`);
            // Attempt to setup sponsored trustline automatically (JIT)
            const jitResult = await this.setupSponsoredTrustline(investorPublicKey, assetCode);
            if (!jitResult.success) {
              throw new Error(`JIT Sponsorship failed: ${jitResult.error || 'Unknown error'}`);
            }
            log.info(`[StellarService] JIT Sponsored trustline setup successful for ${investorPublicKey}`);
          } else {
            throw error;
          }
        }

        const operations = [
          Operation.payment({
            destination: investorPublicKey,
            asset: asset,
            amount: amountStr,
            source: distributorPublicKey,
          }),
        ];

        // Use RPC for sequence
        const distributorAccount = await this.getAccountRPC(distributorPublicKey);
        const transaction = await buildTransactionWithAccount(distributorAccount, operations, {
          memo: options.memo || null,
        });

        result = await TransactionManager.submit({
          transaction,
          signingRole: 'DISTRIBUTOR',
          operationType: 'token_distribute',
          description: `Distribute ${amountStr} ${assetCode} to ${investorPublicKey}`,
          metadata: {
            assetCode,
            amount: amountStr,
            investorPublicKey,
            type: 'classic_payment',
            investorName: options.investorName,
            investorEmail: options.investorEmail,
            investorId: options.investorId,
            offerId: options.offerId,
            offerName: options.offerName,
            usdcAmount: options.usdcAmount,
            usdcPaymentHash: options.usdcPaymentHash,
            investmentId: options.investmentId,
            memo: options.memo
          }
        });
      }

      // Handle pending multisig (distribution queued for admin signing)
      if (result.status === 'pending_multisig') {
        return {
          success: true,
          status: 'pending_multisig',
          step: 'token_distribute',
          multiSigTransactionId: result.multiSigTransactionId,
          assetCode,
          investorPublicKey,
          amount: amountStr,
          message: `Distribution queued for multisig (TX #${result.multiSigTransactionId})`,
        };
      }

      if (!result.success) {
        if (result.userFriendlyError) {
          throw new Error(result.userFriendlyError);
        }
        if (result.resultCodes && result.resultCodes.operation === 'op_no_trust') {
          throw new Error('Investor must establish and be whitelisted for this asset trustline first');
        }
        throw new Error(`Failed to distribute tokens: ${result.error}`);
      }

      return {
        success: true,
        assetCode,
        investorPublicKey,
        amount: amountStr,
        transactionHash: result.hash,
        ledger: result.ledger,
      };
    } catch (error) {
      log.error('Error distributing tokens:', error);
      throw error;
    }
  }

  /**
   * Realiza uma retirada do Tesouro (OpEx)
   * Suporta destinos clássicos (G...) e Smart Wallets (C...)
   * 
   * @param {string} destination - Endereço de destino (G... ou C...)
   * @param {string} amount - Valor a ser retirado
   * @param {string} assetCode - Código do asset (ex: 'USDC', 'XLM')
   * @param {string} description - Descrição da retirada
   * @param {Object} [extraMetadata={}] - Additional metadata to store with the multisig transaction
   * @returns {Promise<Object>} Resultado da retirada
   */
  static async withdrawFromTreasury(destination, amount, assetCode, description, extraMetadata = {}, operationType = 'treasury_payment') {
    try {
      const treasuryPublicKey = keyManager.getTreasuryPublicKey();
      const issuerPublicKey = keyManager.getIssuerPublicKey();

      const isContract = destination.startsWith('C');
      const isNative = assetCode === 'XLM';
      const isUSDC = assetCode === 'USDC';

      // For USDC, use getUsdcIssuer() which returns the correct issuer for the current network
      // For other assets, use the platform issuer
      let asset;
      if (isNative) {
        asset = Asset.native();
      } else if (isUSDC) {
        asset = new Asset('USDC', getUsdcIssuer());
      } else {
        asset = new Asset(assetCode, issuerPublicKey);
      }

      const amountStr = amount.toString();
      let result;

      if (isContract) {
        // --- SOROBAN SAC TRANSFER (for C-addresses) ---
        log.info(`[StellarService] Treasury withdrawal via SAC to contract ${destination}`);

        if (isNative) {
          // Native XLM cannot be sent via SAC, need to wrap or use different approach
          // For now, throw an error - XLM direct to C-address requires different handling
          throw new Error('Native XLM cannot be sent directly to smart contracts via classic operations. Use wrapped XLM or fund the contract sponsor account.');
        }

        const sacContractId = this.getSACContractId(asset);
        const contract = new Contract(sacContractId);

        // Build 'transfer' call: transfer(from, to, amount)
        const transferOp = contract.call(
          'transfer',
          new Address(treasuryPublicKey).toScVal(),
          new Address(destination).toScVal(),
          nativeToScVal(BigInt(Math.floor(parseFloat(amountStr) * 10000000)), { type: 'i128' })
        );

        const treasuryAccount = await this.getAccountRPC(treasuryPublicKey);
        let transaction = buildTransactionWithAccount(treasuryAccount, [transferOp]);

        // Soroban Simulation & Preparation
        log.info(`[StellarService] Simulating Soroban SAC treasury transfer...`);
        transaction = await this.prepareSorobanTransaction(transaction);

        result = await TransactionManager.submit({
          transaction,
          signingRole: 'TREASURY',
          operationType,
          description: `OpEx: ${description}`,
          metadata: {
            destination,
            amount: amountStr,
            assetCode,
            type: 'soroban_treasury_transfer',
            ...extraMetadata
          }
        });
      } else {
        // --- CLASSIC STELLAR PAYMENT (for G-addresses) ---
        const operations = [
          Operation.payment({
            destination,
            asset,
            amount: amountStr,
            source: treasuryPublicKey,
          }),
        ];

        // Use RPC for sequence
        const treasuryAccount = await this.getAccountRPC(treasuryPublicKey);
        const transaction = await buildTransactionWithAccount(treasuryAccount, operations, {
          memo: description.substring(0, 28) // Text memo limit
        });

        result = await TransactionManager.submit({
          transaction,
          signingRole: 'TREASURY',
          operationType,
          description: `OpEx: ${description}`,
          metadata: {
            destination,
            amount: amountStr,
            assetCode,
            type: 'classic_treasury_payment',
            ...extraMetadata
          }
        });
      }

      if (result.status === 'pending_multisig') {
        return {
          success: true,
          status: 'pending_multisig',
          ...result
        };
      }

      return result;
    } catch (error) {
      log.error('Error in treasury withdrawal:', error);
      throw error;
    }
  }

  /**
   * Obtém o Contract ID do Stellar Asset Contract (SAC) para um asset
   * @param {Asset} asset - Objeto Asset
   * @returns {string} Contract ID (C...)
   */
  static getSACContractId(asset) {
    const networkPassphrase = getNetworkPassphrase();
    const networkId = hash(Buffer.from(networkPassphrase));

    // Preimage from Asset
    const xdrAsset = asset.toXDRObject();
    const contractIdPreimage = xdr.ContractIdPreimage.contractIdPreimageFromAsset(xdrAsset);

    const contractIdHash = hash(
      xdr.HashIdPreimage.envelopeTypeContractId(new xdr.HashIdPreimageContractId({
        networkId,
        contractIdPreimage,
      })).toXDR()
    );

    return StrKey.encodeContract(contractIdHash);
  }


  /**
   * Congela conta do investidor revogando a autorização da trustline
   * Remove a flag AuthRequiredFlag, impedindo transferências do asset
   * @param {string} investorPublicKey - Chave pública do investidor (56 caracteres)
   * @param {string} assetCode - Código do asset (REQUIRED)
   * @returns {Promise<Object>} Resultado do congelamento
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.investorPublicKey - Chave pública do investidor
   * @returns {string} returns.assetCode - Código do asset
   * @returns {string} returns.transactionHash - Hash da transação
   * @returns {number} returns.ledger - Número do ledger
   * @returns {string} returns.message - Mensagem de confirmação
   * @throws {Error} Se assetCode não for fornecido, chave inválida, conta não existir ou trustline não existir
   */
  static async freezeAccount(investorPublicKey, assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();

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

      const asset = createAsset(assetCode, issuerPublicKey);

      const operations = [
        Operation.setTrustLineFlags({
          trustor: investorPublicKey,
          asset: asset,
          flags: {
            authorized: false
          },
          source: issuerPublicKey
        }),
      ];

      // Use RPC for sequence
      const issuerAccountForFreeze = await this.getAccountRPC(issuerPublicKey);
      const transaction = await buildTransactionWithAccount(issuerAccountForFreeze, operations);
      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'ISSUER',
        operationType: 'freeze_account',
        description: `Freeze account ${investorPublicKey} for asset ${assetCode}`,
        metadata: { investorPublicKey, assetCode }
      });

      if (result.status === 'pending_multisig') {
        return {
          success: true,
          status: 'pending_multisig',
          ...result
        };
      }

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
      log.error('Error freezing account:', error);
      throw new Error(`Account freeze failed: ${error.message}`);
    }
  }

  /**
   * Authorize an investor to hold a specific asset (White-listing)
   * This sets the Authorized flag on the trustline
   * 
   * @param {string} investorPublicKey - Investor's wallet address
   * @param {string} assetCode - The asset code
   * @returns {Promise<Object>} Transaction result
   */
  static async authorizeInvestor(investorPublicKey, assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    log.info(`[StellarService] Authorizing investor ${investorPublicKey} for asset ${assetCode}`);

    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();
      const server = stellarServer;
      const asset = createAsset(assetCode, issuerPublicKey);

      // Check if trustline exists first
      try {
        const account = await server.loadAccount(investorPublicKey);
        // Check for trustline (classic or contract wallet)
        const hasTrustline = account.balances.some(b =>
          (b.asset_code === assetCode && b.asset_issuer === issuerPublicKey) ||
          (b.asset_type === 'native' && assetCode === 'XLM') // Should not happen for security tokens but good safety
        );

        if (!hasTrustline) {
          log.info(`[StellarService] Investor ${investorPublicKey} does not have a trustline for ${assetCode} yet. Skip auth.`);
          return { success: false, reason: 'No trustline' };
        }
      } catch (err) {
        log.info(`[StellarService] Investor account ${investorPublicKey} not found on ledger (might be un-funded). Skip auth.`);
        return { success: false, reason: 'Account not found' };
      }

      // Set Authorized Flag (1)
      const op = Operation.setTrustLineFlags({
        trustor: investorPublicKey,
        asset: asset,
        flags: {
          authorized: true,
          authorizedToMaintainLiabilities: false
        },
        source: issuerPublicKey
      });

      // Use custom build/submit to reuse loaded issuer account if possible, or force load new
      // For simplicity reusing standard internal flow
      // Use RPC for sequence
      const issuerAccount = await this.getAccountRPC(issuerPublicKey);
      const tx = buildTransactionWithAccount(issuerAccount, [op]);

      const result = await TransactionManager.submit({
        transaction: tx,
        signingRole: 'ISSUER',
        operationType: 'trustline_auth',
        description: `Authorize investor ${investorPublicKey} for asset ${assetCode}`,
        metadata: { investorPublicKey, assetCode }
      });

      if (result.status === 'pending_multisig') {
        return {
          success: true,
          status: 'pending_multisig',
          ...result
        };
      }

      return result;

    } catch (error) {
      log.error(`[StellarService] Failed to authorize investor:`, error);
      // Don't throw logic error, just return failure so bulk auth can continue
      return { success: false, error: error.message };
    }
  }

  /**
   * Configura uma trustline patrocinada para um investidor.
   * Utiliza CAP-33 (Sponsorship) para cobrir o reserve de 0.5 XLM.
   * Returns unsigned XDR for the frontend/caller to sign.
   * 
   * @param {string} investorPublicKey - Chave pública do investidor
   * @param {string} assetCode - Código do asset
   * @returns {Promise<Object>} Resultado da transação ou XDR para assinatura
   */
  static async setupSponsoredTrustline(investorPublicKey, assetCode) {
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();
      const operationsKeypair = getOperationsKeypair();
      const asset = createAsset(assetCode, issuerPublicKey);

      log.info(`[StellarService] Setting up sponsored trustline for ${investorPublicKey} (${assetCode})`);

      // 1. Verificar se a conta do investidor existe
      let investorExists = true;
      try {
        await stellarServer.loadAccount(investorPublicKey);
      } catch (error) {
        if (error.status === 404) {
          investorExists = false;
        } else {
          throw error;
        }
      }

      // 2. Carregar conta de operações via RPC (Sponsor)
      const sponsorAccount = await this.getAccountRPC(operationsKeypair.publicKey());

      // 3. Iniciar construção da transação
      const transactionBuilder = new TransactionBuilder(sponsorAccount, {
        fee: BASE_FEE,
        networkPassphrase: getNetworkPassphrase(),
      });

      // Operação 1: Criar conta se não existir (Patrocinado)
      if (!investorExists) {
        transactionBuilder.addOperation(Operation.beginSponsoringFutureReserves({
          sponsoredID: investorPublicKey,
          source: operationsKeypair.publicKey()
        }));

        transactionBuilder.addOperation(Operation.createAccount({
          destination: investorPublicKey,
          startingBalance: '0', // No balance needed if sponsored
          source: operationsKeypair.publicKey()
        }));

        transactionBuilder.addOperation(Operation.endSponsoringFutureReserves({
          source: investorPublicKey
        }));
      }

      // Operação 2: Adicionar Trustline (Patrocinada)
      transactionBuilder.addOperation(Operation.beginSponsoringFutureReserves({
        sponsoredID: investorPublicKey,
        source: operationsKeypair.publicKey()
      }));

      transactionBuilder.addOperation(Operation.changeTrust({
        asset: asset,
        source: investorPublicKey
      }));

      transactionBuilder.addOperation(Operation.endSponsoringFutureReserves({
        source: investorPublicKey
      }));

      transactionBuilder.setTimeout(TransactionBuilder.TIMEOUT_INFINITE);
      const transaction = transactionBuilder.build();

      // Sign with Sponsor (Operations)
      transaction.sign(operationsKeypair);

      // Return unsigned XDR for the frontend/caller to sign
      return {
        success: true,
        requiresSignature: true,
        xdr: transaction.toXDR(),
        sponsored: true
      };

    } catch (error) {
      log.error('[StellarService] Error in setupSponsoredTrustline:', error);
      throw new Error(`Failed to setup sponsored trustline: ${error.message}`);
    }
  }




  /**
   * Descongela conta do investidor restaurando a autorização da trustline
   * Ativa a flag AUTHORIZED_FLAG
   * @param {string} investorPublicKey - Chave pública do investidor (56 caracteres)
   * @param {string} assetCode - Código do asset (REQUIRED)
   * @returns {Promise<Object>} Resultado do descongelamento
   */
  static async unfreezeAccount(investorPublicKey, assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();

      if (!investorPublicKey || investorPublicKey.length !== 56) {
        throw new Error('Invalid investor public key');
      }

      const asset = createAsset(assetCode, issuerPublicKey);

      const operations = [
        Operation.setTrustLineFlags({
          trustor: investorPublicKey,
          asset: asset,
          setFlags: 1, // AUTHORIZED_FLAG = 1
        }),
      ];

      const transaction = await this.buildUnsignedTransaction(issuerPublicKey, operations);
      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'ISSUER',
        operationType: 'freeze_account',
        description: `Unfreeze account ${investorPublicKey} for asset ${assetCode}`,
        metadata: { investorPublicKey, assetCode }
      });

      if (result.status === 'pending_multisig') {
        return {
          success: true,
          status: 'pending_multisig',
          ...result
        };
      }

      if (!result.success) {
        throw new Error(`Failed to unfreeze account: ${result.error}`);
      }

      return {
        success: true,
        investorPublicKey,
        assetCode,
        transactionHash: result.hash,
        ledger: result.ledger,
        message: 'Account unfrozen successfully (trustline authorization restored)',
      };
    } catch (error) {
      log.error('Error unfreezing account:', error);
      throw new Error(`Account unfreeze failed: ${error.message}`);
    }
  }

  /**
   * Desabilita permanentemente a capacidade de clawback para uma trustline específica.
   * Usado para garantir finalidade de posse para investidores verificados.
   * 
   * @param {string} investorPublicKey - Chave pública do investidor
   * @param {string} assetCode - Código do asset
   * @returns {Promise<Object>} Resultado da transação
   */
  static async disableClawbackForTrustline(investorPublicKey, assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();

      if (!investorPublicKey || investorPublicKey.length !== 56) {
        throw new Error('Invalid investor public key');
      }

      const asset = createAsset(assetCode, issuerPublicKey);

      const operations = [
        Operation.setTrustLineFlags({
          trustor: investorPublicKey,
          asset: asset,
          // CLAWBACK_ENABLED_FLAG = 4
          clearFlags: 4,
        }),
      ];

      const transaction = await this.buildUnsignedTransaction(issuerPublicKey, operations);
      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'ISSUER',
        operationType: 'disable_clawback',
        description: `Disable clawback for ${investorPublicKey} for asset ${assetCode}`,
        metadata: { investorPublicKey, assetCode }
      });

      if (result.status === 'pending_multisig') {
        return {
          success: true,
          status: 'pending_multisig',
          ...result
        };
      }

      if (!result.success) {
        throw new Error(`Failed to disable clawback: ${result.error}`);
      }

      return {
        success: true,
        investorPublicKey,
        assetCode,
        transactionHash: result.hash,
        ledger: result.ledger,
        message: 'Clawback capability disabled for this trustline successfully',
      };
    } catch (error) {
      log.error('Error disabling clawback for trustline:', error);
      throw new Error(`Disable clawback failed: ${error.message}`);
    }
  }

  /**
   * Builds the operation to disable clawback for a trustline (Internal helper)
   */
  static buildDisableClawbackOp(investorPublicKey, assetCode) {
    const issuerPublicKey = keyManager.getIssuerPublicKey();
    const asset = createAsset(assetCode, issuerPublicKey);
    return Operation.setTrustLineFlags({
      trustor: investorPublicKey,
      asset: asset,
      clearFlags: 4, // AuthClawbackEnabledFlag = 4
    });
  }

  /**
   * Recupera tokens (clawback) do investidor
   * Retira tokens da conta do investidor e retorna para o emissor
   * Requer que o asset tenha AuthClawbackEnabledFlag habilitada
   * @param {string} investorPublicKey - Chave pública do investidor (56 caracteres)
   * @param {number|string} amount - Quantidade de tokens a recuperar
   * @param {string} assetCode - Código do asset (REQUIRED)
   * @returns {Promise<Object>} Resultado do clawback
   * @returns {boolean} returns.success - Indica sucesso
   * @returns {string} returns.investorPublicKey - Chave pública do investidor
   * @returns {string} returns.assetCode - Código do asset
   * @returns {string} returns.amount - Quantidade recuperada
   * @returns {string} returns.transactionHash - Hash da transação
   * @returns {number} returns.ledger - Número do ledger
   * @returns {string} returns.message - Mensagem de confirmação
   * @throws {Error} Se assetCode não for fornecido, chave inválida, saldo insuficiente, conta não existir ou clawback não autorizado
   */
  static async clawbackTokens(investorPublicKey, amount, assetCode) {
    if (!assetCode) {
      throw new Error('assetCode is required');
    }
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();

      if (!investorPublicKey || investorPublicKey.length !== 56) {
        throw new Error('Invalid investor public key');
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Amount must be a positive number');
      }

      try {
        const account = await stellarServer.loadAccount(investorPublicKey);
        const balance = account.balances.find(
          (bal) => bal.asset_code === assetCode && bal.asset_issuer === issuerPublicKey
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

      const asset = createAsset(assetCode, issuerPublicKey);

      const operations = [
        Operation.clawback({
          asset: asset,
          from: investorPublicKey,
          amount: amount.toString(),
        }),
      ];

      const transaction = await this.buildUnsignedTransaction(issuerPublicKey, operations);
      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'ISSUER',
        operationType: 'clawback',
        description: `Clawback ${amount} ${assetCode} from ${investorPublicKey}`,
        metadata: { assetCode, amount, investorPublicKey }
      });

      if (result.status === 'pending_multisig') {
        return {
          success: true,
          status: 'pending_multisig',
          ...result
        };
      }

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
      log.error('Error clawing back tokens:', error);
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
      const issuerPublicKey = keyManager.getIssuerPublicKey();

      const account = await stellarServer.loadAccount(publicKey);

      const balance = account.balances.find(
        (bal) => bal.asset_code === assetCode && bal.asset_issuer === issuerPublicKey
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
      log.error('Error getting token balance:', error);
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
          authRequired: account.flags.auth_required,
          authRevocable: account.flags.auth_revocable,
          authImmutable: account.flags.auth_immutable,
          authClawbackEnabled: account.flags.auth_clawback_enabled,
        },
      };
    } catch (error) {
      log.error('Error getting account info:', error);
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
  static async verifyUSDCPayment(investorPublicKey, expectedAmount, treasuryPublicKey = null, windowMinutes = 2, expectedMemo = null) {
    try {
      const treasuryKey = treasuryPublicKey || process.env.TREASURY_PUBLIC_KEY;
      if (!treasuryKey) {
        throw new Error('TREASURY_PUBLIC_KEY not configured');
      }

      const USDC_ISSUER = getUsdcIssuer();
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

        // Verificar destino
        if (payment.to !== treasuryKey) {
          return false;
        }

        // --- RELIABILITY FIX: MEMO CHECK ---
        if (expectedMemo) {
          // If we expect a specific Memo (Strong Validation), check it.
          // We do NOT strictly check 'from' because the user might be sending from an Exchange (Coinbase, Binance)
          // where the sender address is the Exchange's Hot Wallet, not the User's registered key.
          // The Memo is the unique identifier.
          if (payment.memo !== expectedMemo && payment.transaction_attr && payment.transaction_attr.memo !== expectedMemo) {
            // Check both direct memo field and transaction attribute if available
            // Note: Horizon response structure for payments usually excludes memo directly,
            // we might need to fetch transaction details if memo is not on the payment record.
            // However, for efficiency, we assume the memo is needed.
            // Actually, the 'payments' endpoint does NOT return the Memo!
            // The 'transactions' endpoint returns the Memo.
            // We might need to fetch the transaction for EACH candidate or use the transactions endpoint initially.
            // Optimization: Using 'payments' is faster for filtering. If we match Amount/Time, THEN fetch Transaction to verify Memo.
            return false;
          }
        } else {
          // Legacy/Fallback: Strict Sender Check (only works for self-custody wallets)
          if (payment.from !== investorPublicKey) {
            return false;
          }
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

      // --- MEMO VERIFICATION (Double Check) ---
      // Since the 'payments' endpoint response might not contain the memo, we MUST fetch the transaction details
      // to rely on it for security.
      if (expectedMemo) {
        try {
          const tx = await matchingPayment.transaction();
          if (tx.memo !== expectedMemo) {
            log.info(`[verifyUSDCPayment] Memo mismatch. Expected: ${expectedMemo}, Got: ${tx.memo}`);
            return null;
          }
        } catch (err) {
          log.error(`[verifyUSDCPayment] Failed to fetch transaction ${matchingPayment.transaction_hash} for memo check`, err);
          return null;
        }
      }

      // Check if this payment was already used for another investment
      const { Investment } = await import('../models/Investment.js');
      const existingInvestment = await Investment.findByUSDC(matchingPayment.transaction_hash);
      if (existingInvestment) {
        log.info(`[verifyUSDCPayment] Payment ${matchingPayment.transaction_hash} already claimed by investment ${existingInvestment.id}`);
        return null; // Already claimed - prevent double-spend
      }

      return {
        transactionHash: matchingPayment.transaction_hash,
        amount: matchingPayment.amount,
        createdAt: matchingPayment.created_at,
        ledger: matchingPayment.ledger,
        memo: expectedMemo, // Return the verified memo
      };
    } catch (error) {
      log.error('Error verifying USDC payment:', error);
      throw new Error(`Failed to verify USDC payment: ${error.message}`);
    }
  }

  /**
   * Lista todos os holders de um determinado asset
   * Usa a API do Horizon para buscar contas com trustlines para o asset
   * @param {string} assetCode - Código do asset
   * @returns {Promise<Array>} Lista de holders e seus balances
   */
  static async listAssetHolders(assetCode) {
    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();
      const accounts = await stellarServer
        .accounts()
        .forAsset(`${assetCode}:${issuerPublicKey}`)
        .call();

      return accounts.records.map(account => {
        const balance = account.balances.find(
          b => b.asset_code === assetCode && b.asset_issuer === issuerPublicKey
        );

        return {
          publicKey: account.account_id,
          balance: balance.balance,
          authorized: balance.is_authorized,
          authorizedToMaintainLiabilities: balance.is_authorized_to_maintain_liabilities,
          clawbackEnabled: balance.is_clawback_enabled,
        };
      });
    } catch (error) {
      log.error('Error listing asset holders:', error);
      throw new Error(`Failed to list asset holders: ${error.message}`);
    }
  }

  /**
   * Automations: Authorize all project trustlines for a specific investor
   * Usually called after KYC approval
   * @param {string} investorPublicKey - Investor's public key
   * @returns {Promise<Object>} Summary of authorizations
   */
  static async authorizeAllUserTrustlines(investorPublicKey) {
    if (!investorPublicKey) throw new Error('investorPublicKey is required');

    // Smart wallets (C... contract addresses) use SAC for token balances,
    // not classic trustlines. Authorization is handled at the SAC level.
    if (investorPublicKey.startsWith('C')) {
      log.info(`[Whitelisting] Skipping classic trustline auth for smart wallet ${investorPublicKey} — uses SAC`);
      return { success: true, authorizedCount: 0, message: 'Smart wallet — uses SAC, no classic trustlines needed' };
    }

    try {
      const issuerPublicKey = keyManager.getIssuerPublicKey();
      const account = await stellarServer.loadAccount(investorPublicKey);

      // Find all trustlines that are NOT authorized
      const unauthorizedTrustlines = account.balances.filter(b =>
        b.asset_type !== 'native' &&
        b.asset_issuer === issuerPublicKey &&
        !b.is_authorized
      );

      if (unauthorizedTrustlines.length === 0) {
        return { success: true, authorizedCount: 0, message: 'No trustlines to authorize' };
      }

      log.info(`[Whitelisting] Authorizing ${unauthorizedTrustlines.length} trustlines for ${investorPublicKey}`);

      const operations = unauthorizedTrustlines.map(tl =>
        Operation.setTrustLineFlags({
          trustor: investorPublicKey,
          asset: createAsset(tl.asset_code, tl.asset_issuer),
          flags: { authorized: true },
        })
      );

      const transaction = await this.buildUnsignedTransaction(issuerPublicKey, operations);
      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'ISSUER',
        operationType: 'trustline_auth',
        description: `Bulk authorization for investor ${investorPublicKey}`,
        metadata: { investorPublicKey, assets: unauthorizedTrustlines.map(tl => tl.asset_code) }
      });

      if (result.status === 'pending_multisig') {
        return {
          success: true,
          status: 'pending_multisig',
          ...result
        };
      }

      if (!result.success) {
        throw new Error(`Failed to authorize trustlines: ${result.error}`);
      }

      return {
        success: true,
        authorizedCount: unauthorizedTrustlines.length,
        transactionHash: result.hash,
        assets: unauthorizedTrustlines.map(tl => tl.asset_code)
      };
    } catch (error) {
      log.error('Error in authorizeAllUserTrustlines:', error);
      throw error;
    }
  }

  /**
   * Simulates a Soroban transaction to estimate resources and fees.
   * @param {Transaction|FeeBumpTransaction} transaction - The transaction to simulate
   * @returns {Promise<rpc.Api.SimulateTransactionResponse>} Simulation result
   */
  static async simulateSorobanTransaction(transaction) {
    try {
      const rpcServer = new rpc.Server(getSorobanRpcUrl());
      const response = await rpcServer.simulateTransaction(transaction);

      if (rpc.Api.isSimulationError(response)) {
        throw new Error(`Soroban simulation failed: ${response.error}`);
      }

      return response;
    } catch (error) {
      log.error('[StellarService] Soroban simulation error:', error);
      throw error;
    }
  }

  /**
   * Simulates and prepares a Soroban transaction by applying resource limits and fees.
   * @param {Transaction} transaction - The transaction to prepare
   * @returns {Promise<Transaction>} Prepared transaction
   */
  static async prepareSorobanTransaction(transaction) {
    try {
      const rpcServer = new rpc.Server(getSorobanRpcUrl());

      // 1. Simulate
      const simulation = await this.simulateSorobanTransaction(transaction);

      // 2. Assemble (applies resources to footprint/auth/etc)
      let preparedTx = rpc.assembleTransaction(transaction, simulation);

      // ULTRATHINK FIX: assembleTransaction might return a TransactionBuilder instead of a Transaction
      // We must build it to get the signable Transaction object
      if (preparedTx instanceof TransactionBuilder) {
        log.info('[StellarService] assembleTransaction returned a Builder. Building transaction...');
        preparedTx = preparedTx.build();
      }

      // 3. Set a safer fee based on simulation
      // We add a small margin to the suggested fee to ensure execution
      const suggestedFee = parseInt(preparedTx.fee);
      const safeFee = Math.ceil(suggestedFee * 1.15).toString();

      // Re-build with the safe fee if it's a standard Transaction
      // Note: FeeBumpTransaction fees are handled differently
      if (preparedTx instanceof Transaction) {
        // Unfortunately assembleTransaction returns a new transaction, 
        // but we might want to adjust the fee further.
        // However, assembleTransaction already sets a valid fee.
      }

      return preparedTx;
    } catch (error) {
      log.error('[StellarService] Soroban preparation error:', error);
      throw error;
    }
  }

  /**
   * Extends the TTL (Time-To-Live) of a Soroban contract (instance and wasm code).
   * @param {string} contractId - The ID of the contract to extend.
   * @param {number} [ledgersToExtend=100000] - Number of ledgers to extend the TTL by.
   * @returns {Promise<Object>} Result of the extension transaction.
   */
  static async extendContractTTL(contractId, ledgersToExtend = 500000) {
    try {
      const operationsKeypair = getOperationsKeypair();
      const operationsAccount = await stellarServer.loadAccount(operationsKeypair.publicKey());
      const contract = new Contract(contractId);

      log.info(`[StellarService] Extending TTL for contract ${contractId} by ${ledgersToExtend} ledgers`);

      // 1. Create the extend operation
      const extendOp = Operation.extendFootprintTtl({
        extendTo: ledgersToExtend,
      });

      // 2. Get contract instance and code footprints
      //    (Following canonical pattern from Stellar docs: extending-wasm-ttl.md)
      const rpcServer = new rpc.Server(getSorobanRpcUrl());
      const instance = contract.getFootprint();

      // Fetch the contract instance to extract the WASM hash
      const ledgerEntries = await rpcServer.getLedgerEntries(instance);
      if (!ledgerEntries.entries || ledgerEntries.entries.length === 0) {
        throw new Error(`Contract instance not found for ${contractId}`);
      }

      // Build footprint: always include instance, add WASM code only for Wasm-based contracts
      // SACs (Stellar Asset Contracts) are protocol-native and have no WASM code
      const instanceEntry = ledgerEntries.entries[0].val.contractData();
      const executable = instanceEntry.val().instance().executable();
      const readOnlyKeys = [instance];

      // Check if this is a Wasm-based contract (not a SAC)
      const wasmHashRaw = executable.wasmHash?.();
      if (wasmHashRaw) {
        const contractCode = xdr.LedgerKey.contractCode(
          new xdr.LedgerKeyContractCode({
            hash: Buffer.from(wasmHashRaw.toString('hex'), 'hex'),
          })
        );
        readOnlyKeys.push(contractCode);
        log.info(`[StellarService] Including WASM code in TTL extension footprint`);
      } else {
        log.info(`[StellarService] SAC contract detected — extending instance only`);
      }

      // 3. Build soroban data footprint and transaction
      //    (TransactionBuilder.setSorobanData wraps in SorobanDataBuilder internally)
      const footprint = new xdr.LedgerFootprint({
        readOnly: readOnlyKeys,
        readWrite: [],
      });

      const sorobanData = new xdr.SorobanTransactionData({
        resources: new xdr.SorobanResources({
          footprint,
          instructions: 0,
          diskReadBytes: 0,
          writeBytes: 0,
        }),
        ext: new xdr.SorobanTransactionDataExt(0),
        resourceFee: new xdr.Int64(0),
      });

      let transaction = new TransactionBuilder(operationsAccount, {
        fee: BASE_FEE,
        networkPassphrase: getNetworkPassphrase(),
      })
        .setSorobanData(sorobanData)
        .addOperation(extendOp)
        .setTimeout(300)
        .build();

      // 4. Prepare via RPC simulation (sets proper fees/resources)
      transaction = await this.prepareSorobanTransaction(transaction);

      // 5. Submit
      const result = await TransactionManager.submit({
        transaction,
        signingRole: 'OPERATIONS',
        operationType: 'other',
        description: `Extend TTL for contract ${contractId}`,
        metadata: { contractId, ledgersToExtend }
      });

      return result;
    } catch (error) {
      log.error(`[StellarService] Failed to extend TTL for contract ${contractId}:`, error);
      throw error;
    }
  }

  /**
   * Checks the current TTL (Time-To-Live) of a contract.
   * @param {string} contractId - The ID of the contract to check.
   * @returns {Promise<Object>} TTL information.
   */
  static async getContractTTL(contractId) {
    try {
      const rpcServer = new rpc.Server(getSorobanRpcUrl());
      const instanceKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
        contract: Address.fromString(contractId).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }));

      const response = await rpcServer.getLedgerEntries(instanceKey);
      if (!response.entries || response.entries.length === 0) {
        return { exists: false };
      }

      const entry = response.entries[0];
      const latestLedger = await rpcServer.getLatestLedger();

      return {
        exists: true,
        liveUntilLedger: entry.liveUntilLedgerSeq,
        currentLedger: latestLedger.sequence,
        ttlRemaining: entry.liveUntilLedgerSeq - latestLedger.sequence,
      };
    } catch (error) {
      log.error(`[StellarService] Error checking TTL for ${contractId}:`, error);
      throw error;
    }
  }

  /**
   * Lists all assets held by a specific account (usually the Distributor)
   * @param {string} publicKey - The public key of the account to check
   * @returns {Promise<Array>} List of assets with their balances
   */
  static async listAccountAssets(publicKey) {
    try {
      const account = await stellarServer.loadAccount(publicKey);
      return account.balances
        .filter(b => b.asset_type !== 'native')
        .map(b => ({
          assetCode: b.asset_code,
          assetIssuer: b.asset_issuer,
          balance: b.balance,
          isAuthorized: b.is_authorized,
        }));
    } catch (error) {
      log.error(`[StellarService] Error listing assets for account ${publicKey}:`, error);
      throw new Error(`Failed to list account assets: ${error.message}`);
    }
  }
}
