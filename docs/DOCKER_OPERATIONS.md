# Docker Operations Manual

> **IMPORTANT**: Always use the correct compose files and commands to avoid bricking Docker or losing data.

## Quick Reference

| Action | Command |
|--------|---------|
| Start development | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` |
| Start with rebuild | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build` |
| View logs | `docker compose logs -f backend` |
| Restart backend only | `docker compose restart backend` |
| Run tests | `docker exec stellar_backend sh -c 'cd /app/backend && NODE_ENV=test node --import tsx --test tests/unit/**/*.test.js'` |
| Stop all | `docker compose down` |

---

## Safe Operations (Use These)

### Start Development Environment
```bash
cd /Users/pedrosaragossy/Workspace/Tokenizadora/stellar-security-tokens
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### Start with Rebuild (After Code Changes)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### Restart a Single Service (Safe, Keeps Data)
```bash
docker compose restart backend
docker compose restart frontend
```

### Force Recreate (Picks Up Volume/Config Changes)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate backend
```

### View Logs
```bash
docker compose logs -f backend          # Follow backend logs
docker compose logs -f --tail=100 backend  # Last 100 lines
docker compose logs -f                   # All services
```

### Run Tests Inside Container
```bash
# Auth tests
docker exec stellar_backend sh -c 'cd /app/backend && NODE_ENV=test node --import tsx --test tests/unit/middleware/auth.test.js'

# All unit tests
docker exec stellar_backend sh -c 'cd /app/backend && NODE_ENV=test node --import tsx --test tests/unit/**/*.test.js'
```

### Check Container Health
```bash
docker ps                                 # List running containers
docker exec stellar_backend env | grep STELLAR  # Check env vars
```

---

## Destructive Operations (Use With Caution)

### Stop All Services (Keeps Data)
```bash
docker compose down
```

### Stop and Remove Volumes (⚠️ DELETES DATABASE)
```bash
docker compose down -v   # DANGEROUS: Deletes postgres data!
```

### Clean Up Orphaned Containers
```bash
docker compose down --remove-orphans
```

### Full System Prune (⚠️ NUCLEAR OPTION)
```bash
docker system prune -a --volumes  # DELETES EVERYTHING!
```

---

## When To Use Each Command

| Scenario | Command |
|----------|---------|
| Code changed in `src/` | Just save - volume mount auto-syncs |
| Changed `package.json` | `up -d --build` |
| Changed `docker-compose*.yml` | `up -d --force-recreate` |
| Changed `.env` | `up -d --force-recreate` |
| Changed Prisma schema | `up -d --build` then run migrations |
| Container not responding | `docker compose restart backend` |
| Stale container error | `docker compose down --remove-orphans` then `up -d` |
| Tests not seeing changes | Restart container or check volume mounts |

---

## Volume Mounts (What Syncs Automatically)

Defined in `docker-compose.dev.yml`:
- `./backend/src` → Hot-reloaded
- `./backend/prisma` → Hot-reloaded
- `./backend/tests` → Hot-reloaded

**NOT mounted** (requires rebuild):
- `package.json` / `node_modules`
- Dockerfile changes
- New dependencies

---

## Troubleshooting

### "stat .env: operation not permitted"
macOS security issue. Run:
```bash
cat .env > .env.new && rm .env && mv .env.new .env
```

### "No such container: xxx"
Stale container reference:
```bash
docker compose down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### Backend not starting
Check logs:
```bash
docker compose logs backend | tail -50
```

### Tests not reflecting code changes
Test files may not be volume-mounted. Restart backend:
```bash
docker compose restart backend
```
