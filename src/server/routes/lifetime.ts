import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import ffmpegStatic from 'ffmpeg-static'
import multer from 'multer'
import type { AuthRequest } from '../middleware/auth.js'
import { downloadImage, generateImage } from '../services/fal.js'
import { downloadKlingVideo, generateKlingTransitionVideo } from '../services/kling.js'
import { createPipelineSpan } from '../services/telemetry.js'
import { predictGenderHint } from '../services/vision.js'
import { sendError, sendSuccess } from '../utils/http.js'

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

type LifetimeBackgroundMode = (typeof BACKGROUND_MODES)[number]
type LifetimeGenderHint = 'auto' | 'male' | 'female'
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

function makeFrameOutputPath(outputDir: string, age: number): string {
  return path.join(
    outputDir,
    `lifetime_age_${String(age).padStart(2, '0')}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`,
  )
}

function makeSourceFrameOutputPath(outputDir: string): string {
  return path.join(outputDir, `lifetime_source_baby_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`)
}

function makeTransitionOutputPath(outputDir: string, fromAge: number, toAge: number): string {
  return path.join(
    outputDir,
    `lifetime_transition_${String(fromAge).padStart(2, '0')}_to_${String(toAge).padStart(2, '0')}_${Date.now()}.mp4`,
  )
}

function makeFinalVideoOutputPath(outputDir: string): string {
  return path.join(outputDir, `lifetime_final_${Date.now()}.mp4`)
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

  const outputDir = path.join(outputsDir, safeSessionId)
  const raw = await fs.readFile(manifestFilePath(outputDir), 'utf8')
  const manifest = JSON.parse(raw) as LifetimeSessionManifest
  if (!manifest || manifest.sessionId !== safeSessionId) {
    throw new Error('Invalid session manifest')
  }
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
  transitionVideoPaths: string[]
  targetDurationSec: number
}): Promise<{ videoPath: string; videoUrl: string }> {
  const { outputDir, outputsDir, transitionVideoPaths, targetDurationSec } = params
  if (transitionVideoPaths.length === 0) {
    throw new Error('No transition videos to merge')
  }

  const outputPath = makeFinalVideoOutputPath(outputDir)
  const totalDurationSec = transitionVideoPaths.length * KLING_SEGMENT_DURATION_SEC
  const speedFactor = Math.max(1, totalDurationSec / targetDurationSec)
  const speedExpr = Number(speedFactor.toFixed(6))

  const args: string[] = ['-y']
  for (const transitionPath of transitionVideoPaths) {
    args.push('-i', transitionPath)
  }
  const inputs = transitionVideoPaths.map((_value, index) => `[${index}:v:0]`).join('')
  const filterGraph = `${inputs}concat=n=${transitionVideoPaths.length}:v=1:a=0,fps=${FINAL_VIDEO_FPS},setpts=PTS/${speedExpr}[v]`
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

function sceneForAge(age: number): string {
  if (age <= 6) {
    return 'a playful preschool classroom with soft toys, books, and child-safe furniture in the background'
  }
  if (age <= 12) {
    return 'an elementary classroom with desks, school posters, and daylight from side windows'
  }
  if (age <= 18) {
    return 'a high-school corridor or campus setting with lockers and student-life atmosphere'
  }
  if (age <= 25) {
    return 'a university garden/campus scene with academic buildings and young-adult environment'
  }
  if (age <= 35) {
    return 'a modern professional workplace setting with subtle office context'
  }
  if (age <= 45) {
    return 'an outdoor social scene with friends near a lake while fishing, natural daylight'
  }
  if (age <= 55) {
    return 'a calm park-side environment with mature lifestyle context and natural greenery'
  }
  return 'a peaceful outdoor lifestyle scene with warm natural light and timeless mature atmosphere'
}

function mediumShotFramingRule(): string {
  return [
    'CRITICAL HARD CONSTRAINT: Every single frame MUST be medium shot (mid-torso to head).',
    'Never output close-up/headshot-only framing.',
    'Never output full-body/wide framing.',
    'Both shoulders must remain fully visible; do not crop shoulders.',
    'Upper torso and outfit must be clearly visible in frame.',
    'Subject must face the camera directly with a front-facing head orientation.',
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

function buildNormalizePrompt(age: number, mode: LifetimeBackgroundMode, genderHint: LifetimeGenderHint): string {
  const backgroundRule =
    mode === 'white_bg'
      ? 'Pure white solid background (#FFFFFF). Keep identical pose and framing across timeline.'
      : `Natural background mode: place the subject in ${sceneForAge(age)}. Environment must be age-appropriate and photorealistic.`
  const appearanceRule = ageAppearanceRule(age, genderHint)
  const framingRule = mediumShotFramingRule()
  const genderRule = genderHintRule(genderHint)
  return [
    'CRITICAL: Use the provided reference image as mandatory identity source.',
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
): string {
  const backgroundRule =
    mode === 'white_bg'
      ? 'Pure white solid background (#FFFFFF). Keep visual continuity while allowing pose/framing updates required by stage rules.'
      : `Natural background mode: update the environment to match age ${toAge} — ${sceneForAge(toAge)}.`
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

function buildTransitionPrompt(fromAge: number, toAge: number, mode: LifetimeBackgroundMode): string {
  const transitionBackgroundRule =
    mode === 'white_bg'
      ? 'Keep pure white background throughout the whole transition.'
      : `Background should transition naturally from age ${fromAge} scene to age ${toAge} scene while keeping subject continuity.`
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
      'CRITICAL: Use the provided reference image as mandatory identity source.',
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
    'CRITICAL: Use the provided reference image as mandatory identity source.',
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
  }
}

function updateJob(jobId: string, updater: (job: LifetimeRunJob) => void): void {
  const current = lifetimeRunJobs.get(jobId)
  if (!current) return
  updater(current)
  current.updatedAt = new Date().toISOString()
  lifetimeRunJobs.set(jobId, current)
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
    const outputDir = path.join(outputsDir, sessionId)
    await fs.mkdir(outputDir, { recursive: true })

    const inputExt = path.extname(workingInputPath).toLowerCase() || '.jpg'
    const originalReferencePath = path.join(outputDir, `input_reference${inputExt}`)
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
        outputFormat: 'png',
      })
      const sourceGeneratedUrl = sourceResult.urls[0]
      if (!sourceGeneratedUrl) {
        throw new Error('No source frame URL returned')
      }

      sourceFramePath = makeSourceFrameOutputPath(outputDir)
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
          ? buildNormalizePrompt(age, backgroundMode, effectiveGenderHint)
          : buildProgressionPrompt(TARGET_AGES[index - 1], age, backgroundMode, index, effectiveGenderHint)
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
        outputFormat: 'png',
      })
      const generatedUrl = result.urls[0]
      if (!generatedUrl) {
        throw new Error(`No image URL returned for age ${age}`)
      }

      const outputPath = makeFrameOutputPath(outputDir, age)
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
      ages: [...TARGET_AGES],
      frames,
      transitions: [],
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

    if (manifest.transitions.length > 0) await removeTransitionFiles(manifest.transitions)
    await removeFinalVideoFile(manifest)
    manifest.finalVideoPath = ''
    manifest.finalVideoUrl = ''
    manifest.finalVideoDurationSec = 0

    const transitions: LifetimeTransitionRecord[] = []
    for (let index = 0; index < timelineFrames.length - 1; index += 1) {
      const fromFrame = timelineFrames[index]
      const toFrame = timelineFrames[index + 1]

      updateVideoJob(jobId, (job) => {
        job.progress.currentStep = `Age ${fromFrame.age} → ${toFrame.age}`
        job.progress.message = `Generating transition: Age ${fromFrame.age} → ${toFrame.age} (${index + 1}/9)`
      })

      const prompt = buildTransitionPrompt(fromFrame.age, toFrame.age, manifest.backgroundMode)
      const videoResult = await generateKlingTransitionVideo({
        startImagePath: fromFrame.imagePath,
        endImagePath: toFrame.imagePath,
        prompt,
        duration: '5',
        aspectRatio: '9:16',
      })
      const outputPath = makeTransitionOutputPath(manifest.outputDir, fromFrame.age, toFrame.age)
      await downloadKlingVideo(videoResult.videoUrl, outputPath)

      transitions.push({
        fromAge: fromFrame.age,
        toAge: toFrame.age,
        videoPath: outputPath,
        videoUrl: toPublicOutputPath(outputsDir, outputPath),
        prompt,
      })

      updateVideoJob(jobId, (job) => {
        job.progress.completed = index + 1
        job.transitions = transitions.map((t) => ({ fromAge: t.fromAge, toAge: t.toAge, videoUrl: t.videoUrl }))
        job.progress.message = `Completed transition ${index + 1}/9`
      })
    }

    updateVideoJob(jobId, (job) => {
      job.progress.currentStep = 'Assembling final video'
      job.progress.message = 'Assembling final video...'
    })

    manifest.transitions = transitions
    const finalVideo = await buildFinalLifetimeVideo({
      outputDir: manifest.outputDir,
      outputsDir,
      transitionVideoPaths: transitions.map((t) => t.videoPath),
      targetDurationSec,
    })
    manifest.finalVideoPath = finalVideo.videoPath
    manifest.finalVideoUrl = finalVideo.videoUrl
    manifest.finalVideoDurationSec = targetDurationSec
    await saveManifest(manifest)

    updateVideoJob(jobId, (job) => {
      job.status = 'completed'
      job.progress.completed = 10
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

    sendSuccess(res, {
      jobId: job.jobId,
      status: job.status,
      sessionId: job.sessionId,
      error: job.error,
      progress: job.progress,
      sourceFrameUrl: job.sourceFrameUrl,
      frames: framesWithSource,
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
          outputFormat: 'png',
        })
        const sourceGeneratedUrl = sourceResult.urls[0]
        if (!sourceGeneratedUrl) {
          throw new Error('No image URL returned for regenerated source frame')
        }

        const nextSourcePath = makeSourceFrameOutputPath(manifest.outputDir)
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
          ? buildNormalizePrompt(currentFrame.age, manifest.backgroundMode, manifest.genderHint || 'auto')
          : buildProgressionPrompt(
              manifest.frames[frameIndex - 1].age,
              currentFrame.age,
              manifest.backgroundMode,
              frameIndex,
              manifest.genderHint || 'auto',
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
        outputFormat: 'png',
      })
      const generatedUrl = result.urls[0]
      if (!generatedUrl) {
        throw new Error(`No image URL returned for regenerated age ${targetAge}`)
      }

      const nextOutputPath = makeFrameOutputPath(manifest.outputDir, currentFrame.age)
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

      sendSuccess(res, { jobId: job.jobId, status: job.status, totalSteps: 10 })
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

    sendSuccess(res, {
      jobId: job.jobId,
      status: job.status,
      sessionId: job.sessionId,
      error: job.error,
      progress: job.progress,
      transitions: job.transitions,
      finalVideoUrl: job.finalVideoUrl,
      finalVideoDurationSec: job.finalVideoDurationSec,
    })
  })

  return router
}
