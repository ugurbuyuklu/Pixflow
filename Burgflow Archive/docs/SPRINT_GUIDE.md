# 2-Day Sprint Guide

> Quick reference for the hackathon build.

## Day 1: Core Pipeline

### Hour 0-2: Project Setup

```bash
# Clone/create project
mkdir borgflow && cd borgflow

# Initialize
npm init -y
npm install concurrently typescript -D

# Create structure
mkdir -p packages/server/src packages/web/src outputs docs

# Copy all documentation files from this package

# Install server dependencies
cd packages/server
npm install express cors dotenv @anthropic-ai/sdk uuid multer
npm install -D typescript tsx @types/node @types/express @types/cors

# Install web dependencies  
cd ../web
npm install react react-dom react-dropzone lucide-react
npm install -D vite @vitejs/plugin-react tailwindcss postcss autoprefixer typescript @types/react
```

### Hour 2-4: Research + Claude Integration

**File: `packages/server/src/services/research.ts`**

Key functions:
- `performResearch(concept: string)` - Multi-source web search
- `analyzeResearchResults(results)` - Extract insights
- `generateSubThemes(analysis)` - Create sub-themes

**Test checkpoint:**
```
Input: "Christmas"
Output: ResearchBrief with sub-themes
```

### Hour 4-6: Prompt Generation

**File: `packages/server/src/services/promptGenerator.ts`**

Key functions:
- `generatePrompts(concept, count, researchBrief)` - Main generation
- `validateVariety(prompts)` - Check variety score
- `validatePrompt(prompt)` - Schema validation

**Test checkpoint:**
```
Input: ResearchBrief + count=8
Output: 8 validated prompts with variety score PASS
```

### Hour 6-8: Basic API + Test UI

**File: `packages/server/src/index.ts`**

Endpoints:
- `POST /api/prompts/generate` - Generate prompts

**File: `packages/web/src/App.tsx`**

Basic form:
- Concept input
- Slider (1-10)
- Generate button
- JSON output display

**Day 1 Success Criteria:**
```
✅ Enter "Christmas" in UI
✅ Click Generate
✅ See research progress
✅ Receive 8 different prompts
✅ Variety score passes
```

---

## Day 2: Image Generation + Polish

### Hour 0-2: fal.ai Integration

**File: `packages/server/src/services/fal.ts`**

Key functions:
- `generateImage(referenceImage, prompt)` - Single generation
- `generateBatch(referenceImage, prompts)` - Parallel generation

**Test checkpoint:**
```
Input: 1 reference image + 1 prompt
Output: Generated image saved to disk
```

### Hour 2-4: Batch Generation

**File: `packages/server/src/routes/generate.ts`**

Endpoints:
- `POST /api/generate/batch` - Start batch
- `GET /api/generate/progress/:id` - Get progress

Features:
- Parallel execution
- Progress tracking
- Retry on failure
- File naming convention

**Test checkpoint:**
```
Input: Reference + 5 prompts
Output: 5 images in outputs/concept_timestamp/
```

### Hour 4-6: Full UI

**Files:**
- `PromptFactory.tsx` - Tab 1
- `BatchGenerate.tsx` - Tab 2
- Components: PromptList, PromptPreview, ProgressCard, ImageDropzone

Features:
- Prompt selection (checkboxes)
- Send to batch generate
- Progress cards
- Open output folder

### Hour 6-8: Polish + Demo

- Error handling
- Loading states
- Edge cases
- Demo walkthrough prep

**Day 2 Success Criteria:**
```
✅ Full flow works: Concept → Prompts → Select → Upload ref → Generate → View results
✅ Images saved with correct naming
✅ Progress UI shows status
✅ Can open output folder
```

---

## Critical Checkpoints

| Checkpoint | When | Must Have |
|------------|------|-----------|
| Research works | Day 1, Hour 4 | Web search returns results |
| Prompts generate | Day 1, Hour 6 | 8 valid prompts from concept |
| UI shows prompts | Day 1, Hour 8 | Basic form → JSON display |
| Single image works | Day 2, Hour 2 | fal.ai generates 1 image |
| Batch works | Day 2, Hour 4 | 5 images in parallel |
| Full flow | Day 2, Hour 6 | End-to-end demo ready |

---

## If Stuck (>30 min)

### Research not working
- Fallback: Hardcode a sample ResearchBrief for testing
- Continue with prompt generation

### fal.ai issues
- Check API key
- Check model name: "fal-ai/nano-bananana-pro-edit"
- Fallback: Mock the response, show UI working

### UI issues
- Keep it minimal
- Tailwind utility classes only
- No complex animations

---

## Quick Commands

```bash
# Start dev (both)
npm run dev

# Start server only
npm run dev:server

# Start web only
npm run dev:web

# Check server health
curl http://localhost:3001/health

# Test prompt generation
curl -X POST http://localhost:3001/api/prompts/generate \
  -H "Content-Type: application/json" \
  -d '{"concept": "Christmas", "count": 3}'
```

---

## API Keys Needed

1. **OpenAI API Key**
   - Get from: https://platform.openai.com/
   - Add to `.env`: `OPENAI_API_KEY=sk-...`
   - Used for: GPT-4o (research/prompts) and GPT-4 Vision (image analysis)

2. **fal.ai API Key**
   - Get from: https://fal.ai/dashboard
   - Add to `.env`: `FAL_KEY=...`
   - Used for: Nano Banana Pro Edit image generation

---

## Demo Script

1. "Let me show you Borgflow - an AI-powered prompt factory for Clone AI"

2. "I'll enter a concept: Christmas"
   - Show slider at 8 prompts
   - Click Generate

3. "Watch the research phase..."
   - Show progress (trend, competitor, technical)
   - "It's analyzing Pinterest, competitor ads, photography techniques"

4. "Here are 8 unique prompts, each based on research"
   - Show variety: different aesthetics, moods, lighting
   - Click through a few

5. "I'll select 5 and send to batch generate"
   - Check 5 prompts
   - Click Send to Batch

6. "Now I upload a reference selfie"
   - Drop image
   - Click Generate All

7. "Watch the parallel generation..."
   - Show progress cards updating
   - "Using fal.ai Nano Banana Pro Edit"

8. "Done! Let me open the output folder"
   - Show 5 generated images
   - Show naming convention

9. "This is what took me hours manually - now automated with research-backed prompts"
