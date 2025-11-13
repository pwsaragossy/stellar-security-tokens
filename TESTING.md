# Guia de Testes - Stellar Security Tokens

Este documento descreve a estrutura de testes, como executá-los e a estratégia de mocking utilizada.

## Estrutura de Testes

```
backend/tests/
├── setup.js                    # Configuração global de testes
├── helpers/                    # Funções auxiliares e mocks
│   ├── testData.js            # Dados de teste reutilizáveis
│   ├── stellarMock.js         # Mock do Stellar SDK
│   ├── databaseMock.js        # Mock do PostgreSQL
│   ├── testUtils.js           # Utilitários (req/res/next mocks)
│   ├── testDatabase.js        # Setup/teardown do banco de testes
│   ├── apiClient.js           # Cliente HTTP para testes de API
│   └── mockExpress.js         # Helpers para mockar Express
├── unit/                       # Testes unitários
│   ├── models/
│   │   ├── Investor.test.js
│   │   └── Token.test.js
│   ├── services/
│   │   ├── stellar.service.test.js
│   │   ├── payment.service.test.js
│   │   ├── kyc.service.test.js
│   │   └── email.service.test.js
│   ├── controllers/
│   │   ├── investorController.test.js
│   │   ├── tokenController.test.js
│   │   ├── investmentController.test.js
│   │   └── paymentController.test.js
│   └── middleware/
│       ├── auth.test.js
│       └── validator.test.js
└── integration/               # Testes de integração
    └── api/
        ├── auth.test.js
        ├── investors.test.js
        ├── tokens.test.js
        ├── investments.test.js
        └── payments.test.js
```

## Como Executar Testes

### Todos os Testes

```bash
npm test
```

### Apenas Testes Unitários

```bash
npm run test:unit
```

### Apenas Testes de Integração

```bash
npm run test:integration
```

### Modo Watch (re-executa ao salvar arquivos)

```bash
npm run test:watch
```

## Configuração do Ambiente de Teste

### Variáveis de Ambiente

Crie um arquivo `.env.test` baseado em `.env.test.example`:

```bash
cp .env.test.example .env.test
```

Configure as variáveis necessárias, especialmente:

- `DB_NAME=test_stellar_tokens` - Banco de dados de teste separado
- `JWT_SECRET=test_jwt_secret_key_for_testing_only` - Secret para testes
- `STELLAR_NETWORK=testnet` - Rede Stellar para testes

### Banco de Dados de Teste

Crie um banco de dados separado para testes:

```bash
createdb test_stellar_tokens
```

Execute as migrations no banco de teste:

```bash
# Configure DB_NAME=test_stellar_tokens no .env.test
npm run migrate
```

## Estratégia de Mocking

### Unit Tests

Os testes unitários usam mocks para isolar o código sendo testado:

#### Stellar SDK
- `stellarServer.loadAccount()` - Mockado para retornar contas simuladas
- `stellarServer.submitTransaction()` - Mockado para simular transações
- Operações Stellar são mockadas para evitar chamadas reais à rede

#### PostgreSQL
- `query()` e `getClient()` são mockados
- Retornam dados simulados baseados em `testData.js`
- Permitem testar lógica sem banco de dados real

#### Email Service
- `nodemailer.createTransport()` e `transporter.sendMail()` são mockados
- Simula envio de emails sem enviar emails reais

### Integration Tests

Os testes de integração usam recursos reais:

- **Banco de Dados**: PostgreSQL real (`test_stellar_tokens`)
- **API**: Requisições HTTP reais para o servidor Express
- **Setup/Teardown**: Limpa e popula dados antes/depois de cada teste

## Cobertura de Testes

### Models (90%+)
- ✅ Criação, leitura, atualização, deleção
- ✅ Buscas por diferentes campos
- ✅ Validações e constraints
- ✅ Paginação

### Services (85%+)
- ✅ Lógica de negócio
- ✅ Cálculos (juros, saldos)
- ✅ Integração com Stellar SDK (mockado)
- ✅ Retry logic e tratamento de erros

### Controllers (80%+)
- ✅ Todos os endpoints
- ✅ Validações de entrada
- ✅ Códigos de status HTTP corretos
- ✅ Tratamento de erros

### Middleware (90%+)
- ✅ Autenticação JWT
- ✅ Validação de dados
- ✅ Casos de erro

### Integration Tests
- ✅ Fluxos completos de API
- ✅ Autenticação e autorização
- ✅ Persistência no banco de dados

## Executando Testes Específicos

### Um arquivo específico

```bash
node --test backend/tests/unit/models/Investor.test.js
```

### Um teste específico

Use `test.only()` ou `describe.only()` no arquivo de teste:

```javascript
test.only('meu teste específico', async () => {
  // ...
});
```

## Debugging Testes

### Ver logs durante testes

Por padrão, logs são suprimidos. Para ver logs:

```bash
SUPPRESS_TEST_LOGS=false npm test
```

### Executar com Node debugger

```bash
node --inspect --test backend/tests/unit/models/Investor.test.js
```

## Boas Práticas

1. **Isolamento**: Cada teste deve ser independente
2. **Cleanup**: Sempre limpe dados de teste após cada teste
3. **Mocks**: Use mocks para dependências externas em unit tests
4. **Dados**: Use `testData.js` para dados consistentes
5. **Nomes**: Use nomes descritivos que expliquem o que está sendo testado

## Troubleshooting

### Erro: "Cannot find module"
- Verifique se os caminhos de import estão corretos
- Certifique-se de que está usando `import` e não `require`

### Erro: "Database connection failed"
- Verifique se o PostgreSQL está rodando
- Verifique as credenciais no `.env.test`
- Certifique-se de que o banco `test_stellar_tokens` existe

### Erro: "Port already in use"
- Pare o servidor de desenvolvimento antes de rodar integration tests
- Ou configure `TEST_API_URL` para uma porta diferente

### Testes lentos
- Unit tests devem ser rápidos (< 1s cada)
- Integration tests podem ser mais lentos devido ao banco de dados
- Use `test:unit` para desenvolvimento rápido

## Próximos Passos

- [ ] Adicionar cobertura de código (c8)
- [ ] Testes E2E com Playwright/Cypress
- [ ] Testes de performance
- [ ] Testes de carga

