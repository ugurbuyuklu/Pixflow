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
| A: Generate Images | Reference photo(s) + n prompts | n generated images |
| B: Save to Local | Generated images | Named files in local folder |
| C: Custom Prompts | JSON or plain text | Converted & used for generation |
| D: Image Preview | Click on generated image | Full-size overlay with actions |
| E: Send to Analyze | Generated image | Loaded into Image-to-Prompt tab |
| F: Multi-Image | 2-4 reference images | Couple/family generation |

**Multi-Image Support**: Select up to 4 reference images from the gallery for couple and family concepts. The fal.ai API receives all images in the `image_urls` array.

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

### Phase 05: Avatars (Talking Avatar Video Pipeline)
| Feature | Input | Output |
|---------|-------|--------|
| A: Generate Avatars | Gender, age, ethnicity, outfit | AI-generated avatar images |
| B: Avatar Gallery | - | Select from existing avatars |
| C: Script Generation | Concept + duration | Voiceover script (GPT-4o) |
| D: Text-to-Speech | Script + voice | Audio file (ElevenLabs) |
| E: Lipsync Video | Avatar + audio | Talking avatar video (Hedra) |

**Avatar Generation** uses fal.ai's `nano-banana-pro` model:
- Generates avatars with green screen background (#1ebf1a)
- 2K resolution (1536x2752) at 9:16 aspect ratio
- Direct eye contact and camera-facing pose
- Customizable: gender, age group, ethnicity, outfit style

**Working Avatar Prompt Template:**
```
photo of the person in the reference image
background: solid green color (1ebf1a)
outfit: [casual/professional/etc]
pose: at ease
framing: medium shot
slightly smiling
```

**Implementation Status:**
- ✅ `avatar.ts` - fal.ai avatar generation (prompt-only + reference image)
- ✅ `voiceover.ts` - GPT-4o script generation
- ✅ `tts.ts` - ElevenLabs text-to-speech
- ✅ `lipsync.ts` - Hedra video generation
- ✅ `routes/avatars.ts` - All API endpoints
- ⏳ Frontend UI - Avatars tab (pending)

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
    "contrast": "string - low/medium/high with description",
    "atmosphere": "string (optional)",
    "grain": "string - film grain for B&W/vintage looks"
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

## 📜 Prompt Writing & Image-to-Prompt Rules

> These rules are NON-NEGOTIABLE. They apply to ALL prompt generation:
> - Concept-to-Prompt (research-based generation)
> - Image-to-Prompt (reverse engineering from image)
> - Manual prompt editing/refinement
>
> Accumulated from months of production work. Follow every rule.

### 1. Language & Format

**1.1 All prompts are written in English**
No exceptions. User communication may be Turkish, but final prompt output is always English.

**1.2 JSON format is required**
- Keys must be clear, hierarchical, and readable
- Follow the Version B schema defined above

**1.3 Aspect ratio / resolution is NEVER in the prompt**
- This is set in generation settings, not in the prompt
- Including it in the prompt is FORBIDDEN

**1.4 No literary embellishment**
```
❌ "A breathtaking scene that evokes the eternal dance of light and shadow"
✅ "Low-key dramatic lighting with strong directional key light from camera-left"
```
Prompts are technical direction documents, not creative writing.

### 2. Physical Appearance & Identity

**2.1 NO physical descriptors**
The following are BANNED from all prompts:
```
❌ body type, weight, beauty, skinny, curvy, slim, fit
❌ attractive, perfect body, gorgeous figure
❌ age descriptors (young, mature, youthful)
❌ skin color, ethnicity, race
```

**2.2 NO gender/appearance section in JSON**
No fields for gender, height, weight, measurements. Remove entirely.

**2.3 NO hairstyle definition**
```
❌ "Long blonde wavy hair"
❌ "Short dark pixie cut"
✅ "Natural hair" (maximum allowed)
```
Hair color, length, and specific style are NEVER defined. They come from the user's reference photo.

**2.4 Identity preservation is explicit when needed**
Use dedicated fields:
```json
"identity": {
  "preserve_identity": true,
  "preserve_facial_structure": true
}
```

### 3. Pose, Body Language & Composition

**3.1 Pose is described in FULL DETAIL**
```
❌ "standing"
✅ "Standing with weight shifted to left hip, right foot slightly forward,
    torso angled 30 degrees from camera, shoulders relaxed and slightly back"
```

**3.2 Every limb position is explicitly defined**
- Hands: where, doing what, fingers how
- Arms: extended/bent, tension level, angle
- Legs: weight distribution, stance width
- Head: tilt, turn, angle relative to camera

**3.3 Emotional posture is included**
Beyond physical position, define the feeling:
```
"posture": "Relaxed and confident, weight shifted casually,
            shoulders open suggesting ease and self-assurance"
```
Options: relaxed, tense, confident, withdrawn, playful, powerful, vulnerable, guarded, open

### 4. Outfit, Makeup & Expression

**4.1 Outfit is ALWAYS fully defined**
```
❌ "Wearing a dress"
✅ "Black silk slip dress with thin spaghetti straps, midi length,
    slight V-neckline, fabric draping loosely over body"
```
Required: Fabric type, Color, Style/cut, Fit, Length, Notable details

**4.2 Makeup is detailed and controlled**
```
❌ "Natural makeup"
✅ "Matte skin finish with subtle bronzer on cheekbones,
    soft brown smoky eye with defined crease,
    nude matte lip with slight over-line"
```
Required: Tone/color, Intensity, Texture, Regional application

**4.3 Facial expression is PRECISE**
```
❌ "smiling" / "happy"
✅ "subtle smirk, corner of mouth lifted"
✅ "neutral gaze with soft intensity"
✅ "distant look, eyes unfocused, introspective"
✅ "genuine open laugh, eyes crinkled"
```

### 5. Lighting (MOST CRITICAL SECTION)

> This is the #1 most corrected area. ALWAYS give maximum detail.

**5.1 Lighting is ALWAYS described in full** - Never skip or abbreviate.

**5.2 Lighting type is always specified**
```
"studio lighting" OR "cinematic lighting" OR "natural lighting"
```

**5.3 Light direction is always specified**
- Key light: direction, intensity, quality
- Fill light: direction, intensity, purpose
- Rim light: if present, direction and intensity
- Backlight: if present, effect

**5.4 Light character is defined**
- Soft / Hard
- Diffused / Sharp
- High contrast / Low contrast
- Warm / Cool / Neutral

**5.5 Shadow behavior is specified**
```
- "Deep dramatic shadows with hard falloff"
- "Soft graduated shadows, minimal contrast"
- "Chiaroscuro with strong directional modeling"
- "Even, flat lighting with minimal shadow"
```

**5.6 Image-to-Prompt: Light direction detection**
```
Shadows on RIGHT side → Light comes from LEFT
Shadows on LEFT side → Light comes from RIGHT
Shadows below → Light from above
Highlights on hair edges → Rim/back light present
```
ALWAYS verify direction by looking at shadow placement.

### 6. Camera & Film Aesthetic

**6.1 Camera info is always included**
```json
"camera": {
  "lens": "85mm prime",
  "aperture": "f/2.8",
  "angle": "Slightly below eye level",
  "focus": "Sharp on eyes, gradual falloff to background"
}
```

**6.2 Lens choice is RESEARCH-BASED**
```
❌ "Portrait = always 85mm"
✅ Research → This concept trends with 35mm environmental framing
```

**6.3 Film/photo aesthetic is specified**
Options: Editorial, Fashion, Documentary, Cinematic still, Lifestyle, Fine art, Commercial

**6.4 B&W requires additional details**
```json
"effects": {
  "color_grade": "True B&W, Kodak Tri-X 400 emulation",
  "grain": "Medium natural film grain",
  "contrast": "Medium-high, rich blacks, bright whites, full tonal range"
}
```

### 7. Imperfections & Realism

**7.1 Imperfections are DELIBERATELY included**
```json
"skin": "Natural skin texture visible, subtle pores,
         minor natural imperfections preserved"
```

**7.2 Over-smoothness is forbidden**
```
❌ Plastic look, Airbrushed skin, CGI perfection, "Flawless" skin
```

**7.3 Target: Photorealism, not sterility**
Goal is "shot on a real camera by a real photographer" — not "rendered in 3D"

### 8. Image-to-Image Specific Rules

**8.1 Reference image usage is explicit**
```json
"reference": {
  "strength": 0.7,
  "preserve_composition": true,
  "preserve_identity": true
}
```

**8.2 Composition preservation** - If composition should be kept, state it explicitly.

**8.3 Prompt does NOT fight the reference**
```
❌ Prompt says "outdoor beach" but reference is indoor studio
✅ Prompt enhances/refines what the reference shows
```

### 9. Banned Words & Patterns

**9.1 Beauty-contest language is minimized**
```
BANNED: gorgeous, perfect, flawless, stunning, breathtaking
MINIMAL USE: beautiful (prefer specific descriptors)
```

**9.2 No vague words** - Replace with specific:
```
❌ "nice lighting" → ✅ "soft diffused key light from upper-left"
❌ "cool outfit" → ✅ "oversized knit sweater, cream colored, dropped shoulders"
❌ "beautiful setting" → ✅ "minimalist studio with white seamless backdrop"
```

### 10. Core Philosophy

**10.1 Prompt = Technical direction document** - Not an inspiration piece.

**10.2 Control is yours, randomness is the model's enemy** - If you want something, SAY IT EXPLICITLY.

**10.3 Describe BEHAVIOR, POSTURE, and LIGHT — not physical traits**

**10.4 Goal: Consistent, repeatable, professional output**
```
❌ One lucky shot out of 10 tries
✅ 8/10 outputs match the brief
```

### Image-to-Prompt Workflow

**Step 1: Observe (DO NOT SKIP)**
1. Overall mood/aesthetic
2. Light direction and quality (CHECK SHADOWS)
3. Color palette (or B&W treatment)
4. Camera angle and framing
5. Environment/set design
6. Outfit specifics (fabric, color, fit, details)
7. Pose (every limb, weight distribution, head angle)
8. Expression (precise, not generic)
9. Hair (style only, NO COLOR)
10. Makeup (intensity, colors, finish)

**Step 2: Write** - Start with `style` field, use CRITICAL tags, be specific not poetic

**Step 3: Validate Checklist**
- [ ] No physical descriptors (body type, beauty, skin color)?
- [ ] No hair color mentioned?
- [ ] Outfit fully detailed (not "casual loungewear")?
- [ ] Light direction matches shadow placement?
- [ ] Expression is precise (not just "happy")?
- [ ] Film/grain aesthetic noted if applicable?
- [ ] Pose describes every visible limb?
- [ ] No banned vague words?
- [ ] CRITICAL tags on essential elements?
- [ ] Technical, not poetic?

### Quick Reference: Common Corrections

| Mistake | Wrong | Correct |
|---------|-------|---------|
| Generic outfit | "Casual loungewear" | "Black lace bodysuit with thin straps, fitted" |
| Missing grain | "Clean digital" (for B&W) | "Medium film grain, Tri-X emulation" |
| Wrong light direction | "Light from right" | Check shadows, verify direction |
| Vague expression | "Happy" | "Wide genuine laugh, eyes crinkled, mouth open" |
| Beauty language | "Gorgeous woman in stunning dress" | "Silk midi dress draped loosely" |
| Missing shadows | No shadow description | "Soft shadows on left side of face, falloff to neck" |
| Hairstyle with color | "Long blonde waves" | "Long natural waves" (NO COLOR) |
| Generic pose | "Standing" | "Weight on left hip, right hand on waist, chin tilted down 15 degrees" |
| Sterile skin | "Flawless porcelain skin" | "Natural skin texture, subtle pores visible" |
| Missing aperture context | "f/1.4" for group shot | "f/4 to keep both subjects sharp" |

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

### Tab 1: Prompt Factory (with Sub-tabs)

Two modes available via sub-tab toggle: **Concept to Prompts** and **Image to Prompt**

```
┌─────────────────────────────────────────────────────────────────┐
│  [Concept to Prompts]  [Image to Prompt]  ← Sub-tab toggle     │
├─────────────────────────────────────────────────────────────────┤
│ (Concept to Prompts mode shown below)                           │
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

**Image to Prompt Mode** (GPT-4 Vision):

```
┌─────────────────────────────────────────────────────────────────┐
│  [Concept to Prompts]  [Image to Prompt]  ← Sub-tab toggle     │
├─────────────────────────────────────────────────────────────────┤
│ Upload an image to extract style details                        │
│ ┌───────────────────────────────────────────┐                  │
│ │         [Drag & drop image here]          │                  │
│ └───────────────────────────────────────────┘                  │
│ [🔍 Analyze Image]                                              │
├─────────────────────────────────────────────────────────────────┤
│ Generated Prompt:                                               │
│ { "style": "CRITICAL: ...", "lighting": {...}, ... }           │
│                                                                 │
│ [📋 Copy] [💾 Use in Batch] [🚀 Asset Monster]                  │
└─────────────────────────────────────────────────────────────────┘
  🚀 Asset Monster = Sends prompt directly to Batch Generate tab
```

**Image Analysis Features:**
- Shadow-based light direction detection (shadows on RIGHT = light from LEFT)
- CRITICAL tags for most important/unique elements
- Contrast level analysis (low/medium/high)
- Film grain detection for B&W/vintage looks
- Specific outfit descriptions (never generic terms like "casual wear")

### Tab 2: Batch Generate

```
┌─────────────────────────────────────────────────────────────────┐
│ Prompts: [Generated] [Custom]                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Custom prompt input (JSON or plain text)                    │ │
│ │ Plain text is auto-converted to JSON via GPT-4o             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Reference Images: [Gallery] [Upload]  (select up to 4)         │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ ✓ 2 Images Selected (for couple/family)    [Clear All]   │   │
│ │ [img1 ×] [img2 ×] [+2]                                    │   │
│ └──────────────────────────────────────────────────────────┘   │
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

### Tab 3: Avatars

```
┌─────────────────────────────────────────────────────────────────┐
│ [Gallery] [Generate]                                            │
├─────────────────────────────────────────────────────────────────┤
│ Avatar Selection:                                               │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                               │
│ │ 9:16│ │ 9:16│ │ 9:16│ │ 9:16│  ← All thumbnails 9:16        │
│ └─────┘ └─────┘ └─────┘ └─────┘                               │
│                                                                 │
│ Generate Options:                                               │
│ Gender: [Female ▼]  Age: [Young Adult ▼]                       │
│ Ethnicity: [Caucasian ▼]  Outfit: [Casual ▼]                   │
│ Number of Avatars: [●━━━] 1-4                                  │
│ [Generate Avatar]                                               │
├─────────────────────────────────────────────────────────────────┤
│ Script Generation:                                              │
│ Concept: [____________________]  Duration: [30s]               │
│ Tone: [Energetic ▼]                                            │
│ [Generate Script]                                               │
│ ┌─────────────────────────────────────────┐                    │
│ │ Generated script text here...           │                    │
│ └─────────────────────────────────────────┘                    │
├─────────────────────────────────────────────────────────────────┤
│ Voice & TTS:                                                    │
│ Voice: [Select Voice ▼]  [Preview]                             │
│ [Generate Audio]                                                │
├─────────────────────────────────────────────────────────────────┤
│ Lipsync Video:                                                  │
│ [Create Talking Avatar Video]                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Tab 4: History & Favorites

```
┌─────────────────────────────────────────────────────────────────┐
│ [Favorites] [History]                                           │
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
├── .env                          # API keys
├── avatars/                      # Avatar images (user-managed)
├── packages/
│   ├── server/                   # Backend
│   │   ├── src/
│   │   │   ├── index.ts          # Express server entry point
│   │   │   ├── routes/
│   │   │   │   ├── generate.ts   # Batch generation + fal.ai endpoints
│   │   │   │   ├── history.ts    # History & favorites endpoints
│   │   │   │   └── avatars.ts    # Avatar generation & TTS endpoints
│   │   │   └── services/
│   │   │       ├── research.ts   # Web search + analysis (GPT-4o)
│   │   │       ├── promptGenerator.ts  # Prompt generation (GPT-4o)
│   │   │       ├── fal.ts        # fal.ai API wrapper
│   │   │       ├── vision.ts     # GPT-4 Vision image analysis
│   │   │       ├── history.ts    # History & favorites storage
│   │   │       ├── avatar.ts     # Avatar generation (fal.ai nano-banana-pro)
│   │   │       ├── voiceover.ts  # Script generation (GPT-4o)
│   │   │       ├── tts.ts        # Text-to-speech (ElevenLabs)
│   │   │       └── lipsync.ts    # Lipsync video (Hedra)
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
| AI (Image Generation) | fal.ai Nano Banana Pro |
| AI (Avatar Generation) | fal.ai Nano Banana Pro |
| AI (Text-to-Speech) | ElevenLabs |
| AI (Lipsync Video) | Hedra |
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

### Avatars
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/avatars` | List avatars from gallery |
| POST | `/api/avatars/generate` | Generate new avatar (fal.ai) |
| POST | `/api/avatars/script` | Generate voiceover script (GPT-4o) |
| GET | `/api/avatars/voices` | List available TTS voices |
| POST | `/api/avatars/tts` | Convert text to speech (ElevenLabs) |
| POST | `/api/avatars/lipsync` | Create lipsync video (Hedra) |
| GET | `/api/avatars/lipsync/:jobId` | Check lipsync job status |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

---

## 🔑 Environment Variables

```env
# .env (in project root)
OPENAI_API_KEY=sk-...        # For GPT-4o research/prompts and GPT-4 Vision
FAL_API_KEY=...              # For fal.ai image/avatar generation
ELEVENLABS_API_KEY=...       # For text-to-speech (optional)
HEDRA_API_KEY=...            # For lipsync video generation (optional)
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

---

## 🎨 UI Design Patterns

### Button Styles
All buttons use gradient styling for consistency:
- **Purple actions**: `from-purple-600 to-pink-600`
- **Green actions**: `from-green-600 to-emerald-600`
- **Cancel/destructive**: `from-red-600 to-orange-600`
- **Secondary**: `from-gray-700 to-gray-600`

### Thumbnails
All image thumbnails use **9:16 aspect ratio** (`aspect-[9/16]`)

### Scrolling
- Lists use `overflow-y-auto` (vertical only)
- Text uses `break-words` and `whitespace-pre-wrap`

### Tab Order
Tabs appear in this order: **Prompt Factory** → **Asset Monster** → **Avatars** → **History**

### Key Features
- **Editable Prompt Preview**: Prompts can be edited directly in the preview pane
- **Auto-format**: Plain text is auto-converted to JSON via `/api/prompts/text-to-json`
- **Cancel Generation**: Long-running generations can be cancelled via AbortController
- **Image Navigation**: Preview overlay has prev/next buttons and keyboard shortcuts (← → Esc)
- **Send to Monster**: Full-width button below prompts list, auto-selects all prompts

---

## 🔧 Implementation Patterns

### Cancellable Fetch Requests
Uses `AbortController` with `useRef` for persistent reference:
```typescript
const generateAbortController = useRef<AbortController | null>(null)

// In handler:
if (generateAbortController.current) {
  generateAbortController.current.abort()
}
generateAbortController.current = new AbortController()

// Pass to fetch:
fetch(url, { signal: generateAbortController.current.signal })

// Cancel handler:
const handleCancel = () => {
  generateAbortController.current?.abort()
  generateAbortController.current = null
  setLoading(false)
}
```

### Text-to-JSON Conversion Flow
1. User enters text in prompt editor (JSON or plain text)
2. On save, try `JSON.parse()` first
3. If parse fails, call `/api/prompts/text-to-json` endpoint
4. Endpoint uses GPT-4o to convert natural language to our prompt schema
5. Update state with converted JSON

### fal.ai Configuration Pattern
```typescript
let falConfigured = false
function ensureFalConfig() {
  if (!falConfigured) {
    fal.config({ credentials: process.env.FAL_API_KEY })
    falConfigured = true
  }
}
```
Call `ensureFalConfig()` at the start of any fal.ai service function.
