import { Transaction, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

declare global {
  interface Window {
    freighterApi?: {
      isConnected: () => Promise<boolean>;
      connect: () => Promise<void>;
      disconnect: () => Promise<void>;
      getPublicKey: () => Promise<string>;
      signTransaction: (transactionXdr: string, network: string) => Promise<string>;
      setAllowedDomains: (domains: string[]) => Promise<void>;
    };
  }
}

export const checkFreighterInstalled = (): boolean => {
  return typeof window !== 'undefined' && !!window.freighterApi;
};

export const connectFreighter = async (): Promise<string> => {
  if (!checkFreighterInstalled()) {
    throw new Error('Freighter não está instalado. Por favor, instale a extensão Freighter.');
  }

  const freighter = window.freighterApi!;
  
  try {
    const isConnected = await freighter.isConnected();
    if (!isConnected) {
      await freighter.connect();
    }
    
    return await freighter.getPublicKey();
  } catch (error: any) {
    throw new Error(`Erro ao conectar Freighter: ${error.message}`);
  }
};

export const signTransactionWithFreighter = async (
  transaction: Transaction,
  network: 'testnet' | 'public' = 'testnet'
): Promise<Transaction> => {
  if (!checkFreighterInstalled()) {
    throw new Error('Freighter não está instalado');
  }

  const freighter = window.freighterApi!;
  const networkPassphrase = network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
  
  try {
    const xdr = transaction.toXDR();
    const signedXdr = await freighter.signTransaction(xdr, networkPassphrase);
    
    return TransactionBuilder.fromXDR(signedXdr, networkPassphrase) as Transaction;
  } catch (error: any) {
    throw new Error(`Erro ao assinar transação: ${error.message}`);
  }
};

export const getFreighterPublicKey = async (): Promise<string> => {
  if (!checkFreighterInstalled()) {
    throw new Error('Freighter não está instalado');
  }

  const freighter = window.freighterApi!;
  return await freighter.getPublicKey();
};

