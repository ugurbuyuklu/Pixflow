# Cloudflare Deploy (Web Frontend)

Last updated: 2026-02-15

This project is currently deployed to Cloudflare as a **frontend-only Pages app**.

## Why frontend-only right now

The backend in `/src/server` depends on:
- `better-sqlite3` (native module)
- local filesystem writes (`outputs/`, `uploads/`, `avatars_generated/`)

Those are not compatible with a direct Workers runtime port without a backend refactor (D1/R2/Queues or separate containerized backend).

## Prerequisites

1. Cloudflare auth:
```bash
npx wrangler login
npx wrangler whoami
```

2. Set API base URL for the frontend build:
```bash
export VITE_API_BASE_URL="https://your-api-domain.example.com"
```

In non-interactive environments (CI), also set:
```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

3. Optional project settings:
```bash
export PIXFLOW_CF_PAGES_PROJECT="pixflow-web"
export PIXFLOW_CF_PREVIEW_BRANCH="staging"
```

## Deploy commands

Production:
```bash
npm run deploy:pages
```

Preview:
```bash
npm run deploy:pages:preview
```

Safety rule for collaborative sessions:
- Never deploy without explicit user approval.

## First-time project creation (if project does not exist)

Create once from Cloudflare dashboard:
- Workers & Pages -> Create -> Pages -> Direct Upload or Git connect
- Project name must match `PIXFLOW_CF_PAGES_PROJECT` (default: `pixflow-web`)

Then run the deploy script above.

## Current deployment files

- `wrangler.toml`
- `scripts/deploy-pages.sh`
- `.github/workflows/deploy-pages.yml`
- `package.json` scripts:
  - `cf:whoami`
  - `deploy:pages`
  - `deploy:pages:preview`

## GitHub Actions deploy

Workflow: `.github/workflows/deploy-pages.yml`

Required repository secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_API_BASE_URL`

Optional repository variable:
- `CF_PAGES_PROJECT` (default fallback: `pixflow-web`)
