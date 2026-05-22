/**
 * Mock do Stellar SDK para testes unitários
 */

import { mockStellarAccount, mockStellarTransaction, mockKeypair } from './testData.js';

export const createStellarMock = () => {
  const mockLoadAccount = async (publicKey) => {
    if (!publicKey) {
      throw new Error('Public key is required');
    }
    if (publicKey.includes('NOTFOUND')) {
      const error = new Error('Account not found');
      error.status = 404;
      throw error;
    }
    return {
      ...mockStellarAccount,
      accountId: () => publicKey,
      incrementSequenceNumber: () => { }, // Ensure this exists too
    };
  };

  const mockSubmitTransaction = async (transaction) => {
    if (transaction && transaction.operations && transaction.operations[0]?.type === 'payment' && transaction.operations[0]?.amount === '0') {
      const error = new Error('Transaction failed');
      error.response = {
        data: {
          detail: 'Insufficient balance',
          extras: {
            result_codes: {
              transaction: 'tx_failed',
              operations: ['op_underfunded'],
            },
          },
        },
      };
      throw error;
    }
    return mockStellarTransaction;
  };

  // Mock para streaming de pagamentos
  const mockPayments = () => {
    return {
      forAccount: (_accountId) => ({
        cursor: (_cursor) => ({
          stream: (options) => {
            // Armazena o callback onmessage para ser chamado manualmente nos testes
            global.mockStreamCallback = options.onmessage;

            // Retorna função para fechar o stream
            return () => { };
          },
        }),
      }),
    };
  };

  const mockServer = {
    loadAccount: mockLoadAccount,
    submitTransaction: mockSubmitTransaction,
    payments: mockPayments,
  };

  return {
    mockServer,
    mockLoadAccount,
    mockSubmitTransaction,
    mockPayments,
  };
};

export const createKeypairMock = () => {
  return {
    fromSecret: (secret) => {
      if (!secret || secret.length < 56) {
        throw new Error('Invalid secret key');
      }
      return mockKeypair;
    },
    random: () => mockKeypair,
  };
};

export const createAssetMock = () => {
  return (code, issuer) => {
    return {
      code,
      issuer,
      getAssetType: () => 'credit_alphanum4',
    };
  };
};

export const createTransactionBuilderMock = () => {
  return class MockTransactionBuilder {
    constructor(account, options) {
      this.account = account;
      this.options = options;
      this.operations = [];
    }

    addOperation(operation) {
      this.operations.push(operation);
      return this;
    }

    setTimeout(timeout) {
      this.timeout = timeout;
      return this;
    }

    build() {
      return {
        operations: this.operations,
        sign: (_keypair) => {
          this.signed = true;
        },
      };
    }
  };
};

