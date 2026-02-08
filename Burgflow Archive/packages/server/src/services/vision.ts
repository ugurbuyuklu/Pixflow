import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

export interface AnalyzedPrompt {
  style: string
  pose: {
    framing: string
    body_position: string
    arms: string
    posture: string
    expression: {
      facial: string
      eyes: string
      mouth: string
    }
  }
  lighting: {
    setup: string
    key_light: string
    fill_light: string
    shadows: string
    mood: string
  }
  set_design: {
    backdrop: string
    surface: string
    props: string[]
    atmosphere: string
  }
  outfit: {
    main: string
    accessories: string
    styling: string
  }
  camera: {
    lens: string
    aperture: string
    angle: string
    focus: string
  }
  hairstyle: {
    style: string
    parting: string
    details: string
    finish: string
  }
  makeup: {
    style: string
    skin: string
    eyes: string
    lips: string
  }
  effects: {
    color_grade: string
    contrast: string
    grain: string
  }
}

async function imageToBase64(imagePath: string): Promise<string> {
  const buffer = await fs.readFile(imagePath)
  const base64 = buffer.toString('base64')
  const ext = path.extname(imagePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mimeType};base64,${base64}`
}

const ANALYSIS_PROMPT = `You are an expert photography analyst. Analyze this image and generate a TECHNICAL DIRECTION document that could recreate a similar photo.

## NON-NEGOTIABLE RULES

### Physical Appearance - BANNED FROM ALL PROMPTS
- NEVER describe: body type, weight, beauty, skinny, curvy, slim, fit, attractive
- NEVER describe: age (young, mature, youthful), skin color, ethnicity, race
- NEVER describe hair COLOR - only style/texture ("long waves" not "blonde waves")
- NO beauty-contest language: gorgeous, perfect, flawless, stunning, breathtaking

### Language & Format
- Prompts are TECHNICAL DIRECTION, not creative writing
- No literary embellishment: "breathtaking dance of light" → "directional key from camera-left"
- Aspect ratio/resolution is NEVER in the prompt

### Pose & Expression - FULL DETAIL
- Describe EVERY visible limb: hands (where, doing what), arms (angle, tension), legs (weight distribution)
- Expression must be PRECISE: Never "smiling" or "happy"
  ✓ "subtle smirk, corner of mouth lifted"
  ✓ "genuine open laugh, eyes crinkled"
  ✓ "neutral gaze with soft intensity"

### Outfit - NEVER GENERIC
- BANNED: "casual wear", "loungewear", "nice dress", "stylish outfit"
- REQUIRED: Fabric type, color, style/cut, fit (loose/tailored/fitted), length, details
  ✓ "Black silk slip dress with thin spaghetti straps, midi length, V-neckline, fabric draping loosely"

### Makeup - DETAILED
- REQUIRED: Tone/color, intensity (minimal/moderate/dramatic), texture (matte/glossy/dewy), regional application
  ✓ "Matte skin with subtle bronzer on cheekbones, soft brown smoky eye, nude matte lip"

### Lighting - MOST CRITICAL SECTION
- ALWAYS analyze shadows to determine light direction:
  → Shadows on RIGHT = Light from LEFT
  → Shadows on LEFT = Light from RIGHT
  → Shadows below = Light from above
- Describe: Key light (direction, quality), Fill (ratio), Shadows (behavior), Mood

### Imperfections & Realism
- INCLUDE: "Natural skin texture visible, subtle pores, minor imperfections preserved"
- FORBIDDEN: Plastic look, airbrushed skin, CGI perfection, "flawless" skin
- Target: "Shot on real camera by real photographer" not "rendered in 3D"

### Film Aesthetic
- B&W REQUIRES: grain type, contrast level, tonal range
  ✓ "True B&W, Kodak Tri-X 400 emulation, medium film grain, high contrast with rich blacks"
- ALWAYS specify contrast: low (flat/muted), medium (balanced), high (punchy blacks/whites)

Return a JSON object with this EXACT structure:
{
  "style": "CRITICAL: [most unique element]. 30-50 word vivid description of overall aesthetic, mood, and visual hook",
  "pose": {
    "framing": "Precise framing with composition - e.g., 'Tight medium shot from chest up, subject in right third, negative space left'",
    "body_position": "Exact position with weight/angle - e.g., 'Seated with legs tucked under, torso twisted 30° toward camera, weight on left hip'",
    "arms": "Specific arm placement - e.g., 'Left arm raised running fingers through hair, right hand resting on collarbone'",
    "posture": "Detailed posture with movement cues - e.g., 'Spine arched slightly back, shoulders dropped and relaxed, chin tilted up 15°'",
    "expression": {
      "facial": "Nuanced emotion - e.g., 'Sultry confidence with hint of playfulness, brow slightly raised'",
      "eyes": "Exact eye direction - e.g., 'Heavy-lidded gaze directly into lens, slight smize'",
      "mouth": "Precise mouth position - e.g., 'Lips softly parted, corners lifted in subtle smirk'"
    }
  },
  "lighting": {
    "setup": "Full lighting scenario - e.g., 'Dramatic chiaroscuro with single hard source creating strong contrast'",
    "key_light": "ANALYZE SHADOWS FIRST: If shadows fall on RIGHT of face, light is from LEFT. EXACT direction - e.g., 'Key light from camera-LEFT at 45° angle (determined by shadows falling on right side of face and neck)'",
    "fill_light": "Secondary source with ratio - e.g., 'Minimal fill from ambient, approximately 4:1 ratio to key'",
    "shadows": "Shadow placement PROVES light direction - e.g., 'Shadows on camera-right side of face and under chin pointing right = light from upper-left'",
    "mood": "Emotional quality - e.g., 'Mysterious and seductive, film noir influence'"
  },
  "set_design": {
    "backdrop": "Detailed background description - e.g., 'CRITICAL: Rumpled white bedsheets creating soft organic textures, pillows visible in soft focus'",
    "surface": "What subject interacts with - e.g., 'Seated on edge of unmade bed, white linen sheets'",
    "props": ["Specific visible props - be exact about what you see"],
    "atmosphere": "Environmental mood - e.g., 'Intimate bedroom morning, natural and unposed'"
  },
  "outfit": {
    "main": "SPECIFIC garment details. If outfit is standout element, use CRITICAL - e.g., 'CRITICAL: Black lace bodysuit with scalloped edges, sheer panels at sides, thin straps' or 'Cream silk camisole with delicate lace trim at neckline'",
    "accessories": "All visible accessories - e.g., 'Delicate gold chain necklace, small hoop earrings, thin rings on multiple fingers'",
    "styling": "Overall fashion direction - e.g., 'Intimate boudoir, effortlessly sensual, expensive simplicity'"
  },
  "camera": {
    "lens": "Estimated lens with reasoning - e.g., '85mm f/1.4, classic portrait compression with creamy bokeh separation'",
    "aperture": "Depth of field observation - e.g., 'Wide open around f/1.8, very shallow DOF with only eyes in focus'",
    "angle": "Exact camera position - e.g., 'Slightly above eye level, camera tilted down 10°, shooting from camera-left of center'",
    "focus": "Focus technique - e.g., 'Critical focus on nearest eye, gradual falloff across face, background completely soft'"
  },
  "hairstyle": {
    "style": "Shape and texture WITHOUT color - e.g., 'Tousled bedhead waves, messy and undone, volume at roots'",
    "parting": "Parting detail - e.g., 'No defined part, hair swept back and falling naturally'",
    "details": "Styling elements - e.g., 'Pieces falling across face, tucked behind one ear, natural movement'",
    "finish": "Hair quality - e.g., 'Natural texture, slightly matte, lived-in and touchable'"
  },
  "makeup": {
    "style": "Overall approach - e.g., 'Minimal fresh-faced with subtle enhancement' or 'Bold editorial with defined features'",
    "skin": "Skin with NATURAL TEXTURE - e.g., 'Natural texture visible with subtle pores, minor imperfections preserved, slight dewiness on high points - NOT airbrushed or plastic'",
    "eyes": "Eye makeup detail - e.g., 'Bare lids, defined lashes with subtle mascara, groomed natural brows'",
    "lips": "Lip detail - e.g., 'Natural lip color, slightly glossy, no visible product'"
  },
  "effects": {
    "color_grade": "Color treatment - e.g., 'Desaturated with warm shadows, lifted blacks, soft highlight rolloff' or 'True B&W with rich midtones'",
    "contrast": "Contrast level - e.g., 'High contrast with deep blacks and bright highlights' or 'Medium contrast, balanced tones' or 'Low contrast, flat and muted for dreamy feel'",
    "grain": "IMPORTANT: If B&W or film look, add grain - e.g., 'Medium film grain consistent with Tri-X pushed one stop' or 'Fine digital grain added for texture' or 'Clean digital, no grain'"
  }
}

Return ONLY the JSON object, no other text.`

export async function analyzeImage(imagePath: string): Promise<AnalyzedPrompt> {
  const openai = getOpenAI()
  const imageUrl = await imageToBase64(imagePath)

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: ANALYSIS_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0.3,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from vision model')
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from response')
  }

  const parsed = JSON.parse(jsonMatch[0]) as AnalyzedPrompt
  return parsed
}
