# Prompt Factory Research Pipeline Documentation

> Last updated: 2026-02-15
> This document details the research and prompt-generation process that runs before prompt output delivery.

## Overview

The research pipeline is the core differentiator of Prompt Factory. It ensures every prompt is:
- Based on current trends (not outdated assumptions)
- Informed by competitor strategies
- Technically appropriate for the concept
- Optimized for performance marketing

---

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ INPUT: Concept (e.g., "Halloween")                              │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Multi-Source Research                                   │
│                                                                 │
│ A. Trend & Aesthetic Research (3-5 searches)                   │
│ B. Competitor Ad Research (3-5 searches) [MANDATORY]           │
│ C. Technical Style Research (2-3 searches)                     │
│                                                                 │
│ Output: Research Brief (JSON)                                   │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Research Analysis                                       │
│                                                                 │
│ • Extract trending sub-themes                                   │
│ • Identify winning creative patterns from competitors          │
│ • Note technical styles (lens, lighting, color grade)          │
│ • Find differentiation opportunities                           │
│                                                                 │
│ Output: Sub-themes Array + Technical Recommendations           │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Prompt Generation                                       │
│                                                                 │
│ For each prompt (1 to n):                                      │
│ • Select sub-theme from research                               │
│ • Apply rotation axes (1-2 per prompt)                         │
│ • Use research-based technical choices                         │
│ • Generate full JSON prompt                                    │
│ • Validate against schema                                      │
│                                                                 │
│ Output: n Prompts (JSON Array)                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Quality Validation                                      │
│                                                                 │
│ • Research checklist passed?                                   │
│ • Prompt checklist passed?                                     │
│ • Variety score acceptable?                                    │
│                                                                 │
│ Output: Validated Prompt Set                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Multi-Source Research

### A. Trend & Aesthetic Research

**Purpose:** Understand current visual trends for the concept.

**Search Queries:**
```
"[concept] photoshoot ideas 2026"
"[concept] aesthetic Pinterest trends"
"[concept] editorial photography style"
"[concept] fashion editorial 2026"
"[concept] color palette trends"
```

**What to Extract:**
- Popular aesthetics (editorial, lifestyle, minimal, etc.)
- Trending color palettes
- Popular outfit styles
- Set design trends
- Mood/atmosphere trends

### B. Competitor Ad Research (MANDATORY)

**Purpose:** Understand what's working in performance marketing.

**Primary Competitors:**
| App | Publisher | Priority |
|-----|-----------|----------|
| Glam AI | Glam Labs | HIGH |
| Momo | HubX | HIGH |
| AI Video | HubX | HIGH |
| Remini | Bending Spoons | MEDIUM |
| DaVinci | HubX | MEDIUM |
| Hula AI | Prequel | MEDIUM |
| PixVerse | PixVerse | LOW |
| Creati | IMGCreator | LOW |

**Search Queries:**
```
"Glam AI [concept] ads Meta ad library"
"Momo AI photo [concept] Instagram"
"HubX AI [concept] creative ads"
"Remini [concept] photo transformation ads"
"AI photo app [concept] ads 2026"
```

**What to Extract:**
- Which concepts competitors are pushing
- Visual styles that appear frequently (likely high-performing)
- Hook patterns (what grabs attention)
- Pose and framing choices
- Set design patterns

### C. Technical Style Research

**Purpose:** Determine appropriate camera/lighting/color choices.

**Search Queries:**
```
"[concept] photography lighting setup tutorial"
"[concept] portrait lens choice"
"[concept] photo color grading film look"
"[concept] photoshoot behind the scenes"
```

**What to Extract:**
- Recommended lens choices (and WHY)
- Lighting setups that work for this concept
- Color grading styles
- Camera angles commonly used
- Post-processing trends

---

## Step 2: Research Analysis

### Research Brief Schema

```json
{
  "concept": "Halloween",
  "research_date": "2025-02-03",
  "sources_analyzed": 12,
  
  "trend_findings": {
    "trending_aesthetics": [
      "Glamorous witch (velvet, lace, corset)",
      "Gothic romantic",
      "Vintage horror movie",
      "Wicked movie inspired"
    ],
    "color_palettes": [
      "Classic black & orange",
      "Deep purple & black",
      "Burgundy & gold"
    ],
    "outfit_trends": [
      "Velvet dresses with lace",
      "Corset tops",
      "Flowing capes",
      "Witch hats (fashion-forward)"
    ],
    "set_design_trends": [
      "Carved pumpkins with candlelight",
      "Fog/mist atmosphere",
      "Dark forest backdrop",
      "Gothic architecture"
    ]
  },
  
  "competitor_insights": {
    "active_competitors": ["Glam AI", "Momo", "Remini"],
    "common_patterns": [
      "Witch theme dominates",
      "Strong orange lighting from pumpkins",
      "Close-up portraits with props"
    ],
    "differentiation_opportunities": [
      "More editorial/high-fashion approach",
      "Unique color grades (not just orange)",
      "Full-body lifestyle shots"
    ]
  },
  
  "technical_recommendations": {
    "lens_options": [
      "85mm for classic portrait",
      "50mm for environmental",
      "35mm for wider set inclusion"
    ],
    "lighting_styles": [
      "Candlelit dramatic (upward shadows)",
      "Orange ambient glow",
      "Low-key with rim light"
    ],
    "color_grades": [
      "Warm orange/amber dominant",
      "Desaturated gothic",
      "Vintage horror film grain"
    ],
    "notes": "Fish-eye NOT typical for Halloween - use standard portrait lenses"
  },
  
  "sub_themes": [
    {
      "name": "Glamorous Witch",
      "aesthetic": "Fashion-forward",
      "mood": "Mysterious, confident",
      "key_elements": ["Witch hat", "Velvet dress", "Jack-o-lanterns"]
    },
    {
      "name": "Gothic Romantic",
      "aesthetic": "Editorial",
      "mood": "Romantic, dark",
      "key_elements": ["Lace", "Candles", "Roses", "Dark backdrop"]
    }
    // ... more sub-themes
  ]
}
```

---

## Step 3: Prompt Generation

### Generation Rules

1. **Each prompt uses 1 sub-theme** from research
2. **Rotate 1-2 axes** per prompt for variety
3. **Technical choices come from research** - not fixed rules
4. **CRITICAL tags** for must-have elements
5. **No arbitrary identity overrides** (no forced ethnicity/body/beauty constraints)
6. **Reference-first rule**: prompts must assume user may provide one or more reference images.

### Variety Score Calculation

For n prompts, check distribution:

```
Aesthetics Used:    [Editorial, Minimal, Fashion, Lifestyle, Intimate]
                         ✓         ✓        ✓         ✓
Emotions Used:      [Romantic, Playful, Confident, Mysterious, Intimate]
                        ✓         ✓         ✓          ✓
Lighting Setups:    [Candlelit, Ambient, Studio, Natural, Dramatic]
                        ✓         ✓                        ✓
```

**Minimum Requirements for 8 prompts:**
- At least 3 different aesthetics
- At least 3 different emotions
- At least 3 different lighting setups
- No duplicate pose + outfit + lighting combinations

---

## Step 4: Quality Validation

### Research Checklist

Before generating prompts, ALL must be checked:

- [ ] Minimum 5 different sources searched
- [ ] Competitor analysis completed (MANDATORY)
- [ ] Sources are current (recent cycle; avoid stale references)
- [ ] Technical recommendations extracted
- [ ] Sub-themes identified (minimum 4)
- [ ] Differentiation opportunities noted

### Prompt Checklist

Before finalizing each prompt:

- [ ] Style field summarizes the prompt effectively
- [ ] Pose is clear and reproducible
- [ ] Outfit matches concept and sub-theme
- [ ] Lighting choice is research-justified
- [ ] Camera/lens choice is research-justified
- [ ] CRITICAL elements are tagged
- [ ] No arbitrary locked identity parameters mentioned
- [ ] Prompt is reference-first and works with multiple reference images
- [ ] Would look natural with user's selfie

### Variety Checklist

Before delivering prompt set:

- [ ] All prompts are visually distinct
- [ ] Minimum aesthetic variety met
- [ ] Minimum emotion variety met
- [ ] Minimum lighting variety met
- [ ] No duplicate combinations

---

## Example: Research to Prompts

### Input
```
Concept: "Valentine's Day"
Number of prompts: 8
```

### Research Brief (Summarized)
```json
{
  "trending_aesthetics": ["Romantic boudoir", "Lifestyle morning", "Glamorous dinner"],
  "competitor_patterns": ["Red/pink dominance", "Heart props", "Intimate settings"],
  "technical_notes": "Fish-eye creating intimate cocoon effect trending in competitor ads"
}
```

### Sub-themes Generated
1. Romantic morning in bed
2. Glamorous Valentine dinner
3. Red fur boudoir cocoon
4. Gift unwrapping moment
5. Mirror self-love moment
6. Rose petal bath
7. Candlelit intimate
8. Champagne celebration

### Prompt Distribution
| # | Sub-theme | Aesthetic | Emotion | Lighting |
|---|-----------|-----------|---------|----------|
| 1 | Red fur boudoir | Fashion-forward | Romantic | Warm ambient |
| 2 | Morning in bed | Lifestyle | Playful | Window light |
| 3 | Valentine dinner | Editorial | Confident | Candlelit |
| 4 | Gift unwrapping | Lifestyle | Playful | Soft natural |
| 5 | Rose petal bath | Intimate | Romantic | Soft diffused |
| 6 | Mirror moment | Minimal | Confident | Studio |
| 7 | Candlelit intimate | Intimate | Mysterious | Dramatic candle |
| 8 | Champagne celebration | Editorial | Playful | Golden warm |

**Variety Score: ✅ PASS**
- 4 aesthetics used
- 4 emotions used
- 5 lighting setups used
- No duplicates

---

## Technical Architecture: Prompt Generation & Delivery

### SSE Streaming (Progressive Delivery)

The frontend uses `EventSource` (GET `/api/prompts/generate`) for real-time prompt delivery.
Each prompt is emitted the moment its GPT-4o call completes — not batched at the end.

```
Frontend (EventSource)          Backend (Express SSE)           GPT-4o Workers
       │                               │                              │
       │──── GET /generate ────────────▶│                              │
       │                               │──── spawn N workers ─────────▶│
       │◀──── event: status ───────────│                              │
       │◀──── event: research ─────────│                              │
       │                               │◀──── prompt 1 done ──────────│
       │◀──── event: prompt (idx=0) ───│                              │
       │◀──── event: progress (1/N) ───│                              │
       │                               │◀──── prompt 2 done ──────────│
       │◀──── event: prompt (idx=1) ───│                              │
       │◀──── event: progress (2/N) ───│                              │
       │           ...                 │           ...                 │
       │                               │◀──── prompt N done ──────────│
       │◀──── event: prompt (idx=N-1) ─│                              │
       │◀──── event: progress (N/N) ───│                              │
       │◀──── event: done ─────────────│                              │
```

### Key Files

| File | Role |
|------|------|
| `src/server/services/promptGenerator.ts` | GPT-4o calls, system prompt, schema, fallback logic |
| `src/server/routes/prompts.ts` | SSE route handlers, pipeline orchestration |
| `src/renderer/stores/promptStore.ts` | Frontend EventSource handling, progressive state |
| `src/server/utils/prompts.ts` | `PromptOutput` type definition, validation, variety scoring |
| `src/server/services/research.ts` | `performResearch()`, `analyzeResearchResults()` |

### Parallel Worker Pattern

`generatePrompts()` spawns `min(4, count)` workers pulling from a shared queue:

```
generatePrompts(concept, count, researchBrief, onBatchDone)
  └── workers[0..3] (parallel)
       └── generateSinglePromptWithTheme(client, concept, theme, research, index)
            ├── success → prompts[index] = result
            └── failure → prompts[index] = createFallbackPrompt()
       └── onBatchDone(completed, count, prompts[index], index)  ← emits SSE
```

The `onBatchDone` callback passes `(completedCount, total, prompt, index)` so the route can emit
both `prompt` and `progress` SSE events immediately as each worker finishes.

Concurrency is intentionally capped at `4` to reduce provider throttling, fallback drift, and quality collapse on larger batches.

### Schema Alignment (Critical)

The JSON schema in the GPT-4o system prompt **MUST** match the `PromptOutput` TypeScript interface.

| TypeScript (`PromptOutput`) | GPT System Prompt Schema |
|-----------------------------|--------------------------|
| `pose.expression: { facial, eyes, mouth }` | `"pose": { "expression": { "facial", "eyes", "mouth" } }` |
| `camera.focus` | `"camera": { "focus": "..." }` |
| `hairstyle: { style, parting, details, finish }` | `"hairstyle": { "style", "parting", "details", "finish" }` |
| `makeup: { style, skin, eyes, lips }` | `"makeup": { "style", "skin", "eyes", "lips" }` |
| `effects: { color_grade, grain }` | `"effects": { "color_grade", "grain" }` |

There are **two schema sources** that must stay in sync:
1. **`PROMPT_SCHEMA_EXAMPLE` constant** — used by `generatePromptBatch()` and `textToPrompt()`
2. **Inline schema in `generateSinglePromptWithTheme()`** — used for single prompt generation

### Fallback & Error Handling

Every fallback path logs explicitly:

| Condition | Log Prefix | What Happens |
|-----------|-----------|--------------|
| OpenAI returns empty content | `Prompt X: OpenAI returned empty content` | Returns `createFallbackPrompt()` |
| JSON parse failure | `Prompt X: JSON parse failed` | Returns `createFallbackPrompt()` |
| Missing core fields (style/pose/lighting) | `Prompt X: Parsed JSON missing core fields` | Returns `createFallbackPrompt()` |
| Any uncaught error | `FALLBACK for prompt X:` | Returns `createFallbackPrompt()` |

Fallback prompts contain `FALLBACK SCAFFOLD` markers in outfit fields. If prompts arrive instantly
and look generic, check server logs for `[generateSinglePrompt]` prefixed errors.

### ResearchBrief Interface

Access research data through nested properties:

```typescript
researchBrief.trend_findings.trending_aesthetics    // string[]
researchBrief.trend_findings.color_palettes          // string[]
researchBrief.trend_findings.outfit_trends           // string[]
researchBrief.trend_findings.set_design_trends       // string[]
researchBrief.technical_recommendations.lens_options  // string[]
researchBrief.technical_recommendations.lighting_styles // string[]
researchBrief.competitor_insights.common_patterns     // string[]
researchBrief.sub_themes[].name / .aesthetic / .mood / .key_elements
```

**Never** access flat properties like `research.key_themes` or `research.visual_elements` — they don't exist.

### Web Search + JSON Mode Constraint

When using OpenAI Responses with web search tools (`web_search_preview`), do not send JSON mode (`response_format`).

Expected pattern:
- request grounded output text with clear JSON instructions,
- parse JSON from `output_text` defensively,
- keep strict fallback behavior and logging for parse failures.
