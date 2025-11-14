# Docker Setup - Stellar Security Tokens

Guia rápido para executar o projeto usando Docker.

## Pré-requisitos

- Docker >= 20.10
- Docker Compose >= 2.0

## Configuração Inicial

1. **Configure as variáveis de ambiente Stellar**

   Crie um arquivo `.env` na raiz do projeto com suas chaves Stellar:

   ```bash
   cp .env.example .env
   # Edite o .env com suas chaves Stellar
   ```

   **Importante**: Configure pelo menos:
   - `ISSUER_SECRET_KEY` e `ISSUER_PUBLIC_KEY`
   - `DISTRIBUTOR_SECRET_KEY` e `DISTRIBUTOR_PUBLIC_KEY`
   - `TREASURY_SECRET_KEY` e `TREASURY_PUBLIC_KEY`
   - `JWT_SECRET` (mude em produção!)

## Executar o Projeto

### Desenvolvimento/Apresentação

```bash
# Subir todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar serviços
docker-compose down

# Parar e remover volumes (apaga dados do banco)
docker-compose down -v
```

### Produção

```bash
# Subir com configuração otimizada
docker-compose -f docker-compose.prod.yml up -d

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f
```

## Acessar a Aplicação

Após subir os containers:

- **Frontend**: http://localhost
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

## Migrations e Seed

As migrations são executadas automaticamente quando o backend inicia.

Para executar manualmente:

```bash
# Migrations
docker-compose exec backend node backend/database/migrate.js

# Seed (dados de exemplo)
docker-compose exec backend node backend/database/seed.js
```

## Comandos Úteis

```bash
# Rebuild das imagens
docker-compose build

# Rebuild forçado (sem cache)
docker-compose build --no-cache

# Ver status dos containers
docker-compose ps

# Acessar shell do backend
docker-compose exec backend sh

# Acessar shell do PostgreSQL
docker-compose exec postgres psql -U postgres -d stellar_tokens

# Ver logs de um serviço específico
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

## Estrutura dos Containers

- **postgres**: Banco de dados PostgreSQL na porta 5432
- **backend**: API Express.js na porta 3000
- **frontend**: Nginx servindo o build do React na porta 80

## Troubleshooting

### Backend não conecta ao banco

```bash
# Verificar se o PostgreSQL está saudável
docker-compose ps

# Ver logs do PostgreSQL
docker-compose logs postgres

# Reiniciar o backend
docker-compose restart backend
```

### Frontend não carrega

```bash
# Rebuild do frontend
docker-compose build frontend
docker-compose up -d frontend

# Verificar logs
docker-compose logs frontend
```

### Limpar tudo e começar do zero

```bash
# Parar e remover containers, volumes e imagens
docker-compose down -v
docker-compose rm -f
docker rmi stellar-security-tokens-backend stellar-security-tokens-frontend

# Rebuild completo
docker-compose build --no-cache
docker-compose up -d
```

## Variáveis de Ambiente

Todas as variáveis do `.env` são carregadas automaticamente pelo docker-compose.

Para produção, considere usar um gerenciador de secrets (Docker Secrets, AWS Secrets Manager, etc.) ao invés de arquivo `.env`.

## Notas Importantes

- O frontend usa `/api` como URL base (proxy nginx para o backend)
- O banco de dados persiste dados em um volume Docker (`postgres_data`)
- As migrations rodam automaticamente na inicialização do backend
- O frontend é servido via Nginx em modo produção (build otimizado)

