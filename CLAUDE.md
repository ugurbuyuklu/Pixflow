# CLAUDE.md - Borgflow Project Intelligence

> This is the primary reference for Claude Code to understand the project.
> Read this file at the start of every session.

## 🎯 Project Overview

**Borgflow** is an automation system for generating performance marketing assets for the Clone AI app.

**Clone AI** is an image-to-image AI photo app where:
- Users upload a selfie
- AI generates photos of the user in different concepts/scenarios
- The user's face, identity, and features are preserved

**Prompt Factory** is the core component that generates optimized prompts for fal.ai's Nano Banana Pro Edit model.

---

## 📋 Phase Definitions

### Phase 01: Prompt Factory
| Feature | Input | Output |
|---------|-------|--------|
| A: Concept-to-Prompts | Text concept (e.g., "Christmas") | 6-10 JSON prompts |
| B: Image-to-Prompt | Reference image | 1 detailed JSON prompt |

### Phase 02: Batch Generation
| Feature | Input | Output |
|---------|-------|--------|
| A: Generate Images | Reference photo + n prompts | n generated images |
| B: Save to Local | Generated images | Named files in local folder |
| C: Custom Prompts | JSON or plain text | Converted & used for generation |
| D: Image Preview | Click on generated image | Full-size overlay with actions |
| E: Send to Analyze | Generated image | Loaded into Image-to-Prompt tab |

### Phase 03: Image to Prompt
| Feature | Input | Output |
|---------|-------|--------|
| A: Analyze Image | Reference image | Extracted style/mood details |
| B: Generate Prompt | Extracted details | 1 structured JSON prompt |

Uses GPT-4 Vision to analyze images and extract:
- Lighting setup
- Color palette
- Mood/atmosphere
- Technical camera details
- Styling elements

**Important**: Does NOT extract identity information (face, skin tone, hair color).

### Phase 04: History & Favorites
| Feature | Input | Output |
|---------|-------|--------|
| A: Auto-save History | Generated prompts | Stored in JSON file |
| B: Browse History | - | List of past generations |
| C: Favorites | Selected prompt | Saved to favorites |
| D: Reuse | Historical prompt | Loaded into batch generate |

- History auto-saves every generation (max 100 entries)
- Favorites allow naming and organizing best prompts
- Both stored in `packages/server/data/` directory

---

## 🎯 Custom Prompt Features

### Text-to-JSON Conversion
Users can enter prompts in two formats:
1. **JSON format** - Structured prompt following the schema
2. **Plain text** - Natural language description (e.g., "Black & white editorial photoshoot with dramatic lighting")

Plain text is automatically converted to JSON using GPT-4o via `/api/prompts/text-to-json` endpoint.

### External Prompt Adaptation
When pasting prompts from other sources with different schemas, the system automatically adapts them to the internal format by:
- Mapping common fields (scene → set_design, subject → pose, etc.)
- Preserving original data under mapped fields
- Generating a style summary from available information

### Generated Image Actions
When viewing a generated image in the preview overlay:
- **Click thumbnail** → Opens full-size preview
- **FileJson button (📄)** → Sends image to Image-to-Prompt for analysis
- **X button** → Closes preview

This enables a workflow: Generate → Preview → Extract prompt → Iterate

---

## 🔴 CRITICAL: Research Pipeline

This is the heart of the project. Every prompt MUST be generated based on thorough research.

### Research Sources (ALL REQUIRED)

```
1. TREND & AESTHETIC RESEARCH
   • "[concept] photoshoot ideas 2024"
   • "[concept] aesthetic Pinterest"
   • "[concept] editorial photography style"
   • "[concept] color palette trends"

2. COMPETITOR AD RESEARCH (MANDATORY)
   • "Glam AI [concept] ads"
   • "Momo AI photo [concept]"
   • "HubX AI [concept] ads Meta ad library"
   • "Remini [concept] photo ads"
   
   Primary Competitors:
   - Glam AI (Glam Labs)
   - Momo (HubX)
   - AI Video Generator (HubX)
   - Remini (Bending Spoons)
   - DaVinci (HubX)
   - Hula AI (Prequel)

3. TECHNICAL STYLE RESEARCH
   • "[concept] photography lighting setup"
   • "[concept] portrait lens choice bokeh"
   • "[concept] photo color grading film look"
   • "[concept] camera angle techniques"
```

### Research Quality Checklist

Before generating prompts, verify:

- [ ] Is the source current? (2024/2025 priority)
- [ ] Are competitors actively using this concept?
- [ ] Which creatives show high engagement/conversion?
- [ ] What hooks grab attention? (pose, outfit, set)
- [ ] Does the technical style match the concept's mood?
- [ ] Is there differentiation? (Not everyone doing the same thing)

---

## 📐 Prompt Schema (Version B)

Every prompt MUST follow this structure with `style` FIRST:

```json
{
  "style": "Single sentence summary - THIS IS READ FIRST BY THE MODEL",
  
  "pose": {
    "framing": "string",
    "body_position": "string",
    "arms": "string",
    "posture": "string",
    "expression": {
      "facial": "string",
      "eyes": "string",
      "mouth": "string"
    }
  },
  
  "lighting": {
    "setup": "string",
    "key_light": "string",
    "fill_light": "string",
    "shadows": "string",
    "mood": "string"
  },
  
  "set_design": {
    "backdrop": "CRITICAL: Describe the background environment",
    "surface": "string",
    "props": ["array", "of", "props"],
    "atmosphere": "string"
  },
  
  "outfit": {
    "main": "string",
    "underneath": "string (optional)",
    "accessories": "string",
    "styling": "string"
  },
  
  "camera": {
    "lens": "string - RESEARCH BASED, not fixed rules",
    "aperture": "string",
    "angle": "string",
    "focus": "string",
    "distortion": "string (optional, only if needed)"
  },
  
  "hairstyle": {
    "style": "string - NO COLOR, style only",
    "parting": "string",
    "details": "string",
    "finish": "string"
  },
  
  "makeup": {
    "style": "string",
    "skin": "string",
    "eyes": "string",
    "lips": "string"
  },
  
  "effects": {
    "vignette": "string (optional)",
    "color_grade": "string",
    "atmosphere": "string (optional)",
    "grain": "string"
  }
}
```

### CRITICAL Tag Usage

Use "CRITICAL:" prefix for elements that MUST be present:

```json
"backdrop": "CRITICAL: Entire background is plush red fur material"
"lens_distortion": "CRITICAL: Strong fish-eye barrel distortion"
```

The model pays more attention to CRITICAL-tagged elements.

---

## 🚫 Locked Parameters (NEVER CHANGE)

These are NEVER specified in prompts - they come from user's reference photo:

| Parameter | Why |
|-----------|-----|
| Identity | User's face is preserved |
| Facial structure | Comes from selfie |
| Hair color | From reference |
| Skin tone / ethnicity | NEVER mention |
| Age descriptors | NEVER use "young", "old", etc. |

### Anti-Patterns

```json
// ❌ WRONG - Never do this
"hairstyle": { "style": "Blonde wavy hair" }
"expression": { "facial": "Beautiful young woman smiling" }

// ✅ CORRECT
"hairstyle": { "style": "Long wavy hair with soft curls" }
"expression": { "facial": "Warm genuine smile" }
```

---

## 🎨 Rotation Axes (Variation Parameters)

Each prompt should vary 1-2 axes while keeping others stable.

### A. Aesthetics
- Editorial
- Lifestyle editorial
- Minimal studio
- Intimate portrait
- Fashion-forward

### B. Emotional Tone
- Romantic
- Playful
- Confident
- Intimate
- Mysterious

### C. Lighting (RESEARCH-BASED)
- Research what lighting works for the specific concept
- Don't apply fixed rules
- Consider: mood, time of day, indoor/outdoor, dramatic vs soft

### D. Camera/Technical (RESEARCH-BASED)
- Lens choice depends on concept research
- NOT fixed rules like "portrait = 85mm"
- Consider: editorial style, competitor examples, mood

### E. Scenario (CONCEPT-SPECIFIC)
- Generated from research findings
- Different sub-themes within the concept

---

## ✅ Prompt Quality Checklist

Before finalizing any prompt set:

- [ ] Research insights reflected in prompts?
- [ ] CRITICAL elements correctly identified?
- [ ] Technical choices (lens, light, grade) research-based?
- [ ] Variety score: Are all n prompts sufficiently different?
- [ ] Compatible with Clone AI's image-to-image flow?
- [ ] Would user's selfie look natural in this prompt?

### Variety Score Check

For a set of n prompts, verify:
- At least 3 different aesthetics used
- At least 3 different emotional tones
- At least 3 different lighting setups
- No two prompts with identical pose + outfit + lighting

---

## 🖥️ UI Structure

### Tab 1: Prompt Factory

```
┌─────────────────────────────────────────────────────────────────┐
│ Concept: [____________________________________]                 │
│ Number of prompts: [●━━━━━━━━━] 8                              │
│ [✨ Generate Prompts]                                           │
├─────────────────────────┬───────────────────────────────────────┤
│ [☑] 1. Editorial/Romantic│ {                                    │
│ [☑] 2. Minimal/Playful   │   "style": "...",                   │
│ [☐] 3. Fashion/Confident │   "pose": {...},                    │
│ ...                      │   ...                                │
│                          │ }                                    │
├──────────────────────────┴──────────────────────────────────────┤
│ Selected: 3    [Export JSON] [➡️ Send to Batch Generate]       │
└─────────────────────────────────────────────────────────────────┘
```

### Tab 2: Batch Generate

```
┌─────────────────────────────────────────────────────────────────┐
│ Prompts: [Generated] [Custom]                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Custom prompt input (JSON or plain text)                    │ │
│ │ Plain text is auto-converted to JSON via GPT-4o             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ Reference Image: [Gallery] [Upload]                             │
│ [🚀 Generate N Images]                                          │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│ │ ✅ Done  │ │ ⏳ 43%   │ │ ⏸️ Queue │  ← Click to preview    │
│ │ img_01   │ │ img_02   │ │ img_03   │                        │
│ └──────────┘ └──────────┘ └──────────┘                        │
│ [Open Output Folder]                                            │
└─────────────────────────────────────────────────────────────────┘

Image Preview Overlay:
┌─────────────────────────────────────────────────────────────────┐
│                                              [📄] [✕]           │
│                    [Full-size image]                            │
│                                                                 │
│                   Click anywhere to close                       │
└─────────────────────────────────────────────────────────────────┘
  📄 = Send to Image-to-Prompt (extracts prompt from generated image)
```

### Tab 3: Image to Prompt (GPT-4 Vision)

```
┌─────────────────────────────────────────────────────────────────┐
│ Upload an image to extract style details                        │
│ ┌───────────────────────────────────────────┐                  │
│ │         [Drag & drop image here]          │                  │
│ └───────────────────────────────────────────┘                  │
│ [Analyze Image]                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Extracted Prompt:                                               │
│ { "style": "...", "lighting": {...}, ... }                     │
│ [Use in Batch Generate]                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Tab 4: History & Favorites

```
┌─────────────────────────────────────────────────────────────────┐
│ [History] [Favorites]                                           │
├──────────────────────┬──────────────────────────────────────────┤
│ Recent Generations:  │ Preview:                                 │
│ - Christmas (8)      │ Concept: Christmas                       │
│ - Halloween (6)      │ Prompts: 8                               │
│ - ...                │ [Load] [Add to Favorites] [Delete]       │
└──────────────────────┴──────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
borgflow/
├── CLAUDE.md                     # This file
├── package.json                  # Monorepo root
├── .env                          # API keys (OPENAI_API_KEY, FAL_KEY)
├── packages/
│   ├── server/                   # Backend
│   │   ├── src/
│   │   │   ├── index.ts          # Express server entry point
│   │   │   ├── routes/
│   │   │   │   ├── generate.ts   # Batch generation + fal.ai endpoints
│   │   │   │   └── history.ts    # History & favorites endpoints
│   │   │   └── services/
│   │   │       ├── research.ts   # Web search + analysis (GPT-4o)
│   │   │       ├── promptGenerator.ts  # Prompt generation (GPT-4o)
│   │   │       ├── fal.ts        # fal.ai API wrapper
│   │   │       ├── vision.ts     # GPT-4 Vision image analysis
│   │   │       └── history.ts    # History & favorites storage
│   │   ├── data/                 # JSON data storage
│   │   │   ├── history.json      # Generation history (auto-created)
│   │   │   └── favorites.json    # Saved favorites (auto-created)
│   │   └── package.json
│   │
│   └── web/                      # Frontend
│       ├── src/
│       │   ├── App.tsx           # Main app with 4 tabs
│       │   └── main.tsx          # Entry point
│       ├── index.html
│       └── package.json
│
├── outputs/                      # Generated images
│   └── {concept}_{timestamp}/
│       ├── concept_01.jpg
│       └── ...
│
└── uploads/                      # Uploaded reference images
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| AI (Research & Prompts) | OpenAI GPT-4o |
| AI (Image Analysis) | OpenAI GPT-4 Vision |
| AI (Image Generation) | fal.ai Nano Banana Pro Edit |
| File Storage | Local filesystem (JSON for history/favorites) |

---

## 🔌 API Endpoints

### Prompt Generation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/prompts/generate` | Generate prompts from concept |
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

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

---

## 🔑 Environment Variables

```env
# .env (in project root)
OPENAI_API_KEY=sk-...        # For GPT-4o research/prompts and GPT-4 Vision
FAL_KEY=...                   # For fal.ai image generation
PORT=3001                     # Backend server port (optional, default 3001)
```

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development (both frontend + backend)
npm run dev

# Frontend: http://localhost:5173
# Backend: http://localhost:3001
```

---

## 📝 File Naming Convention

Generated images follow this pattern:

```
{concept}_{aesthetic}_{emotion}_{##}.jpg

Examples:
christmas_editorial_romantic_01.jpg
christmas_minimal_playful_02.jpg
halloween_fashion_mysterious_01.jpg
```

---

## 🔒 Security Features

1. **Path Traversal Prevention** - `sanitizeConcept()` removes `../` and special characters
2. **Command Injection Prevention** - Uses `execFile()` instead of `exec()` for shell commands
3. **Path Validation** - All file operations validate paths stay within `PROJECT_ROOT`
4. **Rate Limiting** - API endpoints limited to 10 requests per minute
5. **Input Validation** - Concept length limited to 100 chars, prompt count capped at 20
6. **File Upload Limits** - Max 10MB request body size

---

## ⚠️ Common Pitfalls

1. **Don't copy-paste technical styles** - Every concept needs fresh research
2. **Don't skip competitor research** - It's MANDATORY
3. **Don't use fixed lens/camera rules** - Research what works for each concept
4. **Don't mention identity traits** - No hair color, skin tone, age, ethnicity
5. **Don't forget variety check** - All prompts must be sufficiently different
6. **Don't ignore CRITICAL tags** - Use them for must-have elements

---

## 🎯 Success Metrics

A successful prompt generation:
1. ✅ Based on thorough multi-source research
2. ✅ Includes competitor analysis insights
3. ✅ All prompts pass variety score check
4. ✅ Technical choices are research-justified
5. ✅ CRITICAL elements are properly tagged
6. ✅ No locked parameters violated
