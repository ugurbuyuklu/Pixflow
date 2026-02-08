# Borgflow - Performance Marketing Asset Generator

> Automation system for generating performance marketing assets for the Clone AI app.

---

## Project Overview

**Borgflow** automates the creation of marketing assets (photos + talking avatar videos) for **Clone AI**, an image-to-image AI photo app where users upload a selfie and AI generates photos of them in different concepts/scenarios while preserving their face and identity.

**Core workflow:** Research a concept → Generate optimized prompts → Produce images → Create talking avatar video

---

## Quick Start

```bash
npm install
npm run dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| AI (Research & Prompts) | OpenAI GPT-4o |
| AI (Image Analysis) | OpenAI GPT-4 Vision |
| AI (Image Generation) | fal.ai Nano Banana Pro |
| AI (Avatar Generation) | fal.ai Nano Banana Pro |
| AI (Text-to-Speech) | ElevenLabs |
| AI (Lipsync Video) | Hedra Character-3 |
| File Storage | Local filesystem (JSON for history/favorites) |

---

## Project Structure

```
borgflow/
├── CLAUDE.md                     # AI agent instructions & project intelligence
├── Documentation/                # This file
├── package.json                  # Monorepo root
├── .env                          # API keys
├── avatars/                      # Avatar images (user-managed)
├── packages/
│   ├── server/                   # Backend
│   │   ├── src/
│   │   │   ├── index.ts          # Express server entry point
│   │   │   ├── routes/
│   │   │   │   ├── generate.ts   # Batch generation + fal.ai endpoints
│   │   │   │   ├── history.ts    # History & favorites endpoints
│   │   │   │   └── avatars.ts    # Avatar generation, TTS, lipsync endpoints
│   │   │   └── services/
│   │   │       ├── research.ts   # Web search + analysis (GPT-4o)
│   │   │       ├── promptGenerator.ts  # Prompt generation (GPT-4o)
│   │   │       ├── fal.ts        # fal.ai API wrapper + batch jobs
│   │   │       ├── vision.ts     # GPT-4 Vision image analysis
│   │   │       ├── history.ts    # History & favorites JSON storage
│   │   │       ├── avatar.ts     # Avatar generation (fal.ai nano-banana-pro)
│   │   │       ├── voiceover.ts  # Script generation (GPT-4o)
│   │   │       ├── tts.ts        # Text-to-speech (ElevenLabs)
│   │   │       ├── hedra.ts      # Hedra Character-3 lipsync (polling API)
│   │   │       └── lipsync.ts    # Legacy OmniHuman wrapper (kept for reference)
│   │   ├── data/                 # JSON data storage
│   │   │   ├── history.json      # Generation history (auto-created)
│   │   │   └── favorites.json    # Saved favorites (auto-created)
│   │   └── package.json
│   │
│   └── web/                      # Frontend
│       ├── src/
│       │   ├── App.tsx           # Main app with 5 tabs (single-file, ~3700 lines)
│       │   └── main.tsx          # Entry point
│       ├── index.html
│       └── package.json
│
├── outputs/                      # Generated images + audio + video
│   └── {concept}_{timestamp}/
│       ├── concept_01.jpg
│       └── ...
│
└── uploads/                      # Uploaded reference images
```

---

## Phase Definitions

### Phase 01: Prompt Factory
| Feature | Input | Output |
|---------|-------|--------|
| Concept-to-Prompts | Text concept (e.g., "Christmas") | 6-10 JSON prompts |
| Image-to-Prompt | Reference image | 1 detailed JSON prompt |

Every prompt is generated from thorough research: trend analysis, competitor ad research, and technical photography research.

### Phase 02: Batch Generation (Asset Monster)
| Feature | Input | Output |
|---------|-------|--------|
| Generate Images | Reference photo(s) + prompts | Generated images |
| Custom Prompts | JSON or plain text | Converted & used for generation |
| Image Preview | Click on generated image | Full-size overlay with actions |
| Multi-Image | 2-4 reference images | Couple/family generation |

### Phase 03: Image to Prompt
Reverse-engineering prompts from images using GPT-4 Vision. Extracts lighting, color palette, mood, camera details, and styling. Does NOT extract identity information.

### Phase 04: History & Favorites
Auto-saves every generation (max 100 entries). Favorites allow naming and organizing best prompts. Both stored in `packages/server/data/`.

### Phase 05: Avatars (Talking Avatar Video Pipeline)
| Feature | Input | Output |
|---------|-------|--------|
| Generate Avatars | Gender, age, ethnicity, outfit | AI avatar images (fal.ai) |
| Script Generation | Concept + duration + tone | Voiceover script (GPT-4o) |
| Text-to-Speech | Script + voice | Audio file (ElevenLabs) |
| Lipsync Video | Avatar + audio | Talking avatar video (Hedra Character-3) |

**Hedra Character-3 Lipsync:**
- Async polling API at `https://api.hedra.com/web-app/public`
- Workflow: createAsset → uploadAsset → createGeneration → pollGeneration → downloadVideo
- Polling interval: 5s, timeout: 10 minutes
- Route-level timeout: 660s (11 min)
- File existence validation before API calls
- Lazy getter functions for env vars (avoids dotenv timing issue)

### Phase 06: The Machine (Full Pipeline Orchestration)
| Feature | Input | Output |
|---------|-------|--------|
| Pipeline Run | Concept + avatar + voice | Prompts + images + script + audio + video |
| Error Recovery | Failed step | Retry from failed step, keep completed results |

**Pipeline Steps (sequential):**
1. **Prompts** → research + GPT-4o generation (~2 min)
2. **Images** → fal.ai batch generation, avatar = primary reference (~4 min)
3. **Script** → GPT-4o voiceover script (~15s)
4. **TTS** → ElevenLabs text-to-speech (~20s)
5. **Lipsync** → Hedra Character-3 video (~5 min)

**Total estimated duration: ~12-15 minutes**

Key behaviors:
- Avatar is the primary reference image (auto-fetched as File)
- Additional people optional (up to 3) for couple/family concepts
- Lipsync has auto-retry (1 retry, 3s delay)
- On failure: error view shows which step failed + "Retry from X" + "Start Over"
- Completed results preserved on failure
- Uses local variables to prevent stale closures in sequential async pipeline
- All fetch calls use AbortController for cancellation

---

## API Endpoints

### Prompt Generation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/prompts/generate` | Generate prompts from concept (5 min timeout) |
| GET | `/api/prompts/research/:concept` | Research only (no prompts) |
| POST | `/api/prompts/text-to-json` | Convert plain text to JSON prompt |

### Batch Generation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate/batch` | Start batch image generation |
| GET | `/api/generate/batch/:batchId/status` | Check batch status |
| POST | `/api/generate/open-folder` | Open output folder in Finder |
| POST | `/api/generate/analyze-image` | Analyze image with GPT-4 Vision |

### History & Favorites
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/history` | Get generation history |
| POST | `/api/history` | Add to history |
| DELETE | `/api/history/:id` | Delete history entry |
| DELETE | `/api/history` | Clear all history |
| GET | `/api/history/favorites` | Get all favorites |
| POST | `/api/history/favorites` | Add to favorites |
| PATCH | `/api/history/favorites/:id` | Update favorite name |
| DELETE | `/api/history/favorites/:id` | Remove from favorites |

### Avatars
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/avatars` | List avatars from gallery |
| POST | `/api/avatars/generate` | Generate new avatar (fal.ai) |
| POST | `/api/avatars/script` | Generate voiceover script (GPT-4o) |
| GET | `/api/avatars/voices` | List available TTS voices |
| POST | `/api/avatars/tts` | Convert text to speech (ElevenLabs) |
| POST | `/api/avatars/upload` | Upload avatar image to gallery |
| POST | `/api/avatars/lipsync` | Create lipsync video (Hedra, async polling) |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

---

## Environment Variables

```env
# .env (in project root)
OPENAI_API_KEY=sk-...        # For GPT-4o research/prompts and GPT-4 Vision
FAL_API_KEY=...              # For fal.ai image/avatar generation
ELEVENLABS_API_KEY=...       # For text-to-speech
HEDRA_API_KEY=sk_hedra_...   # For Hedra Character-3 lipsync video
HEDRA_MODEL_ID=...           # Hedra model ID (optional, has default)
PORT=3001                     # Backend server port (optional, default 3001)
```

---

## Prompt Schema (Version B)

Every prompt follows this JSON structure with `style` first:

```json
{
  "style": "Single sentence summary - read first by the model",
  "pose": { "framing", "body_position", "arms", "posture", "expression": { "facial", "eyes", "mouth" } },
  "lighting": { "setup", "key_light", "fill_light", "shadows", "mood" },
  "set_design": { "backdrop", "surface", "props": [], "atmosphere" },
  "outfit": { "main", "underneath", "accessories", "styling" },
  "camera": { "lens", "aperture", "angle", "focus", "distortion" },
  "hairstyle": { "style", "parting", "details", "finish" },
  "makeup": { "style", "skin", "eyes", "lips" },
  "effects": { "vignette", "color_grade", "contrast", "atmosphere", "grain" }
}
```

Use `CRITICAL:` prefix for must-have elements:
```json
"backdrop": "CRITICAL: Entire background is plush red fur material"
```

---

## Key Prompt Rules (Abbreviated)

Full rules in `CLAUDE.md`. Highlights:

1. **All prompts in English** — JSON format required
2. **NO physical descriptors** — no body type, skin color, age, ethnicity, hair color
3. **Pose in full detail** — every limb, weight distribution, head angle
4. **Outfit fully specified** — fabric, color, cut, fit, length
5. **Lighting is most critical** — always specify type, direction, character, shadows
6. **Camera is research-based** — lens choice depends on concept, NOT fixed rules
7. **No literary embellishment** — technical direction, not creative writing
8. **Imperfections deliberate** — natural skin texture, no airbrushed look
9. **Banned words** — gorgeous, perfect, flawless, stunning, breathtaking
10. **Aspect ratio / resolution NEVER in the prompt** — set in generation settings

---

## Research Pipeline

Every prompt generation requires research from three sources:

1. **Trend & Aesthetic Research** — photoshoot ideas, aesthetics, color palettes
2. **Competitor Ad Research (MANDATORY)** — Glam AI, Momo, Remini, DaVinci, Hula AI
3. **Technical Style Research** — lighting setups, lens choices, color grading

---

## UI Structure

5 tabs in this order: **Prompt Factory** → **Asset Monster** → **Avatars** → **The Machine** → **History**

History is ALWAYS the rightmost tab.

### Tab 1: Prompt Factory
Two sub-tabs: "Concept to Prompts" (research-based generation) and "Image to Prompt" (GPT-4 Vision analysis).

### Tab 2: Asset Monster (Batch Generate)
Custom or generated prompts + reference images → batch image generation with progress tracking.

### Tab 3: Avatars
Avatar gallery/generation + script writing + TTS + lipsync video creation.

### Tab 4: The Machine
Full pipeline orchestration. Settings panel → live progress → error recovery with retry → results with download.

### Tab 5: History & Favorites
Browse past generations, save favorites, reload into batch generate.

---

## Server Resilience

### Timeout Configuration

| Scope | Value | Location |
|-------|-------|----------|
| Express global | 600,000ms (10 min) | `index.ts` |
| Express `keepAliveTimeout` | 620,000ms | `index.ts` |
| Express `headersTimeout` | 621,000ms | `index.ts` |
| Prompt generate route | 300,000ms (5 min) | `index.ts` |
| Lipsync route | 660,000ms (11 min) | `avatars.ts` |
| Vite proxy (all routes) | 600,000ms (10 min) | `vite.config.ts` |
| Hedra poll timeout | 600,000ms (10 min) | `hedra.ts` |
| OpenAI client | 60,000ms + 2 retries | `promptGenerator.ts`, `research.ts` |

### Crash Prevention

Global handlers in `index.ts` catch uncaught exceptions and unhandled rejections, logging them instead of crashing:

```typescript
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason)
})
```

### Lipsync File Validation

Before calling Hedra API, the endpoint validates files exist on disk with `fs.access()`. Returns 400 with specific error if files are missing. Error details passed to frontend via `details` field.

---

## Implementation Patterns

### Cancellable Fetch Requests
Uses `AbortController` with `useRef` for persistent reference across renders. All long-running operations support cancellation.

### Text-to-JSON Conversion
Try `JSON.parse()` first → if fails, call `/api/prompts/text-to-json` (GPT-4o converts natural language to prompt schema).

### Machine Pipeline (Stale Closure Prevention)
Sequential async steps use local variables (`localPrompts`, `localScript`, `localAudioUrl`) to pass data between steps. `setState` is called for UI updates only. On error, `currentStep` (local var) is used instead of `machineStep` (stale closure).

### Machine Error Recovery
Error state shows dedicated view (not settings panel). "Retry from X" resumes from failed step using preserved state. "Start Over" explicitly resets everything.

### Lipsync Auto-Retry
Machine pipeline wraps lipsync in a 2-attempt loop with 3s delay between attempts. AbortError always re-thrown immediately.

### fal.ai Configuration
Lazy `ensureFalConfig()` pattern — configures credentials on first call, not at module load time.

---

## Security Features

1. **Path Traversal Prevention** — `sanitizeConcept()` removes `../` and special characters
2. **Command Injection Prevention** — Uses `execFile()` instead of `exec()`
3. **Path Validation** — All file operations validate paths within `PROJECT_ROOT`
4. **Rate Limiting** — 10 requests per minute per endpoint
5. **Input Validation** — Concept max 100 chars, prompt count max 20
6. **File Upload Limits** — Max 10MB request body

---

## File Naming Convention

```
{concept}_{aesthetic}_{emotion}_{##}.jpg

Examples:
christmas_editorial_romantic_01.jpg
christmas_minimal_playful_02.jpg
halloween_fashion_mysterious_01.jpg
```

---

## Common Pitfalls

1. Don't copy-paste technical styles — every concept needs fresh research
2. Don't skip competitor research — it's MANDATORY
3. Don't use fixed lens/camera rules — research what works for each concept
4. Don't mention identity traits — no hair color, skin tone, age, ethnicity
5. Don't forget variety check — all prompts must be sufficiently different
6. Don't ignore CRITICAL tags — use them for must-have elements

---

*For full prompt writing rules, image-to-prompt workflow, and AI agent instructions, see `CLAUDE.md`.*
