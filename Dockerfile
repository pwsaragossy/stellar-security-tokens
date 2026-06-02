FROM node:22-alpine

# Install pg_dump for daily database backups (backup.service.js)
RUN apk add --no-cache postgresql-client

# Create non-root user (alpine base image runs as root by default).
# hardening: drop privileges so a container escape
# doesn't give the attacker root inside the namespace.
RUN addgroup -g 1001 nodeapp \
  && adduser -D -u 1001 -G nodeapp nodeapp \
  && mkdir -p /app /app/logs /app/backups \
  && chown -R nodeapp:nodeapp /app

WORKDIR /app

# Copy backend dependency files
COPY --chown=nodeapp:nodeapp backend/package*.json ./backend/
# Vendored smart-account-kit-bindings (v0.7.1) is referenced via file:vendor/ in
# package.json, so it must be present before `npm ci` resolves dependencies.
COPY --chown=nodeapp:nodeapp backend/vendor/ ./backend/vendor/

# Install backend dependencies (including devDependencies for build)
WORKDIR /app/backend
RUN npm ci

# Return to root and copy source code
WORKDIR /app
COPY --chown=nodeapp:nodeapp backend/ ./backend/
COPY --chown=nodeapp:nodeapp scripts/ ./scripts/

# Generate Prisma Client
WORKDIR /app/backend
RUN npx prisma generate
WORKDIR /app

# Reclaim ownership of everything root created during install + generate
# (npm ci and prisma generate write to node_modules / prisma/generated as root).
RUN chown -R nodeapp:nodeapp /app

# Switch to the non-root user for runtime.
USER nodeapp

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "--import", "tsx", "backend/src/index.js"]
