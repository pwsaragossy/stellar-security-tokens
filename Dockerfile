FROM node:20-alpine

# Install pg_dump for daily database backups (backup.service.js)
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copiar arquivos de dependências do backend
COPY backend/package*.json ./backend/

# Instalar dependências do backend (incluindo devDependencies para build)
WORKDIR /app/backend
RUN npm ci

# Voltar para o diretório raiz e copiar código
WORKDIR /app
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Gerar Prisma Client
WORKDIR /app/backend
RUN npx prisma generate
WORKDIR /app

# Criar diretório para logs
RUN mkdir -p /app/logs

# Expor porta
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "--import", "tsx", "backend/src/index.js"]

