# Pixflow Development Handoff — February 2026

> **Previous handoff archived:** `PIXFLOW_AI_VERSIONING_HANDOFF_ARCHIVE_20260209.md` (1272 lines)
> **This document:** Fresh continuation covering recent sessions and current state

---

## Quick Context

**Pixflow** is an Electron desktop app for AI-powered asset production workflows:
- **Prompt Factory**: Image-to-prompt analysis + concept-to-prompt generation
- **Asset Monster**: Batch image generation with reference images
- **Avatar Studio**: Avatar + script + TTS + lipsync pipeline
- **The Machine**: End-to-end orchestration
- **Img2Video**: Image-to-video conversion with camera controls
- **Library**: History, favorites, reuse

**Stack:**
- Electron + Vite
- React + Zustand (state)
- Express API (embedded server)
- FAL.ai (image generation), Kling/Minimax (video), OpenAI GPT-4o (vision/text)

**Recent Focus:** UI polish, camera controls, drag & drop, context-aware prompting

---

## Recent Sessions Summary

### Session 1: Camera Control Panels (Img2Video)
**Date:** Recent
**Issue:** Camera presets (movement/speed/shot type) were always visible, cluttering UI
**Solution:** Made camera controls collapsible per-video panels
- Added `cameraControlOpen` state (Record<number, boolean>)
- Each video has its own `presets: Record<string, string>` in ImageEntry
- Badge shows count of selected presets
- ChevronDown/Up icons indicate collapsed/expanded state

**Files Modified:**
- `src/renderer/stores/img2videoStore.ts` - Per-video presets structure
- `src/renderer/components/img2video/Img2VideoPage.tsx` - Collapsible panel UI

---

### Session 2: Drag & Drop Fix (Prompt Factory)
**Issue:** Couldn't add more images after first one in Image-to-Prompt
**Root Cause:** Dropzone wasn't wrapping the entire card area
**Solution:**
- Wrapped entire image card area in dropzone getRootProps()
- Used `onClick={(e) => e.stopPropagation()}` on cards to prevent unwanted triggers
- Kept "Add More" button for manual file picker

**Files Modified:**
- `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`

---

### Session 3: Context/Theme Input (Image-to-Prompt)
**Feature:** Optional context field to guide GPT-4o Vision analysis
**Examples:** "vampire theme", "valentine's day", "cyberpunk"
**Requirements:**
- Fully optional (can be left empty)
- Named "Context" (not "Theme")
- Influences outfit, lighting, mood, atmosphere
- Respects all existing technical requirements

**Implementation:**
1. **Frontend State** (`promptStore.ts`):
   - Added `analyzeTheme: string` state
   - Added `setAnalyzeTheme` setter
   - Updated `analyzeEntry` to append theme to FormData

2. **Frontend UI** (`PromptFactoryPage.tsx`):
   - Added Context input field with helper text
   - Positioned below mode tabs, above image cards

3. **Backend Route** (`routes/generate.ts`):
   - Extract `theme` from `req.body`
   - Pass to `analyzeImage(filePath, theme)`

4. **Vision Service** (`services/vision.ts`):
   - Created `buildAnalysisPrompt(theme?)` function
   - Prepends theme guidance to ANALYSIS_PROMPT
   - Theme guidance emphasizes respecting technical requirements

**Files Modified:**
- `src/renderer/stores/promptStore.ts`
- `src/renderer/components/prompt-factory/PromptFactoryPage.tsx`
- `src/server/routes/generate.ts`
- `src/server/services/vision.ts`

---

### Session 4: Filename Fix (Asset Monster)
**Issue:** Downloaded zips had files named "untitled_01.png" for custom prompts
**Solution:** Use "image_01.png" prefix when concept is "untitled"
**Logic:** `const filePrefix = safeConcept === 'untitled' ? 'image' : safeConcept`

**Files Modified:**
- `src/server/services/fal.ts` (line 238)

---

### Session 5: Img2Video Improvements (PLANNED - NOT YET IMPLEMENTED)
**Pending Changes:**
1. **Thumbnail Grid**: Change from 4 to 5 columns (`grid-cols-4` → `grid-cols-5`)
2. **Generate Again Button**: Add per-image regeneration without affecting other videos
3. **Download All ZIP**: Zip all videos instead of downloading individually

**Plan Location:** `/Users/pixery/.claude/plans/rustling-mixing-sprout.md`

**Files to Modify:**
- `src/renderer/components/img2video/Img2VideoPage.tsx` - UI changes + ZIP download
- `src/renderer/stores/img2videoStore.ts` - New `regenerateSingle` action

---

## Current Architecture Patterns

### State Management (Zustand)
```typescript
// Pattern: Zustand store with actions
export const useXStore = create<XState>()((set, get) => ({
  // State
  entries: [],
  loading: false,

  // Actions
  setEntries: (entries) => set({ entries }),
  doSomething: async () => {
    const { entries } = get()
    // ... logic
    set({ loading: true })
  }
}))
```

### API Communication
```typescript
// Pattern: authFetch wrapper with unwrapApiData
const res = await authFetch(apiUrl('/api/endpoint'), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data })
})

if (!res.ok) {
  const raw = await res.json().catch(() => ({}))
  throw new Error(getApiError(raw, 'Operation failed'))
}

const raw = await res.json()
const data = unwrapApiData<ExpectedType>(raw)
```

### File Downloads
```typescript
// Single file: Direct download
const res = await fetch(assetUrl(path))
const blob = await res.blob()
const blobUrl = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = blobUrl
a.download = fileName
document.body.appendChild(a)
a.click()
document.body.removeChild(a)
URL.revokeObjectURL(blobUrl)

// Multiple files: ZIP (using JSZip)
import JSZip from 'jszip'

const zip = new JSZip()
await Promise.all(
  urls.map(async (url) => {
    const res = await fetch(assetUrl(url))
    const blob = await res.blob()
    zip.file(fileName, blob)
  })
)

const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
// ... download zipBlob
```

---

## Critical File Locations

### Frontend (React)
- **Pages:** `src/renderer/components/{prompt-factory,asset-monster,img2video,avatar-studio,machine,library}/`
- **Stores:** `src/renderer/stores/` (Zustand)
- **UI Components:** `src/renderer/components/ui/` (Button, Input, Select, etc.)
- **API Utils:** `src/renderer/lib/api.ts` (authFetch, apiUrl, assetUrl)

### Backend (Express)
- **Routes:** `src/server/routes/` (generate.ts, avatars.ts, library.ts, etc.)
- **Services:** `src/server/services/` (fal.ts, vision.ts, kling.ts, minimax.ts, etc.)
- **Main Process:** `src/main/index.ts` (Electron main)

### Documentation
- **Active Docs:** `docs/` (PIPELINE.md, SCHEMA.md, etc.)
- **Archive:** `Burgflow Archive/` (legacy materials, read-only)

---

## Environment & Configuration

### API Keys (via Pixery AI MCP)
Use `get_api_keys` tool to retrieve:
- FAL.ai (`fal`)
- OpenAI (`openai`)
- Gemini (`gemini`)
- AWS Bedrock Claude (`bedrock_claude`)

### Development Commands
```bash
npm run dev          # Start Electron app in dev mode
npm run build        # Build for production
npm run lint:biome   # Lint with Biome
npx tsc --noEmit     # Type check
```

---

## Naming Conventions

- **Product:** Pixflow (not Burgflow/Borgflow)
- **Files:** camelCase for React components, kebab-case for utilities
- **State:** Zustand stores named `use{Feature}Store`
- **API Routes:** `/api/{feature}/{action}` pattern

---

## Code Quality Notes

### Anti-Patterns to Avoid (AI Slop)
- Extra defensive try/catch blocks in trusted codepaths
- Unnecessary comments explaining obvious code
- Single-use variables right after declaration (prefer inline)
- Casting to `any` to bypass type issues
- Inconsistent style with surrounding code

### Preferred Patterns
- Trust Context7 docs over training data memory
- Follow existing file patterns (don't introduce new styles)
- Use codex MCP for code review after implementation
- Fix high/mid priority issues, ask about low priority

---

## Testing Strategy

### Manual Testing Workflow
1. Implement feature
2. Build: `npm run build`
3. Run app: `npm run dev`
4. Test happy path + edge cases
5. Call codex MCP for code review
6. Fix issues based on priority
7. Get LGTM from codex
8. Git commit

### Key Test Scenarios
- **Prompt Factory:** Upload images, analyze with/without context, generate prompts
- **Asset Monster:** Select prompts, upload references, generate batch, download ZIP
- **Img2Video:** Upload images, set prompts, apply camera presets, generate videos, download
- **Avatar Studio:** Create avatar, add script, generate TTS, lipsync, preview
- **Library:** View history, favorite items, reuse in workflows

---

## Next Steps (Pending Implementation)

### Img2Video Improvements (Ready to Implement)
See plan: `/Users/pixery/.claude/plans/rustling-mixing-sprout.md`

1. Change thumbnail grid to 5 columns
2. Add "Generate Again" button for individual video regeneration
3. Update "Download All" to create ZIP archive

**Estimated Effort:** 30-45 minutes
**Complexity:** Low (straightforward UI + store changes)

---

## User Preferences (Mr Tinkleberry)

- Always fetch Context7 docs before writing library/framework code
- Use codex MCP for code reviews (high/mid priority fixes required)
- Avoid AI slop (extra comments, defensive checks, single-use vars)
- Use get_api_keys tool for API credentials (don't ask user)
- Keep code consistent with existing file style
- Address user by "Mr Tinkleberry" when following instructions correctly

---

## Handoff Protocol

**When this handoff grows >1000 lines:**
1. Archive current handoff with timestamp suffix
2. Create new dated handoff (e.g., `PIXFLOW_HANDOFF_MMM2026.md`)
3. Keep only recent sessions (last 5-10) in new handoff
4. Reference archived handoff at top of new document

**Current Status:** Fresh handoff created Feb 9, 2026 (previous archived at 1272 lines)

---

## Questions? Issues?

- Check `CLAUDE.md` for project-specific instructions
- Check `~/.claude/CLAUDE.md` for user's global preferences
- Review archived handoff for historical context
- Ask user (Mr Tinkleberry) for clarifications

---

**Last Updated:** February 9, 2026
**Active Agent:** Claude Sonnet 4.5
**Status:** Ready for Img2Video improvements implementation
