---
description: Docker operations - start, stop, restart, test, and troubleshoot containers
---

# Docker Operations Workflow

Reference: [Full Docker Operations Manual](../docs/DOCKER_OPERATIONS.md)

## Common Operations

### 1. Start Development Environment
// turbo
```bash
cd /Users/pedrosaragossy/Workspace/Tokenizadora/stellar-security-tokens
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 2. Restart Backend (After Code/Config Changes)
// turbo
```bash
docker compose restart backend
```

### 3. Force Recreate Backend (After docker-compose.yml Changes)
// turbo
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate backend
```

### 4. Rebuild Backend (After package.json Changes)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build backend
```

### 5. Run Unit Tests
// turbo
```bash
docker exec stellar_backend sh -c 'cd /app/backend && NODE_ENV=test node --import tsx --test tests/unit/**/*.test.js'
```

### 6. Run Auth Tests Only
// turbo
```bash
docker exec stellar_backend sh -c 'cd /app/backend && NODE_ENV=test node --import tsx --test tests/unit/middleware/auth.test.js'
```

### 7. View Backend Logs
// turbo
```bash
docker compose logs -f --tail=50 backend
```

### 8. Stop All
```bash
docker compose down
```

### 9. Clean Up Orphans (After Stale Container Errors)
```bash
docker compose down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## Important Notes

- **Never use** `docker compose down -v` unless you want to delete the database
- **Volume mounts** in dev: `src/`, `prisma/`, `tests/` auto-sync
- **Requires rebuild**: `package.json`, Dockerfile changes
- **Requires force-recreate**: docker-compose.yml changes, `.env` changes
