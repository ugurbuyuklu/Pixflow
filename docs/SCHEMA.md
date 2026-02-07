# Prompt Schema Documentation

> Complete schema reference for Prompt Factory outputs.

## Schema Version: B (Current)

Key improvements over version A:
- `style` field moved to FIRST position (highest model priority)
- `lighting` moved up (critical for mood)
- Added `set_design` as separate section
- Added `effects` section for post-processing
- Simplified nested structures
- Added CRITICAL tag support

---

## Complete Schema

```typescript
interface PromptOutput {
  // FIRST - This is read first by the model
  style: string;  // 15-30 words, single sentence summary
  
  pose: PoseConfig;
  lighting: LightingConfig;
  set_design: SetDesignConfig;
  outfit: OutfitConfig;
  camera: CameraConfig;
  hairstyle: HairstyleConfig;
  makeup: MakeupConfig;
  effects: EffectsConfig;
}

interface PoseConfig {
  framing: string;      // e.g., "Three-quarter portrait, seated"
  body_position: string;
  arms: string;
  posture: string;
  expression: {
    facial: string;
    eyes: string;
    mouth: string;
  };
}

interface LightingConfig {
  setup: string;        // Overall lighting description
  key_light: string;    // Main light source
  fill_light: string;   // Secondary/fill
  shadows: string;      // Shadow quality
  mood: string;         // Emotional quality of light
}

interface SetDesignConfig {
  backdrop: string;     // CRITICAL element - background environment
  surface: string;      // What subject is on/in
  props: string[];      // Array of props
  atmosphere: string;   // Overall vibe
}

interface OutfitConfig {
  main: string;         // Primary clothing item
  underneath?: string;  // Optional - visible underlayer
  accessories: string;  // Jewelry, hats, etc.
  styling: string;      // Overall style description
}

interface CameraConfig {
  lens: string;         // RESEARCH-BASED choice
  aperture: string;
  angle: string;
  focus: string;
  distortion?: string;  // Optional - only if concept requires
}

interface HairstyleConfig {
  style: string;        // NO COLOR - shape and texture only
  parting: string;
  details: string;
  finish: string;       // Overall look
}

interface MakeupConfig {
  style: string;        // Overall makeup approach
  skin: string;         // Skin finish
  eyes: string;         // Eye makeup
  lips: string;         // Lip color/finish
}

interface EffectsConfig {
  vignette?: string;    // Optional
  color_grade: string;  // Color treatment
  contrast: string;     // Low/medium/high with description
  atmosphere?: string;  // Fog, haze, etc.
  grain: string;        // Film grain or clean (detect from B&W/vintage)
}
```

---

## Field Guidelines

### style (CRITICAL - Always First)

This field has the highest priority. Make it count.

**Good Examples:**
```
"Luxurious Valentine's boudoir portrait entirely surrounded by plush red fur backdrop, ornate velvet robe with crystal embroidery, warm intimate lighting with circular vignette"

"Glamorous Halloween witch editorial surrounded by carved jack-o-lanterns, black velvet and lace dress with pointed hat, moody orange candlelight with dramatic shadows"

"Cozy Christmas morning portrait by fireplace in oversized knit sweater, warm golden light with soft bokeh from tree lights, intimate lifestyle aesthetic"
```

**Bad Examples:**
```
"A nice photo of someone" // Too vague
"Portrait with good lighting" // No concept
"Halloween costume photo" // No detail
```

### pose.framing Options

```
- "Tight headshot"
- "Close-up portrait"
- "Three-quarter portrait"
- "Three-quarter portrait, seated"
- "Three-quarter portrait, standing"
- "Medium portrait"
- "Full body portrait"
- "Environmental portrait"
```

### pose.expression Guidelines

Describe the emotion, not identity:

```
// ✅ CORRECT
"facial": "Warm genuine smile, inviting"
"facial": "Mysterious half-smile, knowing"
"facial": "Confident smirk, playful"
"facial": "Soft dreamy expression, romantic"

// ❌ WRONG
"facial": "Beautiful young woman smiling"
"facial": "Pretty girl with nice features"
```

### lighting - Research-Based

Don't use fixed rules. Research what works for each concept.

**Halloween Example (from research):**
```json
"lighting": {
  "setup": "Low-key dramatic with warm point sources",
  "key_light": "Orange glow from jack-o-lanterns, upward-casting shadows",
  "fill_light": "Minimal purple ambient from background",
  "shadows": "Deep dramatic shadows, chiaroscuro effect",
  "mood": "Mysterious, enchanting, spooky yet glamorous"
}
```

**Valentine Example (from research):**
```json
"lighting": {
  "setup": "Warm ambient with red environment reflection",
  "key_light": "Soft diffused from above-front",
  "fill_light": "Red glow bouncing from fur backdrop",
  "shadows": "Soft, minimal, flattering",
  "mood": "Romantic, intimate, luxurious"
}
```

### Light Direction Detection (Shadow Analysis)

When analyzing images with Image-to-Prompt, light direction is determined by analyzing shadow placement:

**Rule: Shadows fall OPPOSITE to light source**

| Shadow Location | Light Direction |
|-----------------|-----------------|
| Shadows on RIGHT side of face | Light from LEFT |
| Shadows on LEFT side of face | Light from RIGHT |
| Shadow under nose pointing down-right | Light from upper-left |
| Shadow under nose pointing down-left | Light from upper-right |
| Shadows below features (short shadows) | Light from above (high angle) |
| Long shadows on one side | Low-angle side light |

**Example key_light descriptions:**
```json
// Shadows on right side of face
"key_light": "Key light from camera-LEFT at 45° angle (determined by shadows falling on right side of face)"

// Shadows below and slightly left
"key_light": "Key light from upper-right (determined by shadows falling below-left of features)"
```

### set_design.backdrop (Often CRITICAL)

The backdrop often defines the entire mood. Use CRITICAL tag when essential.

```json
// Valentine boudoir - backdrop is CRITICAL
"backdrop": "CRITICAL: Entire background is plush red fur/velvet material covering ALL visible walls creating cocoon-like environment, NO white walls"

// Halloween - backdrop sets the mood
"backdrop": "CRITICAL: Dark moody environment with fog/mist, deep blacks fading to darkness, no visible walls or modern elements"

// Christmas - backdrop creates warmth
"backdrop": "Cozy living room corner with decorated Christmas tree, warm fireplace glow visible, wrapped presents"
```

### camera - Research-Based (NOT Fixed Rules)

❌ **Wrong Approach:**
```
"Portrait = 85mm"
"Editorial = 50mm"
"Wide shot = 35mm"
```

✅ **Correct Approach:**
```
Research shows competitor Valentine ads use fish-eye for intimate cocoon effect
→ Use "24mm fish-eye with barrel distortion"

Research shows Halloween portraits use standard portrait lens for dramatic shadows
→ Use "85mm prime for classic portrait separation"

Research shows Christmas lifestyle uses environmental framing
→ Use "35mm for room context and warmth"
```

### hairstyle - NO COLOR

Never mention hair color. It comes from the user's reference photo.

```json
// ✅ CORRECT
"hairstyle": {
  "style": "Long flowing waves",
  "parting": "Deep side part",
  "details": "Silky texture, one side tucked behind ear",
  "finish": "Glamorous, polished"
}

// ❌ WRONG
"hairstyle": {
  "style": "Blonde long flowing waves",  // NO!
  "details": "Golden highlights"          // NO!
}
```

### effects - Concept Appropriate

Don't copy effects between concepts. Each should be justified.

```json
// Valentine - fish-eye justified by competitor research
"effects": {
  "lens_distortion": "CRITICAL: Strong fish-eye barrel distortion",
  "vignette": "Heavy circular vignette, tunnel framing",
  "color_grade": "Rich saturated reds, warm skin tones",
  "contrast": "Medium contrast, balanced tones for romantic feel",
  "grain": "None, clean digital"
}

// Halloween - vintage horror aesthetic
"effects": {
  "vignette": "Dark edges, spotlight on subject",
  "color_grade": "Warm orange/amber, deep blacks",
  "contrast": "High contrast with deep blacks and bright highlights",
  "atmosphere": "Subtle fog in background",
  "grain": "Fine film grain for vintage horror feel"
}

// Christmas - warm and cozy
"effects": {
  "color_grade": "Warm golden tones, Portra-like skin",
  "contrast": "Low contrast, flat and muted for dreamy feel",
  "atmosphere": "Soft glow from lights",
  "grain": "Subtle grain for nostalgic feel"
}

// B&W Editorial - classic film look
"effects": {
  "color_grade": "True B&W with rich midtones",
  "contrast": "High contrast, punchy blacks and bright whites",
  "grain": "Medium film grain consistent with Tri-X pushed one stop"
}
```

---

## CRITICAL Tag Usage

Use `CRITICAL:` prefix for elements that MUST be present. The model pays more attention to these.

**When to use CRITICAL:**
- Backdrop that defines the concept
- Specific lens effect that's essential
- Key prop that can't be missing
- Specific lighting that creates the mood

**Examples:**
```json
"backdrop": "CRITICAL: Entire background is plush red fur"
"lens_distortion": "CRITICAL: Strong fish-eye barrel distortion"
"props": ["CRITICAL: Multiple carved jack-o-lanterns with candles inside"]
"shadows": "CRITICAL: Deep dramatic shadows, chiaroscuro effect"
```

**Don't overuse:**
- If everything is CRITICAL, nothing is
- Limit to 2-4 CRITICAL elements per prompt

---

## Anti-Patterns

### Identity Descriptors (NEVER USE)

```json
// ❌ NEVER
"Blonde hair"
"Asian features"
"Young woman"
"Blue eyes"
"Tan skin"
"20-year-old"
"Beautiful/pretty/gorgeous"

// ✅ INSTEAD
Describe pose, expression, style - not identity
```

### Copying Technical Styles

```json
// ❌ WRONG - Copying Valentine fish-eye to Halloween
"camera": {
  "lens": "24mm fish-eye",
  "distortion": "Strong barrel distortion"
}

// ✅ RIGHT - Research-based for Halloween
"camera": {
  "lens": "85mm portrait lens",
  "aperture": "f/2.8 for subject separation from dark background"
}
```

### Vague Descriptions

```json
// ❌ TOO VAGUE
"lighting": {
  "setup": "Good lighting",
  "mood": "Nice"
}

// ✅ SPECIFIC
"lighting": {
  "setup": "Low-key dramatic with warm practical sources",
  "key_light": "Orange glow from jack-o-lanterns at 45 degrees",
  "mood": "Mysterious, enchanting, theatrical"
}
```

---

## Complete Example: Halloween Glamorous Witch

```json
{
  "style": "Glamorous Halloween witch editorial portrait surrounded by carved pumpkins and candlelight, luxurious black velvet and lace costume with pointed witch hat, moody orange and purple ambient lighting with dramatic shadows",

  "pose": {
    "framing": "Three-quarter portrait, seated",
    "body_position": "Seated elegantly among carved pumpkins, leaning slightly toward camera",
    "arms": "One hand delicately touching brim of witch hat, other resting on knee",
    "posture": "Confident, slightly mysterious lean with chin tilted down",
    "expression": {
      "facial": "Mysterious half-smile, knowing and enchanting",
      "eyes": "Intense direct gaze with slightly hooded lids, captivating",
      "mouth": "Subtle smirk, closed lips with dark lipstick"
    }
  },

  "lighting": {
    "setup": "Low-key dramatic lighting with warm point sources from carved pumpkins",
    "key_light": "Warm orange glow from jack-o-lanterns at front-left, casting upward shadows",
    "fill_light": "Subtle purple ambient fill from background",
    "shadows": "CRITICAL: Deep dramatic shadows on face, chiaroscuro effect",
    "mood": "Mysterious, enchanting, spooky yet glamorous"
  },

  "set_design": {
    "backdrop": "CRITICAL: Dark moody backdrop with hints of fog/mist, deep blacks fading to darkness",
    "surface": "Dark wooden floor with scattered autumn leaves",
    "props": [
      "Multiple carved jack-o-lanterns with glowing candles inside",
      "Tall black pillar candles with dripping wax",
      "Subtle cobweb details in background",
      "Dried branches and dark roses"
    ],
    "atmosphere": "Mystical Halloween night, witchy ritual setting"
  },

  "outfit": {
    "main": "Luxurious black velvet dress with corseted bodice and flowing lace sleeves",
    "accessories": "CRITICAL: Elegant pointed black witch hat with wide brim, black tulle accent",
    "jewelry": "Antique silver moon pendant, dark gemstone rings",
    "styling": "Gothic glamour, editorial witch, high-fashion Halloween"
  },

  "camera": {
    "lens": "85mm prime for portrait separation",
    "aperture": "f/2.8",
    "angle": "Slightly below eye-level, looking up for powerful presence",
    "focus": "Sharp on face and hat, pumpkins soft in foreground/background"
  },

  "hairstyle": {
    "style": "Long flowing waves cascading from under witch hat",
    "parting": "Hidden under hat",
    "details": "Silky waves with subtle volume, mysterious and elegant",
    "finish": "Glamorous, witchy, editorial-polished"
  },

  "makeup": {
    "style": "Dramatic Halloween glam",
    "skin": "Flawless with subtle highlight, slightly ethereal",
    "eyes": "CRITICAL: Dark dramatic smoky eye with deep purples and blacks, sharp winged liner",
    "lips": "Deep burgundy matte lip"
  },

  "effects": {
    "vignette": "Dark edges, spotlight effect on subject",
    "color_grade": "Rich oranges from pumpkins, deep blacks, hints of purple, warm skin tones",
    "atmosphere": "Subtle fog/haze in background for depth",
    "grain": "Fine film grain for vintage horror aesthetic"
  }
}
```
