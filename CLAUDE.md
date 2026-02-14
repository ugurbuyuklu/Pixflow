# CLAUDE.md - Pixflow Project Intelligence

> Primary reference for the active Pixflow web app.

## Project

Pixflow is a web app for AI asset production workflows:
- Prompt Factory (concept/image to structured prompts)
- Asset Monster (batch image generation)
- Avatar Studio (avatar, script, TTS, lipsync)
- Captions (AI-generated video captions with sentence selection)
- Img2Video (image-to-video generation)
- Lifetime (lifetime deal management)
- The Machine (end-to-end pipeline orchestration)
- Library (history, favorites, reuse)

## Commands

```bash
npm run dev              # Start dev (client + server concurrently)
npm run dev:web:server   # Server only (port 3002)
npm run dev:web:client   # Vite client only
npm run build            # Production build (Vite) → dist/web
npm run lint             # TypeScript type check (tsc --noEmit)
npm run lint:biome       # Biome linter
npm run format           # Biome auto-format
npm run test             # Vitest (runs native:rebuild first)
npm run test:watch       # Vitest watch mode
npm run smoke:api        # API smoke tests
npm run smoke:journey    # Critical path journey tests
npm run deploy:pages     # Deploy to Cloudflare Pages (production)
npm run telemetry:check  # Run telemetry gates (ci profile)
npm run gate:release     # Full release gate (telemetry + regression + frontend perf)
```

## Tech Stack

- **Frontend:** React 19, Vite 6, Tailwind 4, Zustand 5 (state), Lucide icons
- **Backend:** Express 4.18, better-sqlite3 (SQLite WAL mode in `data/`), Multer (uploads)
- **AI Services:** OpenAI (GPT-4o/Vision), FAL.ai (image gen), Kling (video), Hedra (lipsync), ElevenLabs (TTS)
- **Tooling:** Biome 2.3 (lint + format), Vitest 4 (test), tsx (dev runtime)
- **Deploy:** Cloudflare Pages (frontend), Node server (backend)

## Code Style (Biome)

- Single quotes, no semicolons, trailing commas everywhere
- 120 char line width, 2-space indent
- Arrow parens always: `(x) => x`
- Use `node:` protocol for Node imports (enforced)
- No non-null assertions allowed

## Architecture

```
src/
├── renderer/              # React SPA (Vite root, not project root)
│   ├── components/        # Feature-organized: avatar-studio/, captions/, prompt-factory/, etc.
│   │   └── ui/            # Shared UI primitives (buttons, skeletons, dialogs)
│   ├── hooks/             # React hooks (useKeyboardShortcuts, etc.)
│   ├── lib/               # Utilities (api.ts = API client with envelope unwrapping)
│   ├── stores/            # Zustand stores (avatarStore, captionsPresetStore, navigationStore)
│   └── types/             # TypeScript definitions
├── server/                # Express API
│   ├── routes/            # REST endpoints (avatars, captions, videos, lifetime)
│   ├── services/          # Business logic (captions, fal, kling, hedra, vision, wizper)
│   ├── db/                # SQLite via better-sqlite3 (singleton, WAL mode, foreign keys ON)
│   ├── middleware/         # Auth (JWT 7d expiry), rate limiting
│   ├── smoke/             # Smoke test suites (api, journey, external pipeline)
│   └── telemetry/         # Performance tracking, regression checks, gate profiles
└── constants/             # Shared constants
```

## Key Patterns

### API Envelope
All API responses: `{ success: boolean, data?: T, error?: string, details?: string }`.
Client-side: `unwrapApiData<T>()` to extract, `getApiError()` to parse errors. `assetUrl()` for file URLs (handles absolute URLs as pass-through).

### Zustand Stores
- State + actions in single `create()` call
- Cross-store access: `useOtherStore.getState()` (not hooks)
- Concurrency control: `runWithConcurrency(items, limit, fn)` pattern (TTS=4, Lipsync=4)
- Rate limit retry: `authFetchWithRateLimitRetry()` with exponential backoff via retry-after header
- Request dedup: counter-based stale response rejection (e.g. `transcriptionRequestId`)

### Express App Init Order (createApp.ts)
`validateServerEnv` → `initDatabase` → `migrateJsonToSqlite` → `ensureBootstrapAdmin` → `scheduleAutoExport` → CORS → JSON (10mb limit) → static routes → health → public routes (auth, products) → protected routes → error handler

### Navigation & Page Registration
Adding a new page requires syncing these files:
1. `AppShell.tsx` - lazy import + PAGES object + PAGE_TITLES + PAGE_ICONS
2. `SideNav.tsx` - SIDEBAR_ITEMS array + badge logic if needed
3. `navigationStore.ts` - TabId union type

### Static Asset Directories
Server serves: `/uploads`, `/outputs`, `/avatars`, `/avatars_generated`, `/avatars_uploads`.
Vite proxies these + `/api` to localhost:3002 with 600s timeout.

## Environment

Copy `.env.example` for full list. Key vars:
- `PIXFLOW_WEB_API_PORT` - API port (default 3002)
- `PIXFLOW_AUTH_MODE` - `disabled` (default) or `token` (JWT)
- `JWT_SECRET` - Required when auth enabled (min 32 chars, 7d expiry)
- AI keys: `OPENAI_API_KEY`, `FAL_API_KEY`, `KLING_API_KEY`, `HEDRA_API_KEY`, `ELEVENLABS_API_KEY`
- Dev bypass: `PIXFLOW_AUTH_BYPASS=1` + `VITE_PIXFLOW_DEV_AUTO_LOGIN=1` (dev only)

## Timeouts

Server: 600s request timeout, 620s keepAlive, 621s headers (staggered to prevent premature close).
Vite proxy: 600s. These are intentionally long for AI generation pipelines.

## Telemetry Gates

Three profiles with increasing strictness:
- **ci:** 100% success, P95 ≤ 300s
- **nightly:** 90% overall / 80% per-provider, P95 ≤ 600s
- **release:** 100% success, all gates must pass

Frontend perf gate: tab-switch P95 ≤ 5s, page-render P95 ≤ 6s (min 3 samples).
Events logged to `logs/pipeline-events.jsonl`. Run `gate:release` before deploying.

## Testing

- `mockResponse()` helper in `src/server/test-helpers.ts` (returns `_status` + `_json`)
- `pretest` rebuilds native bindings automatically
- Smoke tests skip gracefully on `sqlite_runtime_mismatch`
- Mock providers toggleable via `isMockProvidersEnabled()`

## Gotchas

- `npm run native:rebuild` needed after switching Node versions (better-sqlite3 native binding)
- DB uses WAL mode → `data/` contains .db, .db-wal, .db-shm files (all gitignored, auto-created)
- DB seeds tables + presets on every startup (idempotent)
- AppShell measures tab-switch perf via double-RAF pattern (two nested requestAnimationFrame calls)
- Avatar green screen detection: hardcoded thresholds (minGreen: 120, minDominance: 35, ratio: 0.6)
- Caption segments: max 8 words / 72 chars per segment
- Legacy materials in `Burgflow Archive/` - do not reference in new code
- Keep "Pixflow" naming in all new docs, routes, and UX copy

## Active Docs

- `docs/PIXFLOW_HANDOFF_FEB2026.md` - Current state handoff
- `docs/PIXFLOW_UI_RULES.md` - UI guidelines
- `docs/SCHEMA.md` - Database schema
- `docs/PIPELINE.md` - Pipeline documentation
- `docs/REPO_STRUCTURE.md` - Detailed repo structure
