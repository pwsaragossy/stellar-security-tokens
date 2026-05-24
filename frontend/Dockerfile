# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Build arguments for Vite environment variables (baked into JS bundle)
ARG VITE_API_URL=/api
ARG VITE_ENABLE_TEST_LOGIN=false
ARG VITE_STELLAR_NETWORK=testnet
ARG VITE_SOROBAN_RPC_URL
ARG VITE_STELLAR_NETWORK_PASSPHRASE
ARG VITE_DEV_TOOLS=false
ARG VITE_APP_VERSION
ARG VITE_SENTRY_DSN

# Copy dependency files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd frontend && npm ci --legacy-peer-deps

# Copy frontend source code
COPY frontend/ ./frontend/

# Build the application
WORKDIR /app/frontend
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_ENABLE_TEST_LOGIN=${VITE_ENABLE_TEST_LOGIN}
ENV VITE_STELLAR_NETWORK=${VITE_STELLAR_NETWORK}
ENV VITE_SOROBAN_RPC_URL=${VITE_SOROBAN_RPC_URL}
ENV VITE_STELLAR_NETWORK_PASSPHRASE=${VITE_STELLAR_NETWORK_PASSPHRASE}
ENV VITE_DEV_TOOLS=${VITE_DEV_TOOLS}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
RUN npm run build

# Stage 2: Nginx to serve static files
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# hardening: drop to non-root.
# nginx:alpine ships with the `nginx` user. We need to:
#   1) Make /var/cache/nginx and /var/run writable for the nginx user.
#   2) Point pid to a writable location.
#   3) Bind to port 8080 instead of 80 (ports <1024 require root).
RUN sed -i 's/listen 80;/listen 8080;/g' /etc/nginx/conf.d/default.conf \
  && grep -q 'listen 8080;' /etc/nginx/conf.d/default.conf \
  && chown -R nginx:nginx /var/cache/nginx /var/run /usr/share/nginx/html /etc/nginx/conf.d \
  && touch /var/run/nginx.pid \
  && chown nginx:nginx /var/run/nginx.pid

USER nginx

# Expose port (8080 to allow non-root bind)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
