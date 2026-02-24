# Post-Deploy: Remaining Tasks

## Missing Secrets

These secrets are not available from the Pixery AI MCP and must be set manually:

```bash
echo "YOUR_KEY" | npx wrangler secret put KLING_API_KEY --config wrangler.container.toml
echo "YOUR_KEY" | npx wrangler secret put HEDRA_API_KEY --config wrangler.container.toml
echo "YOUR_KEY" | npx wrangler secret put ELEVENLABS_API_KEY --config wrangler.container.toml
```

## Cloudflare Zero Trust

The `pixflow.pixeryai.workers.dev` domain is behind Cloudflare Access.
Add a bypass policy for `pixflow.pixeryai.workers.dev` in the Zero Trust dashboard
(or update the existing `pixflow-backend.pixeryai.workers.dev` policy to cover the new hostname).

## Cleanup

After verifying the new `pixflow` worker works end-to-end, delete the old `pixflow-backend` worker
from the Cloudflare dashboard.

## .env File

The `.env` file is protected by a hook and must be created manually. It should contain:

```
JWT_SECRET=<real-secret-min-32-chars>
PIXFLOW_AUTH_MODE=token
PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP=true
PIXFLOW_BOOTSTRAP_ADMIN_EMAIL=admin@pixflow.local
PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD=<real-password>
PIXFLOW_BOOTSTRAP_ADMIN_NAME=Pixflow Admin
OPENAI_API_KEY=<key>
FAL_API_KEY=<key>
KLING_API_KEY=<key>
HEDRA_API_KEY=<key>
ELEVENLABS_API_KEY=<key>
RESEARCH_WEB_ENABLED=true
```

The deploy script (`scripts/deploy-container.sh`) reads secrets from `.env` automatically on each deploy.
