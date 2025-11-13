# Stellar Security Tokens API - Documentação Completa

Documentação completa da API REST para tokenização de security tokens na rede Stellar.

## Base URL

```
http://localhost:3000/api
```

## Autenticação

A maioria dos endpoints requer autenticação via JWT. Para obter um token:

1. Faça login em `POST /api/auth/login`
2. Use o token retornado no header `Authorization: Bearer <token>`

---

## Endpoints

### Autenticação

#### `POST /api/auth/login`

Autentica um investidor e retorna um token JWT.

**Request Body:**
```json
{
  "email": "investor@example.com",
  "password": "optional" // Atualmente não é usado, mas pode ser implementado
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "investor": {
      "id": 1,
      "name": "João Silva",
      "email": "investor@example.com",
      "kycStatus": "approved"
    }
  }
}
```

**Response 401:**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

### Investidores

#### `POST /api/investors/register`

Registra um novo investidor e cria automaticamente uma conta Stellar.

**Request Body:**
```json
{
  "name": "João Silva",
  "email": "joao@example.com",
  "document": "12345678900"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "João Silva",
    "email": "joao@example.com",
    "document": "12345678900",
    "stellarPublicKey": "GABC123...",
    "kycStatus": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "stellarAccount": {
    "publicKey": "GABC123...",
    "note": "Keep your secret key secure. It will not be shown again."
  }
}
```

**Response 409:**
```json
{
  "success": false,
  "error": "Investor with this email already exists"
}
```

---

#### `POST /api/investors/whitelist/:investorId`

Aprova a trustline de um investidor, permitindo que ele receba tokens.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "assetCode": "SIN01" // Opcional, padrão: SIN01
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Investor whitelisted successfully",
  "data": {
    "investor": {
      "id": 1,
      "name": "João Silva",
      "email": "joao@example.com",
      "kycStatus": "approved"
    },
    "stellarTransaction": {
      "transactionHash": "abc123...",
      "ledger": 12345
    }
  }
}
```

**Response 404:**
```json
{
  "success": false,
  "error": "Investor not found"
}
```

---

#### `GET /api/investors`

Lista todos os investidores com paginação.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (opcional): Número de resultados (padrão: 100)
- `offset` (opcional): Número de registros a pular (padrão: 0)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "João Silva",
      "email": "joao@example.com",
      "document": "12345678900",
      "stellar_public_key": "GABC123...",
      "kyc_status": "approved",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 1
  }
}
```

---

#### `GET /api/investors/:id`

Obtém detalhes de um investidor específico.

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "João Silva",
    "email": "joao@example.com",
    "document": "12345678900",
    "stellar_public_key": "GABC123...",
    "kyc_status": "approved",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### `GET /api/investors/:investorId/balance`

Obtém saldo de tokens e histórico completo de um investidor.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `assetCode` (opcional): Código do asset (padrão: SIN01)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "investor": {
      "id": 1,
      "name": "João Silva",
      "email": "joao@example.com",
      "stellarPublicKey": "GABC123...",
      "kycStatus": "approved"
    },
    "balance": {
      "assetCode": "SIN01",
      "balance": "100.0000000",
      "isAuthorized": true
    },
    "tokenDistributions": [
      {
        "id": 1,
        "investor_id": 1,
        "asset_code": "SIN01",
        "amount": "100.0000000",
        "transaction_hash": "abc123...",
        "created_at": "2024-01-15T10:30:00.000Z"
      }
    ],
    "interestPayments": [
      {
        "id": 1,
        "investor_id": 1,
        "asset_code": "SIN01",
        "token_balance": "100.0000000",
        "interest_rate": "10.0000000",
        "interest_amount": "0.8333333",
        "usdc_amount": "0.8333333",
        "transaction_hash": "def456...",
        "payment_date": "2024-02-01",
        "status": "completed",
        "created_at": "2024-02-01T00:00:00.000Z"
      }
    ],
    "summary": {
      "totalTokensReceived": 100,
      "totalInterestReceived": 0.8333333,
      "distributionCount": 1,
      "interestPaymentCount": 1
    }
  }
}
```

---

#### `GET /api/investors/:investorId/payments`

Lista pagamentos de juros de um investidor.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `assetCode` (opcional): Filtrar por código do asset
- `limit` (opcional): Número de resultados (padrão: 100)
- `offset` (opcional): Número de registros a pular (padrão: 0)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "investor": {
      "id": 1,
      "name": "João Silva",
      "email": "joao@example.com"
    },
    "payments": [
      {
        "id": 1,
        "investor_id": 1,
        "asset_code": "SIN01",
        "token_balance": "100.0000000",
        "interest_rate": "10.0000000",
        "interest_amount": "0.8333333",
        "usdc_amount": "0.8333333",
        "transaction_hash": "def456...",
        "payment_date": "2024-02-01",
        "status": "completed",
        "email_sent": true,
        "created_at": "2024-02-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "limit": 100,
      "offset": 0,
      "count": 1
    },
    "summary": {
      "totalInterestReceived": 0.8333333,
      "totalPayments": 1
    }
  }
}
```

---

#### `PUT /api/investors/:id`

Atualiza dados de um investidor.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "João Silva Santos", // Opcional
  "email": "novoemail@example.com", // Opcional
  "kycStatus": "approved" // Opcional
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "João Silva Santos",
    "email": "novoemail@example.com",
    "kyc_status": "approved",
    "updated_at": "2024-01-16T10:30:00.000Z"
  }
}
```

---

### Tokens

#### `POST /api/tokens/issue`

Emite um novo token de segurança.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "assetCode": "SIN01",
  "totalSupply": 1000,
  "description": "Sunset Income Note - Security token backed by rental income"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "asset_code": "SIN01",
    "issuer_public_key": "GXYZ789...",
    "total_supply": "1000.0000000",
    "description": "Sunset Income Note - Security token backed by rental income",
    "created_at": "2024-01-15T10:30:00.000Z",
    "transactionHash": "ghi789...",
    "ledger": 12345
  }
}
```

**Response 409:**
```json
{
  "success": false,
  "error": "Token with this asset code already exists"
}
```

---

#### `GET /api/tokens`

Lista todos os tokens emitidos.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (opcional): Número de resultados (padrão: 100)
- `offset` (opcional): Número de registros a pular (padrão: 0)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "asset_code": "SIN01",
      "issuer_public_key": "GXYZ789...",
      "total_supply": "1000.0000000",
      "description": "Sunset Income Note",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 1
  }
}
```

---

#### `GET /api/tokens/:assetCode`

Obtém informações de um token específico.

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "asset_code": "SIN01",
    "issuer_public_key": "GXYZ789...",
    "total_supply": "1000.0000000",
    "description": "Sunset Income Note",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response 404:**
```json
{
  "success": false,
  "error": "Token not found"
}
```

---

#### `POST /api/tokens/distribute`

Distribui tokens para um investidor aprovado.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "investorId": 1,
  "assetCode": "SIN01",
  "amount": 100
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "investor_id": 1,
    "asset_code": "SIN01",
    "amount": "100.0000000",
    "transaction_hash": "jkl012...",
    "created_at": "2024-01-15T10:30:00.000Z",
    "transactionHash": "jkl012...",
    "ledger": 12346
  }
}
```

**Response 403:**
```json
{
  "success": false,
  "error": "Investor KYC status must be approved to receive tokens"
}
```

---

#### `GET /api/tokens/:assetCode/balance`

Obtém saldo de tokens de uma conta Stellar específica.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `publicKey` (obrigatório): Chave pública Stellar da conta

**Response 200:**
```json
{
  "success": true,
  "data": {
    "assetCode": "SIN01",
    "publicKey": "GABC123...",
    "balance": "100.0000000",
    "assetType": "credit_alphanum4",
    "isAuthorized": true,
    "isAuthorizedToMaintainLiabilities": false
  }
}
```

**Response 400:**
```json
{
  "success": false,
  "error": "publicKey query parameter is required"
}
```

---

### Investimentos

#### `POST /api/investments/purchase`

Compra tokens com USDC (distribui tokens após pagamento).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "investorId": 1,
  "usdcAmount": 100,
  "assetCode": "SIN01" // Opcional, padrão: SIN01
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Investment purchased successfully",
  "data": {
    "investor": {
      "id": 1,
      "name": "João Silva",
      "email": "joao@example.com"
    },
    "investment": {
      "usdcAmount": 100,
      "tokenAmount": 100,
      "assetCode": "SIN01",
      "exchangeRate": 1.0
    },
    "distribution": {
      "id": 1,
      "amount": "100.0000000",
      "transaction_hash": "mno345...",
      "created_at": "2024-01-15T10:30:00.000Z"
    },
    "transaction": {
      "hash": "mno345...",
      "ledger": 12347
    },
    "note": "USDC payment should be sent separately. Tokens have been distributed."
  }
}
```

---

### Pagamentos

#### `POST /api/payments/process`

Processa pagamentos de juros mensais manualmente.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "assetCode": "SIN01" // Opcional, padrão: SIN01
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Monthly interest payments processed successfully",
  "data": {
    "paymentDate": "2024-02-01",
    "transactionHash": "pqr678...",
    "ledger": 12348,
    "paymentsProcessed": 5,
    "totalInterestAmount": 8.3333333,
    "emailsSent": 5,
    "emailsFailed": 0,
    "duration": "1234ms"
  }
}
```

**Response 200 (sem investidores):**
```json
{
  "success": true,
  "message": "No investors to process",
  "processed": 0
}
```

---

#### `GET /api/payments/history`

Obtém histórico completo de pagamentos de juros com filtros e paginação.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `assetCode` (opcional): Filtrar por código do asset
- `investorId` (opcional): Filtrar por ID do investidor
- `limit` (opcional): Número de resultados (padrão: 100, máximo: 1000)
- `offset` (opcional): Número de registros a pular (padrão: 0)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": 1,
        "investor_id": 1,
        "asset_code": "SIN01",
        "token_balance": "100.0000000",
        "interest_rate": "10.0000000",
        "interest_amount": "0.8333333",
        "usdc_amount": "0.8333333",
        "transaction_hash": "def456...",
        "payment_date": "2024-02-01",
        "status": "completed",
        "email_sent": true,
        "email_sent_at": "2024-02-01T00:05:00.000Z",
        "created_at": "2024-02-01T00:00:00.000Z",
        "investor_name": "João Silva",
        "investor_email": "joao@example.com",
        "token_description": "Sunset Income Note"
      }
    ],
    "pagination": {
      "total": 1,
      "limit": 100,
      "offset": 0,
      "count": 1
    },
    "summary": {
      "unique_investors": "1",
      "total_payments": "1",
      "total_usdc_paid": "0.8333333",
      "average_payment": "0.8333333"
    }
  }
}
```

---

#### `GET /api/payments/statistics`

Obtém estatísticas de pagamentos agrupadas por data.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `assetCode` (opcional): Filtrar por código do asset
- `startDate` (opcional): Data inicial (formato ISO 8601: YYYY-MM-DD)
- `endDate` (opcional): Data final (formato ISO 8601: YYYY-MM-DD)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "statistics": [
      {
        "payment_date": "2024-02-01",
        "payment_count": "5",
        "unique_investors": "5",
        "total_usdc": "8.3333333",
        "average_usdc": "1.6666667",
        "min_usdc": "0.8333333",
        "max_usdc": "3.3333333"
      },
      {
        "payment_date": "2024-01-01",
        "payment_count": "3",
        "unique_investors": "3",
        "total_usdc": "5.0000000",
        "average_usdc": "1.6666667",
        "min_usdc": "0.8333333",
        "max_usdc": "2.5000000"
      }
    ],
    "period": {
      "startDate": "2024-01-01",
      "endDate": "2024-02-01"
    }
  }
}
```

---

## Códigos de Status HTTP

- `200 OK` - Requisição bem-sucedida
- `201 Created` - Recurso criado com sucesso
- `400 Bad Request` - Erro de validação ou requisição inválida
- `401 Unauthorized` - Token não fornecido ou inválido
- `403 Forbidden` - Token válido mas sem permissão
- `404 Not Found` - Recurso não encontrado
- `409 Conflict` - Conflito (ex: email duplicado)
- `500 Internal Server Error` - Erro interno do servidor

---

## Formato de Erros

Todos os erros seguem o formato:

```json
{
  "success": false,
  "error": "Mensagem de erro descritiva",
  "details": [] // Opcional: array com detalhes de validação
}
```

**Exemplo de erro de validação:**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "type": "field",
      "msg": "Email must be a valid email",
      "path": "email",
      "location": "body"
    }
  ]
}
```

---

## Rate Limiting

Atualmente não há rate limiting implementado. Recomenda-se implementar em produção.

---

## Webhooks

Webhooks não estão implementados atualmente. Podem ser adicionados para notificar eventos importantes (ex: novo investidor, pagamento processado).

---

## Exemplos de Uso

### Fluxo Completo: Registro → Whitelist → Compra → Pagamento

```bash
# 1. Registrar investidor
curl -X POST http://localhost:3000/api/investors/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@example.com",
    "document": "12345678900"
  }'

# 2. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@example.com"
  }'

# 3. Aprovar investidor (whitelist)
curl -X POST http://localhost:3000/api/investors/whitelist/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"assetCode": "SIN01"}'

# 4. Comprar tokens
curl -X POST http://localhost:3000/api/investments/purchase \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "investorId": 1,
    "usdcAmount": 100,
    "assetCode": "SIN01"
  }'

# 5. Processar pagamentos de juros (manual)
curl -X POST http://localhost:3000/api/payments/process \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"assetCode": "SIN01"}'

# 6. Verificar histórico de pagamentos
curl -X GET "http://localhost:3000/api/payments/history?investorId=1" \
  -H "Authorization: Bearer <token>"
```

---

## Notas Importantes

1. **Chaves Secretas**: Nunca compartilhe chaves secretas Stellar. Em produção, use variáveis de ambiente seguras.

2. **Testnet vs Mainnet**: O sistema funciona em ambas as redes. Em testnet, use Friendbot para financiar contas. Em mainnet, financie manualmente.

3. **Trustlines**: Investidores precisam estabelecer trustline antes de receber tokens. O processo de whitelist aprova a trustline.

4. **Pagamentos Automáticos**: Pagamentos mensais são agendados automaticamente via cron (dia 1 de cada mês às 00:00 UTC). Use o endpoint manual para testes ou pagamentos antecipados.

5. **Juros**: Taxa anual de 10%, calculada proporcionalmente mensalmente (10% / 12 = 0.8333% ao mês).

6. **USDC**: Os pagamentos de juros são feitos em USDC. Certifique-se de que a conta distribuidora tem USDC suficiente.

---

## Suporte

Para questões ou problemas, consulte o README.md principal ou abra uma issue no repositório.

