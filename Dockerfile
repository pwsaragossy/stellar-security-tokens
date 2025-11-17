FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (incluindo devDependencies para build)
RUN npm ci

# Copiar código do backend
COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY prisma/ ./prisma/

# Gerar Prisma Client
RUN npx prisma generate

# Criar diretório para logs
RUN mkdir -p /app/logs

# Expor porta
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "backend/server.js"]

