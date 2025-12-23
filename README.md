# Stellar Security Tokens

Plataforma baseada em blockchain para tokenização de ativos reais na rede Stellar.

## 🚀 Características

- **Backend**: Express.js com arquitetura baseada em serviços.
- **Frontend**: Dashboard Admin React v19.
- **Blockchain**: Integração com rede Stellar (SDK v14).
- **Segurança**: Autenticação via Passkey (WebAuthn).
- **Banco de Dados**: PostgreSQL com Prisma ORM.

## � Sistema de Taxas (Fee System)

A plataforma implementa um sistema de taxas dinâmico e configurável:

1.  **Taxa de Operação Blockchain**: 5.0 USDC (fixo) cobrado em cada investimento para cobrir custos de rede.
2.  **Taxa de Investimento (%):** Deduzida do valor bruto investido (Padrão: 0%).
3.  **Taxa de Dividendos (%):** Deduzida dos pagamentos de proventos (Padrão: 0%).

**Configuração**:
Administradores podem alterar as taxas via API:
- `PUT /api/platform-admins/system-config`
  - Chaves: `INVESTMENT_FEE_PERCENT`, `DIVIDEND_FEE_PERCENT`, `BLOCKCHAIN_OPERATION_FEE_FIXED`.

## �🛠️ Instalação Rápida

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
   cp .env.example .env
   # Edite o .env com suas chaves Stellar e banco de dados
   # Para Mainnet, consulte docs/ENV_MAINNET_GUIDE.md
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
- [**Tokenização**](./docs/TOKENIZATION.md): O que são os tokens e como são criados.
- [**Fluxo de Investimento**](./docs/INVESTMENT_FLOW.md): A jornada do investidor (Compra e Liquidação).
- [**Dividendos & Pagamentos**](./docs/PAYMENTS.md): Como funcionam as distribuições de lucro.
- [**Compliance & KYC**](./docs/COMPLIANCE.md): Regras de aprovação e governança.

### 💰 Financeiro & Taxas
- [**Sistema de Monetização**](./docs/MONETIZATION.md): Detalhes sobre taxas fixas e variáveis.

### 🔐 Segurança & Acesso
- [**Autenticação (Passkeys)**](./docs/AUTHENTICATION.md): Fluxos de registro, login e roles.

### 📡 Comunicação
- [**Notificações & Emails**](./docs/NOTIFICATIONS.md): Configuração SMTP e gatilhos de envio.

### 🚀 Produção & Mainnet
- [**Guia de Ambiente (Mainnet)**](./docs/ENV_MAINNET_GUIDE.md): Configuração de chaves e variáveis para produção.
- [**Checklist de Migração**](./docs/MAINNET_CHECKLIST.md): Passos para levar o token para a Mainnet.
- [**Lembretes Pós-Migração**](./docs/POST_MIGRATION_REMINDERS.md): Manutenção e monitoramento.

### 🔌 API & Desenvolvimento
- [**Swagger API**](http://localhost:3000/api-docs)
- [**Estrutura do Projeto**](./docs/PROJECT_STATUS.md)

## 🧪 Testes

```bash
cd backend && npm test
```

---
*Atualizado em Dezembro 2025*
