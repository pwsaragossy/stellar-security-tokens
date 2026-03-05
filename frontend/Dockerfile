# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for Vite environment variables (baked into JS bundle)
ARG VITE_API_URL=/api
ARG VITE_ENABLE_TEST_LOGIN=false
ARG VITE_STELLAR_NETWORK=testnet
ARG VITE_SOROBAN_RPC_URL
ARG VITE_STELLAR_NETWORK_PASSPHRASE
ARG VITE_FACTORY_CONTRACT_ID

# Copiar arquivos de dependências
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Instalar dependências
RUN cd frontend && npm ci

# Copiar código do frontend
COPY frontend/ ./frontend/

# Build da aplicação
WORKDIR /app/frontend
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_ENABLE_TEST_LOGIN=${VITE_ENABLE_TEST_LOGIN}
ENV VITE_STELLAR_NETWORK=${VITE_STELLAR_NETWORK}
ENV VITE_SOROBAN_RPC_URL=${VITE_SOROBAN_RPC_URL}
ENV VITE_STELLAR_NETWORK_PASSPHRASE=${VITE_STELLAR_NETWORK_PASSPHRASE}
ENV VITE_FACTORY_CONTRACT_ID=${VITE_FACTORY_CONTRACT_ID}
RUN npm run build

# Stage 2: Nginx para servir arquivos estáticos
FROM nginx:alpine

# Copiar arquivos buildados
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copiar configuração customizada do nginx
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expor porta
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

