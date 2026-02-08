import OpenAI from 'openai'
import type { PromptOutput, ResearchBrief, SubTheme, VarietyScore } from '../utils/prompts.js'
import { validatePrompt, calculateVarietyScore } from '../utils/prompts.js'

let openaiClient: OpenAI | null = null
let clientInitializing = false

async function getOpenAI(): Promise<OpenAI> {
  if (openaiClient) return openaiClient
  if (clientInitializing) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    return getOpenAI()
  }
  clientInitializing = true
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000,
    maxRetries: 2,
  })
  clientInitializing = false
  return openaiClient
}

function safeJsonParse<T>(content: string, fallback: T): T {
  try {
    return JSON.parse(content) as T
  } catch {
    console.error('[JSON Parse Error] Failed to parse prompt response:', content.substring(0, 200))
    return fallback
  }
}

const CREATIVE_DIRECTOR_KNOWLEDGE = `
## VISUAL VOCABULARY - Use specific terms, not generic descriptions

### MATERIALS & TEXTURES
Fabrics: silk charmeuse, crushed velvet, raw linen, organza, tulle, leather, denim, cashmere, mohair, sequins, lace, satin, tweed, boucle, mesh
Surfaces: brushed chrome, patina brass, terrazzo, marble veining, raw concrete, reclaimed wood, smoked glass, mirror, acrylic, rattan, wicker
Elements: condensation droplets, soap bubbles, flower petals, confetti, glitter particles, rain streaks, dust motes in light, rising steam

### LIGHTING TECHNIQUES
Classic: Rembrandt (triangle shadow), butterfly/paramount, split light, loop lighting, broad/short lighting
Cinematic: chiaroscuro, film noir venetian blinds, neon glow, golden hour backlight, blue hour ambient
Practical: fairy lights bokeh, candle flicker, TV screen glow, window light with curtain diffusion, ring light catch
Qualities: specular highlights, crushed blacks, lifted shadows, lens flare, light leak, haze/atmosphere

### LENS FLARE AESTHETIC (USE WHEN APPROPRIATE - NOT A MUST)
When to use: Golden hour/backlight scenarios, romantic/dreamy moods, summer/warm concepts, nostalgic aesthetics, aspirational lifestyle shots
Types of flare:
- Anamorphic flare: Horizontal streaks across frame, cinematic and dramatic, blue or orange tint
- Circular flare: Soft hexagonal or circular orbs floating in frame, dreamier and more organic
- Veiling flare: Overall haze/glow reducing contrast, creates ethereal washed-out look
- Sun star: Sharp pointed rays from bright point source, works with small apertures
Placement and intensity:
- Subtle: Gentle warmth and glow at frame edges, barely noticeable lift in highlights
- Medium: Visible flare elements adding atmosphere without overwhelming subject
- Dramatic: Bold flare streaks or orbs as intentional compositional element
Best scenarios: Backlit portraits at golden hour, beach/pool scenes, summer romance, festival/celebration, warm nostalgia
Avoid when: Studio clean shots, corporate/professional, dark moody noir, high contrast editorial, winter/cool concepts

### PROPS & SET ELEMENTS
Vintage: rotary phone, vinyl records, polaroid camera, typewriter, film projector, vintage suitcase, antique mirror
Modern: geometric sculptures, monstera leaves, pampas grass, ceramic vases, coffee table books, designer objects
Atmospheric: disco ball reflections, prism rainbow, smoke machine haze, bubble machine, projection mapping
Seasonal: string lights, candles, dried flowers, fresh citrus, ice cubes, tropical fruits, autumn leaves

### FASHION & COSTUME
Eras: 60s mod, 70s bohemian, 80s power shoulder, 90s minimalism, Y2K cyber, 2020s quiet luxury
Aesthetics: old money prep, mob wife glam, clean girl minimal, cottagecore romantic, dark academia, coastal grandmother
Silhouettes: oversized blazer, slip dress, wide-leg trouser, cropped cardigan, maxi skirt, bodycon, A-line
Details: pearl buttons, gold hardware, tortoise shell, chain details, feather trim, ruching, cutouts

### JEWELRY & ACCESSORIES
Jewelry: layered gold chains, chunky hoops, tennis bracelet, signet ring, baroque pearls, statement ear cuff, delicate studs
Eyewear: cat-eye sunglasses, aviators, round wire frames, shield sunglasses, tortoise readers
Bags: quilted leather, basket weave, structured top-handle, slouchy hobo, micro bag, transparent PVC
Hair accessories: silk scarf, claw clip, headband, barrettes, scrunchie, hair pins, ribbon
Other: leather gloves, silk scarf at neck, belt as statement, watch as jewelry, hat/beret

### POSES & BODY LANGUAGE
CRITICAL POSE RULE: All poses must look NATURAL, STABLE, and EFFORTLESS. Never describe poses that look off-balance, strained, or like the model is about to fall. The model should appear comfortable and grounded.

Natural Standing: weight settled into hips, one leg slightly relaxed, spine naturally aligned, shoulders level and relaxed, arms hanging naturally or resting on something stable
Seated Relaxed: weight fully supported by seat, back comfortably against support or naturally upright, legs crossed or feet flat, hands resting naturally in lap or on armrests
Leaning Stable: body weight fully supported by surface (wall, doorframe, furniture), relaxed into the lean rather than pushing against it, comfortable and sustainable position
Editorial Grounded: elongated neck with chin level (not strained up), shoulders back but relaxed (not tensed), weight evenly distributed or clearly settled on one hip
Candid Natural: caught in a comfortable moment, body language that suggests ease and familiarity with the environment, nothing forced or held

AVOID: twisted torsos without support, weight on toes, arms held in mid-air without purpose, head tilted at extreme angles, poses that require muscle tension to maintain, anything that looks like the model is fighting gravity

### EXPRESSIONS
Eyes: smizing (smile with eyes), soft gaze, intense stare, dreamy unfocused, knowing glance, side-eye
Mouth: barely-there smile, soft part lips, full genuine smile, pout, relaxed neutral, biting lip
Mood: serene contemplation, joyful abandon, sultry confidence, vulnerable softness, mysterious allure

### COLOR PALETTES & GRADING
Warm: burnt sienna, terracotta, honey gold, dusty rose, cream, caramel, cognac
Cool: slate blue, sage green, lavender, silver, ice white, navy, eucalyptus
Film looks: Kodachrome saturation, Portra skin tones, Fuji Pro greens, Cinestill neon halation
Grades: lifted blacks for matte, crushed shadows for drama, cross-processed, bleach bypass, orange-teal split

### COMPOSITION TECHNIQUES
Framing: rule of thirds, golden ratio, center symmetry, frame-within-frame, negative space
Angles: dutch tilt for tension, low angle for power, high angle for vulnerability, eye-level for connection
Depth: shallow DOF subject isolation, layered foreground/midground/background, leading lines
Movement: motion blur intentional, frozen action, flowing fabric, hair movement

### CINEMATIC & CULTURAL REFERENCES
Directors: Wes Anderson symmetry/pastels, Wong Kar-wai neon/longing, Sofia Coppola dreamy/feminine, Kubrick one-point perspective
Eras: Old Hollywood glamour, French New Wave casual, 80s Miami Vice, 90s grunge, Y2K cyber
Genres: film noir shadows, sci-fi chrome/neon, romantic comedy warmth, horror dramatic lighting
Art movements: Art Deco geometric, Bauhaus minimal, Baroque dramatic, Pop Art bold
Photographers: Slim Aarons poolside luxury, Helmut Newton power, Richard Avedon movement, Annie Leibovitz narrative

## PROMPT CRAFT PRINCIPLES
1. MAXIMUM DETAIL - Describe every element as if briefing a photographer and stylist
2. SPECIFIC VOCABULARY - Use exact terms from the knowledge base
3. LAYERED DESCRIPTIONS - Multiple adjectives and qualifiers for richness
4. SENSORY LANGUAGE - Textures, temperatures, weights, movements you can feel
5. TECHNICAL PRECISION - Real photography/styling terms, not vague descriptions
6. NATURAL POSES - Every pose must be stable, grounded, and effortless. No awkward balance, no muscle strain, no "about to fall" positions
7. IDENTITY NEUTRAL - Never dictate body characteristics that come from the person (posture quirks, natural stance). Describe the IDEAL pose direction, the AI model will adapt to the person's body

## LIGHTING SETUP PRINCIPLES
Always describe lighting as a complete setup:
- KEY LIGHT: Primary source, direction, quality (hard/soft), color temperature
- FILL: Secondary source or reflector, ratio to key (e.g., 2:1, 3:1)
- ACCENT/RIM: Separation light if needed, direction and intensity
- AMBIENT: Environmental light contribution
- MOOD: Emotional quality the lighting creates
Example: "Soft key from large window camera-left creating gentle Rembrandt pattern, white reflector fill on shadow side at 2:1 ratio, warm afternoon sun providing subtle rim light on hair, overall mood intimate and inviting"
`

const PROMPT_SCHEMA_EXAMPLE = `{
  "style": "30-50 word vivid sentence capturing the entire vision: aesthetic reference, mood, color story, key visual hook, and aspirational quality. Example: 'Slim Aarons-inspired poolside glamour meets modern editorial — honey-gold late afternoon light streaming through palm fronds, vintage Riviera color palette of terracotta and cream, effortless old-money elegance with a knowing, sun-warmed confidence'",

  "pose": {
    "framing": "Precise framing with composition reasoning — e.g., 'Three-quarter portrait from chest up, subject positioned in right third of frame using rule of thirds, generous negative space on left creating visual balance and breathing room, slight headroom above'",
    "body_position": "MUST BE STABLE AND NATURAL — e.g., 'Comfortably seated in rattan chair with weight fully supported, body angled 30 degrees from camera, hips settled into seat, one leg crossed over the other in relaxed position — pose feels effortless and could be held indefinitely'",
    "arms": "Natural arm placement with support — e.g., 'Left arm resting naturally on chair arm with elbow supported, fingers loosely curled in relaxed position, right hand resting lightly in lap or gently touching collarbone — no arms held in mid-air without purpose'",
    "posture": "Relaxed yet elegant posture — e.g., 'Spine comfortably upright with natural curve, shoulders level and relaxed (not raised or tensed), chin level with ground projecting quiet ease, neck naturally lengthened — posture looks sustainable and comfortable, not held or forced'",
    "expression": {
      "facial": "Nuanced emotional state — e.g., 'Serene self-assurance with hint of private amusement, as if recalling a pleasant memory, brow relaxed and smooth, jaw unclenched and soft'",
      "eyes": "Precise eye direction and quality — e.g., 'Soft gaze into lens with gentle smize (smile reaching the eyes), warmth and presence without intensity, natural catch lights suggesting the lighting setup'",
      "mouth": "Detailed mouth position — e.g., 'Lips naturally together or softly parted, corners gently lifted in genuine micro-smile, no tension in jaw or around mouth — expression feels real, not performed'"
    }
  },

  "lighting": {
    "setup": "Complete lighting scenario with all sources — e.g., 'Natural window light setup: large north-facing window as soft key from camera-left, white foam board reflector on shadow side for 2:1 fill ratio, sheer linen curtains diffusing light to reduce contrast, warm practical lamp in background adding depth and color accent at 2800K'",
    "key_light": "Primary source with direction, quality, and color — e.g., 'Soft diffused window light from camera-left at 45-degree angle to subject, quality is broad and wrapping due to large source size, color temperature approximately 5500K daylight, creating gentle Rembrandt pattern with soft triangle of light on shadow cheek'",
    "fill_light": "Secondary sources with ratio — e.g., 'Large white v-flat reflector positioned camera-right bouncing key light back into shadows, maintaining 2:1 lighting ratio (key is one stop brighter than fill), preserving detail in shadows while keeping dimensional modeling on face'",
    "shadows": "Shadow quality, placement, and density — e.g., 'Soft-edged shadows with gradual 6-inch falloff zone, gentle shadow under chin defining jawline without harshness, subtle nose shadow pointing toward corner of mouth, shadow side of face approximately 1 stop darker than highlight side, lifted shadows with visible detail'",
    "mood": "Emotional quality and atmosphere — e.g., 'Warm, intimate, and inviting — the quality of light on a lazy Sunday morning, soft and forgiving, wrapping around the subject like a gentle embrace, creating a sense of comfort and approachability'"
  },

  "set_design": {
    "backdrop": "CRITICAL: Layered background description — e.g., 'CRITICAL: Infinity pool edge in soft focus foreground, azure water catching sky reflections, whitewashed Mediterranean villa wall in middle distance with weathered terracotta roof tiles, swaying palm fronds creating dappled shadows, endless cerulean sky with wispy cirrus clouds at horizon'",
    "surface": "What subject interacts with — e.g., 'Vintage rattan peacock chair with cream linen cushion, textured woven pattern visible, aged honey-toned wood frame with natural patina'",
    "props": ["Sweating crystal tumbler with amber liquid and large ice sphere", "Vintage Gucci sunglasses casually placed on chair arm", "Open hardcover book face-down on side table", "Ceramic bowl of ripe figs and citrus"],
    "atmosphere": "Environmental mood — e.g., 'Unhurried Mediterranean summer afternoon, gentle breeze suggested by fabric movement, warmth radiating from sun-baked stone, cicada-quiet luxury'"
  },

  "outfit": {
    "main": "Detailed garment description — e.g., 'Flowing silk charmeuse maxi dress in warm ivory, bias-cut draping liquid over body, thin spaghetti straps, deep V-neckline to sternum, fabric catching light with subtle luster'",
    "underneath": "Visible undergarments if applicable — e.g., 'Delicate gold body chain glimpsed at neckline, thin straps visible at shoulders'",
    "accessories": "Complete accessory inventory — e.g., 'Layered 14k gold necklaces: delicate chain with small medallion, longer chain with vintage coin pendant; chunky gold ear cuffs; stack of thin hammered bangles on right wrist; vintage signet ring on pinky'",
    "styling": "Overall fashion direction — e.g., 'Effortless Riviera elegance meets quiet luxury — clothes that look casually thrown on but are impeccably considered, relaxed but never sloppy, suggesting old money ease'"
  },

  "camera": {
    "lens": "Specific lens with creative reasoning — e.g., '85mm f/1.4 prime for classic portrait compression, flattering facial features while providing creamy background separation, slight telephoto compression adding intimacy'",
    "aperture": "F-stop with depth reasoning — e.g., 'f/2.0 for shallow depth of field isolating subject from background, smooth bokeh rendering out-of-focus highlights as soft circles, subject sharp from eyes to ears'",
    "angle": "Precise camera position — e.g., 'Camera at subject's eye level, positioned 15 degrees right of center, creating slight asymmetry, shooting slightly across body toward the turned shoulder'",
    "focus": "Focus technique and point — e.g., 'Single-point autofocus locked on nearest eye with eye-detect, critical sharpness on iris and lashes, gradual falloff across face, tip of nose slightly soft'"
  },

  "hairstyle": {
    "style": "Shape and texture without color — e.g., 'Long loose waves with natural movement and body, effortless beach texture as if air-dried after ocean swim, face-framing layers starting at chin'",
    "parting": "Parting detail — e.g., 'Deep side part on left, hair sweeping across forehead with natural swoop, exposing right ear and elegant earring'",
    "details": "Specific styling elements — e.g., 'Subtle natural-looking highlights catching the sunlight, lived-in texture with slight frizz suggesting humidity, a few strands catching breeze across face'",
    "finish": "Overall hair quality — e.g., 'Healthy shine without looking overdone, touchable texture, natural movement, no stiffness or product buildup visible'"
  },

  "makeup": {
    "style": "Overall makeup approach — e.g., 'Sun-kissed natural glam — skin-focused with strategic enhancement, editorial polish meets vacation ease, makeup that looks like better skin rather than obvious product'",
    "skin": "Detailed skin with NATURAL TEXTURE — e.g., 'Dewy luminous finish, natural skin texture visible with subtle pores, minor imperfections preserved, sun-kissed warmth across nose and cheeks, hydrated and healthy - NOT airbrushed or plastic'",
    "eyes": "Complete eye makeup — e.g., 'Warm bronze wash across lids blended into crease, subtle champagne shimmer on inner corners, soft brown definition in outer V, clean lash line, fluffy natural-looking lashes with individual clusters at outer corners, groomed feathered brows'",
    "lips": "Detailed lip description — e.g., 'Juicy nude-rose lip with slight glossy finish, natural lip color enhanced, defined cupid's bow, slightly fuller appearance from gloss, hydrated and plush'"
  },

  "effects": {
    "vignette": "Edge treatment — e.g., 'Subtle natural vignette from lens, slight warmth and exposure falloff in corners drawing eye to center'",
    "color_grade": "Complete color treatment — e.g., 'Warm Kodachrome-inspired palette: lifted shadows with golden undertone, rich skin tones leaning peachy-coral, desaturated greens pushed toward teal, highlight rolloff creamy rather than clinical'",
    "lens_flare": "(OPTIONAL - only for appropriate scenarios) — e.g., 'Subtle golden hour flare entering from top-right corner, soft circular orbs floating in upper third of frame, gentle veiling warmth reducing contrast in highlights, adding dreamy romantic quality' OR 'None - clean studio look maintained'",
    "atmosphere": "Post-production atmosphere — e.g., 'Subtle haze suggesting humid summer air, dreamy quality without losing clarity, halation around bright highlights'",
    "grain": "Film grain treatment — e.g., 'Fine organic film grain at ISO 200 level, adding texture and analog warmth, more visible in shadows and midtones, not distracting but present'"
  }
}`

function createFallbackPrompt(theme: SubTheme, concept: string): PromptOutput {
  const moodToLighting: Record<string, { setup: string; key: string; shadows: string }> = {
    Romantic: { setup: 'Golden hour backlight with lens flare', key: 'Warm sun from behind, soft fill from front', shadows: 'Soft, lifted, dreamy' },
    Playful: { setup: 'Bright natural daylight, airy and fresh', key: 'Soft diffused overhead', shadows: 'Minimal, open shadows' },
    Confident: { setup: 'Editorial butterfly lighting', key: 'Beauty dish from above', shadows: 'Defined but flattering' },
    Intimate: { setup: 'Window light with sheer curtain diffusion', key: 'Soft side light creating gentle modeling', shadows: 'Soft gradient, one side falling to shadow' },
    Mysterious: { setup: 'Chiaroscuro with single source', key: 'Hard light from dramatic angle', shadows: 'Deep, crushed blacks' },
  }

  const moodToColor: Record<string, string> = {
    Romantic: 'Warm honey tones, soft peachy highlights, Portra-inspired skin',
    Playful: 'Bright and saturated, lifted shadows, clean whites',
    Confident: 'Rich contrast, warm midtones, editorial polish',
    Intimate: 'Muted palette, creamy highlights, subtle warmth',
    Mysterious: 'Desaturated with selective color, deep shadows, cinematic',
  }

  const lighting = moodToLighting[theme.mood] || moodToLighting.Confident
  const colorGrade = moodToColor[theme.mood] || moodToColor.Confident

  return {
    style: `${theme.aesthetic} ${concept} portrait — ${theme.mood.toLowerCase()} atmosphere with ${theme.key_elements.slice(0, 2).join(', ')}, scroll-stopping visual hook`,
    pose: {
      framing: 'Three-quarter portrait with negative space',
      body_position: 'Weight shifted, natural asymmetry',
      arms: 'One hand near face or relaxed gesture',
      posture: 'Elongated neck, shoulders back',
      expression: { facial: 'Soft confidence, caught mid-moment', eyes: 'Engaged with gentle smize', mouth: 'Relaxed, barely-there smile' },
    },
    lighting: {
      setup: lighting.setup,
      key_light: lighting.key,
      fill_light: 'Subtle ambient fill',
      shadows: lighting.shadows,
      mood: `${theme.mood} and inviting`,
    },
    set_design: {
      backdrop: `CRITICAL: ${theme.key_elements[0] || 'Textured backdrop'} with depth and atmosphere`,
      surface: 'Contextual to scene',
      props: theme.key_elements.slice(1, 3),
      atmosphere: `${theme.aesthetic} with tactile, aspirational quality`,
    },
    outfit: {
      main: 'Elevated, concept-appropriate attire',
      accessories: 'Layered gold jewelry, intentional details',
      styling: `${theme.aesthetic} with fashion-forward edge`,
    },
    camera: {
      lens: '85mm f/1.4 for creamy bokeh',
      aperture: 'f/2 for subject isolation',
      angle: 'Slightly above eye level',
      focus: 'Tack sharp on nearest eye',
    },
    hairstyle: {
      style: 'Effortlessly styled with movement',
      parting: 'Soft, natural parting',
      details: 'Texture and dimension',
      finish: 'Healthy shine, lived-in',
    },
    makeup: {
      style: 'Elevated natural, skin-focused',
      skin: 'Dewy finish, natural skin texture visible with subtle pores, minor imperfections preserved',
      eyes: 'Soft definition, groomed brows',
      lips: 'Your-lips-but-better nude',
    },
    effects: {
      color_grade: colorGrade,
      grain: 'Fine film grain for texture',
    },
  }
}

export async function generatePrompts(
  concept: string,
  count: number,
  researchBrief: ResearchBrief
): Promise<{ prompts: PromptOutput[]; varietyScore: VarietyScore }> {
  const client = await getOpenAI()
  const prompts: PromptOutput[] = []
  const subThemesToUse = distributeSubThemes(researchBrief.sub_themes, count)

  const batchSize = 2 // Reduced for detailed prompts
  for (let i = 0; i < count; i += batchSize) {
    const batchThemes = subThemesToUse.slice(i, Math.min(i + batchSize, count))
    const batchPrompts = await generatePromptBatch(client, concept, batchThemes, researchBrief, i)
    prompts.push(...batchPrompts)
  }

  const varietyScore = calculateVarietyScore(prompts)

  return { prompts: prompts.slice(0, count), varietyScore }
}

function distributeSubThemes(subThemes: SubTheme[], count: number): SubTheme[] {
  const result: SubTheme[] = []
  let idx = 0
  for (let i = 0; i < count; i++) {
    result.push(subThemes[idx % subThemes.length])
    idx++
  }
  return result
}

async function generatePromptBatch(
  client: OpenAI,
  concept: string,
  themes: SubTheme[],
  research: ResearchBrief,
  startIndex: number
): Promise<PromptOutput[]> {
  const fallbackPrompts = themes.map((theme) => createFallbackPrompt(theme, concept))

  try {
    const themeDescriptions = themes
      .map((t, i) => `${startIndex + i + 1}. "${t.name}" (${t.aesthetic}, ${t.mood}) - Key elements: ${t.key_elements.join(', ')}`)
      .join('\n')

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'developer',
          content: `You are a Creative Director and prompt engineer for Clone AI's image-to-image model. You have deep knowledge of photography, fashion, film, and visual culture. You create prompts that are scroll-stopping, Instagram/Pinterest-worthy, and visually sophisticated.

${CREATIVE_DIRECTOR_KNOWLEDGE}

## CRITICAL RULES - NON-NEGOTIABLE

### Language & Format
1. All prompts in English - technical direction documents, not creative writing
2. Aspect ratio/resolution is NEVER in the prompt - set in generation settings
3. No literary embellishment - be technical and specific

### Physical Appearance & Identity - BANNED
4. NEVER mention: body type, weight, beauty, skinny, curvy, slim, fit, attractive, perfect body
5. NEVER mention: age descriptors (young, mature, youthful), skin color, ethnicity, race
6. NEVER mention hair COLOR - only style/texture (comes from reference photo)
7. NO gender/appearance sections in JSON

### Pose & Expression
8. POSES MUST BE NATURAL - Stable, grounded, effortless. Weight clearly supported, comfortable and sustainable
9. EVERY LIMB explicitly defined - hands, arms, legs, head position
10. EXPRESSIONS ARE PRECISE - Never "smiling" or "happy". Use: "subtle smirk, corner of mouth lifted", "genuine open laugh, eyes crinkled"

### Outfit & Makeup - FULL DETAIL REQUIRED
11. OUTFIT: Never "casual wear" or "dress". Specify: fabric type, color, style/cut, fit, length, details
12. MAKEUP: Specify tone/color, intensity, texture (matte/glossy/dewy), regional application

### Lighting - MOST CRITICAL
13. LIGHTING ALWAYS COMPLETE - Key, fill, rim, ambient + mood
14. Light direction from shadow analysis: shadows on RIGHT = light from LEFT
15. Shadow behavior specified: "deep dramatic with hard falloff" or "soft graduated minimal contrast"

### Imperfections & Realism
16. DELIBERATELY include imperfections: "Natural skin texture visible, subtle pores, minor imperfections preserved"
17. FORBIDDEN: Plastic look, airbrushed skin, CGI perfection, "flawless" skin
18. Target: Photorealism ("shot on real camera") not sterility

### Banned Words
19. BANNED: gorgeous, perfect, flawless, stunning, breathtaking, beautiful (minimize)
20. Replace vague with specific: "nice lighting" → "soft diffused key from upper-left"

### Core Philosophy
21. Prompt = Technical direction document for photographer/stylist/set designer
22. Use "CRITICAL:" prefix for the ONE hero element
23. If you want something, SAY IT EXPLICITLY - undefined = left to chance
24. Goal: 8/10 outputs match the brief, not 1 lucky shot out of 10`,
        },
        {
          role: 'user',
          content: `Generate ${themes.length} scroll-stopping prompts for "${concept}".

RESEARCH CONTEXT:
- Technical: ${research.technical_recommendations.lens_options.slice(0, 2).join('; ')} | ${research.technical_recommendations.lighting_styles.slice(0, 2).join('; ')}
- Colors: ${research.trend_findings.color_palettes.join(', ')}
- Outfits: ${research.trend_findings.outfit_trends.slice(0, 3).join(', ')}
- Sets: ${research.trend_findings.set_design_trends.slice(0, 3).join(', ')}

SUB-THEMES:
${themeDescriptions}

FOR EACH PROMPT, WRITE AS TECHNICAL DIRECTION:
1. IDENTIFY THE HOOK - The ONE scroll-stopping element (mark with "CRITICAL:")
2. STYLE FIELD (30-50 words) - Technical vision, not poetic prose
3. EVERY FIELD NEEDS FULL DETAIL - Complete sentences, not brief phrases
4. USE SPECIFIC VOCABULARY - Exact terms from knowledge base
5. DESCRIBE LIKE A BRIEF - For photographer, stylist, set designer

DETAIL REQUIREMENTS:
- pose.framing: Composition reasoning (30+ words)
- pose.body_position: Weight distribution, angles, limb positions (30+ words)
- pose.expression: PRECISE emotions ("subtle smirk" not "happy")
- lighting.setup: Full scenario with sources, ratios, color temps (40+ words)
- lighting.shadows: Direction and behavior ("shadows on right = light from left")
- set_design.backdrop: Layered foreground/midground/background (50+ words)
- outfit.main: Fabric type, color, cut, fit, length, details (30+ words)
- makeup.skin: MUST include "natural texture, subtle pores visible"

BANNED:
- Body descriptors (curvy, slim, fit, attractive)
- Age/ethnicity/skin color
- Hair COLOR (style only)
- Vague words: gorgeous, perfect, flawless, stunning, beautiful
- Generic outfit: "casual wear", "nice dress"
- Generic expression: "smiling", "happy"

Return JSON:
{
  "prompts": [
    ${PROMPT_SCHEMA_EXAMPLE}
  ]
}

Generate exactly ${themes.length} visually distinct, richly detailed prompts.`,
        },
      ],
      temperature: 0.85,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) return fallbackPrompts

    const parsed = safeJsonParse<{ prompts?: PromptOutput[] }>(content, { prompts: fallbackPrompts })
    return parsed.prompts ?? fallbackPrompts
  } catch (error) {
    console.error('[Prompts] Batch generation failed:', error)
    return fallbackPrompts
  }
}

export function validateVariety(prompts: PromptOutput[]): VarietyScore {
  return calculateVarietyScore(prompts)
}

export function validateAllPrompts(prompts: PromptOutput[]): {
  allValid: boolean
  results: Array<{ index: number; valid: boolean; errors: string[] }>
} {
  const results = prompts.map((prompt, index) => {
    const { valid, errors } = validatePrompt(prompt)
    return { index, valid, errors }
  })

  return {
    allValid: results.every((r) => r.valid),
    results,
  }
}

export async function textToPrompt(textDescription: string): Promise<PromptOutput> {
  const openai = await getOpenAI()

  console.log(`[TextToPrompt] Converting: "${textDescription.substring(0, 50)}..."`)

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a Creative Director converting descriptions into technical image prompts.

${CREATIVE_DIRECTOR_KNOWLEDGE}

## NON-NEGOTIABLE RULES

### BANNED - Physical Appearance
- NEVER: body type, weight, beauty, skinny, curvy, slim, fit, attractive, perfect body
- NEVER: age descriptors (young, mature, youthful), skin color, ethnicity, race
- NEVER: hair COLOR - only style/texture (comes from reference photo)
- BANNED WORDS: gorgeous, perfect, flawless, stunning, breathtaking

### REQUIRED - Detail Levels
- OUTFIT: Fabric type, color, style/cut, fit, length, details (never "casual wear")
- MAKEUP: Tone, intensity, texture (matte/glossy/dewy), regional application
- EXPRESSION: Precise (never just "smiling") → "subtle smirk, corner of mouth lifted"
- POSE: Every limb defined, weight distribution, head angle
- LIGHTING: Full setup with key, fill, shadows, direction, mood

### REALISM
- INCLUDE imperfections: "Natural skin texture, subtle pores, minor imperfections"
- FORBIDDEN: Plastic look, airbrushed, CGI perfection, "flawless" skin

### FORMAT
- "style" field: 30-50 words, technical and visual
- Mark ONE hero element with "CRITICAL:" prefix
- Prompt = Technical direction document, not creative writing

Output JSON with this structure:
${PROMPT_SCHEMA_EXAMPLE}`,
      },
      {
        role: 'user',
        content: `Convert this description into a TECHNICAL JSON prompt:

"${textDescription}"

REQUIREMENTS:
- style: 30-50 words, technical vision (not poetic)
- Outfit: fabric, color, cut, fit, length, details
- Makeup: tone, intensity, texture, regional application
- Expression: precise emotional state, not generic
- Skin: include "natural texture, subtle pores visible"
- Mark ONE element with "CRITICAL:"
- This is a brief for photographer/stylist, not creative writing

Return only the JSON object.`,
      },
    ],
    temperature: 0.75,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  const parsed = safeJsonParse<PromptOutput>(content, {
    style: textDescription,
    pose: { framing: '', body_position: '', arms: '', posture: '', expression: { facial: '', eyes: '', mouth: '' } },
    lighting: { setup: '', key_light: '', fill_light: '', shadows: '', mood: '' },
    set_design: { backdrop: '', surface: '', props: [], atmosphere: '' },
    outfit: { main: '', accessories: '', styling: '' },
    camera: { lens: '', aperture: '', angle: '', focus: '' },
    hairstyle: { style: '', parting: '', details: '', finish: '' },
    makeup: { style: '', skin: '', eyes: '', lips: '' },
    effects: { color_grade: '', grain: '' },
  })

  console.log(`[TextToPrompt] Generated style: "${parsed.style?.substring(0, 50)}..."`)

  return parsed
}
