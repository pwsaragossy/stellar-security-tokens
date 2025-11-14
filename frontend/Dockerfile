# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Argumento de build para URL da API
ARG VITE_API_URL=/api

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

