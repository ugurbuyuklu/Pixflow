import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import ffmpegStatic from 'ffmpeg-static'
import multer from 'multer'
import { REFERENCE_IDENTITY_SOURCE_CRITICAL } from '../../constants/referencePrompts.js'
import type { AuthRequest } from '../middleware/auth.js'
import { downloadImage, generateImage } from '../services/fal.js'
import { downloadKlingVideo, generateKlingTransitionVideo } from '../services/kling.js'
import { createPipelineSpan } from '../services/telemetry.js'
import { predictGenderHint } from '../services/vision.js'
import { sendError, sendSuccess } from '../utils/http.js'
import { buildJobOutputFileName, createJobOutputDir } from '../utils/outputPaths.js'

interface LifetimeRouterConfig {
  projectRoot: string
}

const lifetimeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many lifetime generation requests, please wait before trying again', 'RATE_LIMITED')
  },
})

const TARGET_AGES = [7, 12, 18, 25, 35, 45, 55, 65, 75]
const BACKGROUND_MODES = ['white_bg', 'natural_bg'] as const
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_INPUT_IMAGE_BYTES = 10 * 1024 * 1024
const JOB_RETENTION_MS = 2 * 60 * 60 * 1000
const DEFAULT_FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg'
const KLING_SEGMENT_DURATION_SEC = 5
const FINAL_VIDEO_MIN_DURATION_SEC = 8
const FINAL_VIDEO_MAX_DURATION_SEC = 45
const FINAL_VIDEO_DEFAULT_DURATION_SEC = 12
const FINAL_VIDEO_FPS = 30
const TRANSITION_BATCH_CONCURRENCY = 4

type LifetimeBackgroundMode = (typeof BACKGROUND_MODES)[number]
type LifetimeGenderHint = 'auto' | 'male' | 'female'
type LifetimeNarrativeTrack =
  | 'doctor'
  | 'engineer'
  | 'scientist'
  | 'athlete'
  | 'artist'
  | 'musician'
  | 'architect'
  | 'chef'
  | 'pilot'
  | 'lawyer'
  | 'teacher'
  | 'veterinarian'
  | 'astronaut'
  | 'fashion_designer'
  | 'filmmaker'
  | 'writer'
  | 'firefighter'
  | 'marine_biologist'
  | 'business_founder'
  | 'dancer'
  | 'photographer'
  | 'game_designer'
  | 'robotics_engineer'
  | 'surgeon'
  | 'diplomat'
  | 'environmental_scientist'
  | 'race_car_driver'
  | 'detective'
  | 'opera_singer'
  | 'archaeologist'

const NARRATIVE_TRACKS: LifetimeNarrativeTrack[] = [
  'doctor',
  'engineer',
  'scientist',
  'athlete',
  'artist',
  'musician',
  'architect',
  'chef',
  'pilot',
  'lawyer',
  'teacher',
  'veterinarian',
  'astronaut',
  'fashion_designer',
  'filmmaker',
  'writer',
  'firefighter',
  'marine_biologist',
  'business_founder',
  'dancer',
  'photographer',
  'game_designer',
  'robotics_engineer',
  'surgeon',
  'diplomat',
  'environmental_scientist',
  'race_car_driver',
  'detective',
  'opera_singer',
  'archaeologist',
]
type LifetimeRunJobStatus = 'queued' | 'running' | 'completed' | 'failed'

interface LifetimeFrameRecord {
  age: number
  imagePath: string
  imageUrl: string
  prompt: string
}

interface LifetimeTransitionRecord {
  fromAge: number
  toAge: number
  videoPath: string
  videoUrl: string
  prompt: string
}

interface LifetimeTimelineFrame {
  age: number
  imagePath: string
  imageUrl: string
}

interface LifetimeSessionManifest {
  sessionId: string
  createdAt: string
  updatedAt: string
  outputDir: string
  outputDirUrl: string
  originalReferencePath: string
  sourceFramePath: string
  sourceFrameUrl: string
  backgroundMode: LifetimeBackgroundMode
  genderHint: LifetimeGenderHint
  narrativeTrack?: LifetimeNarrativeTrack
  ages: number[]
  frames: LifetimeFrameRecord[]
  transitions: LifetimeTransitionRecord[]
  finalVideoPath?: string
  finalVideoUrl?: string
  finalVideoDurationSec?: number
}

interface LifetimeRunJob {
  jobId: string
  status: LifetimeRunJobStatus
  startedAt: string
  updatedAt: string
  backgroundMode: LifetimeBackgroundMode
  progress: {
    total: number
    completed: number
    currentAge: number | null
    message: string
  }
  sourceFrameUrl: string
  frames: Array<{ age: number; imageUrl: string }>
  sessionId: string
  error: string
  earlyTransitionsStarted: number
  earlyTransitionsInFlight: number
  earlyTransitionStartedKeys: Set<string>
  earlyTransitions: Map<string, LifetimeTransitionRecord>
  earlyTransitionPromises: Promise<void>[]
}

const lifetimeRunJobs = new Map<string, LifetimeRunJob>()

interface LifetimeVideoJob {
  jobId: string
  status: LifetimeRunJobStatus
  startedAt: string
  updatedAt: string
  sessionId: string
  progress: {
    total: number
    completed: number
    currentStep: string
    message: string
  }
  transitions: Array<{ fromAge: number; toAge: number; videoUrl: string }>
  assemblyStage: 'idle' | 'editing' | 'adjusting_time' | 'finalizing' | 'done'
  finalVideoUrl: string
  finalVideoDurationSec: number
  error: string
}

const lifetimeVideoJobs = new Map<string, LifetimeVideoJob>()

function parseBackgroundMode(value: unknown): LifetimeBackgroundMode {
  if (typeof value === 'string' && BACKGROUND_MODES.includes(value as LifetimeBackgroundMode)) {
    return value as LifetimeBackgroundMode
  }
  return 'white_bg'
}

function parseSessionId(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : ''
}

function parseTargetAge(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isInteger(parsed)) return parsed
  }
  return Number.NaN
}

function parseTargetDurationSec(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(FINAL_VIDEO_MIN_DURATION_SEC, Math.min(FINAL_VIDEO_MAX_DURATION_SEC, Math.round(value)))
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return Math.max(FINAL_VIDEO_MIN_DURATION_SEC, Math.min(FINAL_VIDEO_MAX_DURATION_SEC, Math.round(parsed)))
    }
  }
  return FINAL_VIDEO_DEFAULT_DURATION_SEC
}

function parseGenderHint(value: unknown): LifetimeGenderHint {
  if (typeof value !== 'string') return 'auto'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'male' || normalized === 'female') return normalized
  return 'auto'
}

function extractBabyImageUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function ensureHttpUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Image URL must use http or https')
  }
  return parsed.toString()
}

function extensionForMimeType(mimeType: string): '.jpg' | '.png' | '.webp' {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  return '.jpg'
}

function toPublicOutputPath(outputsDir: string, absolutePath: string): string {
  return `/outputs/${path.relative(outputsDir, absolutePath).split(path.sep).join('/')}`
}

function manifestFilePath(outputDir: string): string {
  return path.join(outputDir, 'lifetime_manifest.json')
}

function makeSessionId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `lifetime_${timestamp}_${Math.random().toString(36).slice(2, 8)}`
}

function makeRunJobId(): string {
  return `lrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function makeVideoJobId(): string {
  return `lvid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createVideoJob(sessionId: string): LifetimeVideoJob {
  const nowIso = new Date().toISOString()
  return {
    jobId: makeVideoJobId(),
    status: 'queued',
    startedAt: nowIso,
    updatedAt: nowIso,
    sessionId,
    progress: { total: 10, completed: 0, currentStep: '', message: 'Queued' },
    transitions: [],
    assemblyStage: 'idle',
    finalVideoUrl: '',
    finalVideoDurationSec: 0,
    error: '',
  }
}

function updateVideoJob(jobId: string, updater: (job: LifetimeVideoJob) => void): void {
  const current = lifetimeVideoJobs.get(jobId)
  if (!current) return
  updater(current)
  current.updatedAt = new Date().toISOString()
  lifetimeVideoJobs.set(jobId, current)
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  let failed = false
  const run = async () => {
    while (!failed && next < items.length) {
      const idx = next++
      try {
        await worker(items[idx], idx)
      } catch (err) {
        failed = true
        throw err
      }
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, () => run()))
  const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (firstError) throw firstError.reason
}

function getLifetimeSessionOutputLayout(outputsDir: string, sessionId: string) {
  return createJobOutputDir(outputsDir, 'lifetime', 'timeline', sessionId)
}

function makeFrameOutputPath(outputDir: string, sessionId: string, age: number): string {
  return path.join(outputDir, buildJobOutputFileName(`frame-age-${String(age).padStart(2, '0')}`, sessionId, 'jpg'))
}

function makeSourceFrameOutputPath(outputDir: string, sessionId: string): string {
  return path.join(outputDir, buildJobOutputFileName('frame-age-00', sessionId, 'jpg'))
}

function makeTransitionOutputPath(outputDir: string, sessionId: string, fromAge: number, toAge: number): string {
  return path.join(
    outputDir,
    buildJobOutputFileName(
      `transition-${String(fromAge).padStart(2, '0')}-to-${String(toAge).padStart(2, '0')}`,
      sessionId,
      'mp4',
    ),
  )
}

function makeFinalVideoOutputPath(outputDir: string, sessionId: string): string {
  return path.join(outputDir, buildJobOutputFileName('final', sessionId, 'mp4'))
}

async function saveManifest(manifest: LifetimeSessionManifest): Promise<void> {
  const nextManifest: LifetimeSessionManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
  }
  await fs.writeFile(manifestFilePath(nextManifest.outputDir), JSON.stringify(nextManifest, null, 2), 'utf8')
}

async function loadManifest(outputsDir: string, sessionId: string): Promise<LifetimeSessionManifest> {
  const safeSessionId = parseSessionId(sessionId)
  if (!safeSessionId) {
    throw new Error('Invalid session id')
  }

  const layout = getLifetimeSessionOutputLayout(outputsDir, safeSessionId)
  const candidateDirs = [layout.outputDir, path.join(outputsDir, safeSessionId)]
  let manifest: LifetimeSessionManifest | null = null
  let outputDir = layout.outputDir

  for (const candidate of candidateDirs) {
    try {
      const raw = await fs.readFile(manifestFilePath(candidate), 'utf8')
      manifest = JSON.parse(raw) as LifetimeSessionManifest
      outputDir = candidate
      break
    } catch {
      // try next
    }
  }
  if (!manifest) {
    throw new Error('Session manifest not found')
  }
  if (!manifest || manifest.sessionId !== safeSessionId) {
    throw new Error('Invalid session manifest')
  }
  manifest.outputDir = manifest.outputDir || outputDir
  manifest.outputDirUrl = manifest.outputDirUrl || toPublicOutputPath(outputsDir, manifest.outputDir)
  if (!manifest.sourceFramePath) {
    manifest.sourceFramePath = manifest.originalReferencePath
  }
  if (!manifest.sourceFrameUrl) {
    manifest.sourceFrameUrl = toPublicOutputPath(outputsDir, manifest.sourceFramePath)
  }
  if (manifest.genderHint !== 'male' && manifest.genderHint !== 'female' && manifest.genderHint !== 'auto') {
    manifest.genderHint = 'auto'
  }
  if (typeof manifest.finalVideoPath !== 'string') {
    manifest.finalVideoPath = ''
  }
  if (typeof manifest.finalVideoUrl !== 'string') {
    manifest.finalVideoUrl = ''
  }
  if (typeof manifest.finalVideoDurationSec !== 'number') {
    manifest.finalVideoDurationSec = 0
  }
  if (!manifest.narrativeTrack && manifest.backgroundMode === 'natural_bg') {
    manifest.narrativeTrack = NARRATIVE_TRACKS[Math.floor(Math.random() * NARRATIVE_TRACKS.length)]
    await saveManifest(manifest)
  }
  return manifest
}

async function removeTransitionFiles(transitions: LifetimeTransitionRecord[]): Promise<void> {
  await Promise.all(transitions.map((transition) => fs.unlink(transition.videoPath).catch(() => {})))
}

async function removeFinalVideoFile(manifest: LifetimeSessionManifest): Promise<void> {
  if (!manifest.finalVideoPath) return
  await fs.unlink(manifest.finalVideoPath).catch(() => {})
}

async function removeFrameFiles(frames: LifetimeFrameRecord[]): Promise<void> {
  await Promise.all(frames.map((frame) => fs.unlink(frame.imagePath).catch(() => {})))
}

function runFfmpeg(args: string[]): Promise<void> {
  const configured = process.env.FFMPEG_PATH?.trim()
  const candidates = [configured, DEFAULT_FFMPEG_PATH, ffmpegStatic || undefined, 'ffmpeg']
    .filter((candidate): candidate is string => Boolean(candidate))
    .filter((candidate, index, list) => list.indexOf(candidate) === index)

  const runWithBinary = (binary: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const proc = spawn(binary, args)
      let stderr = ''
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`ffmpeg failed (binary=${binary}, code ${code}): ${stderr || 'unknown error'}`))
        }
      })
      proc.on('error', (error) => {
        reject(new Error(`ffmpeg spawn failed (binary=${binary}): ${error.message}`))
      })
    })

  return candidates
    .reduce<Promise<void>>(
      (chain, binary) => {
        return chain.catch(() => runWithBinary(binary))
      },
      Promise.reject(new Error('ffmpeg execution not started')),
    )
    .catch((error) => {
      throw error instanceof Error ? error : new Error('ffmpeg execution failed')
    })
}

async function buildFinalLifetimeVideo(params: {
  outputDir: string
  outputsDir: string
  sessionId: string
  transitionVideoPaths: string[]
  targetDurationSec: number
}): Promise<{ videoPath: string; videoUrl: string }> {
  const { outputDir, outputsDir, sessionId, transitionVideoPaths, targetDurationSec } = params
  if (transitionVideoPaths.length === 0) {
    throw new Error('No transition videos to merge')
  }

  const outputPath = makeFinalVideoOutputPath(outputDir, sessionId)
  const totalDurationSec = transitionVideoPaths.length * KLING_SEGMENT_DURATION_SEC
  const speedFactor = Math.max(1, totalDurationSec / targetDurationSec)
  const speedExpr = Number(speedFactor.toFixed(6))

  const args: string[] = ['-y']
  for (const transitionPath of transitionVideoPaths) {
    args.push('-i', transitionPath)
  }
  const TARGET_W = 1080
  const TARGET_H = 1920
  const scaleParts = transitionVideoPaths.map(
    (_v, i) =>
      `[${i}:v:0]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2,setsar=1[s${i}]`,
  )
  const scaledInputs = transitionVideoPaths.map((_v, i) => `[s${i}]`).join('')
  const filterGraph = [
    ...scaleParts,
    `${scaledInputs}concat=n=${transitionVideoPaths.length}:v=1:a=0,fps=${FINAL_VIDEO_FPS},setpts=PTS/${speedExpr}[v]`,
  ].join(';')
  args.push(
    '-filter_complex',
    filterGraph,
    '-map',
    '[v]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  )

  await runFfmpeg(args)

  return {
    videoPath: outputPath,
    videoUrl: toPublicOutputPath(outputsDir, outputPath),
  }
}

// prettier-ignore
const NARRATIVE_SCENES: Record<LifetimeNarrativeTrack, Record<number, string>> = {
  doctor: {
    7: 'Bright elementary school classroom with colorful educational posters and small wooden desks. Child sitting at a desk with a toy stethoscope peeking from a backpack, wearing a neat school uniform. Warm morning sunlight through tall windows.',
    12: 'Middle school science lab with microscopes, specimen jars, and a periodic table on the wall. Pre-teen in a school lab coat examining something under a microscope, science fair ribbon visible on the table. Focused fluorescent lighting.',
    18: 'University lecture amphitheater with tiered seating and a large anatomy diagram projected on screen. Late teen in casual college attire sitting in the front row with a thick biology textbook. Ambient lecture-hall lighting.',
    25: 'Hospital corridor with clean white walls, medical equipment, and a nurses station in soft focus behind. Young adult in medical scrubs and a white coat with a stethoscope around the neck, ID badge visible. Bright clinical lighting.',
    35: 'Modern hospital consultation room with a computer screen showing medical imaging, family photos on the desk. Doctor in a crisp white coat reviewing patient charts, confident posture. Balanced warm and clinical lighting.',
    45: 'Spacious office in a medical center with diplomas on the wall, a large window overlooking a city skyline. Mid-career physician in professional attire at a polished desk, reading glasses resting nearby. Late afternoon golden light.',
    55: 'Medical conference stage podium with a presentation screen and an audience in soft-focus bokeh behind. Distinguished physician in formal professional wear at a podium, giving a keynote address. Warm stage spotlights.',
    65: 'University medical school faculty lounge with bookshelves, leather chairs, and framed research publications. Senior physician-professor in a tweed blazer and open-collar shirt, relaxed and wise. Soft warm interior lighting.',
    75: 'Sunlit garden terrace of a beautiful home with medical memoirs and a cup of tea on the table. Retired elder in comfortable elegant clothing, sitting peacefully surrounded by greenery. Golden hour natural light.',
  },
  engineer: {
    7: 'Colorful elementary school classroom with building blocks, a small robot toy, and math posters on the wall. Child at a desk assembling a simple LEGO structure with focused curiosity. Bright cheerful daylight.',
    12: 'Home garage workshop with circuit boards, tools, and a half-built drone on the bench. Pre-teen wearing safety goggles on forehead, tinkering with a small electronics project. Warm overhead workshop lighting.',
    18: 'University engineering lab with 3D printers, computer workstations, and technical blueprints on the wall. Late teen in a university hoodie working at a computer with CAD software on screen. Cool blue-tinted monitor glow.',
    25: 'Modern tech startup office with standing desks, whiteboards full of diagrams, and large monitors. Young professional in smart-casual tech attire at a workstation, a prototype device on the desk. Contemporary office lighting.',
    35: 'Sleek tech company innovation lab with robotic arms and server racks visible through glass walls. Engineer-lead in business casual with rolled-up sleeves, presenting at a team whiteboard. Bright modern lighting.',
    45: 'Glass-walled corner office in a tech campus overlooking green grounds, awards and patents on the shelf. Mid-career executive in polished professional attire, reviewing designs on a large touchscreen. Natural daylight flooding in.',
    55: 'TED-style conference stage with a large screen showing an innovation timeline, audience in soft focus. Distinguished tech leader in a tailored blazer, presenting their life work on stage. Dramatic warm spotlights.',
    65: 'University robotics lab with student prototypes around, mentoring young engineers. Senior innovator in a comfortable blazer and open collar, gesturing toward a student project. Warm academic lab lighting.',
    75: 'Beautiful home study with bookshelves, engineering awards, vintage tech prototypes on display, garden view through the window. Retired elder in comfortable refined clothing, sitting at a desk with old blueprints. Soft golden light.',
  },
  scientist: {
    7: 'Elementary classroom with a globe, nature posters, and a small terrarium on the windowsill. Child holding a magnifying glass, peering at a leaf with wide-eyed curiosity. Soft morning sunlight, wonder and discovery.',
    12: 'School science fair hall with colorful project boards and a volcano model on the table. Pre-teen standing proudly next to a science fair display with a blue ribbon. Bright fluorescent event lighting.',
    18: 'University chemistry lab with glass beakers, fume hoods, and shelves of reagent bottles. Late teen in a lab coat and safety goggles, carefully measuring liquid in a graduated cylinder. Clean laboratory lighting.',
    25: 'Research university laboratory with advanced equipment, electron microscope, and published papers on the wall. Young researcher in a lab coat, analyzing data on a computer screen with graphs. Cool institutional lighting.',
    35: 'Well-equipped private research lab with the subject name on a plaque, a team visible in background. Lead scientist in professional attire directing research, confident and established. Balanced modern lighting.',
    45: 'Distinguished lecture podium at a formal academic ceremony with wood-paneled walls and gold accents. Scientist in formal attire, accepting an award at a prestigious ceremony. Warm ceremonial stage lighting.',
    55: 'Office of a research institute director with panoramic nature view, publications lining the walls. Senior scientist in refined professional wear, reviewing a manuscript at a grand desk. Late afternoon warm light.',
    65: 'University campus courtyard with ivy-covered buildings, walking among doctoral students. Emeritus professor in a comfortable academic blazer, engaged in discussion outdoors. Dappled sunlight through trees.',
    75: 'Home library with floor-to-ceiling bookshelves, awards on display, garden visible outside. Retired elder in a comfortable cardigan, reading in a leather armchair surrounded by knowledge. Warm golden interior light.',
  },
  athlete: {
    7: 'Sunny park with green grass and children playing in soft focus, a ball nearby. Child in sporty casual clothing, mid-action kicking a soccer ball on a grassy field. Bright outdoor daylight, pure childhood energy.',
    12: 'School sports field with bleachers, a scoreboard, and team banners. Pre-teen in a school team uniform, standing confidently with a basketball, teammates in soft focus. Afternoon golden-hour sports lighting.',
    18: 'University athletic stadium with packed stands in soft-focus bokeh, championship banners above. Teen athlete in a university team jersey, in a dynamic pose on the field, muscle definition emerging. Dramatic stadium lighting.',
    25: 'Professional sports arena with bright lights and sponsor logos in soft focus, world-class facility. Young professional athlete in full team gear, celebrating a victory moment with fist raised. Intense arena lighting.',
    35: 'Training facility with modern gym equipment, tactical boards, and a coaching setup. Athlete transitioning to coaching, wearing athletic-professional hybrid clothing, clipboard in hand. Bright gymnasium lighting.',
    45: 'Sports broadcasting studio or commentary booth overlooking a stadium, monitors showing a live game. Former athlete in a sharp blazer, now a sports commentator, microphone and earpiece visible. Broadcast studio lighting.',
    55: 'Community sports academy with the subject name on the building, youth players training in background. Founder of a youth academy in smart-casual athletic wear, watching young players with pride. Warm late-afternoon light.',
    65: 'Hall of fame or sports museum with memorabilia, jerseys, and trophies in glass cases. Retired legend in distinguished casual wear, standing in front of their enshrined memorabilia. Museum spotlighting.',
    75: 'Beautiful lakeside home terrace with sports memorabilia visible inside, nature all around. Retired elder in comfortable resort-style clothing, sitting peacefully overlooking the water. Warm golden sunset light.',
  },
  artist: {
    7: 'Bright art classroom with easels, paint-splattered tables, and children artwork on the walls. Child in a paint-smudged smock, holding a paintbrush with a canvas showing bright colors. Warm creative-studio lighting.',
    12: 'Home art corner with canvases, colored pencils, and sketchbooks stacked everywhere. Pre-teen sketching intently in a large notebook, surrounded by drawings and art supplies. Warm lamp-lit creative atmosphere.',
    18: 'Art school studio with large canvases, sculptures, and artistic installations. Late teen in artistically styled clothing, working on a large abstract painting. Moody artistic studio lighting with warm spots.',
    25: 'First solo gallery exhibition with artwork on white walls and visitors in soft focus. Young artist in distinctive creative attire, standing before their exhibited work at opening night. Gallery spotlighting.',
    35: 'Established art studio loft with large windows, finished works everywhere, a city skyline outside. Professional artist in characteristic creative clothing, working on a major piece. Natural north-light through skylights.',
    45: 'Major gallery with the subject name on the entrance wall, elegant opening night setting. Mid-career artist in sophisticated creative formal wear, surrounded by admirers at a premiere. Elegant warm lighting.',
    55: 'Beautiful countryside atelier with panoramic views, masterworks in progress on multiple easels. Mature artist in refined bohemian clothing, working contemplatively on a deeply personal piece. Soft natural light.',
    65: 'Prestigious art school classroom, mentoring the next generation, student works displayed around the room. Master artist-teacher in distinguished creative attire, demonstrating technique to students. Warm studio lighting.',
    75: 'Serene home studio filled with a lifetime of art, a garden visible through open french doors. Retired elder in comfortable artistic clothing, sitting among their collected works peacefully. Soft golden afternoon light.',
  },
  musician: {
    7: 'Elementary school music room with colorful instruments, a small xylophone, and musical note decorations. Child sitting with a tiny keyboard, pressing keys with delighted curiosity. Bright cheerful classroom light.',
    12: 'Bedroom with band posters on the walls, a guitar on a stand, and sheet music scattered on the desk. Pre-teen practicing guitar with headphones around the neck, focused expression. Warm bedroom lamp lighting.',
    18: 'Music conservatory practice room with a grand piano, soundproofing panels, and music stands. Late teen performing at a piano or with an instrument, intense focus and passion. Dramatic practice room lighting.',
    25: 'Small intimate concert venue with a stage, microphones, and warm ambient lighting. Young musician performing on stage to a close audience, sweat on the brow, fully immersed. Moody stage lighting with blue tones.',
    35: 'Professional recording studio with mixing console, monitor speakers, and acoustic panels. Musician-producer in the control room, headphones around the neck, adjusting levels. Soft studio ambient lighting.',
    45: 'Grand concert hall stage with an orchestra or band setup, audience seats in soft-focus bokeh. Mid-career musician performing to a large audience, commanding stage presence. Dramatic concert spotlighting.',
    55: 'Beautiful home music studio with vintage instruments, gold records on the wall, and a view of rolling hills. Established musician composing at a grand piano, manuscripts nearby. Warm late-afternoon golden light.',
    65: 'Masterclass setting at a prestigious music academy, students with instruments gathered around. Senior maestro in elegant attire, conducting or teaching with expressive gestures. Warm academic hall lighting.',
    75: 'Sunlit living room with a beloved instrument nearby, music memorabilia and family photos on the shelves. Retired elder in a comfortable sweater, listening to vinyl records in a cozy armchair. Soft golden interior light.',
  },
  architect: {
    7: 'Elementary classroom with colorful building blocks, miniature house models, and geometric shapes. Child constructing an elaborate tower from wooden blocks with intense concentration. Bright classroom sunlight.',
    12: 'Home desk with graph paper, rulers, pencils, and a model of a tiny house made from cardboard. Pre-teen drawing a floor plan with careful precision, reference books stacked nearby. Warm desk lamp lighting.',
    18: 'University architecture studio with drafting tables, scale models, and pinned-up design boards. Late teen working on an architectural model, cutting balsa wood with a craft knife. Cool studio fluorescent lighting.',
    25: 'Modern architecture firm office with large monitors showing 3D renders, material samples on shelves. Young architect in smart-casual attire reviewing blueprints at a light table. Clean contemporary office lighting.',
    35: 'Construction site with a half-built modern building, the subject in a hard hat reviewing plans. Architect overseeing their design coming to life, pointing at structural details, city skyline behind. Bright outdoor daylight.',
    45: 'Award-winning architecture studio with models of iconic buildings, floor-to-ceiling windows overlooking a city. Principal architect in refined professional attire, presenting a new design on a large screen. Warm afternoon light.',
    55: 'Urban planning exhibition hall with large-scale city models and the subject name on a featured installation. Distinguished architect giving a keynote beside their masterwork model. Dramatic exhibition lighting.',
    65: 'University architecture department with student models and drawings, mentoring the next generation of designers. Senior professor in a comfortable blazer, critiquing student work with encouraging gestures. Warm studio lighting.',
    75: 'Beautiful architect-designed home with signature style, garden courtyard, and shelves of design awards. Retired elder in comfortable elegant clothing, sitting in their own masterpiece home. Golden hour light through skylights.',
  },
  chef: {
    7: 'Bright family kitchen with a small step stool, mixing bowls, and flour dusted on the counter. Child wearing an oversized apron and a tiny chef hat, stirring batter with a wooden spoon. Warm kitchen lighting.',
    12: 'Home kitchen with cookbooks open, fresh vegetables on the counter, and something baking in the oven. Pre-teen carefully decorating a homemade cake with colorful frosting and focused determination. Cozy kitchen warmth.',
    18: 'Culinary school kitchen with professional stainless steel equipment, chef uniforms, and mise en place stations. Late teen in crisp white chef jacket, practicing knife skills on vegetables. Clean professional kitchen lighting.',
    25: 'Bustling restaurant kitchen with flames on the stove, plates being plated, and a kitchen brigade in action. Young chef in whites, plating an elegant dish with tweezers and precision. Energetic warm kitchen lighting.',
    35: 'Own restaurant kitchen with the subject name visible on chef coats, a modern open-kitchen concept. Head chef tasting a signature dish, confident authority, team working in background. Warm ambient restaurant lighting.',
    45: 'Television cooking show set with cameras, bright lights, and a beautiful staged kitchen. Celebrity chef presenting a dish to camera, charismatic smile, cookbook visible on the counter. Bright TV studio lighting.',
    55: 'Michelin-starred restaurant dining room with elegant table settings, the chef greeting distinguished guests. Renowned chef in impeccable whites walking through their acclaimed restaurant. Sophisticated warm ambiance.',
    65: 'Culinary academy classroom with eager students at cooking stations, the master chef demonstrating. Senior chef instructor in traditional whites, showing classic technique with effortless mastery. Warm institutional lighting.',
    75: 'Beautiful home kitchen with copper pots hanging, herb garden visible through the window, family gathered around. Retired elder in comfortable clothing, cooking for loved ones with joy and practiced ease. Soft golden evening light.',
  },
  pilot: {
    7: 'Elementary school classroom with airplane models hanging from the ceiling and a world map on the wall. Child holding a toy airplane, zooming it through the air with wide imaginative eyes. Bright morning sunlight.',
    12: 'Bedroom with aviation posters, model aircraft on shelves, and a flight simulator game on a computer screen. Pre-teen assembling a detailed model airplane at a desk with paints and glue. Warm focused lamp lighting.',
    18: 'Flight school hangar with small training aircraft, the subject in a flight suit near a Cessna. Late teen holding a logbook, standing beside a training plane on a sunny tarmac. Bright outdoor aviation lighting.',
    25: 'Commercial airline cockpit with instrument panels, overhead switches, and runway visible through the windshield. Young first officer in a crisp airline uniform, performing pre-flight checks. Cool cockpit instrument glow.',
    35: 'Modern airline cockpit, now in the captain seat with four stripes on epaulettes, clouds visible outside. Captain in full uniform reviewing flight plan, confident and authoritative. Golden sunlight through cockpit windows.',
    45: 'Airport operations center with flight planning screens and aviation charts, pilots in background. Senior captain in dress uniform, mentoring younger pilots at a briefing table. Professional office lighting.',
    55: 'Aviation training center with flight simulators, the subject in an instructor uniform teaching. Distinguished flight instructor demonstrating procedures in a state-of-the-art simulator. Cool simulator lighting.',
    65: 'Private airfield with a vintage aircraft, hangars in background, blue sky with scattered clouds. Retired pilot in a leather flight jacket, standing proudly beside a restored classic airplane. Beautiful outdoor light.',
    75: 'Sunlit study with aviation memorabilia, model airplanes, old flight maps, and logbooks on display. Retired elder in comfortable clothing, looking at framed photos of aircraft and flight memories. Warm golden interior light.',
  },
  lawyer: {
    7: 'Elementary classroom with a pretend courtroom setup, small desk with a toy gavel and books stacked neatly. Child in a school uniform holding a toy gavel with serious determination. Bright classroom daylight.',
    12: 'School debate stage with a podium, microphone, and audience seats in soft focus. Pre-teen at the podium making a passionate argument, debate trophy visible on a nearby table. Auditorium stage lighting.',
    18: 'University law library with towering bookshelves, legal volumes, and study carrels. Late teen surrounded by law textbooks and highlighted notes, studying intently at a wooden desk. Warm library lamp lighting.',
    25: 'Modern law firm office with legal books on shelves, a corner window, and case files on the desk. Young attorney in a sharp suit, reviewing documents at a polished desk. Clean professional office lighting.',
    35: 'Courtroom with wooden judge bench, jury box, and gallery seating in soft focus. Trial lawyer in a tailored suit, standing before the jury, mid-argument with confident posture. Formal courtroom lighting.',
    45: 'Corner office of a prestigious law firm with city skyline view, awards and diplomas on the wall. Senior partner in impeccable attire, seated at a grand executive desk. Late afternoon golden light through windows.',
    55: 'Supreme court or high court building interior with marble columns and carved details. Distinguished legal figure in formal robes or a dark suit, walking through grand hallways. Dramatic institutional lighting.',
    65: 'Law school lecture hall with tiered seating, the subject teaching from a podium with slides. Esteemed law professor in academic attire, engaging a class of eager students. Warm lecture hall lighting.',
    75: 'Elegant home library with leather-bound legal volumes, a carved wooden desk, and family photos. Retired elder in a comfortable blazer, reading by a fireplace surrounded by a life of jurisprudence. Warm golden firelight.',
  },
  teacher: {
    7: 'Elementary classroom with ABCs on the wall, small desks in rows, and a blackboard with chalk. Child standing at a toy chalkboard pretending to teach stuffed animals lined up in chairs. Bright cheerful classroom light.',
    12: 'School library with bookshelves, reading nooks, and an after-school tutoring session happening. Pre-teen helping a younger student with homework at a library table, patient and kind. Warm library ambient lighting.',
    18: 'University education department classroom with teaching method posters and practice whiteboards. Late teen in casual college wear, practicing a lesson presentation to classmates. Bright institutional lighting.',
    25: 'Elementary school classroom with colorful decorations, student artwork on the walls, small desks arranged in groups. Young teacher in smart-casual attire standing at a whiteboard, engaging students warmly. Morning sunlight through windows.',
    35: 'Middle school classroom with science equipment and motivational posters, students working on projects. Experienced teacher walking between desks, guiding students with confidence and warmth. Balanced classroom lighting.',
    45: 'School principal office with awards, community photos, and a welcoming atmosphere. Mid-career educator in professional attire, meeting with parents at a round table. Warm office lighting.',
    55: 'Education conference stage with a presentation about innovative teaching methods, audience engaged. Distinguished educator speaking passionately at a podium, years of wisdom evident. Warm stage spotlighting.',
    65: 'University teacher training program, mentoring future educators in a seminar setting. Senior professor of education in comfortable academic attire, leading a discussion circle. Warm seminar room lighting.',
    75: 'Beautiful home garden with a reading nook, shelves of well-loved books, and handwritten letters from former students. Retired elder in a cozy cardigan, reading letters of gratitude in peaceful sunshine. Soft golden garden light.',
  },
  veterinarian: {
    7: 'Elementary classroom with animal posters, a class pet hamster in a cage, and nature books on a shelf. Child gently holding a small stuffed animal while wearing a toy doctor kit. Warm morning classroom light.',
    12: 'Backyard or garden with a family dog, pet care supplies, and nature around. Pre-teen kneeling beside a golden retriever, gently bandaging its paw with focused care. Soft afternoon outdoor light.',
    18: 'University veterinary school lab with anatomy models, microscopes, and specimen charts on the wall. Late teen in a white coat examining an animal model, taking careful notes. Clean laboratory lighting.',
    25: 'Veterinary clinic examination room with medical equipment, pet treats on the counter, and a cat on the table. Young vet in a white coat with a stethoscope, gently examining a pet with compassion. Bright clinical lighting.',
    35: 'Own veterinary practice with the subject name on the door, a well-equipped modern clinic. Experienced vet in scrubs reviewing an x-ray image on a light panel, staff in background. Balanced professional lighting.',
    45: 'Wildlife conservation center in a lush natural setting, large enclosures visible in background. Mid-career wildlife vet in field clothing, caring for a rescued animal outdoors. Natural golden-hour light.',
    55: 'Veterinary research facility with advanced imaging equipment and published research on the walls. Senior veterinary researcher in professional attire, presenting findings at a conference. Warm presentation lighting.',
    65: 'University veterinary school lecture hall with animal anatomy posters and eager students. Emeritus professor in a comfortable blazer, teaching from decades of clinical experience. Warm academic lighting.',
    75: 'Beautiful country home porch with a beloved pet curled up nearby, rolling green fields in the distance. Retired elder in comfortable clothing, sitting peacefully with an old companion dog. Warm golden sunset light.',
  },
  astronaut: {
    7: 'Elementary school classroom with a solar system mobile hanging from the ceiling and space posters. Child wearing a toy astronaut helmet, gazing up at the planets with wide-eyed wonder. Bright classroom sunlight.',
    12: 'Bedroom with glow-in-the-dark stars on the ceiling, a telescope by the window, and space model kits. Pre-teen looking through a telescope toward the night sky, star charts on the desk. Soft moonlit room with desk lamp.',
    18: 'University aerospace engineering lab with rocket models, satellite components, and simulations on screens. Late teen in a university t-shirt working on a small rocket propulsion project. Cool lab instrument lighting.',
    25: 'NASA or space agency training facility with a centrifuge and flight suits hanging on racks. Young astronaut candidate in a blue flight suit, going through physical training. Institutional fluorescent lighting.',
    35: 'Space station interior with floating equipment, earth visible through a cupola window. Astronaut in a space suit or station wear, conducting an experiment in microgravity. Cool ambient station lighting with earth glow.',
    45: 'Mission control center with banks of monitors, headsets, and a large screen showing a spacecraft trajectory. Senior astronaut now in mission control, directing operations in a polo and slacks. Cool monitor glow with overhead lights.',
    55: 'Space museum or visitor center with rockets, capsules, and interactive exhibits on display. Distinguished space veteran in a suit, unveiling a new exhibit or giving a public talk. Dramatic museum spotlighting.',
    65: 'University aerospace department with scale models of spacecraft, mentoring doctoral students. Retired astronaut-professor in a comfortable blazer with a space agency pin, sharing stories. Warm classroom lighting.',
    75: 'Peaceful home observatory with a large telescope, framed photos from space missions on the walls. Retired elder in a cozy sweater, gazing at the stars through an open observatory dome. Soft starlight and warm lamp glow.',
  },
  fashion_designer: {
    7: 'Elementary classroom with an arts-and-crafts corner, fabric scraps, and colorful paper designs. Child cutting fabric with safety scissors, creating a tiny outfit for a doll. Bright creative classroom light.',
    12: 'Bedroom with fashion magazine clippings on a mood board, a sewing machine, and sketched dress designs. Pre-teen draping fabric on a small dress form, pins in hand, creative concentration. Warm bedroom lamp lighting.',
    18: 'Fashion design school studio with dress forms, fabric bolts, and sewing machines in rows. Late teen pinning fabric on a mannequin, working on a collection piece with artistic flair. Cool studio fluorescent lighting.',
    25: 'Small fashion atelier with a runway at the end, first collection on dress forms, fashion sketches on walls. Young designer in chic attire, making final adjustments to a garment before a show. Bright studio work lighting.',
    35: 'Fashion week backstage with models, makeup artists, and racks of garments in organized chaos. Designer in their signature style directing the team, headset on, intense focus. Energetic backstage lighting.',
    45: 'Flagship boutique with the designer name on the storefront, elegant interior, and signature pieces displayed. Established designer in impeccable attire welcoming VIP clients in their own store. Sophisticated warm ambiance.',
    55: 'Haute couture atelier in Paris or Milan with master craftspeople and exquisite fabrics on every surface. Renowned designer overseeing the creation of a couture gown, experienced authority. Beautiful atelier natural light.',
    65: 'Fashion institute classroom with students at design stations, the subject demonstrating draping technique. Legendary designer in elegant attire, teaching the next generation of creators. Warm classroom studio lighting.',
    75: 'Beautiful sunlit studio apartment with a lifetime of iconic designs on display, sketches and awards everywhere. Retired elder in timeless elegant clothing, surrounded by decades of fashion legacy. Soft golden afternoon light.',
  },
  filmmaker: {
    7: 'Elementary classroom during a show-and-tell session, a small toy camera and handmade storyboards on the desk. Child holding a toy video camera, directing classmates with enthusiastic gestures. Bright classroom daylight.',
    12: 'Home living room converted into a movie set with a blanket fort backdrop and a phone on a tripod. Pre-teen directing siblings in a homemade short film, clapper board in hand. Warm living room lighting.',
    18: 'Film school editing suite with multiple monitors, timeline software, and movie posters on the walls. Late teen hunched over an editing station, headphones on, cutting a short film. Cool monitor glow in a dark room.',
    25: 'Independent film set with a small crew, camera on a dolly, and director chair with the subject name on it. Young director behind the camera, framing a shot with hands, calling action. Natural on-set lighting.',
    35: 'Major film set with professional equipment, a boom mic, lighting rigs, and a crowd of crew members. Director in a director chair, reviewing footage on a monitor with a cinematographer nearby. Dramatic set lighting.',
    45: 'Film festival red carpet with photographers, fans, and a marquee showing the subject film title. Acclaimed filmmaker in formal festival attire, walking the red carpet with confidence. Bright camera flash and ambient light.',
    55: 'Private screening room with plush seats, a wall of film posters, and awards on a shelf. Master filmmaker watching a rough cut of their latest work, contemplative and focused. Warm screening room light.',
    65: 'Film academy masterclass with aspiring directors in tiered seating, classic film stills on the walls. Legendary director in a comfortable blazer, sharing wisdom with the next generation. Warm lecture hall lighting.',
    75: 'Home cinema room with shelves of films, awards, and behind-the-scenes photos from a legendary career. Retired elder in a cozy cardigan, watching a classic film in their personal theater. Soft warm projection light.',
  },
  writer: {
    7: 'Elementary classroom with a creative writing corner, storybooks on shelves, and colorful vocabulary posters. Child bent over a notebook, writing a story with crayons and an imaginative smile. Warm morning classroom light.',
    12: 'Cozy bedroom reading nook with overflowing bookshelves, a desk covered in notebooks and pencils. Pre-teen writing in a journal at a window seat, a stack of favorite novels beside them. Soft afternoon window light.',
    18: 'University English department library with literary classics, a laptop open to a manuscript in progress. Late teen in a campus coffee shop corner, typing intently on a laptop surrounded by books. Warm cafe ambient lighting.',
    25: 'Small apartment writing desk with a published debut novel prominently displayed, manuscript pages scattered. Young writer in casual creative attire, typing at a desk with a coffee cup nearby. Morning sunlight through a window.',
    35: 'Book launch event at an independent bookstore, a crowd gathered, the subject book stacked on a table. Published author in smart-casual attire, reading an excerpt to an engaged audience. Warm bookstore ambient lighting.',
    45: 'Elegant home office with a wall of published works, literary awards on shelves, and a typewriter as decor. Established author in refined casual wear, writing at a beautiful wooden desk. Late afternoon golden light.',
    55: 'Literary festival stage with a large backdrop, an interviewer on a couch, and an audience in the seats. Celebrated novelist on stage, discussing their latest work with eloquence and humor. Stage lighting with warm tones.',
    65: 'University creative writing workshop with a circle of students, manuscripts being passed around. Beloved writing professor in professorial attire, leading a thoughtful discussion about craft. Warm seminar room light.',
    75: 'Cottage study with shelves of first editions, a writing desk by a garden window, and a cat sleeping nearby. Retired elder in a soft sweater, reading in a comfortable armchair surrounded by a lifetime of words. Gentle golden light.',
  },
  firefighter: {
    7: 'Elementary school classroom during career day with a real firefighter helmet and toy fire truck on display. Child wearing an oversized firefighter helmet, proudly holding a tiny fire hose. Bright cheerful classroom light.',
    12: 'Neighborhood with a fire station visible in background, kids watching a fire truck with excitement. Pre-teen in a junior fire cadet t-shirt, learning fire safety from a firefighter. Warm outdoor afternoon light.',
    18: 'Fire academy training ground with obstacle courses, practice buildings, and recruit squads. Late teen in training gear, climbing a ladder during a drill with determination and grit. Bright outdoor training ground light.',
    25: 'Fire station interior with a gleaming engine, turnout gear hanging on hooks, and a pole in background. Young firefighter in full turnout gear, standing proudly beside the engine with a helmet under arm. Warm station lighting.',
    35: 'Emergency scene with a fire truck, hoses deployed, and emergency lights casting red-blue reflections. Lieutenant firefighter directing a team with calm authority, smoke in the background. Dramatic emergency lighting.',
    45: 'Fire department headquarters office with commendations on the wall and a district map behind the desk. Fire chief in dress uniform, reviewing operational plans at a large desk. Professional office lighting.',
    55: 'Fire training academy classroom with cadets in formation, the subject in a command officer uniform. Senior training officer addressing recruits with decades of experience evident. Formal institutional lighting.',
    65: 'Community fire safety center with fire prevention displays and educational materials. Retired fire chief in civilian clothes with department pins, speaking to school children about safety. Warm community center light.',
    75: 'Home porch with a rocking chair, fire department memorabilia inside, and a peaceful neighborhood view. Retired elder in comfortable clothing, waving to neighbors from a welcoming front porch. Warm golden evening light.',
  },
  marine_biologist: {
    7: 'Elementary classroom with an aquarium, ocean posters, and a collection of seashells on a display shelf. Child with face pressed against the glass of a classroom fish tank, fascinated by the fish. Bright aquatic blue-tinted light.',
    12: 'Beach or tide pools with binoculars, a net, and a bucket of collected specimens. Pre-teen crouching at a tide pool, examining a sea star with a magnifying glass. Warm outdoor coastal light.',
    18: 'University marine biology lab with saltwater tanks, coral specimens, and underwater photography on walls. Late teen in a lab coat with diving certification patch, examining a specimen slide. Cool lab and tank lighting.',
    25: 'Research vessel deck with ocean stretching to the horizon, scientific equipment and sample containers. Young marine biologist in a wetsuit top and shorts, cataloging specimens on deck. Bright ocean sunlight.',
    35: 'Underwater research scene with coral reef, diving equipment, and recording instruments. Marine scientist in scuba gear, documenting reef life with an underwater camera. Blue-green underwater light.',
    45: 'Ocean research institute with a large aquarium wall, published papers, and expedition maps on display. Senior researcher in professional attire, presenting ocean conservation findings. Cool aquatic ambient lighting.',
    55: 'United Nations or international conference with ocean conservation banners, world delegates in attendance. Distinguished marine scientist at a podium, advocating for ocean preservation. Formal conference stage lighting.',
    65: 'Coastal university campus with ocean views, walking with graduate students along a seaside path. Retired professor in casual coastal attire, sharing knowledge with the next generation of ocean scientists. Beautiful coastal golden light.',
    75: 'Seaside cottage with ocean view, marine artifacts, coral specimens, and a telescope pointed at the sea. Retired elder in comfortable linen clothing, watching the ocean from a sunlit veranda. Warm sunset light over water.',
  },
  business_founder: {
    7: 'Elementary classroom with a lemonade stand project, handmade price signs, and play money on a desk. Child counting play coins with an entrepreneurial gleam, a small cash register toy nearby. Bright classroom sunlight.',
    12: 'Home garage or basement with a first business attempt — a small craft or tech project being assembled. Pre-teen packaging homemade products at a folding table, order forms visible. Warm overhead lighting.',
    18: 'University startup incubator with whiteboards, pitch decks on screens, and bean bag chairs. Late teen in casual wear, pitching a business idea to fellow students with contagious energy. Modern co-working lighting.',
    25: 'First small office or co-working space with a company logo on the wall, a small team at desks. Young founder in startup casual, leading a standup meeting at a whiteboard. Bright contemporary office lighting.',
    35: 'Growing company headquarters with open-plan office, employees busy, the company name prominent. CEO in smart-casual attire, touring the floor with investors, confident and visionary. Modern office natural daylight.',
    45: 'Conference keynote stage with company branding, a large screen showing growth metrics. Business leader in a tailored blazer, delivering a keynote to thousands, command of the room. Dramatic keynote stage lighting.',
    55: 'Boardroom of a major corporation with a long mahogany table, city skyline through floor-to-ceiling windows. Chairman in executive attire, presiding over a board meeting with calm authority. Warm afternoon boardroom light.',
    65: 'Philanthropic foundation office with impact photos on the walls, a globe, and community awards. Senior philanthropist in comfortable distinguished clothing, reviewing charitable initiatives. Warm office ambient light.',
    75: 'Beautiful estate garden with a memoir on the table, grandchildren playing in soft focus background. Retired elder in elegant casual clothing, reflecting peacefully in a magnificent garden. Soft golden hour light.',
  },
  dancer: {
    7: 'Elementary school gym with a portable barre, mirror, and children in dance outfits lined up. Child in a small dance outfit, mid-twirl with arms extended and a joyful expression. Bright gymnasium light.',
    12: 'Dance studio with floor-to-ceiling mirrors, a wooden barre, and ballet shoes hanging on hooks. Pre-teen at the barre in dance practice wear, stretching with disciplined form. Warm studio natural light.',
    18: 'Performing arts academy stage with professional lighting rigs and a rehearsal in progress. Late teen in performance attire, mid-leap in a dramatic dance pose on stage. Dramatic stage spotlighting.',
    25: 'Professional dance company stage with an audience in soft-focus bokeh, elaborate set behind. Young professional dancer in costume, performing a lead role with grace and power. Beautiful theatrical lighting.',
    35: 'Own dance studio with the subject name on the door, choreographing a piece with a company of dancers. Dance director in rehearsal attire, demonstrating a sequence to the company. Bright rehearsal studio lighting.',
    45: 'Broadway or West End theater stage with marquee lights, curtain call with bouquets of flowers. Celebrated choreographer taking a bow on a major theater stage after a premiere. Brilliant theater stage lighting.',
    55: 'International dance festival with flags, outdoor stage, and dancers from around the world. Renowned dance figure in elegant attire, speaking at an opening ceremony. Warm festival outdoor lighting.',
    65: 'Dance conservatory masterclass with young dancers in a circle, mirrors reflecting the movement. Master teacher in comfortable dance attire, guiding students through delicate corrections. Soft studio morning light.',
    75: 'Elegant living room with a gramophone, dance memorabilia, and photos of a lifetime of performances. Retired elder in flowing comfortable clothing, swaying gently to music in their home. Warm golden interior light.',
  },
  photographer: {
    7: 'Elementary classroom with colorful drawings and a display of photos taken by students on the wall. Child holding a small disposable camera, snapping a photo with one eye squeezed shut. Bright cheerful classroom light.',
    12: 'Backyard or park with a basic DSLR camera, photographing flowers, pets, and interesting textures. Pre-teen crouching to photograph a butterfly on a flower with careful framing. Warm outdoor golden-hour light.',
    18: 'University photography darkroom with red safe-light, enlargers, and developing trays of chemicals. Late teen in casual artsy clothing, carefully developing a print in the darkroom. Moody red safe-light glow.',
    25: 'On-location photoshoot with a model, reflectors, and a camera bag, urban backdrop in background. Young photographer with a professional camera, directing a subject with creative energy. Natural outdoor ambient light.',
    35: 'Own photography studio with backdrop setups, lighting equipment, and a portfolio displayed on walls. Professional photographer adjusting studio lights, camera on a tripod, preparing for a session. Controlled studio lighting.',
    45: 'Gallery exhibition of photographic work, large prints on walls, visitors admiring the images. Acclaimed photographer in refined creative attire at their own exhibition opening. Warm gallery spotlighting.',
    55: 'Photojournalism office or National Geographic-style workspace with world maps and iconic prints. Senior photographer reviewing proofs at a light table, decades of world travel evident. Warm workspace lighting.',
    65: 'Photography workshop in a scenic outdoor location, teaching a group of enthusiasts composition. Master photographer in outdoor wear, demonstrating technique to students in beautiful landscape. Gorgeous natural light.',
    75: 'Home darkroom or study with walls covered in a lifetime of iconic photographs, cameras on shelves. Retired elder in comfortable clothing, looking through contact sheets with a loupe. Soft warm interior lighting.',
  },
  game_designer: {
    7: 'Elementary classroom with a computer corner, pixel art on the wall, and children playing educational games. Child at a computer, drawing a game character with a simple paint program. Bright classroom light with screen glow.',
    12: 'Bedroom with gaming posters, dual monitors, and a notebook full of game level sketches. Pre-teen coding a simple game, lines of code on screen, a game design notebook open beside. Cool monitor glow and desk lamp.',
    18: 'University game design lab with VR headsets, game engines on screens, and prototype controllers. Late teen testing a game prototype on a large monitor, teammates playtesting in background. Cool mixed lighting.',
    25: 'Indie game studio with beanbags, whiteboards full of game mechanics diagrams, and dev kits on desks. Young game developer in casual gaming attire, presenting a game demo on a big screen. Modern studio ambient lighting.',
    35: 'Major game studio with motion capture space visible through glass, concept art covering the walls. Lead game designer in creative casual wear, directing a design review session. Stylish modern studio lighting.',
    45: 'Game awards ceremony stage with the subject game title on a large screen, golden trophy in hand. Acclaimed game designer in sharp creative formal wear, accepting an industry award. Dramatic award show spotlighting.',
    55: 'Personal game design studio with memorabilia from beloved titles, prototype consoles, and sketches. Veteran designer in comfortable creative clothing, working on an indie passion project. Warm studio light.',
    65: 'University game design program, teaching students in a lab with game engines and creative tools. Professor of game design in academic-creative attire, reviewing student game projects. Warm classroom lighting.',
    75: 'Cozy home office with shelves of games, design awards, concept art books, and a retro game console. Retired elder in a gaming t-shirt and comfortable pants, playing a classic game with a gentle smile. Soft warm screen glow.',
  },
  robotics_engineer: {
    7: 'Elementary classroom with a small programmable robot, LEGO Mindstorms kit, and coding activity poster. Child on the floor with a simple robot kit, connecting pieces with wide-eyed fascination. Bright classroom sunlight.',
    12: 'Home workshop or garage with a robot competition entry, tools, wires, and a programming laptop. Pre-teen soldering a circuit board with safety goggles, a partially built robot on the table. Warm workshop lighting.',
    18: 'University robotics lab with articulated robot arms, sensor arrays, and competition trophies on a shelf. Late teen programming a robot at a workstation, the machine responding to commands. Cool lab lighting with LED accents.',
    25: 'Robotics startup workspace with prototype humanoid robots, testing areas, and engineering whiteboards. Young robotics engineer in smart-casual attire, calibrating a robot arm prototype. Clean modern workspace lighting.',
    35: 'Advanced robotics R&D facility with AI systems, motion platforms, and a team of engineers collaborating. Lead engineer in lab attire, overseeing a robot performing complex autonomous tasks. High-tech ambient lighting.',
    45: 'Innovation expo main stage with a revolutionary robot on display, media cameras and audience in attendance. CTO-level roboticist presenting a breakthrough product to the world with pride. Bright expo stage lighting.',
    55: 'Personal robotics lab with cutting-edge prototypes, awards on shelves, and patents on the wall. Distinguished engineer in refined casual wear, working on next-generation AI robotics. Warm lab ambient lighting.',
    65: 'University AI and robotics department with student projects and research papers displayed. Senior professor in a comfortable blazer, mentoring a PhD student working on a humanoid. Warm academic lab lighting.',
    75: 'Beautiful modern home with a helpful robot companion, bookshelves of engineering texts, garden view. Retired elder in comfortable clothing, interacting with a robot they helped create. Soft golden natural light.',
  },
  surgeon: {
    7: 'Elementary classroom with a toy medical kit open on a desk, bandages, and a stethoscope toy. Child carefully bandaging a teddy bear with serious concentration and a tiny white coat. Warm bright classroom light.',
    12: 'Home study desk with human anatomy coloring books, a plastic skeleton model, and biology textbooks. Pre-teen examining a detailed anatomy model with fascination, notes spread around. Warm focused desk lamp lighting.',
    18: 'University pre-med lab with cadaver models, surgical tools displays, and anatomy charts. Late teen in scrubs and gloves, practicing suturing technique on a simulation model. Clean sterile lab lighting.',
    25: 'Hospital surgical residency corridor with OR doors, scrub stations, and medical staff walking by. Young surgical resident in scrubs and a surgical cap, reviewing a patient chart outside the OR. Bright hospital fluorescent light.',
    35: 'Operating room with surgical lights, monitors showing vital signs, and a sterile surgical team. Surgeon in full scrubs, mask, and loupes, performing a precision procedure with steady hands. Intense overhead surgical lighting.',
    45: 'Hospital department office with surgical awards, framed publications, and a teaching hospital banner. Chief of surgery in a white coat over scrubs, consulting with colleagues at a conference table. Professional office lighting.',
    55: 'Medical innovation conference with robotic surgery demonstrations and international attendees. Pioneer surgeon presenting a groundbreaking surgical technique on the main stage. Conference stage spotlighting.',
    65: 'Surgical simulation center with high-fidelity mannequins, teaching the next generation of surgeons. Master surgeon-educator in scrubs, guiding residents through a complex procedure on a simulator. Cool simulation lab light.',
    75: 'Elegant home study with medical texts, surgical instruments as decorative art, and a garden view. Retired elder in comfortable refined clothing, writing surgical memoirs at a mahogany desk. Warm golden afternoon light.',
  },
  diplomat: {
    7: 'Elementary classroom with world flags on the wall, a globe on the teacher desk, and cultural artifacts. Child pointing at countries on a large globe with curious interest, world map poster behind. Bright classroom sunlight.',
    12: 'Model United Nations event in a school auditorium with country placards and formal seating. Pre-teen in a blazer at a delegate desk, raising a hand to speak with confident poise. Formal auditorium lighting.',
    18: 'University international relations department with geopolitical maps, policy books, and debate practice. Late teen in smart attire, participating in a simulated diplomatic negotiation. Warm seminar room lighting.',
    25: 'Embassy office in a foreign capital with national flags, diplomatic seals, and official portraits. Young diplomat in professional formal attire, reviewing policy documents at an ornate desk. Elegant institutional lighting.',
    35: 'United Nations assembly hall with nation placards, translators booths, and the iconic green marble. Diplomat at the national delegation desk, delivering a speech to the assembly. Dramatic assembly hall lighting.',
    45: 'Ambassador residence with art from multiple cultures, reception hall, and dignitaries in soft focus. Ambassador in diplomatic formal wear, hosting an international reception with grace. Warm sophisticated reception lighting.',
    55: 'International peace conference with world leaders, a long negotiating table, and press in background. Senior diplomat mediating between delegations with calm authority and experience. Formal conference lighting.',
    65: 'University international affairs institute, giving a lecture on diplomacy to graduate students. Elder statesman in distinguished attire, sharing decades of diplomatic wisdom. Warm lecture hall lighting.',
    75: 'Beautiful home with cultural artifacts from around the world, letters from world leaders on display. Retired elder in comfortable elegant clothing, writing memoirs of a life in service to peace. Soft golden interior light.',
  },
  environmental_scientist: {
    7: 'Elementary classroom with a plant growing experiment, recycling bins, and a poster about saving the planet. Child watering a small seedling in a cup with careful attention, a nature journal nearby. Bright classroom sunlight.',
    12: 'Forest or nature preserve with a backpack, binoculars, and a field notebook for recording observations. Pre-teen crouching beside a stream, testing water quality with a simple kit. Dappled forest sunlight.',
    18: 'University environmental science lab with satellite imagery on screens, soil samples, and plant specimens. Late teen in field clothing, analyzing environmental data on a computer in the lab. Cool institutional lighting.',
    25: 'Rainforest or arctic research station with weather monitoring equipment and field research tents. Young field researcher in outdoor gear, collecting samples in a pristine natural environment. Beautiful natural outdoor light.',
    35: 'Environmental consultancy office with sustainability certifications on the wall, green building models. Senior consultant in professional attire, presenting a climate impact report to stakeholders. Modern office lighting.',
    45: 'Climate summit main stage with world leaders in attendance, environmental data on a large screen behind. Leading environmental scientist at the podium, presenting critical climate findings. Grand stage lighting.',
    55: 'Conservation reserve that the subject helped establish, with rewilded landscape and monitoring stations. Distinguished conservationist in field clothing, surveying a thriving restored ecosystem. Golden afternoon natural light.',
    65: 'University environmental department with student research posters and a living wall of plants. Senior professor of environmental science, reviewing student research in a green campus building. Warm natural interior light.',
    75: 'Sustainable home surrounded by a lush garden, solar panels on the roof, birds visiting a feeder. Retired elder in comfortable outdoor clothing, tending a beautiful permaculture garden. Warm sunset golden light.',
  },
  race_car_driver: {
    7: 'Elementary classroom with toy cars lined up on a desk, a race track poster, and speed-themed decorations. Child zooming a toy race car across a desk with engine sound effects and pure excitement. Bright classroom light.',
    12: 'Go-kart track with colorful karts, tire barriers, and a small podium with trophies. Pre-teen in a go-kart racing suit and helmet, standing next to a kart with a winner trophy. Bright outdoor track lighting.',
    18: 'Junior racing academy garage with a formula car, tools, and telemetry screens on the wall. Late teen in a race suit with sponsor patches, checking tire pressure on a junior formula car. Cool garage lighting.',
    25: 'Professional racing pit lane with a team of mechanics, the race car being prepped, grandstands behind. Young race car driver in full race suit, putting on gloves next to a gleaming racing machine. Bright pit lane lighting.',
    35: 'Podium at a major racing circuit with champagne spray, national flag, and a massive crowd in background. Champion driver on the top step of the podium, trophy held high, team celebrating below. Dramatic podium lighting.',
    45: 'Racing team headquarters with engineering bays, trophy cabinets, and screens showing race telemetry. Team principal and former champion in team branded attire, leading the racing operation. Modern facility lighting.',
    55: 'Motorsport broadcasting booth with monitors showing race coverage, headset on, analyzing race strategy. Respected racing commentator and analyst in professional attire, calling the race. Broadcast studio lighting.',
    65: 'Racing heritage center or motorsport museum with classic cars, helmets, and racing memorabilia. Motorsport legend in casual elegant wear, walking among cars from their championship years. Museum ambient lighting.',
    75: 'Beautiful countryside estate with a classic race car in the garage, trophies in a glass case visible inside. Retired elder in comfortable sporty clothing, polishing a vintage race car with fond memories. Warm garage and sunlight.',
  },
  detective: {
    7: 'Elementary classroom with a mystery book corner, magnifying glasses, and a detective costume on a hook. Child wearing a toy detective hat, examining clues with a magnifying glass at a desk. Bright classroom daylight.',
    12: 'Home with mystery novels stacked high, a notebook full of observations, and a homemade evidence board. Pre-teen with a flashlight and notebook, investigating something in the backyard with intent focus. Warm afternoon light.',
    18: 'University criminal justice department with forensic science displays and case study boards. Late teen in smart casual wear, studying forensic evidence analysis in a criminology lab. Cool institutional lab lighting.',
    25: 'Police precinct detective bullpen with desks covered in case files, evidence boards, and city maps. Young detective in a suit with a badge visible, reviewing case files at a cluttered desk. Harsh fluorescent office lighting.',
    35: 'Crime scene investigation with evidence markers, forensic equipment, and a team working methodically. Lead detective in a professional overcoat, directing the investigation with sharp analytical focus. Cool investigative lighting.',
    45: 'FBI or major crimes division office with screens showing connected evidence, a serious operation underway. Senior investigator in a tailored suit, leading a high-profile case briefing. Tense office ambient lighting.',
    55: 'Courtroom witness stand with a jury visible, testifying as an expert witness with decades of experience. Distinguished investigator in formal attire, presenting crucial evidence with authority. Formal courtroom lighting.',
    65: 'Criminal justice academy lecture hall with case studies on screens, teaching investigative techniques. Retired detective-professor in a comfortable blazer, sharing legendary case stories with students. Warm lecture hall lighting.',
    75: 'Home study with shelves of true crime books, framed commendations, and a chess set on the table. Retired elder in a comfortable cardigan, reading a mystery novel in a leather armchair by the fire. Warm golden firelight.',
  },
  opera_singer: {
    7: 'Elementary school music room with a small stage area, musical instruments, and concert posters. Child standing on a small platform singing enthusiastically into a toy microphone, classmates watching. Bright cheerful school lighting.',
    12: 'Church or community choir practice room with wooden pews, hymnals, and a piano accompanist. Pre-teen in a youth choir robe, singing with powerful projection, choirmaster conducting nearby. Warm reverent lighting.',
    18: 'Music conservatory vocal studio with a grand piano, acoustic panels, and opera score sheets on a stand. Late teen in practice attire, performing an aria for a vocal coach with passionate expression. Dramatic vocal studio lighting.',
    25: 'Small opera house stage with period costumes, set pieces, and an orchestra pit visible below. Young opera singer in full costume and stage makeup, performing a role with emotional intensity. Beautiful theatrical lighting.',
    35: 'Major opera house like La Scala or the Met, grand stage with elaborate sets, full orchestra below. Opera star in magnificent costume, performing center stage, audience in rapt attention. Grand theatrical spotlighting.',
    45: 'International concert hall stage with a world-class orchestra, performing a solo recital to a packed house. Celebrated singer in elegant concert attire, commanding the stage with mature vocal power. Dramatic warm concert lighting.',
    55: 'Recording studio for a definitive album, vintage microphone, orchestra visible through the glass. Legendary vocalist in refined attire, recording a masterpiece performance with eyes closed. Warm intimate studio lighting.',
    65: 'Opera academy masterclass with young singers gathered, a grand piano, and performance photos on walls. Master vocal teacher in elegant attire, coaching a promising young singer with gentle authority. Warm academy studio light.',
    75: 'Elegant home music room with a grand piano, opera memorabilia, playbills, and costume sketches framed. Retired elder in a silk robe, humming softly at the piano, a lifetime of music around them. Soft golden evening light.',
  },
  archaeologist: {
    7: 'Elementary classroom with a sandbox archaeology dig simulation, toy dinosaurs, and ancient history posters. Child carefully brushing sand off a buried toy artifact with focused archaeological patience. Bright classroom sunlight.',
    12: 'Backyard or garden with a homemade dig site, small tools, labeled bags, and a notebook of findings. Pre-teen on hands and knees, carefully excavating something from the dirt with a small brush. Warm outdoor afternoon light.',
    18: 'University archaeology department with artifact displays, ancient maps, and a pottery reconstruction table. Late teen in field-ready clothing, cataloging pottery shards in a campus archaeology lab. Cool institutional lab lighting.',
    25: 'Archaeological excavation site in an ancient desert or Mediterranean landscape, tents and grid squares. Young archaeologist in field gear and a sun hat, carefully excavating with trowel and brush. Bright outdoor desert light.',
    35: 'Major dig site with significant discovery exposed, media cameras, and international research team. Lead archaeologist in dusty field clothes, revealing an important find, team celebrating behind. Dramatic golden-hour light.',
    45: 'Museum exhibition hall with the subject major discovery on display, educational panels, and visitors. Curator-archaeologist in professional attire, presenting a groundbreaking exhibition. Warm museum spotlighting.',
    55: 'Archaeological research institute with artifact archives, restoration labs, and published monographs. Distinguished researcher in academic attire, examining an artifact with specialized equipment. Balanced institutional lighting.',
    65: 'University lecture hall with slides of ancient civilizations, students engaged in discussion. Eminent professor of archaeology in a comfortable blazer with a field scarf, teaching with passion. Warm lecture hall lighting.',
    75: 'Home study filled with collected artifacts, expedition photos, ancient maps, and handwritten field journals. Retired elder in a linen shirt, examining a beloved artifact with a magnifying glass. Soft warm golden light.',
  },
}

function sceneForAge(age: number, track: LifetimeNarrativeTrack, _genderHint: LifetimeGenderHint): string {
  const trackScenes = NARRATIVE_SCENES[track]
  const closest = TARGET_AGES.reduce((prev, curr) => (Math.abs(curr - age) < Math.abs(prev - age) ? curr : prev))
  return trackScenes[closest] ?? trackScenes[TARGET_AGES[0]]
}

function mediumShotFramingRule(): string {
  return [
    'CRITICAL HARD CONSTRAINT: Every single frame MUST be medium shot (mid-torso to head).',
    'Never output close-up/headshot-only framing.',
    'Never output full-body/wide framing.',
    'Both shoulders must remain fully visible; do not crop shoulders.',
    'Upper torso and outfit must be clearly visible in frame.',
    'Subject must be in a relaxed, natural POSE — never caught mid-action, mid-motion, or in dynamic movement.',
    'The subject should look like they paused naturally for a portrait in their environment.',
    'Occasional gentle eye contact with the camera is encouraged.',
  ].join(' ')
}

function ageAppearanceRule(age: number, genderHint: LifetimeGenderHint): string {
  const femaleHardRule =
    genderHint === 'female'
      ? 'Gender lock (female): preserve female-presenting identity continuity across all ages; never masculinize face/jaw/body; no moustache, no beard, no male facial-hair stubble.'
      : ''
  const maleHardRule =
    genderHint === 'male'
      ? 'Gender lock (male): preserve male-presenting identity continuity across all ages; avoid feminizing facial structure/body styling.'
      : ''
  const hardGenderRule = [femaleHardRule, maleHardRule].filter(Boolean).join(' ')

  if (age <= 7) {
    return [
      'CRITICAL age styling for 7 years:',
      'Face: clearly childlike proportions (softer cheeks, smaller jaw, larger-eye impression), no adult facial structure.',
      'Body map: narrow shoulders, shorter arms/torso ratio, child body mass distribution.',
      'Hair map: child haircut only, slightly updated from baby look, no static baby hair carry-over.',
      'Facial/body hair: none.',
      'Outfit: age-appropriate child clothing, playful but clean, no adult wardrobe.',
      hardGenderRule,
    ].join(' ')
  }
  if (age <= 12) {
    return [
      'CRITICAL age styling for 12 years:',
      'Face: pre-teen growth compared to age 7 (longer midface, reduced baby-fat look) while still clearly non-adult.',
      'Body map: visible growth in shoulder width, arm length, and torso height vs age 7.',
      'Hair map: evolve haircut from age 7, do not reuse identical style.',
      'Facial/body hair: none.',
      'Outfit: school/pre-teen casual, age-appropriate and distinct from age 7.',
      hardGenderRule,
    ].join(' ')
  }
  if (age <= 18) {
    return [
      'CRITICAL age styling for 18 years:',
      'Face: late-teen maturity (stronger jaw/cheekbone definition than age 12), clearly not pre-teen.',
      'Body map: adolescent growth complete enough for late teen (broader shoulders/chest frame, longer torso).',
      'Hair map: clear style shift from childhood/pre-teen; allow stronger teen styling.',
      genderHint === 'female'
        ? 'Female continuity for age 18: preserve a clearly female-presenting late-teen morphology (natural soft-tapered jawline and female facial ratios) without exaggerated glam styling.'
        : genderHint === 'male'
          ? 'Male continuity for age 18: preserve a clearly male-presenting late-teen morphology while avoiding over-mature adult hardening.'
          : 'Preserve identity-consistent late-teen morphology without forced gender stylization.',
      genderHint === 'female'
        ? 'Facial/body hair: none.'
        : genderHint === 'male'
          ? 'Facial/body hair: puberty-consistent emergence allowed (light moustache/beard shadow), never over-aged.'
          : 'Facial/body hair: puberty-consistent emergence may appear if identity-consistent; never over-aged.',
      genderHint === 'female'
        ? 'Outfit guidance: late-teen female casual/student styling, age-appropriate and natural, no masculine wardrobe shift.'
        : '',
      'Outfit: late-teen/student style, distinct from age 12 and age 25.',
      hardGenderRule,
    ].join(' ')
  }
  if (age <= 25) {
    return [
      'CRITICAL age styling for 25 years:',
      'Face: young-adult structure, visibly older than 18 with mature but youthful skin.',
      'Body map: adult shoulders/torso/arms; no teen body proportions.',
      'Hair map: evolve from age 18 with plausible young-adult grooming; keep identity but avoid static clone hair.',
      genderHint === 'female'
        ? 'Facial/body hair: none.'
        : genderHint === 'male'
          ? 'Facial/body hair: natural young-adult male pattern; can be fuller than 18 where plausible.'
          : 'Facial/body hair: natural young-adult pattern if identity-consistent.',
      'Outfit: young-adult wardrobe (smart casual/early professional), distinct from 18.',
      hardGenderRule,
    ].join(' ')
  }
  if (age <= 35) {
    return [
      'CRITICAL age styling for 35 years:',
      'Face: mature adult definition vs age 25 with subtle early lines.',
      'Body map: stable adult structure, shoulders/torso clearly adult.',
      'Hair map: mature grooming update from 25, not identical copy.',
      genderHint === 'female'
        ? 'Facial/body hair: none.'
        : genderHint === 'male'
          ? 'Facial/body hair: naturally groomed adult male pattern.'
          : 'Facial/body hair: naturally groomed adult pattern if identity-consistent.',
      'Outfit: confident adult smart-casual/professional style, evolved from 25.',
      hardGenderRule,
    ].join(' ')
  }
  if (age <= 45) {
    return [
      'CRITICAL age styling for 45 years:',
      'Face: mid-adult aging markers must be visible (eye corners, nasolabial depth) without over-aging.',
      'Body map: mature adult build with realistic posture and muscle/fat distribution shifts.',
      'Hair map: subtle recession/thickness changes where plausible; no frozen style from 35.',
      genderHint === 'female'
        ? 'Facial/body hair: none.'
        : genderHint === 'male'
          ? 'Facial/body hair: mature and identity-consistent male pattern.'
          : 'Facial/body hair: mature and identity-consistent.',
      'Outfit: mid-career mature style, distinct from 35.',
      hardGenderRule,
    ].join(' ')
  }
  if (age <= 55) {
    return [
      'CRITICAL age styling for 55 years:',
      'Face: clear mature-aging cues (fine wrinkles, skin texture changes, mild volume loss).',
      'Body map: older mature body with natural age posture shifts.',
      'Hair map: visible graying should begin/be present; do not keep uniformly youthful hair color.',
      genderHint === 'female'
        ? 'Facial/body hair: none.'
        : genderHint === 'male'
          ? 'Facial/body hair: graying male facial-hair patterns where plausible.'
          : 'Facial/body hair: graying patterns where plausible.',
      'Outfit: age-appropriate mature wardrobe, still stylish but not youthful teen/20s style.',
      hardGenderRule,
    ].join(' ')
  }
  if (age <= 65) {
    return [
      'CRITICAL age styling for 65 years:',
      'Face: older-adult markers must be clear (deeper wrinkles, age-related skin laxity, bone/soft-tissue aging).',
      'Body map: senior-adjacent posture/body distribution, still identity-consistent.',
      'Hair map: strong gray/white progression and possible thinning.',
      genderHint === 'female'
        ? 'Facial/body hair: none.'
        : genderHint === 'male'
          ? 'Facial/body hair: older-adult male pattern if present.'
          : 'Facial/body hair: older-adult pattern if present.',
      'Outfit: older-adult clothing, practical and age-appropriate.',
      hardGenderRule,
    ].join(' ')
  }
  return [
    'CRITICAL age styling for 75 years:',
    'Face: clearly senior appearance with strong but natural wrinkles and aging texture.',
    'Body map: senior body/posture cues appropriate for this age.',
    'Hair map: mostly gray/white with realistic texture/thinning.',
    genderHint === 'female'
      ? 'Facial/body hair: none.'
      : genderHint === 'male'
        ? 'Facial/body hair: senior-consistent male pattern if present.'
        : 'Facial/body hair: senior-consistent pattern if present.',
    'Outfit: senior-appropriate wardrobe, distinct from 65 and younger stages.',
    hardGenderRule,
  ].join(' ')
}

function ageGapEmphasisRule(fromAge: number, toAge: number): string {
  const gap = Math.max(1, toAge - fromAge)
  return [
    `CRITICAL age-gap rule: enforce a clearly visible ${gap}-year progression from ${fromAge} to ${toAge}.`,
    `The result must not be visually confusable with age ${fromAge}.`,
  ].join(' ')
}

function outfitContinuityRule(fromAge: number, toAge: number): string {
  return [
    `Outfit continuity rule from ${fromAge} -> ${toAge}:`,
    'Wardrobe must evolve gradually and age-appropriately.',
    'Do not keep the exact same outfit across adjacent frames.',
    'Do not make radical costume jumps; keep realistic continuity.',
  ].join(' ')
}

function genderHintRule(genderHint: LifetimeGenderHint): string {
  if (genderHint === 'male') {
    return [
      'CRITICAL gender lock (user-selected): male.',
      'Keep male-presenting identity across all frames.',
      'Do NOT switch to female-presenting morphology at any age step.',
      'Keep male-consistent maturation cues, grooming, and age-appropriate male wardrobe evolution.',
    ].join(' ')
  }
  if (genderHint === 'female') {
    return [
      'CRITICAL gender lock (user-selected): female.',
      'Keep female-presenting identity across all frames.',
      'Do NOT switch to male-presenting morphology at any age step.',
      'Keep female-consistent maturation cues, grooming, and age-appropriate female wardrobe evolution.',
      'Never introduce moustache, beard, or masculine jawline/body styling.',
    ].join(' ')
  }
  return 'Gender hint: auto-infer from reference identity without forcing binary stereotypes.'
}

function buildNormalizePrompt(
  age: number,
  mode: LifetimeBackgroundMode,
  genderHint: LifetimeGenderHint,
  track?: LifetimeNarrativeTrack,
): string {
  const backgroundRule =
    mode === 'white_bg' || !track
      ? 'Pure white solid background (#FFFFFF). Keep identical pose and framing across timeline.'
      : `Natural background mode: place the subject in ${sceneForAge(age, track, genderHint)}. Environment must be photorealistic and narrative-consistent.`
  const appearanceRule = ageAppearanceRule(age, genderHint)
  const framingRule = mediumShotFramingRule()
  const genderRule = genderHintRule(genderHint)
  return [
    REFERENCE_IDENTITY_SOURCE_CRITICAL,
    'CRITICAL: Prioritize highest possible facial resemblance to the reference identity.',
    'CRITICAL: Do not change identity, ethnicity, skin tone, eye color, or defining facial landmarks.',
    'Treat the subject as a baby from the reference photo.',
    `Create a photorealistic age progression of the exact same person at ${age}-years old.`,
    `Professional direction: "How the baby in the reference photo would look at the age of ${age}."`,
    genderRule,
    appearanceRule,
    framingRule,
    backgroundRule,
    'Vertical 9:16 composition, centered framing, no extra people, no props, no text.',
  ].join(' ')
}

function buildStagePoseRule(frameIndex: number): string {
  // frameIndex: 0 => first frame, 1 => second frame, 2+ => third and later
  if (frameIndex >= 2) {
    return 'Keep the subject upright and front-facing with a stable medium-shot framing continuity.'
  }
  if (frameIndex >= 1) {
    return 'For this frame, transition the subject into a natural standing pose with balanced posture while preserving medium-shot framing.'
  }
  return ''
}

function buildProgressionPrompt(
  fromAge: number,
  toAge: number,
  mode: LifetimeBackgroundMode,
  frameIndex: number,
  genderHint: LifetimeGenderHint,
  track?: LifetimeNarrativeTrack,
): string {
  const backgroundRule =
    mode === 'white_bg' || !track
      ? 'Pure white solid background (#FFFFFF). Keep visual continuity while allowing pose/framing updates required by stage rules.'
      : `Natural background mode: update the environment to match age ${toAge} — ${sceneForAge(toAge, track, genderHint)}.`
  const stagePoseRule = buildStagePoseRule(frameIndex)
  const appearanceRule = ageAppearanceRule(toAge, genderHint)
  const framingRule = mediumShotFramingRule()
  const gapRule = ageGapEmphasisRule(fromAge, toAge)
  const wardrobeRule = outfitContinuityRule(fromAge, toAge)
  const genderRule = genderHintRule(genderHint)
  return [
    'CRITICAL: Use ALL provided reference images as mandatory identity anchors.',
    'CRITICAL: Prioritize highest possible facial resemblance and identity continuity.',
    'CRITICAL: Do not change identity, ethnicity, skin tone, eye color, or defining facial landmarks.',
    `The person in the reference image is ${fromAge}-years old.`,
    `How would this person look like at the age of ${toAge}?`,
    'Keep exact identity consistency while updating age progression only.',
    genderRule,
    gapRule,
    appearanceRule,
    wardrobeRule,
    framingRule,
    stagePoseRule,
    backgroundRule,
    'Vertical 9:16 composition, centered framing, no extra people, no props, no text.',
  ].join(' ')
}

function buildTransitionPrompt(
  fromAge: number,
  toAge: number,
  mode: LifetimeBackgroundMode,
  track?: LifetimeNarrativeTrack,
): string {
  const transitionBackgroundRule =
    mode === 'white_bg' || !track
      ? 'Keep pure white background throughout the whole transition.'
      : `Background should transition naturally from the age-${fromAge} scene to the age-${toAge} scene, reflecting the life journey of the subject.`
  return [
    `Smooth cinematic age transition of the exact same person from ${fromAge}-years old to ${toAge}-years old.`,
    'CRITICAL HARD CONSTRAINT: Keep medium-shot continuity during the entire transition (mid-torso to head, both shoulders visible).',
    transitionBackgroundRule,
    'No camera shake, no extra people, no text.',
  ].join(' ')
}

function buildSourceFramePrompt(mode: LifetimeBackgroundMode, genderHint: LifetimeGenderHint): string {
  const genderRule = genderHintRule(genderHint)
  if (mode === 'white_bg') {
    return [
      REFERENCE_IDENTITY_SOURCE_CRITICAL,
      'CRITICAL: Keep the exact same baby identity, facial structure, skin tone, and age.',
      genderRule,
      'Remove the existing background completely and replace it with pure white (#FFFFFF).',
      'Create a clean studio-style 9:16 medium shot with the baby centered and clearly visible.',
      'Face must be directly front-facing to camera.',
      'Keep both shoulders visible and include upper torso/outfit in frame.',
      'No extra people, no props, no text, no logos.',
    ].join(' ')
  }
  return [
    REFERENCE_IDENTITY_SOURCE_CRITICAL,
    'Keep the exact same baby identity and apparent age.',
    genderRule,
    'Create a clean, natural-looking 9:16 portrait with realistic environment continuity.',
    'No extra people, no text, no logos.',
  ].join(' ')
}

async function downloadInputImageFromUrl(imageUrl: string, uploadsDir: string): Promise<string> {
  const normalizedUrl = ensureHttpUrl(imageUrl)
  await fs.mkdir(uploadsDir, { recursive: true })

  const response = await fetch(normalizedUrl, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Failed to fetch image URL (HTTP ${response.status})`)
  }

  const contentTypeHeader = response.headers.get('content-type') || ''
  const mimeType = contentTypeHeader.split(';')[0]?.trim().toLowerCase()
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new Error('URL must point to a JPG, PNG, or WebP image')
  }

  const contentLengthHeader = response.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (Number.isFinite(contentLength) && contentLength > MAX_INPUT_IMAGE_BYTES) {
      throw new Error('Image size exceeds 10MB limit')
    }
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) {
    throw new Error('Image URL returned empty content')
  }
  if (bytes.length > MAX_INPUT_IMAGE_BYTES) {
    throw new Error('Image size exceeds 10MB limit')
  }

  const ext = extensionForMimeType(mimeType)
  const outputPath = path.join(
    uploadsDir,
    `lifetime_input_url_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`,
  )
  await fs.writeFile(outputPath, bytes)
  return outputPath
}

function cleanupOldJobs(): void {
  const now = Date.now()
  for (const [jobId, job] of lifetimeRunJobs.entries()) {
    if (now - new Date(job.updatedAt).getTime() > JOB_RETENTION_MS) lifetimeRunJobs.delete(jobId)
  }
  for (const [jobId, job] of lifetimeVideoJobs.entries()) {
    if (now - new Date(job.updatedAt).getTime() > JOB_RETENTION_MS) lifetimeVideoJobs.delete(jobId)
  }
}

function createJob(backgroundMode: LifetimeBackgroundMode): LifetimeRunJob {
  const nowIso = new Date().toISOString()
  const totalSteps = TARGET_AGES.length + (backgroundMode === 'white_bg' ? 1 : 0)
  return {
    jobId: makeRunJobId(),
    status: 'queued',
    startedAt: nowIso,
    updatedAt: nowIso,
    backgroundMode,
    progress: {
      total: totalSteps,
      completed: 0,
      currentAge: null,
      message: 'Queued',
    },
    sourceFrameUrl: '',
    frames: [],
    sessionId: '',
    error: '',
    earlyTransitionsStarted: 0,
    earlyTransitionsInFlight: 0,
    earlyTransitionStartedKeys: new Set(),
    earlyTransitions: new Map(),
    earlyTransitionPromises: [],
  }
}

function updateJob(jobId: string, updater: (job: LifetimeRunJob) => void): void {
  const current = lifetimeRunJobs.get(jobId)
  if (!current) return
  updater(current)
  current.updatedAt = new Date().toISOString()
  lifetimeRunJobs.set(jobId, current)
}

function acquireEarlyTransitionSlot(jobId: string): boolean {
  const job = lifetimeRunJobs.get(jobId)
  if (!job) return true
  if (job.earlyTransitionsInFlight < TRANSITION_BATCH_CONCURRENCY) {
    job.earlyTransitionsInFlight += 1
    return true
  }
  return false
}

function releaseEarlyTransitionSlot(jobId: string): void {
  const job = lifetimeRunJobs.get(jobId)
  if (job) job.earlyTransitionsInFlight -= 1
}

function fireEarlyTransition(params: {
  jobId: string
  sessionId: string
  outputsDir: string
  outputDir: string
  fromAge: number
  fromImagePath: string
  toAge: number
  toImagePath: string
  backgroundMode: LifetimeBackgroundMode
  narrativeTrack?: LifetimeNarrativeTrack
}): Promise<void> {
  const {
    jobId,
    sessionId,
    outputsDir,
    outputDir,
    fromAge,
    fromImagePath,
    toAge,
    toImagePath,
    backgroundMode,
    narrativeTrack,
  } = params
  const key = `${fromAge}-${toAge}`

  const job = lifetimeRunJobs.get(jobId)
  if (job) {
    job.earlyTransitionsStarted += 1
    job.earlyTransitionStartedKeys.add(key)
  }

  return (async () => {
    while (!acquireEarlyTransitionSlot(jobId)) {
      await new Promise((r) => setTimeout(r, 500))
    }

    try {
      const prompt = buildTransitionPrompt(fromAge, toAge, backgroundMode, narrativeTrack)
      const videoResult = await generateKlingTransitionVideo({
        startImagePath: fromImagePath,
        endImagePath: toImagePath,
        prompt,
        duration: '5',
        aspectRatio: '9:16',
      })
      const outputPath = makeTransitionOutputPath(outputDir, sessionId, fromAge, toAge)
      await downloadKlingVideo(videoResult.videoUrl, outputPath)

      const doneJob = lifetimeRunJobs.get(jobId)
      if (doneJob) {
        doneJob.earlyTransitions.set(key, {
          fromAge,
          toAge,
          videoPath: outputPath,
          videoUrl: toPublicOutputPath(outputsDir, outputPath),
          prompt,
        })
      }
      console.log(`[Lifetime] Early transition ${key} completed`)
    } catch (error) {
      console.warn(`[Lifetime] Early transition ${key} failed (non-critical):`, error)
    } finally {
      releaseEarlyTransitionSlot(jobId)
    }
  })()
}

async function runGenerateFramesJob(params: {
  jobId: string
  outputsDir: string
  uploadsDir: string
  inputImagePath: string
  inputImageUrl: string
  backgroundMode: LifetimeBackgroundMode
  genderHint: LifetimeGenderHint
  userId: number | undefined
}): Promise<void> {
  const { jobId, outputsDir, uploadsDir, inputImagePath, inputImageUrl, backgroundMode, genderHint, userId } = params
  let span: ReturnType<typeof createPipelineSpan> | null = null
  let workingInputPath = inputImagePath
  let effectiveGenderHint: LifetimeGenderHint = genderHint

  try {
    updateJob(jobId, (job) => {
      job.status = 'running'
      job.progress.message = 'Starting frame generation'
    })

    span = createPipelineSpan({
      pipeline: 'lifetime.generate_frames',
      userId,
      metadata: {
        backgroundMode,
        genderHintRequested: genderHint,
        frameCount: TARGET_AGES.length,
        mode: 'async',
      },
    })

    if (!workingInputPath) {
      updateJob(jobId, (job) => {
        job.progress.currentAge = null
        job.progress.message = 'Downloading source image'
      })
      workingInputPath = await downloadInputImageFromUrl(inputImageUrl, uploadsDir)
    }

    const sessionId = makeSessionId()
    const outputLayout = getLifetimeSessionOutputLayout(outputsDir, sessionId)
    const outputDir = outputLayout.outputDir
    await fs.mkdir(outputDir, { recursive: true })

    const narrativeTrack =
      backgroundMode === 'natural_bg'
        ? NARRATIVE_TRACKS[Math.floor(Math.random() * NARRATIVE_TRACKS.length)]
        : undefined

    const inputExt = path.extname(workingInputPath).replace(/^\./, '').toLowerCase() || 'jpg'
    const originalReferencePath = path.join(outputDir, buildJobOutputFileName('reference', sessionId, inputExt))
    await fs.copyFile(workingInputPath, originalReferencePath)

    let sourceFramePath = originalReferencePath
    let sourceFrameUrl = toPublicOutputPath(outputsDir, originalReferencePath)

    if (backgroundMode === 'white_bg') {
      updateJob(jobId, (job) => {
        job.progress.currentAge = null
        job.progress.message = `Generating baby source frame (1/${job.progress.total})`
      })

      const sourcePrompt = buildSourceFramePrompt(backgroundMode, effectiveGenderHint)
      const sourceResult = await generateImage(`file://${originalReferencePath}`, sourcePrompt, {
        resolution: '2K',
        aspectRatio: '9:16',
        numImages: 1,
        outputFormat: 'jpeg',
      })
      const sourceGeneratedUrl = sourceResult.urls[0]
      if (!sourceGeneratedUrl) {
        throw new Error('No source frame URL returned')
      }

      sourceFramePath = makeSourceFrameOutputPath(outputDir, sessionId)
      await downloadImage(sourceGeneratedUrl, sourceFramePath)
      sourceFrameUrl = toPublicOutputPath(outputsDir, sourceFramePath)

      updateJob(jobId, (job) => {
        job.progress.completed = 1
        job.progress.currentAge = null
        job.progress.message = `Baby source frame ready (1/${job.progress.total})`
      })
    }

    updateJob(jobId, (job) => {
      job.sourceFrameUrl = sourceFrameUrl
      job.frames = [{ age: 0, imageUrl: sourceFrameUrl }]
    })

    const frames: LifetimeFrameRecord[] = []
    for (let index = 0; index < TARGET_AGES.length; index += 1) {
      const age = TARGET_AGES[index]
      updateJob(jobId, (job) => {
        job.progress.currentAge = age
        job.progress.message = `Generating age ${age} frame (${index + 1}/${TARGET_AGES.length})`
      })

      const prompt =
        index === 0
          ? buildNormalizePrompt(age, backgroundMode, effectiveGenderHint, narrativeTrack)
          : buildProgressionPrompt(
              TARGET_AGES[index - 1],
              age,
              backgroundMode,
              index,
              effectiveGenderHint,
              narrativeTrack,
            )
      const referenceImagePaths =
        index === 0
          ? backgroundMode === 'white_bg'
            ? `file://${sourceFramePath}`
            : `file://${originalReferencePath}`
          : `file://${frames[index - 1].imagePath}`

      const result = await generateImage(referenceImagePaths, prompt, {
        resolution: '2K',
        aspectRatio: '9:16',
        numImages: 1,
        outputFormat: 'jpeg',
      })
      const generatedUrl = result.urls[0]
      if (!generatedUrl) {
        throw new Error(`No image URL returned for age ${age}`)
      }

      const outputPath = makeFrameOutputPath(outputDir, sessionId, age)
      await downloadImage(generatedUrl, outputPath)
      const frame: LifetimeFrameRecord = {
        age,
        imagePath: outputPath,
        imageUrl: toPublicOutputPath(outputsDir, outputPath),
        prompt,
      }
      frames.push(frame)

      if (index === 0 && genderHint === 'auto' && effectiveGenderHint === 'auto') {
        try {
          const prediction = await predictGenderHint(outputPath)
          if (prediction.genderHint === 'male' || prediction.genderHint === 'female') {
            effectiveGenderHint = prediction.genderHint
            updateJob(jobId, (job) => {
              job.progress.message = `Locked gender from first frame: ${prediction.genderHint}`
            })
          }
        } catch (predictionError) {
          console.warn('[Lifetime] Gender lock prediction failed, continuing with auto mode:', predictionError)
        }
      }

      updateJob(jobId, (job) => {
        const sourceStepOffset = backgroundMode === 'white_bg' ? 1 : 0
        job.progress.completed = sourceStepOffset + frames.length
        const sourceFrameEntry = backgroundMode === 'white_bg' ? [{ age: 0, imageUrl: sourceFrameUrl }] : []
        job.frames = [...sourceFrameEntry, ...frames.map((item) => ({ age: item.age, imageUrl: item.imageUrl }))]
        job.progress.message = `Generated ${sourceStepOffset + frames.length}/${job.progress.total} steps`
      })

      const prevImagePath = index === 0 ? sourceFramePath : frames[index - 1].imagePath
      const prevAge = index === 0 ? 0 : frames[index - 1].age
      const transitionPromise = fireEarlyTransition({
        jobId,
        sessionId,
        outputsDir,
        outputDir,
        fromAge: prevAge,
        fromImagePath: prevImagePath,
        toAge: frame.age,
        toImagePath: frame.imagePath,
        backgroundMode,
        narrativeTrack,
      })
      updateJob(jobId, (job) => {
        job.earlyTransitionPromises.push(transitionPromise)
      })
    }

    const nowIso = new Date().toISOString()
    const manifest: LifetimeSessionManifest = {
      sessionId,
      createdAt: nowIso,
      updatedAt: nowIso,
      outputDir,
      outputDirUrl: toPublicOutputPath(outputsDir, outputDir),
      originalReferencePath,
      sourceFramePath,
      sourceFrameUrl,
      backgroundMode,
      genderHint: effectiveGenderHint,
      narrativeTrack,
      ages: [...TARGET_AGES],
      frames,
      transitions: [...(lifetimeRunJobs.get(jobId)?.earlyTransitions.values() ?? [])].sort(
        (a, b) => a.fromAge - b.fromAge,
      ),
      finalVideoPath: '',
      finalVideoUrl: '',
      finalVideoDurationSec: 0,
    }
    await saveManifest(manifest)

    updateJob(jobId, (job) => {
      job.status = 'completed'
      job.sessionId = sessionId
      job.sourceFrameUrl = sourceFrameUrl
      const sourceFrameEntry = backgroundMode === 'white_bg' ? [{ age: 0, imageUrl: sourceFrameUrl }] : []
      job.frames = [...sourceFrameEntry, ...frames.map((item) => ({ age: item.age, imageUrl: item.imageUrl }))]
      job.progress.currentAge = null
      job.progress.completed = job.progress.total
      job.progress.message = 'Frame generation completed'
    })

    span.success({
      sessionId,
      frameCount: frames.length,
      outputDir,
      genderHintRequested: genderHint,
      genderHintEffective: effectiveGenderHint,
    })
  } catch (error) {
    console.error('[Lifetime] Frame generation job failed:', error)
    span?.error(error)
    updateJob(jobId, (job) => {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Unknown error'
      job.progress.message = 'Frame generation failed'
      job.progress.currentAge = null
    })
  } finally {
    if (workingInputPath) {
      await fs.unlink(workingInputPath).catch(() => {})
    }
  }
}

async function runCreateVideosJob(params: {
  jobId: string
  outputsDir: string
  sessionId: string
  targetDurationSec: number
  userId: number | undefined
}): Promise<void> {
  const { jobId, outputsDir, sessionId, targetDurationSec, userId } = params
  let span: ReturnType<typeof createPipelineSpan> | null = null

  try {
    updateVideoJob(jobId, (job) => {
      job.status = 'running'
      job.assemblyStage = 'editing'
      job.progress.message = 'Starting video creation'
    })

    const manifest = await loadManifest(outputsDir, sessionId)
    const sourceFramePath = manifest.sourceFramePath || manifest.originalReferencePath
    const sourceFrameUrl = manifest.sourceFrameUrl || toPublicOutputPath(outputsDir, sourceFramePath)
    const timelineFrames: LifetimeTimelineFrame[] = [
      { age: 0, imagePath: sourceFramePath, imageUrl: sourceFrameUrl },
      ...manifest.frames.map((frame) => ({ age: frame.age, imagePath: frame.imagePath, imageUrl: frame.imageUrl })),
    ]

    span = createPipelineSpan({
      pipeline: 'lifetime.create_videos',
      userId,
      metadata: { sessionId, frameCount: timelineFrames.length, backgroundMode: manifest.backgroundMode },
    })

    await removeFinalVideoFile(manifest)
    manifest.finalVideoPath = ''
    manifest.finalVideoUrl = ''
    manifest.finalVideoDurationSec = 0

    const runJob = [...lifetimeRunJobs.values()].find((j) => j.sessionId === sessionId)
    if (runJob && runJob.earlyTransitionPromises.length > 0) {
      updateVideoJob(jobId, (job) => {
        job.progress.message = 'Waiting for in-flight early transitions to finish...'
      })
      await Promise.allSettled(runJob.earlyTransitionPromises)
      manifest.transitions = [...runJob.earlyTransitions.values()].sort((a, b) => a.fromAge - b.fromAge)
      await saveManifest(manifest)
    }

    const transitionCount = timelineFrames.length - 1
    const transitionSlots = new Array<LifetimeTransitionRecord | null>(transitionCount).fill(null)
    let completedCount = 0

    const existingByKey = new Map(manifest.transitions.map((t) => [`${t.fromAge}-${t.toAge}`, t]))
    const missingItems: Array<{ index: number; fromFrame: LifetimeTimelineFrame; toFrame: LifetimeTimelineFrame }> = []

    for (let i = 0; i < transitionCount; i++) {
      const fromFrame = timelineFrames[i]
      const toFrame = timelineFrames[i + 1]
      const key = `${fromFrame.age}-${toFrame.age}`
      const existing = existingByKey.get(key)
      if (existing) {
        try {
          await fs.access(existing.videoPath)
          transitionSlots[i] = existing
          completedCount += 1
          continue
        } catch {
          // file missing, regenerate
        }
      }
      missingItems.push({ index: i, fromFrame, toFrame })
    }

    const reusedCount = completedCount
    if (reusedCount > 0) {
      console.log(`[Lifetime] Reusing ${reusedCount}/${transitionCount} early transitions`)
    }

    const totalSteps = missingItems.length + 1
    updateVideoJob(jobId, (job) => {
      job.progress.total = totalSteps
      job.progress.completed = 0
      job.transitions = transitionSlots
        .filter((t): t is LifetimeTransitionRecord => t !== null)
        .map((t) => ({ fromAge: t.fromAge, toAge: t.toAge, videoUrl: t.videoUrl }))
      job.progress.message =
        missingItems.length === 0
          ? 'All transitions ready, assembling video...'
          : `Generating ${missingItems.length} transitions (${reusedCount} pre-generated)`
    })

    let missingCompleted = 0
    if (missingItems.length > 0) {
      await runWithConcurrency(missingItems, TRANSITION_BATCH_CONCURRENCY, async ({ index, fromFrame, toFrame }) => {
        updateVideoJob(jobId, (job) => {
          job.progress.currentStep = `Age ${fromFrame.age} → ${toFrame.age}`
        })

        const prompt = buildTransitionPrompt(
          fromFrame.age,
          toFrame.age,
          manifest.backgroundMode,
          manifest.narrativeTrack,
        )
        const videoResult = await generateKlingTransitionVideo({
          startImagePath: fromFrame.imagePath,
          endImagePath: toFrame.imagePath,
          prompt,
          duration: '5',
          aspectRatio: '9:16',
        })
        const outputPath = makeTransitionOutputPath(manifest.outputDir, manifest.sessionId, fromFrame.age, toFrame.age)
        await downloadKlingVideo(videoResult.videoUrl, outputPath)

        transitionSlots[index] = {
          fromAge: fromFrame.age,
          toAge: toFrame.age,
          videoPath: outputPath,
          videoUrl: toPublicOutputPath(outputsDir, outputPath),
          prompt,
        }
        missingCompleted += 1

        updateVideoJob(jobId, (job) => {
          job.progress.completed = missingCompleted
          job.transitions = transitionSlots
            .filter((t): t is LifetimeTransitionRecord => t !== null)
            .map((t) => ({ fromAge: t.fromAge, toAge: t.toAge, videoUrl: t.videoUrl }))
          job.progress.message = `Generating transitions (${missingCompleted}/${missingItems.length})`
        })
      })
    }

    // Clean up any stale transition files not in current slots
    const activeTransitionPaths = new Set(transitionSlots.filter(Boolean).map((t) => t!.videoPath))
    for (const old of manifest.transitions) {
      if (!activeTransitionPaths.has(old.videoPath)) {
        await fs.unlink(old.videoPath).catch(() => {})
      }
    }

    const transitions = transitionSlots.filter((t): t is LifetimeTransitionRecord => t !== null)

    updateVideoJob(jobId, (job) => {
      job.assemblyStage = 'adjusting_time'
      job.progress.currentStep = 'Assembling final video'
      job.progress.message = 'Adjusting time...'
    })

    manifest.transitions = transitions
    const finalVideo = await buildFinalLifetimeVideo({
      outputDir: manifest.outputDir,
      outputsDir,
      sessionId: manifest.sessionId,
      transitionVideoPaths: transitions.map((t) => t.videoPath),
      targetDurationSec,
    })

    updateVideoJob(jobId, (job) => {
      job.assemblyStage = 'finalizing'
      job.progress.message = 'Finalizing...'
    })

    manifest.finalVideoPath = finalVideo.videoPath
    manifest.finalVideoUrl = finalVideo.videoUrl
    manifest.finalVideoDurationSec = targetDurationSec
    await saveManifest(manifest)

    updateVideoJob(jobId, (job) => {
      job.status = 'completed'
      job.assemblyStage = 'done'
      job.progress.completed = job.progress.total
      job.progress.currentStep = ''
      job.progress.message = 'Lifetime video created'
      job.transitions = transitions.map((t) => ({ fromAge: t.fromAge, toAge: t.toAge, videoUrl: t.videoUrl }))
      job.finalVideoUrl = manifest.finalVideoUrl || ''
      job.finalVideoDurationSec = targetDurationSec
    })

    span.success({ sessionId, transitionCount: transitions.length })
  } catch (error) {
    console.error('[Lifetime] Video creation job failed:', error)
    span?.error(error)
    updateVideoJob(jobId, (job) => {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Unknown error'
      job.progress.currentStep = ''
      job.progress.message = 'Video creation failed'
    })
  }
}

export function createLifetimeRouter(config: LifetimeRouterConfig): Router {
  const { projectRoot } = config
  const outputsDir = path.join(projectRoot, 'outputs')
  const uploadsDir = path.join(projectRoot, 'uploads')

  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(uploadsDir, { recursive: true })
      cb(null, uploadsDir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `lifetime_input_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  })

  const upload = multer({
    storage,
    limits: { fileSize: MAX_INPUT_IMAGE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
        cb(null, true)
      } else {
        cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed.'))
      }
    },
  })

  const router = Router()

  router.post('/run', lifetimeLimiter, upload.single('babyImage'), async (req: AuthRequest, res) => {
    req.setTimeout(20 * 60 * 1000)
    res.setTimeout(20 * 60 * 1000)

    const file = req.file
    const inputImagePath = file?.path || ''
    const inputImageUrl = inputImagePath ? '' : extractBabyImageUrl(req.body.babyImageUrl)
    let launched = false

    try {
      if (!inputImagePath && !inputImageUrl) {
        sendError(res, 400, 'Baby image is required', 'MISSING_BABY_IMAGE')
        return
      }
      if (!inputImagePath && inputImageUrl) {
        try {
          ensureHttpUrl(inputImageUrl)
        } catch (error) {
          sendError(
            res,
            400,
            'Invalid baby image URL',
            'INVALID_BABY_IMAGE_URL',
            error instanceof Error ? error.message : 'Image URL must be valid',
          )
          return
        }
      }

      cleanupOldJobs()
      const backgroundMode = parseBackgroundMode(req.body.backgroundMode)
      const genderHint = parseGenderHint(req.body.genderHint)
      const job = createJob(backgroundMode)
      lifetimeRunJobs.set(job.jobId, job)

      launched = true
      void runGenerateFramesJob({
        jobId: job.jobId,
        outputsDir,
        uploadsDir,
        inputImagePath,
        inputImageUrl,
        backgroundMode,
        genderHint,
        userId: req.user?.id,
      })

      sendSuccess(res, {
        jobId: job.jobId,
        status: job.status,
        totalFrames: TARGET_AGES.length + (backgroundMode === 'white_bg' ? 1 : 0),
        ages: backgroundMode === 'white_bg' ? [0, ...TARGET_AGES] : [...TARGET_AGES],
      })
    } catch (error) {
      console.error('[Lifetime] Failed to start frame generation:', error)
      sendError(
        res,
        500,
        'Failed to start lifetime frame generation',
        'LIFETIME_FRAME_GENERATION_START_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    } finally {
      if (!launched && inputImagePath) {
        await fs.unlink(inputImagePath).catch(() => {})
      }
    }
  })

  router.get('/run-status/:jobId', (req, res) => {
    const jobId = parseSessionId(req.params.jobId)
    if (!jobId) {
      sendError(res, 400, 'jobId is required', 'MISSING_JOB_ID')
      return
    }

    const job = lifetimeRunJobs.get(jobId)
    if (!job) {
      sendError(res, 404, 'Lifetime generation job not found', 'LIFETIME_JOB_NOT_FOUND')
      return
    }

    const hasSourceInFrames = job.frames.some((frame) => frame.age === 0)
    const framesWithSource =
      job.sourceFrameUrl && !hasSourceInFrames ? [{ age: 0, imageUrl: job.sourceFrameUrl }, ...job.frames] : job.frames

    const allPairs = [0, ...TARGET_AGES]
    const earlyTransitionStatuses = allPairs.slice(0, -1).map((fromAge, i) => {
      const toAge = allPairs[i + 1]
      const key = `${fromAge}-${toAge}`
      if (job.earlyTransitions.has(key)) return { fromAge, toAge, status: 'completed' as const }
      if (job.earlyTransitionStartedKeys.has(key)) return { fromAge, toAge, status: 'in_progress' as const }
      return { fromAge, toAge, status: 'pending' as const }
    })

    const outputLayout =
      job.sessionId && parseSessionId(job.sessionId) ? getLifetimeSessionOutputLayout(outputsDir, job.sessionId) : null

    sendSuccess(res, {
      jobId: job.jobId,
      status: job.status,
      sessionId: job.sessionId,
      outputDirUrl: outputLayout?.outputDirUrl || '',
      outputDirLocal: outputLayout?.outputDir || '',
      error: job.error,
      progress: job.progress,
      sourceFrameUrl: job.sourceFrameUrl,
      frames: framesWithSource,
      earlyTransitionsStarted: job.earlyTransitionsStarted,
      earlyTransitionsCompleted: job.earlyTransitions.size,
      earlyTransitionStatuses,
    })
  })

  router.post('/regenerate-frame', lifetimeLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(20 * 60 * 1000)
    res.setTimeout(20 * 60 * 1000)

    const sessionId = parseSessionId(req.body?.sessionId)
    const targetAge = parseTargetAge(req.body?.age)
    const requestedGenderHint =
      typeof req.body?.genderHint === 'string' ? parseGenderHint(req.body.genderHint) : undefined
    if (!sessionId) {
      sendError(res, 400, 'sessionId is required', 'MISSING_SESSION_ID')
      return
    }
    if (!Number.isInteger(targetAge)) {
      sendError(res, 400, 'age is required', 'MISSING_TARGET_AGE')
      return
    }

    let span: ReturnType<typeof createPipelineSpan> | null = null

    try {
      const manifest = await loadManifest(outputsDir, sessionId)
      if (requestedGenderHint === 'male' || requestedGenderHint === 'female') {
        manifest.genderHint = requestedGenderHint
      }

      if (targetAge === 0) {
        span = createPipelineSpan({
          pipeline: 'lifetime.regenerate_source',
          userId: req.user?.id,
          metadata: { sessionId, backgroundMode: manifest.backgroundMode },
        })

        const sourcePrompt = buildSourceFramePrompt(manifest.backgroundMode, manifest.genderHint || 'auto')
        const sourceResult = await generateImage(`file://${manifest.originalReferencePath}`, sourcePrompt, {
          resolution: '2K',
          aspectRatio: '9:16',
          numImages: 1,
          outputFormat: 'jpeg',
        })
        const sourceGeneratedUrl = sourceResult.urls[0]
        if (!sourceGeneratedUrl) {
          throw new Error('No image URL returned for regenerated source frame')
        }

        const nextSourcePath = makeSourceFrameOutputPath(manifest.outputDir, manifest.sessionId)
        await downloadImage(sourceGeneratedUrl, nextSourcePath)
        const previousSourcePath = manifest.sourceFramePath

        if (manifest.frames.length > 0) {
          await removeFrameFiles(manifest.frames)
        }
        if (manifest.transitions.length > 0) {
          await removeTransitionFiles(manifest.transitions)
        }
        await removeFinalVideoFile(manifest)

        manifest.sourceFramePath = nextSourcePath
        manifest.sourceFrameUrl = toPublicOutputPath(outputsDir, nextSourcePath)
        manifest.frames = []
        manifest.transitions = []
        manifest.finalVideoPath = ''
        manifest.finalVideoUrl = ''
        manifest.finalVideoDurationSec = 0
        await saveManifest(manifest)

        if (
          previousSourcePath &&
          previousSourcePath !== manifest.originalReferencePath &&
          previousSourcePath !== nextSourcePath
        ) {
          await fs.unlink(previousSourcePath).catch(() => {})
        }

        span.success({ sessionId })
        sendSuccess(res, {
          sessionId: manifest.sessionId,
          sourceFrameUrl: manifest.sourceFrameUrl,
          frames: [{ age: 0, imageUrl: manifest.sourceFrameUrl }],
          transitions: [],
          finalVideoUrl: '',
        })
        return
      }

      const frameIndex = manifest.frames.findIndex((frame) => frame.age === targetAge)
      if (frameIndex < 0) {
        sendError(res, 404, `Age frame ${targetAge} not found in this session`, 'FRAME_NOT_FOUND')
        return
      }

      span = createPipelineSpan({
        pipeline: 'lifetime.regenerate_frame',
        userId: req.user?.id,
        metadata: { sessionId, age: targetAge, backgroundMode: manifest.backgroundMode },
      })

      const currentFrame = manifest.frames[frameIndex]
      const prompt =
        frameIndex === 0
          ? buildNormalizePrompt(
              currentFrame.age,
              manifest.backgroundMode,
              manifest.genderHint || 'auto',
              manifest.narrativeTrack,
            )
          : buildProgressionPrompt(
              manifest.frames[frameIndex - 1].age,
              currentFrame.age,
              manifest.backgroundMode,
              frameIndex,
              manifest.genderHint || 'auto',
              manifest.narrativeTrack,
            )
      const sourceAnchorPath = manifest.sourceFramePath || manifest.originalReferencePath
      const referenceImagePaths =
        frameIndex === 0
          ? manifest.backgroundMode === 'white_bg'
            ? `file://${sourceAnchorPath}`
            : `file://${manifest.originalReferencePath}`
          : `file://${manifest.frames[frameIndex - 1].imagePath}`

      const result = await generateImage(referenceImagePaths, prompt, {
        resolution: '2K',
        aspectRatio: '9:16',
        numImages: 1,
        outputFormat: 'jpeg',
      })
      const generatedUrl = result.urls[0]
      if (!generatedUrl) {
        throw new Error(`No image URL returned for regenerated age ${targetAge}`)
      }

      const nextOutputPath = makeFrameOutputPath(manifest.outputDir, manifest.sessionId, currentFrame.age)
      await downloadImage(generatedUrl, nextOutputPath)
      const previousPath = currentFrame.imagePath

      manifest.frames[frameIndex] = {
        ...currentFrame,
        imagePath: nextOutputPath,
        imageUrl: toPublicOutputPath(outputsDir, nextOutputPath),
        prompt,
      }

      if (manifest.transitions.length > 0) {
        await removeTransitionFiles(manifest.transitions)
      }
      await removeFinalVideoFile(manifest)
      manifest.transitions = []
      manifest.finalVideoPath = ''
      manifest.finalVideoUrl = ''
      manifest.finalVideoDurationSec = 0
      await saveManifest(manifest)
      if (previousPath !== nextOutputPath) {
        await fs.unlink(previousPath).catch(() => {})
      }

      span.success({ sessionId, age: targetAge })
      sendSuccess(res, {
        sessionId: manifest.sessionId,
        frames: manifest.frames.map((frame) => ({ age: frame.age, imageUrl: frame.imageUrl })),
        transitions: [],
        finalVideoUrl: '',
      })
    } catch (error) {
      console.error('[Lifetime] Regenerate frame failed:', error)
      span?.error(error)
      sendError(
        res,
        500,
        'Failed to regenerate lifetime frame',
        'LIFETIME_REGENERATE_FRAME_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.post('/create-videos', lifetimeLimiter, async (req: AuthRequest, res) => {
    const sessionId = parseSessionId(req.body?.sessionId)
    const targetDurationSec = parseTargetDurationSec(req.body?.targetDurationSec)
    if (!sessionId) {
      sendError(res, 400, 'sessionId is required', 'MISSING_SESSION_ID')
      return
    }

    try {
      const manifest = await loadManifest(outputsDir, sessionId)
      const hasAllAgeFrames =
        manifest.frames.length === TARGET_AGES.length && manifest.ages.length === TARGET_AGES.length
      if (!hasAllAgeFrames) {
        sendError(res, 400, `Lifetime videos require ${TARGET_AGES.length} age frames first`, 'MISSING_LIFETIME_FRAMES')
        return
      }
      if (!manifest.sourceFramePath && !manifest.originalReferencePath) {
        sendError(res, 400, 'Lifetime videos require a source frame first', 'MISSING_LIFETIME_SOURCE_FRAME')
        return
      }

      cleanupOldJobs()
      for (const existing of lifetimeVideoJobs.values()) {
        if (existing.sessionId === sessionId && (existing.status === 'queued' || existing.status === 'running')) {
          sendError(res, 409, 'Video creation is already in progress for this session', 'VIDEO_JOB_ALREADY_RUNNING')
          return
        }
      }
      const job = createVideoJob(sessionId)
      lifetimeVideoJobs.set(job.jobId, job)

      void runCreateVideosJob({
        jobId: job.jobId,
        outputsDir,
        sessionId,
        targetDurationSec,
        userId: req.user?.id,
      })

      sendSuccess(res, { jobId: job.jobId, status: job.status })
    } catch (error) {
      console.error('[Lifetime] Failed to start video creation:', error)
      sendError(
        res,
        500,
        'Failed to start lifetime video creation',
        'LIFETIME_CREATE_VIDEOS_START_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.get('/create-videos-status/:jobId', (req, res) => {
    const jobId = parseSessionId(req.params.jobId)
    if (!jobId) {
      sendError(res, 400, 'jobId is required', 'MISSING_JOB_ID')
      return
    }

    const job = lifetimeVideoJobs.get(jobId)
    if (!job) {
      sendError(res, 404, 'Video creation job not found', 'VIDEO_JOB_NOT_FOUND')
      return
    }

    const outputLayout =
      job.sessionId && parseSessionId(job.sessionId) ? getLifetimeSessionOutputLayout(outputsDir, job.sessionId) : null

    sendSuccess(res, {
      jobId: job.jobId,
      status: job.status,
      sessionId: job.sessionId,
      outputDirUrl: outputLayout?.outputDirUrl || '',
      outputDirLocal: outputLayout?.outputDir || '',
      error: job.error,
      progress: job.progress,
      transitions: job.transitions,
      assemblyStage: job.assemblyStage,
      finalVideoUrl: job.finalVideoUrl,
      finalVideoDurationSec: job.finalVideoDurationSec,
    })
  })

  return router
}
