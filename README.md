# Pixflow

Last updated: 2026-02-17

Pixflow is a web-first AI production workspace for social/media creative pipelines.

## Product Areas

- `Prompt Factory`: research-backed structured prompt generation (concept/image input).
- `Asset Monster`: batch image generation (prompt-only or multi-reference identity anchoring).
- `Img2Engine`: image-to-video generation with queue-based execution.
- `Avatar Studio`: script, voice, and talking-avatar generation flows (`Have an Audio` mode uses direct audio -> lipsync without auto transcription).
- `Captions`: subtitle generation, sentence selection, and burned-in rendering.
- `The Machine`: end-to-end pipeline orchestration from concept to final media.
- `Lifetime`: baby photo -> age frames -> transition videos -> merged timeline video.
- `Library`: saved history, favorites, and reusable assets.
- `Competitor Report`: last-7-day creative intelligence report (currently Clone AI).

## Global UI Utilities

- `Job Monitor`: bottom-right overlay showing the last 50 jobs across the app (excludes Library + Competitor Report).

## Stack

- `Frontend`: React 19, Vite 6, Tailwind 4, Zustand 5.
- `Backend`: Express 4, better-sqlite3 (WAL), Multer.
- `AI providers`: OpenAI, FAL.ai, Hedra, ElevenLabs, Kling.
- `Tooling`: TypeScript, Biome, Vitest, tsx.
- `Deploy`: Cloudflare Pages (frontend) + Cloudflare Worker API gateway + Node server (backend).

## Quick Start

### Prerequisites

- Node.js `>=20 <21`
- npm

### Install and run

```bash
npm install
cp .env.example .env
npm run dev
```

Run client/server separately if needed:

```bash
npm run dev:web:server   # API on port 3002 by default
npm run dev:web:client   # Vite frontend
```

## Build and Preview

```bash
npm run build
npm run preview:web
```

## Deploy

Frontend deploy command:

```bash
npm run deploy:pages
```

API gateway deploy command:

```bash
npm run deploy:worker:api
```

Detailed deployment guide:
- `docs/CLOUDFLARE_DEPLOY.md`
- `docs/INDEX.md` (documentation map)

Note:
- Do not deploy without explicit user approval in active collaboration sessions.

## Quality Gates

```bash
npm run lint
npm run lint:biome
npm run test
npm run smoke:api
npm run smoke:journey
npm run gate:release
```

Current local status (2026-02-17): `gate:release` passes end-to-end.

## Pipeline Lock (PGP)

Prompt Factory and Transcript Media core pipelines are protected against accidental edits.

```bash
npm run pgp:lock:check
npm run pgp:lock:update
```

Lock files:
- `scripts/pgp-lock-guard.js`
- `docs/ops/pgp-lock.json`

`pgp:lock:update` must only be run after explicit user approval for PGP changes.

## Structure (high level)

```text
src/
  renderer/   # React SPA
  server/     # Express API + services + db + telemetry
docs/         # Product + engineering docs
data/         # Local sqlite runtime
outputs/      # Generated artifacts
uploads/      # Temp uploads
avatars/      # Curated avatar assets
```

## Documentation Map

Use `docs/INDEX.md` to see active vs archived documentation.
Command alias: `docs sync` (or `dosc sync`) means update active docs via `docs/INDEX.md`.

## Environment Notes

Key variables:
- `OPENAI_API_KEY`
- `FAL_API_KEY`
- `HEDRA_API_KEY`
- `ELEVENLABS_API_KEY`
- `KLING_API_KEY`
- `PIXFLOW_WEB_API_PORT` (default `3002`)

Auth defaults:
- `PIXFLOW_AUTH_MODE=disabled` for internal/trusted development.
- To enable token auth: set `PIXFLOW_AUTH_MODE=token` and secure `JWT_SECRET`.

## License

Private - all rights reserved.
