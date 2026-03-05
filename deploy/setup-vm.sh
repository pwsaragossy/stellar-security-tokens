#!/bin/bash
# =============================================================================
# GCE VM Setup Script — Run ONCE on a fresh Ubuntu 22.04 VM
# =============================================================================
# Prerequisites:
#   - GCE VM created (e2-medium, 30GB disk, Ubuntu 22.04)
#   - SSH access configured
#   - DNS records pointing to VM IP (radox.net, app.radox.net, api.radox.net)
#
# Usage:
#   gcloud compute ssh radox-prod
#   curl -sL https://raw.githubusercontent.com/<repo>/main/deploy/setup-vm.sh | bash
#   # OR copy and run manually
# =============================================================================

set -euo pipefail

echo "=== Radox Platform — VM Setup ==="

# 1. Install Docker
echo "📦 Installing Docker..."
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
sudo usermod -aG docker $USER
echo "✅ Docker installed ($(docker --version))"

# 2. Clone repository
echo "📥 Cloning repository..."
if [ ! -d ~/radox ]; then
    git clone https://github.com/TrebleLegacy/stellar-security-tokens.git ~/radox
else
    echo "   Repository already exists at ~/radox"
fi

# 3. Create landing page directory
echo "📁 Creating landing page directory..."
mkdir -p ~/radox/deploy/landing

# 4. Reminder for next steps
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. cd ~/radox"
echo "  2. Copy .env.production and fill in secrets:"
echo "     - POSTGRES_PASSWORD (generate: openssl rand -base64 24)"
echo "     - JWT_SECRET (generate: openssl rand -hex 32)"
echo "     - REDIS_PASSWORD (generate: openssl rand -base64 16)"
echo "     - LAUNCHTUBE_JWT"
echo "     - PINATA_JWT"
echo "     - Stellar public keys"
echo "     - SMTP credentials"
echo "  3. Copy landing page files to deploy/landing/"
echo "  4. Start services:"
echo "     docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build"
echo "  5. Bootstrap admin:"
echo "     ./deploy/bootstrap-admin.sh"
echo "  6. Verify:"
echo "     curl https://api.radox.net/health"
echo "     curl https://app.radox.net"
echo "     curl https://radox.net"
echo ""
echo "⚠️  NOTE: You may need to log out and back in for Docker group permissions."
echo "   Run: newgrp docker"
