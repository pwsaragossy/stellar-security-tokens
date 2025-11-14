FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código do backend
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Criar diretório para logs
RUN mkdir -p /app/logs

# Expor porta
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "backend/server.js"]

