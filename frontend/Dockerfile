# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Build arguments for Vite environment variables (baked into JS bundle)
ARG VITE_API_URL=/api
ARG VITE_ENABLE_TEST_LOGIN=false
ARG VITE_STELLAR_NETWORK=testnet
ARG VITE_SOROBAN_RPC_URL
ARG VITE_STELLAR_NETWORK_PASSPHRASE

# Copy dependency files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd frontend && npm ci

# Copy frontend source code
COPY frontend/ ./frontend/

# Build the application
WORKDIR /app/frontend
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_ENABLE_TEST_LOGIN=${VITE_ENABLE_TEST_LOGIN}
ENV VITE_STELLAR_NETWORK=${VITE_STELLAR_NETWORK}
ENV VITE_SOROBAN_RPC_URL=${VITE_SOROBAN_RPC_URL}
ENV VITE_STELLAR_NETWORK_PASSPHRASE=${VITE_STELLAR_NETWORK_PASSPHRASE}
RUN npm run build

# Stage 2: Nginx to serve static files
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
