# Pixflow

AI-powered web platform for creative asset production workflows.

## Features

### Prompt Factory
Transform concepts and images into structured, production-ready prompts using GPT-4o Vision.

### Asset Monster
Batch image generation with advanced prompt management:
- Generated, custom, and library prompt sources
- Reference image support (up to 5 images)
- Character-consistent generation
- Configurable aspect ratios, resolutions, and formats

### Avatar Studio
Create AI avatars with script refinement, multi-language TTS, and lip-sync video generation.

### Captions
AI-generated video subtitles with sentence-level selection, style presets, and local ffmpeg rendering.

### Img2Video
Image-to-video conversion with camera controls and per-job queue management.

### Lifetime
Age progression pipeline: upload a photo and generate a lifetime video (baby to 75) with transition animations.

### The Machine
End-to-end pipeline orchestration: concept to prompts to images to script to TTS to lip-sync video.

### Library
Organize, favorite, and reuse your best prompts and generated assets.

## Tech Stack

- **Frontend:** React 19, Vite 6, Tailwind 4, Zustand 5, Lucide icons
- **Backend:** Express 4.18, better-sqlite3 (SQLite WAL mode), Multer
- **AI Services:** OpenAI GPT-4o, FAL.ai, ElevenLabs, Hedra, Kling
- **Tooling:** Biome 2.3 (lint + format), Vitest 4, tsx
- **Deploy:** Cloudflare Pages (frontend), Node server (backend)

## Getting Started

### Prerequisites

- Node.js >= 20
- npm

### Installation

```bash
npm install

cp .env.example .env
# Add your API keys to .env

npm run dev
```

Or run each process separately:

```bash
npm run dev:web:server   # Express API (port 3002)
npm run dev:web:client   # Vite dev server
```

Default API port is `3002` (override with `PIXFLOW_WEB_API_PORT`).

### Build

```bash
npm run build          # Production build -> dist/web
npm run preview:web    # Preview production build
```

## Deploy

Pixflow frontend deploys to Cloudflare Pages.

```bash
npx wrangler login
export VITE_API_BASE_URL="https://your-api-domain.example.com"
npm run deploy:pages
```

See `docs/CLOUDFLARE_DEPLOY.md` for the full guide.
CI: `.github/workflows/deploy-pages.yml` deploys on `main` pushes and manual preview runs.

## Project Structure

```
pixflow/
├── src/
│   ├── renderer/          # React SPA (Vite root)
│   │   ├── components/    # Feature-organized pages
│   │   ├── stores/        # Zustand state
│   │   ├── hooks/         # React hooks
│   │   └── lib/           # API client, utilities
│   └── server/            # Express API
│       ├── routes/        # REST endpoints
│       ├── services/      # Business logic + AI providers
│       ├── db/            # SQLite schema + migrations
│       └── telemetry/     # Performance tracking + gates
├── docs/                  # Documentation
├── data/                  # SQLite database (auto-created, gitignored)
├── avatars/               # Curated avatar gallery
└── outputs/               # Generated assets (gitignored)
```

## Configuration

Copy `.env.example` for the full variable list. Key API keys:

- `OPENAI_API_KEY` - Prompt generation, vision analysis
- `FAL_API_KEY` - Image generation
- `ELEVENLABS_API_KEY` - Text-to-speech
- `HEDRA_API_KEY` - Lip-sync video
- `KLING_API_KEY` - Video generation and transitions

Auth is disabled by default (`PIXFLOW_AUTH_MODE=disabled`).
Re-enable with `PIXFLOW_AUTH_MODE=token` and set `JWT_SECRET` (min 32 chars).

## Development

```bash
npm test             # Vitest (94 tests)
npm run lint         # TypeScript type check
npm run lint:biome   # Biome linter
npm run format       # Biome auto-format
npm run gate:release # Full release gate (lint + tests + smoke + telemetry)
```

## License

Private - All rights reserved
