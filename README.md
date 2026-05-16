# Stellar Security Tokens

Plataforma para tokenização de ativos reais na rede Stellar, com compra de security tokens em USDC, carteiras com Passkey, contratos Soroban e fluxos de on-ramp/off-ramp via Etherfuse para Pix e USDC.

## 🚀 Características

- **Tokenização de ativos reais**: ofertas, investimentos, liquidação e distribuição de pagamentos em USDC.
- **On-ramp via Etherfuse**: cotação BRL -> TESOURO/USDC e instruções de depósito Pix para investidores.
- **Off-ramp via Etherfuse**: conversão TESOURO/USDC -> BRL com saque Pix para contas bancárias cadastradas.
- **Carteiras inteligentes**: onboarding com Passkey/WebAuthn e suporte a Freighter quando aplicável.
- **Backend**: Express.js com arquitetura baseada em serviços, Prisma ORM e PostgreSQL.
- **Frontend**: dashboards React v19 para investidores, empresas e administradores.
- **Blockchain**: Stellar SDK v14 e contratos Soroban para venda, distribuição e liquidação.

## On-ramp, Off-ramp, Pix e USDC

O módulo de ramp conecta o fluxo fiat brasileiro aos ativos usados na plataforma:

1. **KYC e conta Pix**: o investidor registra dados de KYC e uma conta bancária Pix antes de operar rampas.
2. **On-ramp**: o investidor solicita uma cotação em BRL e recebe instruções Pix. Após confirmação, o fluxo Etherfuse entrega TESOURO ou USDC para a carteira configurada.
3. **Uso em investimentos**: o saldo em USDC pode ser usado para comprar security tokens e pagar taxas de operação.
4. **Off-ramp**: quando habilitado por `ENABLE_OFFRAMP=true`, o investidor solicita cotação TESOURO/USDC -> BRL, assina a transação e acompanha o saque Pix.

Esses fluxos dependem de credenciais Etherfuse, webhooks, liquidez operacional, configuração dos contratos SAC de USDC/TESOURO e reconciliação dos pedidos. Veja o runbook de off-ramp em [`docs/Operations/OFFRAMP_RUNBOOK.md`](./docs/Operations/OFFRAMP_RUNBOOK.md).

## 💰 Sistema de Taxas (Fee System)

A plataforma implementa um sistema de taxas dinâmico e configurável:

1.  **Taxa de Operação Blockchain**: 5.0 USDC (fixo) cobrado em cada investimento para cobrir custos de rede.
2.  **Taxa de Investimento (%):** Deduzida do valor bruto investido (Padrão: 0%).
3.  **Taxa de Dividendos (%):** Deduzida dos pagamentos de proventos (Padrão: 0%).

**Configuração**:
Administradores podem alterar as taxas via API:
- `PUT /api/platform-admins/system-config`
  - Chaves: `INVESTMENT_FEE_PERCENT`, `DIVIDEND_FEE_PERCENT`, `BLOCKCHAIN_OPERATION_FEE_FIXED`.

## 🛠️ Instalação Rápida

### Usando Docker (Recomendado)

Certifique-se de que a build inclua as últimas correções (especialmente para TypeScript):

```bash
docker-compose up -d --build
```

### Manual

1. Instale as dependências:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. Configure o ambiente:
   ```bash
   cp .env.template .env
   # Configure chaves Stellar, Etherfuse, banco de dados, webhooks e flags de ramp.
   ```

3. Inicie:
   ```bash
   # Backend
   cd backend && npm start
   # Frontend
   cd frontend && npm run dev
   ```

## 📖 Documentação

A documentação completa do projeto encontra-se na pasta [`docs/`](./docs):

### 🏢 Regras de Negócio (Business Logic)
- [**Matriz de Funcionalidades**](./docs/Project_Bible/02_feature_matrix.md): visão dos fluxos suportados.
- [**Fluxo de Dados**](./docs/Project_Bible/03_data_flow.md): jornada entre frontend, backend, banco e Stellar.
- [**Camada de Smart Contracts**](./docs/Project_Bible/smart_contract_layer.md): contratos Soroban e responsabilidades.
- [**Camada de Serviços**](./docs/Project_Bible/services_layer.md): regras de negócio e integrações.

### 💰 Financeiro, Rampas & Taxas
- [**Sistema de Monetização**](./docs/Operations/MONETIZATION.md): Detalhes sobre taxas fixas e variáveis.
- [**Runbook de Off-ramp**](./docs/Operations/OFFRAMP_RUNBOOK.md): Operação Etherfuse para TESOURO/USDC -> BRL via Pix.

### 🔐 Segurança & Acesso
- [**Auditoria de Segurança**](./docs/Project_Bible/06_security_audit.md): autenticação, permissões e riscos.
- [**Mapa de Configuração**](./docs/Project_Bible/05_config_env_map.md): variáveis de ambiente e integrações.

### 📡 Comunicação
- [**Inventário de Emails**](./docs/Project_Bible/08_email_inventory.md): templates e gatilhos de envio.

### 🚀 Produção & Mainnet
- [**Checklist de Migração**](./docs/Operations/MAINNET_CHECKLIST.md): Passos para levar o token para a Mainnet.
- [**Lembretes Pós-Migração**](./docs/Operations/POST_MIGRATION_REMINDERS.md): Manutenção e monitoramento.

### 🔌 API & Desenvolvimento
- [**Swagger API**](http://localhost:3000/api-docs)
- [**Índice Técnico**](./docs/Project_Bible/00_index.md)

## 🧪 Testes

```bash
cd backend && npm test
```

---
*Atualizado em Maio 2026*
