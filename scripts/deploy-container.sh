#!/usr/bin/env bash
set -euo pipefail

CONFIG="wrangler.container.toml"

echo "=== Pixflow Container Deploy ==="

# Check Docker
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and try again."
  exit 1
fi
echo "Docker: OK"

# Check Cloudflare auth
if ! wrangler whoami >/dev/null 2>&1; then
  echo "ERROR: Not authenticated with Cloudflare. Run 'wrangler login' first."
  exit 1
fi
echo "Cloudflare auth: OK"

# Set secrets (prompts for value via stdin)
SECRETS=(
  JWT_SECRET
  OPENAI_API_KEY
  FAL_API_KEY
  KLING_API_KEY
  HEDRA_API_KEY
  ELEVENLABS_API_KEY
  PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD
)

echo ""
echo "Setting secrets (press Enter to skip any)..."
for secret in "${SECRETS[@]}"; do
  printf "  %s: " "$secret"
  read -r value
  if [ -n "$value" ]; then
    echo "$value" | wrangler secret put "$secret" --config "$CONFIG" 2>/dev/null
    echo "    -> set"
  else
    echo "    -> skipped"
  fi
done

echo ""
echo "Deploying..."
wrangler deploy --config "$CONFIG"

echo ""
echo "Deploy complete."
