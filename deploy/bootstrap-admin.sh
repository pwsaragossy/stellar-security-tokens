#!/bin/bash
# =============================================================================
# Bootstrap Admin — Run ONCE on first production deployment
# =============================================================================
# Creates the initial admin account so Freighter login works.
# checkAndCreateAdmin.js refuses to run in NODE_ENV=production,
# so we insert directly via psql.
#
# Usage (from project root on the VM):
#   chmod +x deploy/bootstrap-admin.sh
#   ./deploy/bootstrap-admin.sh
# =============================================================================

set -euo pipefail

# Load env vars for DB credentials
if [ -f .env.production ]; then
    export $(grep -E '^POSTGRES_(USER|PASSWORD|DB)=' .env.production | xargs)
fi

POSTGRES_USER=${POSTGRES_USER:-stellar_prod}
POSTGRES_DB=${POSTGRES_DB:-stellar_tokens}

echo "🔐 Bootstrapping admin account..."

docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
INSERT INTO platform_admins (
    email, name, password_hash, role, is_active,
    stellar_public_key, created_at, updated_at
) VALUES (
    'psaragossy@gmail.com',
    'Pedro Saragossy',
    'FREIGHTER_ONLY',
    'super_admin',
    true,
    'GCQPERDSGG4524J5N33IFUXOHRJKFJFBNDX27KXET7MC6OV7XJAG5VX5',
    NOW(), NOW()
) ON CONFLICT (email) DO UPDATE SET
    stellar_public_key = EXCLUDED.stellar_public_key,
    is_active = true;
"

echo "✅ Admin account created. Login via Freighter at app.radox.net/admin/login"
