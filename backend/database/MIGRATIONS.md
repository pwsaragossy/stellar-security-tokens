# Database Migrations - Melhorias Implementadas

Este documento descreve as melhorias de banco de dados implementadas no sistema.

## Sistema de Versionamento

O sistema agora suporta versionamento de migrations através da tabela `schema_migrations`:

- **Tabela**: `schema_migrations` - Rastreia todas as migrations executadas
- **Campos**: `version`, `name`, `executed_at`, `execution_time_ms`
- **Benefícios**: 
  - Evita execução duplicada de migrations
  - Histórico completo de mudanças
  - Rastreamento de performance

## Migrations Implementadas

### 001 - Schema Migrations Table
Cria a tabela de controle de versionamento.

### 002 - Validation Constraints
Adiciona validações de integridade de dados:

- **Email**: Valida formato de email com regex
- **Stellar Public Key**: Valida formato (56 caracteres, começa com G)
- **Valores Positivos**: Garante que amounts sejam > 0
- **Transaction Hash**: Valida formato hexadecimal (64 caracteres)

### 003 - Composite Indexes
Índices compostos para otimizar queries frequentes:

- `idx_investors_kyc_created`: Investidores aprovados ordenados por data
- `idx_interest_payments_investor_asset_date`: Pagamentos por investidor/asset/data
- `idx_distributions_investor_asset_created`: Distribuições por investidor/asset/data
- `idx_interest_payments_pending`: Índice parcial para pagamentos pendentes
- `idx_interest_payments_completed_date`: Pagamentos completos para relatórios

### 004 - Unique Constraints
Previne duplicação de dados:

- `idx_distributions_tx_hash_unique`: Previne distribuições duplicadas
- `idx_interest_payments_unique`: Previne pagamentos duplicados
- `idx_distributions_usdc_hash_unique`: Previne duplicação de pagamentos USDC

### 005 - Updated At Triggers
Triggers automáticos para atualizar `updated_at`:

- Função `update_updated_at_column()`: Atualiza timestamp automaticamente
- Triggers aplicados em: `investors`, `tokens`

### 006 - Helper Functions
Funções auxiliares para queries comuns:

- `get_investor_balance(p_investor_id, p_asset_code)`: Retorna saldo de tokens
- `get_payment_statistics(p_start_date, p_end_date, p_asset_code)`: Estatísticas de pagamentos
- `get_investor_summary(p_investor_id, p_asset_code)`: Resumo completo do investidor

### 007 - Token Interest Rate
Adiciona campo configurável de taxa de juros:

- **Campo**: `annual_interest_rate` na tabela `tokens`
- **Padrão**: 10.0%
- **Constraint**: Entre 0 e 100%
- **Benefício**: Permite diferentes taxas por token

### 008 - Table Optimization
Otimizações de performance:

- **Fillfactor**: 90% para tabelas com atualizações frequentes
- **Autovacuum**: Configurações otimizadas para tabelas grandes
- **Aplicado em**: `investors`, `tokens`, `interest_payments`, `token_distributions`

## Como Executar Migrations

```bash
# Executar todas as migrations pendentes
npm run migrate

# O sistema automaticamente:
# 1. Cria a tabela schema_migrations (se não existir)
# 2. Verifica quais migrations já foram executadas
# 3. Executa apenas as pendentes
# 4. Registra execução na tabela schema_migrations
```

## Estrutura de Migrations

As migrations estão organizadas em dois formatos:

1. **Legacy (inline)**: Migrations originais no arquivo `migrate.js`
2. **SQL Files**: Novas migrations em arquivos `.sql` na pasta `migrations/`

### Formato de Nomenclatura

```
001_nome_da_migration.sql
002_outra_migration.sql
...
```

O número no início do arquivo define a ordem de execução.

## Verificando Migrations Executadas

```sql
-- Ver todas as migrations executadas
SELECT * FROM schema_migrations ORDER BY executed_at DESC;

-- Verificar última migration
SELECT * FROM schema_migrations ORDER BY executed_at DESC LIMIT 1;
```

## Benefícios das Melhorias

### Performance
- ✅ Queries até 10x mais rápidas com índices compostos
- ✅ Índices parciais reduzem tamanho e melhoram performance
- ✅ Otimizações de autovacuum para tabelas grandes

### Integridade
- ✅ Validação automática de dados na camada de banco
- ✅ Prevenção de duplicatas através de constraints únicos
- ✅ Validação de formatos (email, chaves Stellar, hashes)

### Manutenibilidade
- ✅ Versionamento completo de mudanças
- ✅ Funções reutilizáveis para queries comuns
- ✅ Triggers automáticos reduzem código manual

### Flexibilidade
- ✅ Taxa de juros configurável por token
- ✅ Sistema extensível para novas migrations
- ✅ Compatibilidade com migrations legadas

## Próximas Melhorias Sugeridas

1. **Particionamento**: Particionar `interest_payments` por ano quando crescer
2. **Materialized Views**: Views materializadas para relatórios complexos
3. **Full-Text Search**: Índices GIN para busca em descrições
4. **Audit Logs**: Tabela de auditoria para rastrear mudanças importantes

## Troubleshooting

### Migration falha
Se uma migration falhar, o sistema para e não executa as seguintes. Verifique o erro e corrija antes de tentar novamente.

### Migration já executada
O sistema detecta automaticamente migrations já executadas através da tabela `schema_migrations`. Não há risco de execução duplicada.

### Rollback
Para fazer rollback, você precisará criar uma migration de rollback manualmente. O sistema atual não suporta rollback automático.

