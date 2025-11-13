# Stellar Security Tokens - Admin Dashboard

Dashboard administrativo React para gerenciar o sistema de tokenização de security tokens no Stellar.

## Tecnologias

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Recharts
- React Router
- Axios

## Instalação

```bash
npm install
```

## Configuração

Copie o arquivo `.env.example` para `.env` e configure:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com a URL da API:

```
VITE_API_URL=http://localhost:3000/api
```

## Desenvolvimento

```bash
npm run dev
```

O dashboard estará disponível em `http://localhost:5173`

## Build

```bash
npm run build
```

## Funcionalidades

### Overview
- Total de tokens emitidos
- Total de investidores
- Próximo pagamento de juros
- Saldo da treasury account
- Gráficos de evolução

### Investidores
- Lista de investidores com status KYC
- Botão para aprovar whitelist
- Visualizar saldo de cada investidor

### Pagamentos
- Botão "Executar Pagamento Mensal"
- Histórico de pagamentos
- Preview antes de executar

## Login

Use o email de um investidor cadastrado para fazer login. O sistema gerará um token JWT automaticamente.
