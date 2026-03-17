FROM node:22-alpine

# Install pg_dump for daily database backups (backup.service.js)
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy backend dependency files
COPY backend/package*.json ./backend/

# Install backend dependencies (including devDependencies for build)
WORKDIR /app/backend
RUN npm ci

# Return to root and copy source code
WORKDIR /app
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Generate Prisma Client
WORKDIR /app/backend
RUN npx prisma generate
WORKDIR /app

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "--import", "tsx", "backend/src/index.js"]
