import { Server, Networks, Keypair, Asset, Operation, TransactionBuilder, BASE_FEE } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Parse CLI arguments
const args = process.argv.slice(2);
const networkArg = args.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'testnet';
const supplyArg = args.find(arg => arg.startsWith('--supply='))?.split('=')[1] || '1000';

const network = networkArg;
const assetSupply = parseFloat(supplyArg);
const horizonUrl = network === 'testnet' 
  ? 'https://horizon-testnet.stellar.org'
  : 'https://horizon.publicnet.stellar.org';
const friendbotUrl = network === 'testnet'
  ? 'https://friendbot.stellar.org'
  : null;

const stellarServer = new Server(horizonUrl);
const networkPassphrase = network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fundAccount(publicKey) {
  if (!friendbotUrl) {
    log(`⚠️  Friendbot não disponível em ${network}. Pulando financiamento.`, 'yellow');
    log(`   Certifique-se de que a conta ${publicKey} já tem fundos.`, 'yellow');
    return null;
  }

  log(`📡 Financiando conta via Friendbot...`, 'cyan');
  const url = `${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Friendbot failed: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    log(`✓ Conta financiada com sucesso`, 'green');
    return data;
  } catch (error) {
    throw new Error(`Erro ao financiar conta: ${error.message}`);
  }
}

async function waitForAccount(publicKey, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await stellarServer.loadAccount(publicKey);
      return true;
    } catch (error) {
      if (error.status === 404) {
        log(`⏳ Aguardando criação da conta... (tentativa ${i + 1}/${maxRetries})`, 'yellow');
        await sleep(2000);
      } else {
        throw error;
      }
    }
  }
  throw new Error('Timeout aguardando criação da conta');
}

async function createAccount(name) {
  log(`\n🔑 Criando conta ${name}...`, 'blue');
  const keypair = Keypair.random();
  
  log(`   Chave Pública: ${keypair.publicKey()}`, 'cyan');
  log(`   Chave Secreta: ${keypair.secret()}`, 'cyan');
  
  if (friendbotUrl) {
    await fundAccount(keypair.publicKey());
    await waitForAccount(keypair.publicKey());
  } else {
    log(`   ⚠️  Conta criada, mas não financiada automaticamente.`, 'yellow');
    log(`   Adicione fundos manualmente antes de continuar.`, 'yellow');
  }
  
  return {
    name,
    keypair,
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

async function configureIssuerFlags(issuerKeypair) {
  log(`\n⚙️  Configurando flags de compliance na conta Issuer...`, 'blue');
  
  const account = await stellarServer.loadAccount(issuerKeypair.publicKey());
  
  // Verificar se as flags já estão configuradas
  const currentFlags = account.flags;
  const authRequired = currentFlags.authRequired();
  const authRevocable = currentFlags.authRevocable();
  const authClawbackEnabled = currentFlags.authClawbackEnabled();
  
  if (authRequired && authRevocable && authClawbackEnabled) {
    log(`✓ Flags já estão configuradas`, 'green');
    return { hash: 'already_configured' };
  }
  
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.setOptions({
        setFlags: 7, // AuthRequiredFlag (1) | AuthRevocableFlag (2) | AuthClawbackEnabledFlag (4) = 7
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(issuerKeypair);
  
  try {
    const result = await stellarServer.submitTransaction(transaction);
    log(`✓ Flags configuradas com sucesso`, 'green');
    log(`   Transaction Hash: ${result.hash}`, 'cyan');
    return result;
  } catch (error) {
    throw new Error(`Erro ao configurar flags: ${error.message}`);
  }
}

async function issueToken(issuerKeypair, distributorKeypair, assetCode, amount) {
  log(`\n🪙 Emitindo ${amount} tokens ${assetCode}...`, 'blue');
  
  const issuerAccount = await stellarServer.loadAccount(issuerKeypair.publicKey());
  const distributorAccount = await stellarServer.loadAccount(distributorKeypair.publicKey());
  
  const asset = new Asset(assetCode, issuerKeypair.publicKey());
  
  const transaction = new TransactionBuilder(issuerAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: distributorKeypair.publicKey(),
        asset: asset,
        amount: amount.toString(),
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(issuerKeypair);
  
  try {
    const result = await stellarServer.submitTransaction(transaction);
    log(`✓ Tokens emitidos com sucesso`, 'green');
    log(`   Transaction Hash: ${result.hash}`, 'cyan');
    log(`   Ledger: ${result.ledger}`, 'cyan');
    return result;
  } catch (error) {
    throw new Error(`Erro ao emitir tokens: ${error.message}`);
  }
}

function updateEnvFile(accounts, assetCode, assetSupply) {
  log(`\n💾 Atualizando arquivo .env...`, 'blue');
  
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else {
    const examplePath = path.join(__dirname, '..', '.env.example');
    if (fs.existsSync(examplePath)) {
      envContent = fs.readFileSync(examplePath, 'utf8');
    }
  }
  
  const updates = {
    'STELLAR_NETWORK': network,
    'HORIZON_URL': horizonUrl,
    'STELLAR_HORIZON_URL': horizonUrl,
    'ISSUER_SECRET_KEY': accounts.issuer.secretKey,
    'ISSUER_PUBLIC_KEY': accounts.issuer.publicKey,
    'DISTRIBUTOR_SECRET_KEY': accounts.distribution.secretKey,
    'DISTRIBUTOR_PUBLIC_KEY': accounts.distribution.publicKey,
    'DISTRIBUTION_SECRET_KEY': accounts.distribution.secretKey,
    'DISTRIBUTION_PUBLIC_KEY': accounts.distribution.publicKey,
    'TREASURY_SECRET_KEY': accounts.treasury.secretKey,
    'TREASURY_PUBLIC_KEY': accounts.treasury.publicKey,
    'ASSET_CODE': assetCode,
    'ASSET_SUPPLY': assetSupply.toString(),
  };
  
  // Atualizar ou adicionar cada variável
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // Adicionar no final se não existir
      envContent = envContent.trim();
      envContent += `\n${key}=${value}`;
    }
  }
  
  // Garantir que termina com newline
  envContent = envContent.trim() + '\n';
  
  fs.writeFileSync(envPath, envContent);
  log(`✓ Arquivo .env atualizado`, 'green');
}

function printSummary(accounts, assetCode, assetSupply, transactionHash) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`📊 RESUMO DO SETUP`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
  
  log(`\n🌐 Rede: ${network.toUpperCase()}`, 'blue');
  log(`🪙 Token: ${assetCode}`, 'blue');
  log(`📦 Supply: ${assetSupply}`, 'blue');
  
  log(`\n📋 CONTAS CRIADAS:`, 'yellow');
  log(`\n1️⃣  ISSUER ACCOUNT (Emissor)`, 'cyan');
  log(`   Chave Pública: ${accounts.issuer.publicKey}`, 'green');
  log(`   Chave Secreta: ${accounts.issuer.secretKey}`, 'green');
  log(`   Status: ✓ Financiada | ✓ Flags configuradas`, 'green');
  
  log(`\n2️⃣  DISTRIBUTION ACCOUNT (Distribuidor)`, 'cyan');
  log(`   Chave Pública: ${accounts.distribution.publicKey}`, 'green');
  log(`   Chave Secreta: ${accounts.distribution.secretKey}`, 'green');
  log(`   Status: ✓ Financiada | ✓ Tokens recebidos`, 'green');
  
  log(`\n3️⃣  TREASURY ACCOUNT (Tesouraria)`, 'cyan');
  log(`   Chave Pública: ${accounts.treasury.publicKey}`, 'green');
  log(`   Chave Secreta: ${accounts.treasury.secretKey}`, 'green');
  log(`   Status: ✓ Financiada`, 'green');
  
  if (transactionHash) {
    log(`\n🔗 Transação de Emissão:`, 'cyan');
    log(`   Hash: ${transactionHash}`, 'green');
    log(`   Explorer: https://stellar.expert/explorer/${network}/tx/${transactionHash}`, 'cyan');
  }
  
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`✅ Setup concluído com sucesso!`, 'green');
  log(`\n⚠️  IMPORTANTE: Guarde as chaves secretas com segurança!`, 'yellow');
  log(`   Elas não serão mostradas novamente.`, 'yellow');
  log(`${'='.repeat(60)}\n`, 'cyan');
}

async function main() {
  try {
    log(`\n🚀 Iniciando setup do Stellar Security Tokens`, 'cyan');
    log(`   Rede: ${network}`, 'blue');
    log(`   Supply: ${assetSupply} tokens`, 'blue');
    
    if (network !== 'testnet') {
      log(`\n⚠️  ATENÇÃO: Você está usando ${network}!`, 'yellow');
      log(`   Friendbot só funciona em testnet.`, 'yellow');
      log(`   Certifique-se de que as contas já têm fundos antes de continuar.`, 'yellow');
      log(`   O script tentará usar contas existentes ou falhará se não houver fundos.`, 'yellow');
    }
    
    const assetCode = process.env.ASSET_CODE || 'SIN01';
    
    // Criar contas
    const issuer = await createAccount('Issuer');
    await sleep(1000);
    
    const distribution = await createAccount('Distribution');
    await sleep(1000);
    
    const treasury = await createAccount('Treasury');
    await sleep(1000);
    
    const accounts = {
      issuer: {
        keypair: issuer.keypair,
        publicKey: issuer.publicKey,
        secretKey: issuer.secretKey,
      },
      distribution: {
        keypair: distribution.keypair,
        publicKey: distribution.publicKey,
        secretKey: distribution.secretKey,
      },
      treasury: {
        keypair: treasury.keypair,
        publicKey: treasury.publicKey,
        secretKey: treasury.secretKey,
      },
    };
    
    // Configurar flags na conta Issuer
    await configureIssuerFlags(accounts.issuer.keypair);
    
    // Emitir tokens
    const issueResult = await issueToken(
      accounts.issuer.keypair,
      accounts.distribution.keypair,
      assetCode,
      assetSupply
    );
    
    // Atualizar .env
    updateEnvFile(accounts, assetCode, assetSupply);
    
    // Imprimir resumo
    printSummary(accounts, assetCode, assetSupply, issueResult.hash);
    
    process.exit(0);
  } catch (error) {
    log(`\n❌ Erro durante o setup: ${error.message}`, 'red');
    if (error.response) {
      log(`   Detalhes: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    console.error(error);
    process.exit(1);
  }
}

main();

