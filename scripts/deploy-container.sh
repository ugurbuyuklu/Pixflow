#!/usr/bin/env bash
set -euo pipefail

CONFIG="wrangler.container.toml"
WORKER_URL="https://pixflow.pixeryai.workers.dev"

echo "=== Pixflow Unified Container Deploy ==="

# Check Docker
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and try again."
  exit 1
fi
echo "Docker: OK"

# Check Cloudflare auth (containers:write scope required)
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "ERROR: Not authenticated with Cloudflare. Run 'npx wrangler login' first."
  exit 1
fi
echo "Cloudflare auth: OK"

# Push secrets from .env (skip missing keys silently)
SECRETS=(
  JWT_SECRET
  OPENAI_API_KEY
  FAL_API_KEY
  KLING_API_KEY
  HEDRA_API_KEY
  ELEVENLABS_API_KEY
  PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD
)

ENV_FILE="$(dirname "$0")/../.env"
if [[ -f "$ENV_FILE" ]]; then
  echo ""
  echo "Pushing secrets from .env..."
  for secret in "${SECRETS[@]}"; do
    value=$(grep -E "^${secret}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
    if [[ -n "$value" ]]; then
      echo "$value" | npx wrangler secret put "$secret" --config "$CONFIG" 2>/dev/null
      echo "  $secret -> set"
    else
      echo "  $secret -> skipped (not in .env)"
    fi
  done
else
  echo ""
  echo "WARNING: No .env file found at $ENV_FILE — skipping secrets."
  echo "  Create .env with secret values to auto-push on deploy."
fi

echo ""
echo "Deploying..."
npx wrangler deploy --config "$CONFIG"

echo ""
echo "Deploy complete: $WORKER_URL"
echo ""
echo "Verify:"
echo "  curl $WORKER_URL/health"
echo "  curl $WORKER_URL/api/products"
echo "  curl -s $WORKER_URL/ | head -5"
