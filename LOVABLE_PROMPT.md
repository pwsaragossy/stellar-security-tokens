# Prompt Completo para Lovable - Dashboard Admin Stellar Security Tokens

## Contexto do Projeto

Crie um dashboard administrativo completo e profissional para gerenciar Security Tokens na rede Stellar. O sistema permite registrar investidores, emitir tokens, distribuir tokens, processar pagamentos de juros mensais e visualizar relatórios completos.

## Stack Técnica

- **Framework**: React 19+ com TypeScript
- **Roteamento**: React Router DOM v7
- **Estilização**: Tailwind CSS 4+ (design moderno e responsivo)
- **HTTP Client**: Axios
- **Gráficos**: Recharts
- **Ícones**: Lucide React
- **Autenticação**: JWT (Bearer Token)

## Configuração da API

**Base URL**: `http://localhost:3000/api`

**Autenticação**: Todos os endpoints (exceto login e register) requerem header:
```
Authorization: Bearer <token>
```

**Formato de Resposta Padrão**:
```typescript
{
  success: boolean;
  data?: any;
  error?: string;
  details?: ValidationError[];
  pagination?: {
    limit: number;
    offset: number;
    count: number;
    total?: number;
  }
}
```

## Estrutura de Dados

### Investor (Investidor)
```typescript
interface Investor {
  id: number;
  name: string;
  email: string;
  document: string; // CPF/CNPJ
  stellar_public_key?: string;
  kyc_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}
```

### Token
```typescript
interface Token {
  id: number;
  asset_code: string; // Ex: "SIN01"
  issuer_public_key: string;
  total_supply: string; // NUMERIC format
  description?: string;
  annual_interest_rate?: number; // Taxa de juros anual
  created_at: string;
  updated_at: string;
}
```

### Token Distribution
```typescript
interface TokenDistribution {
  id: number;
  investor_id: number;
  asset_code: string;
  amount: string;
  transaction_hash: string;
  usdc_payment_hash?: string;
  created_at: string;
}
```

### Interest Payment
```typescript
interface InterestPayment {
  id: number;
  investor_id: number;
  asset_code: string;
  token_balance: string;
  interest_rate: string;
  interest_amount: string;
  usdc_amount: string;
  transaction_hash: string;
  payment_date: string; // YYYY-MM-DD
  status: 'pending' | 'completed' | 'failed';
  email_sent: boolean;
  email_sent_at?: string;
  retry_count: number;
  error_message?: string;
  created_at: string;
  investor_name?: string;
  investor_email?: string;
  token_description?: string;
}
```

### Balance Response
```typescript
interface InvestorBalance {
  investor: Investor;
  balance: {
    assetCode: string;
    balance: string;
    isAuthorized: boolean;
  };
  tokenDistributions: TokenDistribution[];
  interestPayments: InterestPayment[];
  summary: {
    totalTokensReceived: number;
    totalInterestReceived: number;
    distributionCount: number;
    interestPaymentCount: number;
  };
}
```

## Funcionalidades Completas

### 1. Autenticação

#### Login (`POST /api/auth/login`)
- **Tela**: Página de login simples e elegante
- **Campos**: Email (obrigatório), Password (opcional por enquanto)
- **Ações**:
  - Validação de email
  - Exibir erros de validação
  - Armazenar token JWT no localStorage
  - Redirecionar para dashboard após login
  - Mostrar loading durante requisição
- **Tratamento de Erros**: Exibir mensagem amigável para credenciais inválidas

### 2. Registro de Investidores

#### Registrar Investidor (`POST /api/investors/register`)
- **Tela**: Formulário de registro
- **Campos**:
  - Nome completo (obrigatório, mínimo 3 caracteres)
  - Email (obrigatório, formato válido, único)
  - Documento/CPF (obrigatório, único)
- **Ações**:
  - Validação completa de formulário
  - Criar conta Stellar automaticamente
  - Exibir chave pública Stellar criada (com aviso de segurança)
  - Mostrar status KYC inicial (pending)
  - Redirecionar para lista de investidores após sucesso
- **Tratamento de Erros**: 
  - Email já existe (409)
  - Documento já existe (409)
  - Erros de validação com detalhes

### 3. Gerenciamento de Investidores

#### Listar Investidores (`GET /api/investors`)
- **Tela**: Tabela com paginação e filtros
- **Funcionalidades**:
  - Tabela responsiva com colunas: ID, Nome, Email, Documento, Chave Stellar, Status KYC, Data de Registro
  - Filtros: Por status KYC (pending/approved/rejected), por nome/email (busca)
  - Paginação: Limite e offset, mostrar total de registros
  - Ordenação: Por data de criação (mais recentes primeiro)
  - Ações por linha: Ver detalhes, Editar, Aprovar KYC (whitelist)
  - Badges coloridos para status KYC:
    - Pending: Amarelo/Laranja
    - Approved: Verde
    - Rejected: Vermelho
- **Estados**: Loading, Empty state, Error state

#### Ver Detalhes do Investidor (`GET /api/investors/:id`)
- **Tela**: Página de detalhes completa
- **Seções**:
  1. **Informações Pessoais**: Nome, Email, Documento, Chave Stellar, Status KYC
  2. **Saldo e Histórico** (`GET /api/investors/:investorId/balance`):
     - Card com saldo atual de tokens
     - Gráfico de evolução de saldo (se houver histórico)
     - Tabela de distribuições de tokens recebidas
     - Tabela de pagamentos de juros recebidos
     - Resumo: Total de tokens recebidos, Total de juros recebidos, Contadores
  3. **Histórico de Pagamentos** (`GET /api/investors/:investorId/payments`):
     - Tabela com todos os pagamentos de juros
     - Filtros: Por asset code, por período
     - Mostrar: Data, Valor em USDC, Taxa de juros, Status, Hash da transação (link para Stellar Explorer)
- **Ações**: Editar investidor, Aprovar KYC, Ver transações no Stellar Explorer

#### Editar Investidor (`PUT /api/investors/:id`)
- **Tela**: Modal ou página de edição
- **Campos editáveis**: Nome, Email, Status KYC
- **Validações**: Email válido, status KYC válido
- **Ações**: Salvar alterações, Cancelar

#### Aprovar KYC / Whitelist (`POST /api/investors/whitelist/:investorId`)
- **Ação**: Botão na lista ou página de detalhes
- **Funcionalidade**: 
  - Modal de confirmação
  - Opção de escolher asset code (padrão: SIN01)
  - Processar aprovação
  - Atualizar status para "approved"
  - Mostrar hash da transação Stellar
- **Feedback**: Loading, Sucesso com hash, Erro com mensagem

### 4. Gerenciamento de Tokens

#### Listar Tokens (`GET /api/tokens`)
- **Tela**: Cards ou tabela de tokens
- **Informações**: Asset Code, Descrição, Supply Total, Taxa de Juros, Data de Criação
- **Ações**: Ver detalhes, Emitir novo token, Distribuir tokens

#### Ver Detalhes do Token (`GET /api/tokens/:assetCode`)
- **Tela**: Página de detalhes do token
- **Informações**: 
  - Código do asset
  - Chave pública do emissor
  - Supply total
  - Descrição
  - Taxa de juros anual
  - Data de criação
- **Ações**: Distribuir tokens, Ver distribuições, Ver estatísticas

#### Emitir Token (`POST /api/tokens/issue`)
- **Tela**: Modal ou página de formulário
- **Campos**:
  - Asset Code (obrigatório, máximo 12 caracteres, único)
  - Total Supply (obrigatório, número positivo)
  - Descrição (opcional)
  - Taxa de Juros Anual (opcional, padrão 10%, 0-100%)
- **Validações**: 
  - Asset code único
  - Supply positivo
  - Taxa entre 0 e 100
- **Ações**: Emitir token, Cancelar
- **Feedback**: Mostrar hash da transação Stellar após sucesso

#### Distribuir Tokens (`POST /api/tokens/distribute`)
- **Tela**: Modal de distribuição
- **Campos**:
  - Seleção de investidor (dropdown com busca, apenas aprovados)
  - Asset Code (dropdown com tokens disponíveis)
  - Quantidade (obrigatório, número positivo)
- **Validações**: 
  - Investidor deve estar aprovado
  - Token deve existir
  - Quantidade positiva
- **Ações**: Distribuir, Cancelar
- **Feedback**: Mostrar hash da transação, atualizar saldo do investidor

#### Verificar Saldo (`GET /api/tokens/:assetCode/balance?publicKey=...`)
- **Funcionalidade**: Campo de busca na página do token
- **Ação**: Inserir chave pública Stellar e verificar saldo
- **Resultado**: Mostrar saldo, status de autorização

### 5. Investimentos

#### Comprar Tokens (`POST /api/investments/purchase`)
- **Tela**: Modal ou página de compra
- **Campos**:
  - Seleção de investidor (dropdown, apenas aprovados)
  - Quantidade em USDC (obrigatório, número positivo)
  - Asset Code (dropdown, padrão SIN01)
- **Informações**: 
  - Taxa de câmbio (1:1 por padrão)
  - Quantidade de tokens que será recebida
- **Validações**: 
  - Investidor aprovado
  - Valor positivo
- **Ações**: Processar compra, Cancelar
- **Feedback**: 
  - Mostrar hash da transação
  - Aviso sobre pagamento USDC separado
  - Atualizar saldo do investidor

### 6. Pagamentos de Juros

#### Processar Pagamentos (`POST /api/payments/process`)
- **Tela**: Página de processamento ou modal
- **Campos**:
  - Asset Code (dropdown, padrão SIN01)
- **Funcionalidades**:
  - Botão "Processar Pagamentos Mensais"
  - Modal de confirmação com resumo:
    - Número de investidores que receberão
    - Total estimado de USDC a pagar
  - Processar pagamentos
  - Mostrar progresso (se possível)
- **Resultado**: 
  - Mostrar resumo completo:
    - Data do pagamento
    - Hash da transação
    - Número de pagamentos processados
    - Total de juros pagos
    - Emails enviados
    - Duração do processamento
- **Estados**: Loading, Sucesso com detalhes, Erro

#### Histórico de Pagamentos (`GET /api/payments/history`)
- **Tela**: Tabela completa com filtros avançados
- **Filtros**:
  - Por Asset Code (dropdown)
  - Por Investidor (dropdown com busca)
  - Por período (date picker start/end)
  - Por status (pending/completed/failed)
  - Limite e offset (paginação)
- **Colunas**: 
  - Data do Pagamento
  - Investidor (nome e email)
  - Asset Code
  - Saldo de Tokens
  - Taxa de Juros
  - Valor em USDC
  - Status (badge colorido)
  - Hash da Transação (link para Stellar Explorer)
  - Email Enviado (ícone sim/não)
  - Data de Criação
- **Ações**: 
  - Ver detalhes do investidor
  - Ver transação no Stellar Explorer
  - Exportar para CSV (opcional)
- **Resumo**: Total de pagamentos, Total de USDC pago, Média por pagamento

#### Estatísticas de Pagamentos (`GET /api/payments/statistics`)
- **Tela**: Dashboard com gráficos e cards
- **Filtros**: Asset Code, Período (start/end date)
- **Visualizações**:
  1. **Cards de Resumo**:
     - Total de pagamentos no período
     - Total de USDC pago
     - Investidores únicos
     - Média por pagamento
  2. **Gráfico de Linha**: Evolução de pagamentos ao longo do tempo
  3. **Gráfico de Barras**: Pagamentos por data
  4. **Tabela de Estatísticas**: 
     - Agrupado por data
     - Colunas: Data, Número de Pagamentos, Investidores Únicos, Total USDC, Média, Mínimo, Máximo
- **Biblioteca**: Recharts para gráficos

## Requisitos de UI/UX

### Design System
- **Cores**: 
  - Primária: Azul profissional (#3B82F6 ou similar)
  - Sucesso: Verde (#10B981)
  - Erro: Vermelho (#EF4444)
  - Aviso: Amarelo (#F59E0B)
  - Info: Azul claro (#60A5FA)
- **Tipografia**: 
  - Títulos: Bold, tamanhos variados
  - Corpo: Regular, legível
  - Monospace: Para hashes e chaves Stellar
- **Espaçamento**: Consistente, usar Tailwind spacing scale
- **Bordas**: Arredondadas (rounded-lg, rounded-xl)
- **Sombras**: Sutis para elevação (shadow-sm, shadow-md)

### Componentes Reutilizáveis
1. **Button**: Variantes (primary, secondary, danger, ghost), tamanhos (sm, md, lg), loading state
2. **Input**: Com label, placeholder, erro, ícone opcional
3. **Select/Dropdown**: Com busca quando necessário
4. **Modal**: Overlay, animação suave, fechar com ESC
5. **Table**: Responsiva, ordenável, paginação integrada
6. **Card**: Com header, body, footer opcionais
7. **Badge**: Para status (cores diferentes)
8. **Alert**: Para mensagens de sucesso/erro/aviso
9. **Loading Spinner**: Para estados de carregamento
10. **Empty State**: Quando não há dados

### Responsividade
- **Mobile**: Layout adaptável, tabelas scrolláveis horizontalmente
- **Tablet**: Layout em 2 colunas quando apropriado
- **Desktop**: Layout completo, todas as funcionalidades visíveis

### Acessibilidade
- Labels descritivos em todos os campos
- Navegação por teclado
- Contraste adequado de cores
- ARIA labels onde necessário
- Foco visível em elementos interativos

## Fluxos de Usuário Principais

### Fluxo 1: Registrar e Aprovar Investidor
1. Login → Dashboard
2. Navegar para "Investidores" → "Novo Investidor"
3. Preencher formulário → Submeter
4. Ver confirmação com chave Stellar criada
5. Na lista, clicar em "Aprovar KYC" do investidor
6. Confirmar aprovação → Ver status atualizado

### Fluxo 2: Emitir e Distribuir Tokens
1. Navegar para "Tokens" → "Emitir Token"
2. Preencher dados do token → Emitir
3. Ver confirmação com hash da transação
4. Clicar em "Distribuir Tokens"
5. Selecionar investidor aprovado → Quantidade → Distribuir
6. Ver confirmação e atualização de saldo

### Fluxo 3: Processar Pagamentos de Juros
1. Navegar para "Pagamentos" → "Processar Pagamentos"
2. Selecionar Asset Code → Clicar em "Processar"
3. Confirmar no modal
4. Ver progresso (se possível) ou aguardar
5. Ver resumo completo com todos os detalhes
6. Verificar histórico atualizado

### Fluxo 4: Visualizar Relatórios
1. Navegar para "Relatórios" ou "Estatísticas"
2. Selecionar período e filtros
3. Ver gráficos e estatísticas atualizadas
4. Exportar dados (opcional)

## Tratamento de Erros

### Erros de API
- **401 Unauthorized**: Redirecionar para login, limpar token
- **403 Forbidden**: Mostrar mensagem de permissão negada
- **404 Not Found**: Mostrar mensagem "Recurso não encontrado"
- **409 Conflict**: Mostrar mensagem específica (ex: "Email já cadastrado")
- **400 Bad Request**: Mostrar erros de validação detalhados
- **500 Server Error**: Mostrar mensagem genérica, sugerir tentar novamente

### Validações de Formulário
- Validação em tempo real quando possível
- Mensagens de erro claras e específicas
- Destaque visual de campos com erro
- Prevenir submissão se houver erros

### Estados de Loading
- Spinner ou skeleton durante carregamento
- Desabilitar botões durante ações
- Mostrar "Carregando..." em tabelas

## Integração com Stellar Explorer

Sempre que houver um `transaction_hash`, criar link para:
```
https://stellar.expert/explorer/testnet/tx/{transaction_hash}
```
ou
```
https://stellar.expert/explorer/public/tx/{transaction_hash}
```
(dependendo se está em testnet ou mainnet)

## Estrutura de Pastas Sugerida

```
src/
├── api/
│   ├── client.ts          # Configuração do Axios
│   ├── auth.ts            # Endpoints de autenticação
│   ├── investors.ts       # Endpoints de investidores
│   ├── tokens.ts          # Endpoints de tokens
│   ├── investments.ts     # Endpoints de investimentos
│   └── payments.ts        # Endpoints de pagamentos
├── components/
│   ├── ui/                # Componentes base (Button, Input, etc)
│   ├── layout/            # Layout components (Header, Sidebar, etc)
│   ├── investors/         # Componentes específicos de investidores
│   ├── tokens/            # Componentes específicos de tokens
│   └── payments/          # Componentes específicos de pagamentos
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Investors/
│   │   ├── List.tsx
│   │   ├── Detail.tsx
│   │   └── Register.tsx
│   ├── Tokens/
│   │   ├── List.tsx
│   │   ├── Detail.tsx
│   │   └── Issue.tsx
│   └── Payments/
│       ├── Process.tsx
│       ├── History.tsx
│       └── Statistics.tsx
├── hooks/
│   ├── useAuth.ts         # Hook de autenticação
│   ├── useInvestors.ts    # Hook para investidores
│   └── usePayments.ts     # Hook para pagamentos
├── types/
│   └── index.ts           # TypeScript interfaces
├── utils/
│   ├── format.ts          # Formatação de números, datas
│   └── validation.ts      # Funções de validação
└── App.tsx
```

## Requisitos Técnicos Específicos

1. **Gerenciamento de Estado**: 
   - Context API para autenticação global
   - React Query ou SWR para cache de dados da API
   - Estado local para formulários

2. **Persistência**:
   - Token JWT no localStorage
   - Limpar ao fazer logout

3. **Interceptores Axios**:
   - Adicionar token automaticamente em todas as requisições
   - Tratar erros 401 globalmente
   - Mostrar loading global durante requisições

4. **Formatação**:
   - Números: Formatar com separadores de milhar e casas decimais
   - Datas: Formato brasileiro (DD/MM/YYYY) ou ISO conforme contexto
   - Moedas: USDC com símbolo $
   - Hashes: Mostrar primeiros 8 e últimos 8 caracteres com "..." no meio

5. **Performance**:
   - Lazy loading de rotas
   - Debounce em buscas
   - Paginação eficiente
   - Cache de dados quando apropriado

## Checklist de Funcionalidades

- [ ] Autenticação completa (login, logout, proteção de rotas)
- [ ] CRUD completo de investidores
- [ ] Aprovação de KYC (whitelist)
- [ ] Visualização de saldo e histórico do investidor
- [ ] CRUD completo de tokens
- [ ] Emissão de tokens
- [ ] Distribuição de tokens
- [ ] Compra de tokens com USDC
- [ ] Processamento de pagamentos de juros
- [ ] Histórico completo de pagamentos com filtros
- [ ] Estatísticas e gráficos de pagamentos
- [ ] Links para Stellar Explorer em todas as transações
- [ ] Validação completa de formulários
- [ ] Tratamento de erros em todas as operações
- [ ] Estados de loading em todas as ações
- [ ] Design responsivo
- [ ] Acessibilidade básica

## Notas Finais

- O sistema deve ser **completo e funcional**, não deixar nenhuma funcionalidade do backend sem interface
- Priorizar **usabilidade** e **clareza** sobre complexidade visual
- Todos os dados devem ser **atualizados em tempo real** após operações
- Mensagens de sucesso/erro devem ser **claras e acionáveis**
- O design deve ser **profissional e moderno**, adequado para um sistema financeiro

---

**IMPORTANTE**: Este prompt deve resultar em um frontend **100% funcional** que se conecta perfeitamente com o backend existente. Todas as funcionalidades listadas devem estar implementadas e testadas.

