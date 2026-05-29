import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import esmock from 'esmock';

describe('StellarService Unit Tests', async () => {

  describe('Structure Tests (No Mocks)', async () => {
    test('StellarService exports correctly', async () => {
      // Need to handle potential import errors if SDK is not mocked here and environment is strict,
      // but for structure tests we often just try to import.
      // Using esmock here too to avoid side effects of real config loading
      const module = await esmock('../../../src/services/stellar.service.js', {
        '@stellar/stellar-sdk': {
          Account: class { },
          rpc: { Server: class { } },
          Keypair: {},
          Network: { use: () => { } },
          Networks: { TESTNET: 'TESTNET' },
          BASE_FEE: '100',
          Operation: {},
          TransactionBuilder: {},
          StrKey: {},
          hash: {},
          Address: {},
          Contract: {},
          scValToNative: () => { },
          nativeToScVal: () => { }
        },
        '../../../src/config/stellar.js': {
          stellarServer: {},
          getSorobanRpcUrl: () => 'http://mock-rpc',
          getSorobanServer: () => new (class { })(),
          getIssuerKeypair: () => { },
          getDistributorKeypair: () => { },
          getTreasuryKeypair: () => { },
          getOperationsKeypair: () => { },
          getNetworkPassphrase: () => 'pass',
          createFreshServer: () => { },
          createAsset: () => { },
          buildTransaction: () => { },
          buildTransactionWithAccount: () => { },
          signAndSubmitTransaction: () => { },
        },
        '../../../src/services/transactionManager.service.js': {
          TransactionManager: {}
        }
      });
      const { StellarService } = module;
      assert.ok(StellarService);

      const methods = [
        'createIssuerAccount',
        'unlockToken',
        'issueSecurityToken',
        'distributeTokens',
        'withdrawFromTreasury',
        'getAccountRPC'
      ];
      methods.forEach(method => {
        assert.strictEqual(typeof StellarService[method], 'function', `${method} should be a function`);
      });
    });
  });

  describe('RPC Migration Tests', async () => {
    let StellarService;
    let rpcMock;
    let loadAccountCalled = false;

    beforeEach(async () => {
      loadAccountCalled = false;
      rpcMock = {
        Server: class MockServer {
          constructor(url) { this.url = url; }
          async getAccount(key) {
            return { id: key, sequence: '999' };
          }
        }
      };

      const module = await esmock('../../../src/services/stellar.service.js', {
        '@stellar/stellar-sdk': {
          rpc: rpcMock,
          Account: class { }, // Stub base class
          Keypair: { fromSecret: () => ({ publicKey: () => 'PK' }) },
          Network: { use: () => { } },
          Networks: { TESTNET: 'TESTNET' },
          BASE_FEE: '100',
          Operation: {},
          TransactionBuilder: {},
          StrKey: {},
          hash: {},
          Address: {},
          Contract: {},
          scValToNative: () => { },
          nativeToScVal: () => { }
        },
        '../../../src/config/stellar.js': {
          // Mock config dependencies
          getSorobanRpcUrl: () => 'https://soroban-testnet.stellar.org',
          getSorobanServer: () => new rpcMock.Server('https://soroban-testnet.stellar.org'),
          stellarServer: {
            loadAccount: async () => {
              loadAccountCalled = true;
              return { sequence: 'fallback' };
            }
          },
          getIssuerKeypair: () => { },
          getDistributorKeypair: () => { },
          getTreasuryKeypair: () => { },
          getOperationsKeypair: () => { },
          getNetworkPassphrase: () => 'pass',
          createFreshServer: () => { },
          createAsset: () => { },
          buildTransaction: () => { },
          buildTransactionWithAccount: () => { },
          signAndSubmitTransaction: () => { }
        },
        '../../../src/services/transactionManager.service.js': {
          TransactionManager: {}
        }
      });
      StellarService = module.StellarService;
    });

    test('getAccountRPC fetches sequence via RPC server', async () => {
      const result = await StellarService.getAccountRPC('GABTEST');
      assert.strictEqual(result.sequence, '999');
      assert.strictEqual(result.id, 'GABTEST');
      assert.strictEqual(loadAccountCalled, false, 'Should not fall back to Horizon if RPC works');
    });

    test('getAccountRPC falls back to Horizon if RPC fails', async () => {
      // Setup failing RPC mock for this test
      const rpcFailMock = {
        Server: class MockServer {
          constructor() { }
          async getAccount() { throw new Error('RPC Down'); }
        }
      };

      // Re-mock module with failure
      const module = await esmock('../../../src/services/stellar.service.js', {
        '@stellar/stellar-sdk': {
          rpc: rpcFailMock,
          Account: class { },
          Keypair: {},
          Network: { use: () => { } },
          Networks: { TESTNET: 'TESTNET' },
          BASE_FEE: '100',
          Operation: {},
          TransactionBuilder: {},
          StrKey: {},
          hash: {},
          Address: {},
          Contract: {},
          scValToNative: () => { },
          nativeToScVal: () => { }
        },
        '../../../src/config/stellar.js': {
          getSorobanRpcUrl: () => 'https://soroban-testnet.stellar.org',
          getSorobanServer: () => new rpcFailMock.Server(),
          stellarServer: {
            loadAccount: async (key) => {
              loadAccountCalled = true;
              return { id: key, sequence: 'fallback_seq' };
            }
          },
          getIssuerKeypair: () => { },
          getDistributorKeypair: () => { },
          getTreasuryKeypair: () => { },
          getOperationsKeypair: () => { },
          getNetworkPassphrase: () => 'pass',
          createFreshServer: () => { },
          createAsset: () => { },
          buildTransaction: () => { },
          buildTransactionWithAccount: () => { },
          signAndSubmitTransaction: () => { }
        },
        '../../../src/services/transactionManager.service.js': {
          TransactionManager: {}
        }
      });

      const result = await module.StellarService.getAccountRPC('GABFALLBACK');
      assert.strictEqual(result.sequence, 'fallback_seq');
      assert.strictEqual(loadAccountCalled, true, 'Should have called Horizon fallback');
    });
  });
});
