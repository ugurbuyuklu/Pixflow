export interface ErrorInfo {
  message: string
  type: 'error' | 'warning' | 'info'
  action?: { label: string; onClick: () => void }
}

export interface GeneratedPrompt {
  style: string
  pose: {
    framing?: string
    body_position?: string
    arms?: string
    posture?: string
    expression?: {
      facial?: string
      eyes?: string
      mouth?: string
    }
  }
  lighting: {
    setup?: string
    key_light?: string
    fill_light?: string
    shadows?: string
    mood?: string
  }
  set_design: {
    backdrop?: string
    surface?: string
    props?: string[]
    atmosphere?: string
  }
  outfit: {
    main?: string
    underneath?: string
    accessories?: string
    styling?: string
  }
  camera: {
    lens?: string
    aperture?: string
    angle?: string
    focus?: string
    distortion?: string
  }
  hairstyle?: {
    style?: string
    parting?: string
    details?: string
    finish?: string
  }
  makeup?: {
    style?: string
    skin?: string
    eyes?: string
    lips?: string
  }
  effects: {
    vignette?: string
    color_grade?: string
    contrast?: string
    lens_flare?: string
    atmosphere?: string
    grain?: string
  }
  // Internal streaming flags (not persisted)
  _quick?: boolean
  _enriched?: boolean
}

export interface ResearchData {
  summary: string
  insights: string[]
  warnings: string[]
  subThemes: string[]
}

export interface VarietyScore {
  aesthetics_used: string[]
  emotions_used: string[]
  lighting_setups_used: string[]
  has_duplicates: boolean
  passed: boolean
}

export interface BatchImage {
  index: number
  status: 'pending' | 'generating' | 'completed' | 'failed'
  url?: string
  localPath?: string
  error?: string
}

export interface BatchProgress {
  jobId: string
  status: string
  progress: number
  totalImages: number
  completedImages: number
  outputDir: string
  images: BatchImage[]
}

export interface HistoryEntry {
  id: string
  concept: string
  prompts: GeneratedPrompt[]
  promptCount: number
  createdAt: string
  source: 'generated' | 'analyzed'
}

export interface FavoritePrompt {
  id: string
  prompt: GeneratedPrompt
  name: string
  concept?: string
  createdAt: string
}

export interface Avatar {
  name: string
  filename: string
  url: string
}

export interface Voice {
  id: string
  name: string
  category?: string
  previewUrl?: string
  labels?: Record<string, string>
}

export interface LipsyncJob {
  id: string
  status: 'pending' | 'processing' | 'complete' | 'error'
  videoUrl?: string
  error?: string
  progress?: number
}

export interface Notification {
  id: number
  type: string
  title: string
  body: string | null
  read: boolean
  created_at: string
}

export interface GeneratedImageRecord {
  id: number
  userId: number
  jobId: string
  batchIndex: number
  promptIndex: number
  url: string
  localPath: string
  fileName: string
  concept: string
  prompt: GeneratedPrompt
  aspectRatio?: string
  resolution?: string
  generatedAt: string
  rating?: number
  ratingNotes?: string
  ratedAt?: string
}

export type MachineStep = 'idle' | 'prompts' | 'images' | 'script' | 'tts' | 'lipsync' | 'done' | 'error'

export function parseError(err: unknown, response?: Response): ErrorInfo {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      message: 'No internet connection. Please check your network.',
      type: 'error',
    }
  }

  if (response) {
    switch (response.status) {
      case 429:
        return {
          message: 'Too many requests. Please wait a moment before trying again.',
          type: 'warning',
        }
      case 400: {
        const detail =
          err instanceof Error && err.message && !err.message.startsWith('HTTP ')
            ? err.message
            : 'Invalid input. Please check your concept and try again.'
        return { message: detail, type: 'error' }
      }
      case 500: {
        const detail =
          err instanceof Error && err.message && !err.message.startsWith('HTTP ')
            ? err.message
            : 'Server error. The AI service might be temporarily unavailable.'
        return { message: detail, type: 'error' }
      }
      case 503:
        return {
          message: 'Service unavailable. Please try again later.',
          type: 'error',
        }
    }
  }

  if (err instanceof TypeError && err.message.includes('fetch')) {
    return {
      message: 'Failed to connect to the server. Is the backend running?',
      type: 'error',
    }
  }

  return {
    message: err instanceof Error ? err.message : 'An unexpected error occurred',
    type: 'error',
  }
}
