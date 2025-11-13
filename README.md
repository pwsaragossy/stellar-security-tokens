# Stellar Security Tokens API

API REST para tokenização de security tokens na rede Stellar.

## Características

- Express.js para API REST
- Stellar SDK v11 para operações blockchain
- PostgreSQL para armazenamento de dados
- Estrutura modular (services/routes/controllers)
- Suporte a variáveis de ambiente
- Validação de inputs
- Error handling robusto
- Dashboard Admin React

## Pré-requisitos

- Node.js >= 18.0.0
- PostgreSQL >= 12.0
- Conta Stellar (testnet ou mainnet)

## Instalação

### Método Rápido (Script de Inicialização)

```bash
# Execute o script de inicialização
./scripts/init.sh
```

O script irá:
- Verificar pré-requisitos (Node.js, PostgreSQL)
- Criar arquivo .env a partir do .env.example
- Instalar dependências npm
- Criar banco de dados (se não existir)
- Executar migrations

### Método Manual

1. Clone o repositório

2. Instale as dependências:
```bash
npm install
cd frontend && npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

4. Configure o banco de dados:
```bash
# Crie o banco de dados PostgreSQL
createdb stellar_tokens

# Execute as migrations
npm run migrate

# (Opcional) Execute o seed para dados de exemplo
npm run seed
```

5. Configure as chaves Stellar no arquivo `.env`:
   - `ISSUER_SECRET_KEY`: Chave secreta da conta emissora
   - `DISTRIBUTOR_SECRET_KEY`: Chave secreta da conta distribuidora
   - `TREASURY_SECRET_KEY`: Chave secreta da conta treasury (recebe USDC)

   **Importante**: As contas Stellar devem existir e ter fundos antes de usar a API.

6. Inicie o servidor:
```bash
# Backend - Desenvolvimento (com watch mode)
npm run dev

# Backend - Produção
npm start

# Frontend - Desenvolvimento
cd frontend && npm run dev
```

## Estrutura do Projeto

```
stellar-security-tokens/
├── frontend/           # Dashboard Admin React
│   ├── src/
│   │   ├── components/ # Componentes React
│   │   ├── pages/      # Páginas do dashboard
│   │   └── lib/        # Utilitários e API client
│   └── package.json
├── backend/           # API Node.js/Express
│   ├── config/        # Configurações (database, stellar)
│   ├── controllers/   # Controllers da API
│   ├── database/      # Migrations e seeds
│   ├── middleware/    # Middlewares do Express
│   ├── models/        # Modelos de dados
│   ├── routes/        # Rotas da API
│   ├── services/      # Serviços de negócio
│   │   ├── stellar.service.js    # Operações Stellar
│   │   ├── kyc.service.js        # Verificação KYC
│   │   └── payment.service.js    # Distribuição de juros
│   └── server.js      # Ponto de entrada
├── scripts/           # Scripts de setup inicial
└── .env              # Variáveis de ambiente
```

## Endpoints da API

### Autenticação

- `POST /api/auth/login` - Login e obtenção de token JWT

### Investidores

- `POST /api/investors/register` - Registrar investidor (cria conta Stellar)
- `POST /api/investors/whitelist/:investorId` - Aprovar trustline do investidor
- `GET /api/investors` - Listar investidores
- `GET /api/investors/:id` - Obter investidor por ID
- `GET /api/investors/:investorId/balance` - Obter saldo e histórico
- `GET /api/investors/:investorId/payments` - Listar pagamentos de juros
- `PUT /api/investors/:id` - Atualizar investidor

### Tokens

- `POST /api/tokens/issue` - Emitir novo token
- `GET /api/tokens` - Listar tokens emitidos
- `GET /api/tokens/:assetCode` - Obter informações do token
- `POST /api/tokens/distribute` - Distribuir tokens para investidor
- `GET /api/tokens/:assetCode/balance?publicKey=...` - Obter saldo de tokens de uma conta

### Investimentos

- `POST /api/investments/purchase` - Comprar tokens com USDC

### Pagamentos

- `POST /api/payments/process` - Processar pagamentos de juros mensais manualmente
- `GET /api/payments/history` - Obter histórico completo de pagamentos
- `GET /api/payments/statistics` - Obter estatísticas de pagamentos por período

**Nota:** Os pagamentos de juros são processados automaticamente no dia 1º de cada mês às 00:00 UTC quando `ENABLE_AUTO_PAYMENTS=true`. Você pode desabilitar isso definindo `ENABLE_AUTO_PAYMENTS=false` e processar pagamentos manualmente via API.

## Scripts Disponíveis

- `npm start` - Inicia o servidor em modo produção
- `npm run dev` - Inicia o servidor em modo desenvolvimento (com watch)
- `npm run migrate` - Executa as migrations do banco de dados
- `npm run seed` - Popula o banco com dados de exemplo
- `npm run setup` - Setup inicial completo (cria contas, emite tokens, configura .env)
- `npm test` - Executa os testes (quando implementados)

### Setup Inicial Automatizado

O script `setup.js` automatiza todo o processo de configuração inicial:

```bash
# Setup padrão (testnet, 1000 tokens)
npm run setup

# Com opções personalizadas
node scripts/setup.js --network=testnet --supply=1000
```

O script irá:
1. ✅ Criar 3 contas Stellar (Issuer, Distribution, Treasury)
2. ✅ Financiar contas via Friendbot (testnet)
3. ✅ Configurar flags de compliance na conta Issuer
4. ✅ Emitir tokens SIN01
5. ✅ Transferir tokens para Distribution Account
6. ✅ Salvar todas as chaves no arquivo `.env`
7. ✅ Imprimir resumo completo das contas criadas

**Importante**: Em mainnet, você precisa financiar as contas manualmente antes de executar o script.

## Variáveis de Ambiente

Veja `.env.example` para todas as variáveis necessárias.

### Configuração Stellar

O arquivo `.env` deve conter:

```env
# Stellar Network
STELLAR_NETWORK=testnet
HORIZON_URL=https://horizon-testnet.stellar.org

# Issuer Account (Token LLC)
ISSUER_SECRET_KEY=S...
ISSUER_PUBLIC_KEY=G...

# Distribution Account
DISTRIBUTOR_SECRET_KEY=S...
DISTRIBUTOR_PUBLIC_KEY=G...

# Treasury Account (recebe USDC dos investidores)
TREASURY_SECRET_KEY=S...
TREASURY_PUBLIC_KEY=G...

# Token Details
ASSET_CODE=SIN01
ASSET_SUPPLY=1000

# USDC Contract
USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN

# Payment Scheduler
ENABLE_AUTO_PAYMENTS=true
```

Para obter chaves Stellar para teste:

1. **Testnet**: Acesse [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
2. Crie três contas (Issuer, Distributor, Treasury)
3. Adicione fundos usando o [Friendbot](https://laboratory.stellar.org/#account-creator?network=test) (apenas testnet)
4. Copie as chaves secretas para o arquivo `.env`

**Atenção**: Nunca compartilhe suas chaves secretas. Em produção, use variáveis de ambiente seguras ou um gerenciador de secrets.

## Dashboard Admin

O dashboard React está localizado em `frontend/`. Para executar:

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173` e faça login com o email de um investidor cadastrado.

## Testes

O projeto inclui uma suite completa de testes automatizados. Veja [TESTING.md](./TESTING.md) para detalhes completos.

### Executar Testes

```bash
# Todos os testes
npm test

# Apenas testes unitários
npm run test:unit

# Apenas testes de integração
npm run test:integration

# Modo watch (re-executa ao salvar)
npm run test:watch
```

### Estrutura de Testes

- **Unit Tests**: Testam componentes isolados (models, services, controllers, middleware)
- **Integration Tests**: Testam fluxos completos da API com banco de dados real

Veja [TESTING.md](./TESTING.md) para documentação completa sobre testes.

## Licença

MIT
