# CLAUDE.md - Pixflow Project Intelligence

> Primary reference for the active Pixflow web app.
> Last updated: 2026-02-17

## Project

Pixflow is a web app for AI asset production workflows:
- Prompt Factory (concept/image to structured prompts)
- Asset Monster (batch image generation; prompt-only or multi-reference)
- Img2Engine (image-to-video generation)
- Avatar Studio (avatar, script, TTS, lipsync)
- Captions (AI-generated video captions with sentence selection)
- Lifetime (age progression: baby photo → aging frames → transition videos → final compilation)
- The Machine (end-to-end pipeline orchestration)
- Library (history, favorites, reuse)
- Competitor Report (last-7-day creative intelligence, currently Clone AI)

## Commands

```bash
# Dev
npm run dev              # Start dev (client + server via scripts/dev-web.sh)
npm run dev:web:server   # Server only (port $PIXFLOW_WEB_API_PORT, default 3002)
npm run dev:web:client   # Vite client only

# Build & Preview
npm run build            # Production build (Vite) → dist/web
npm run preview          # Preview production build locally

# Quality
npm run lint             # TypeScript type check (tsc --noEmit)
npm run lint:biome       # Biome linter
npm run format           # Biome auto-format
npm run format:check     # Check format without writing

# Test
npm run test             # Vitest (runs native:rebuild first)
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Vitest with coverage reports
npm run smoke:api        # API smoke tests
npm run smoke:journey    # Critical path journey tests
npm run smoke:external   # External pipeline smoke tests

# Deploy
npm run deploy:pages     # Deploy to Cloudflare Pages (production)
npm run deploy:pages:preview # Deploy preview build
npm run deploy:worker:api # Deploy Cloudflare Worker API gateway

# Telemetry & Gates
npm run telemetry:check  # Run telemetry gates (ci profile)
npm run gate:release     # Full release gate (telemetry + regression + frontend perf)
npm run preflight:release # Release preflight checks
npm run native:rebuild   # Rebuild better-sqlite3 native binding

# PGP Lock
npm run pgp:lock:check   # Verify Prompt Generation Pipeline lock (must pass in CI)
npm run pgp:lock:update  # Update PGP lock fingerprint (requires explicit unlock token)
```

## Docs Sync Trigger Protocol

Trigger phrases:
- `docs sync`
- `dosc sync` (common typo; treat as `docs sync`)

Required behavior when triggered:
1. Read `docs/INDEX.md` first.
2. Update only active/core docs affected by recent work.
3. Do not edit `docs/archive/*` unless explicitly requested.
4. Keep redirect stubs minimal (`docs/PIXFLOW_HANDOFF_FEB2026.md`, etc.).
5. Return a concise changelog of updated docs.
6. If user says `go`, create one docs-only commit.

## PGP Lock Protocol (Do Not Bypass)

Critical pipelines are protected by a lock guard and must not be modified casually.

Protected scope:
- `src/server/routes/prompts.ts`
- `src/server/routes/videos.ts`
- `src/server/services/promptGenerator.ts`
- `src/server/services/research.ts`
- `src/server/services/ytdlp.ts`
- `src/server/services/wizper.ts`
- `src/server/utils/prompts.ts`
- `docs/PIPELINE.md`
- `docs/ops/pgp-lock.json` (lock fingerprint output)
- `scripts/pgp-lock-guard.js` (enforcement script)

Rules:
1. Always run `npm run pgp:lock:check` before and after any PGP-adjacent changes.
2. If lock check fails, do not update lock automatically.
3. Update lock only after explicit user instruction that clearly requests PGP change approval.
4. Lock update requires:
   - `PIXFLOW_PGP_UNLOCK=I_HAVE_EXPLICIT_USER_APPROVAL_FROM_PIXERY`
   - `PIXFLOW_PGP_UNLOCK_NOTE="<reason>"`

## Tech Stack

- **Frontend:** React 19, Vite 6, Tailwind 4, Zustand 5 (state), Lucide icons
- **Backend:** Express 4.18, better-sqlite3 (SQLite WAL mode in `data/`), Multer (uploads)
- **AI Services:** OpenAI (GPT-4o/Vision), FAL.ai (image gen), Kling (video), Hedra (lipsync), ElevenLabs (TTS)
- **Tooling:** Biome 2.3 (lint + format), Vitest 4 (test), tsx (dev runtime)
- **Deploy:** Cloudflare Pages (frontend), Cloudflare Worker API gateway, Node server (backend)

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
│   ├── routes/            # REST endpoints (prompts, avatars, captions, videos, lifetime, competitor-report)
│   ├── services/          # Business logic (promptGenerator, research, fal, kling, hedra, vision, tts, lipsync, captions)
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

### FAL Model Selection (Asset Monster)
- `/api/generate/batch` accepts `0..5` reference images.
- Model selection rule (server-side, `src/server/services/fal.ts`):
  - If reference images provided: `fal-ai/nano-banana-pro/edit`
  - If no reference images: `fal-ai/nano-banana-pro`

### Output History + Job Monitor
- Canonical job/event store: `src/renderer/stores/outputHistoryStore.ts`
- Global always-visible overlay: `src/renderer/components/shared/JobMonitorWidget.tsx`
- Purpose:
  - show running/done/failed jobs without switching tabs
  - keep last 50 jobs visible
  - allow user to dismiss individual jobs from the widget
- Explicit exclusions: `Library` + `Competitor Report`
- Notable categories:
  - `prompt_factory` (Prompt Factory SSE prompt generation)
  - `asset_monster` (Asset Monster batch generation)
  - `img2img`, `img2video`, `startend`, `captions`, `machine`, `lifetime`, `avatars_*`

### Zustand Stores
- State + actions in single `create()` call
- Cross-store access: `useOtherStore.getState()` (not hooks)
- Concurrency control: `runWithConcurrency(items, limit, fn)` pattern (TTS=4, Lipsync=4)
- Rate limit retry: `authFetchWithRateLimitRetry()` with exponential backoff via retry-after header
- Request dedup: counter-based stale response rejection (e.g. `transcriptionRequestId`)
- Avatar Studio language cards: auto-detect may set `detectedLanguage` label, but must not auto-add a language card selection.
- Avatar Studio `Have an Audio`: upload audio directly to `generatedAudioUrl` and generate lipsync from that audio (no forced transcript step).

### Express App Init Order (createApp.ts)
`validateServerEnv` → `initDatabase` → `migrateJsonToSqlite` → `ensureBootstrapAdminIfConfigured` → `scheduleAutoExport` → CORS → JSON (10mb limit) → static routes → health → public routes (auth, products) → protected routes → error handler

### Navigation & Page Registration
Adding a new page requires syncing these files:
1. `AppShell.tsx` - lazy import + PAGES object + PAGE_ICONS (titles via `brandedName()`)
2. `SideNav.tsx` - SIDEBAR_ITEMS array + badge logic if needed (imports from stores for badge counts)
3. `navigationStore.ts` - TabId union type

### Lifetime Pipeline (lifetime.ts)
- In-memory job maps: `lifetimeRunJobs` (`lrun_` prefix, frame gen) and `lifetimeVideoJobs` (`lvid_` prefix, video creation)
- Fire-and-forget POST returns jobId → frontend polls GET every 1.8s for status
- Session-based: each run creates `outputs/<sessionId>/` with manifest.json, frames, transitions, final video
- Early transitions: Kling video calls fire during frame gen (non-blocking), video job awaits them before assembly
- Transition concurrency: 4 parallel batches via `runWithConcurrency()` in server routes (separate from Zustand pattern)

### Prompt Factory Pipeline (promptGenerator.ts + prompts.ts)
- **SSE streaming**: GET `/api/prompts/generate` uses EventSource (SSE) for progressive delivery. Each prompt is emitted via `onBatchDone` callback the moment its GPT-4o call resolves — not batched at the end.
- **`onBatchDone` signature**: `(completedCount, total, prompt, index) => void` — passes the prompt object and its index so the route can emit it immediately.
- **Parallel workers**: `generatePrompts()` spawns `min(4, count)` parallel workers pulling from a shared queue. This is intentionally capped at 4 to reduce provider throttling and fallback drift.
- **Reference-image framing**: prompts are enforced to assume one or more reference images, not a single hardcoded reference-photo assumption.
- **Schema alignment is critical**: The JSON schema in the system prompt sent to GPT-4o MUST match the `PromptOutput` TypeScript interface in `src/server/utils/prompts.ts` exactly. Historical bug: mismatched field names (e.g. top-level `expression` vs `pose.expression`, `camera.framing` vs `camera.focus`) caused GPT to return valid JSON that didn't map to the expected type, silently producing "generic" prompts.
- **`PROMPT_SCHEMA_EXAMPLE` constant**: Used by `generatePromptBatch()` and `textToPrompt()`. Already aligned with `PromptOutput`. The inline schema in `generateSinglePromptWithTheme()` must stay in sync with this.
- **Fallback prompts**: `createFallbackPrompt()` returns a scaffold with `FALLBACK SCAFFOLD` markers in outfit fields. Every fallback path now logs explicitly (empty content, JSON parse failure, missing core fields, catch block).
- **SSE headers**: Both GET and POST routes use `flushHeaders()`, `X-Accel-Buffering: no`, `Cache-Control: no-cache` to prevent proxy/buffer delays.
- **Research pipeline**: `performResearch()` / `performResearchWithMeta()` → `analyzeResearchResults()` feeds into prompt generation. Access research data via `researchBrief.trend_findings.*` (NOT `research.key_themes` etc. which don't exist).
- **Web search constraint**: when Responses API web search tool is enabled, do not use JSON mode (`response_format`). Parse structured JSON from output text with robust fallback parsing.
- **`getOpenAI()` singleton**: Uses `clientInitializing` flag with `try/finally` to prevent deadlock if init throws.

### Competitor Report Pipeline (competitorReport.ts)
- `/api/competitor-report/apps`: returns supported apps list (currently Clone AI).
- `/api/competitor-report/weekly`: uses OpenAI Responses + `web_search_preview` to generate last-7-day competitor report payload.
- Payload normalization includes:
  - URL sanitization (`http/https` only)
  - strict date-window filtering (`start_date..end_date`)
  - data gap reporting for dropped/invalid rows

### Static Asset Directories
Server serves: `/uploads`, `/outputs`, `/avatars`, `/avatars_generated`, `/avatars_uploads`.
Vite proxies these + `/api` to localhost:3002 with 600s timeout.

## Environment

Copy `.env.example` for full list. Key vars:
- `PIXFLOW_WEB_API_PORT` - API port (default 3002)
- `PIXFLOW_AUTH_MODE` - `disabled` (default) or `token` (JWT)
- `JWT_SECRET` - Required when auth enabled (min 32 chars, 7d expiry)
- AI keys: `OPENAI_API_KEY`, `FAL_API_KEY`, `KLING_API_KEY`, `HEDRA_API_KEY`, `ELEVENLABS_API_KEY` (all optional, gracefully skipped)
- `RESEARCH_WEB_ENABLED` - Enable/disable web-grounded research (default: true unless explicitly set to `false`)
- Dev bypass: `PIXFLOW_AUTH_BYPASS=1` + `VITE_PIXFLOW_DEV_AUTO_LOGIN=1` (dev only)
- Bootstrap admin: `PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP=true` + `_EMAIL`, `_PASSWORD`, `_NAME`

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
- `setupTestDb()` creates temporary test database, `withEnv()` overrides env vars in tests
- `pretest` rebuilds native bindings automatically
- Smoke tests skip gracefully on `sqlite_runtime_mismatch` via `isSqliteRuntimeCompatible()`
- Mock providers toggleable via `isMockProvidersEnabled()`

## Gotchas

- `npm run native:rebuild` needed after switching Node versions (better-sqlite3 native binding)
- DB uses WAL mode → `data/` contains .db, .db-wal, .db-shm files (all gitignored, auto-created)
- DB seeds tables + presets on every startup (idempotent)
- AppShell measures tab-switch perf via double-RAF pattern (two nested requestAnimationFrame calls)
- Avatar uploads in Avatar Studio are direct gallery uploads (`/api/avatars/upload`); do not silently auto-trigger `generate-from-reference` on upload.
- Caption segments: max 8 words / 72 chars per segment
- `POST /api/prompts/text-to-json` currently allows up to 8000 chars (long-form custom prompt conversion).
- FAL.ai Kling model IDs and params change without notice — always verify via Context7 docs before assuming endpoint exists
- Server does not hot-reload all service file changes — restart `npm run dev` after modifying services like `kling.ts`, `promptGenerator.ts`
- GitHub Actions: push to main triggers Cloudflare Pages deploy when `src/renderer/**`, `public/**`, `package.json`, `package-lock.json`, `vite.web.config.ts`, or `wrangler.toml` change; needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets
- Prompt Factory: if GPT-4o prompts look "generic" or arrive instantly, check for silent fallbacks in server logs (`FALLBACK for prompt`, `JSON parse failed`, `missing core fields`). The most common cause is schema mismatch between the system prompt JSON and `PromptOutput` interface.
- Prompt Factory: `generateSinglePromptWithTheme()` catches ALL errors and returns fallback — outer code sees "success". Always check server logs for `[generateSinglePrompt]` prefixed errors.
- Prompt Factory: `ResearchBrief` properties live under `trend_findings.*`, `technical_recommendations.*`, `competitor_insights.*`, `sub_themes[]` — NOT flat fields like `key_themes` or `visual_elements`.
- Research: if web grounding silently falls back to model-only behavior, verify server process is restarted and confirm `effective_mode` in `research` meta.
- Mock-provider video pipelines now emit valid MP4 data URLs (Kling/Hedra). If FFmpeg reports `moov atom not found`, suspect stale old mock files generated before 2026-02-17.
- Legacy materials in `Burgflow Archive/` - do not reference in new code
- Keep "Pixflow" naming in all new docs, routes, and UX copy

## Active Docs

- `docs/INDEX.md` - Docs map (active vs archive)
- `docs/PIXFLOW_AI_VERSIONING_HANDOFF.md` - Canonical handoff
- `docs/PIXFLOW_HANDOFF_FEB2026.md` - Compatibility redirect to canonical/archived handoff
- `docs/PIXFLOW_UI_RULES.md` - UI guidelines
- `docs/SCHEMA.md` - Database schema
- `docs/PIPELINE.md` - Prompt Factory pipeline (research + generation + SSE delivery)
- `docs/REPO_STRUCTURE.md` - Detailed repo structure
- `docs/CLOUDFLARE_DEPLOY.md` - Cloudflare Pages deployment guide
- `docs/ops/` - Operational runbooks, telemetry baselines, regression gate config
