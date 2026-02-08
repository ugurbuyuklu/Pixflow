import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'
import {
  Sparkles,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  Lightbulb,
  Tags,
  Upload,
  Image,
  Play,
  Loader2,
  FolderOpen,
  AlertCircle,
  X,
  WifiOff,
  Clock,
  ScanSearch,
  ArrowRight,
  History,
  Star,
  Trash2,
  Users,
  ImagePlus,
  FileJson,
  List,
  Download,
  Video,
  Mic,
  Volume2,
  RefreshCw,
  MessageSquare,
  Wand2,
  Bot,
  Layers,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Zap,
} from 'lucide-react'

interface ErrorInfo {
  message: string
  type: 'error' | 'warning' | 'info'
  action?: { label: string; onClick: () => void }
}

function parseError(err: unknown, response?: Response): ErrorInfo {
  if (!navigator.onLine) {
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
      case 400:
        return {
          message: 'Invalid input. Please check your concept and try again.',
          type: 'error',
        }
      case 500:
        return {
          message: 'Server error. The AI service might be temporarily unavailable.',
          type: 'error',
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

  const message = err instanceof Error ? err.message : 'An unexpected error occurred'
  return { message, type: 'error' }
}

interface GeneratedPrompt {
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
    lens_flare?: string
    atmosphere?: string
    grain?: string
  }
}

interface ResearchData {
  summary: string
  insights: string[]
  warnings: string[]
  subThemes: string[]
}

interface VarietyScore {
  aesthetics_used: string[]
  emotions_used: string[]
  lighting_setups_used: string[]
  has_duplicates: boolean
  passed: boolean
}

interface BatchImage {
  index: number
  status: 'pending' | 'generating' | 'completed' | 'failed'
  url?: string
  localPath?: string
  error?: string
}

interface BatchProgress {
  jobId: string
  status: string
  progress: number
  totalImages: number
  completedImages: number
  outputDir: string
  images: BatchImage[]
}

interface HistoryEntry {
  id: string
  concept: string
  prompts: GeneratedPrompt[]
  promptCount: number
  createdAt: string
  source: 'generated' | 'analyzed'
}

interface FavoritePrompt {
  id: string
  prompt: GeneratedPrompt
  name: string
  concept?: string
  createdAt: string
}

interface Avatar {
  name: string
  filename: string
  url: string
}

interface Voice {
  id: string
  name: string
  category?: string
  previewUrl?: string
  labels?: Record<string, string>
}

interface LipsyncJob {
  id: string
  status: 'pending' | 'processing' | 'complete' | 'error'
  videoUrl?: string
  error?: string
  progress?: number
}

type MachineStep = 'idle' | 'prompts' | 'images' | 'script' | 'tts' | 'lipsync' | 'done' | 'error'

function App() {
  const [activeTab, setActiveTab] = useState<'prompts' | 'generate' | 'history' | 'avatars' | 'machine'>('prompts')
  const [promptMode, setPromptMode] = useState<'concept' | 'image'>('concept')

  // Prompt Factory State
  const [concept, setConcept] = useState('')
  const [count, setCount] = useState(8)
  const [loading, setLoading] = useState(false)
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [editingPromptText, setEditingPromptText] = useState<string>('')
  const [promptSaving, setPromptSaving] = useState(false)
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const [research, setResearch] = useState<ResearchData | null>(null)
  const [varietyScore, setVarietyScore] = useState<VarietyScore | null>(null)

  // Abort controller for cancellable requests
  const generateAbortController = useRef<AbortController | null>(null)

  // Asset Monster State
  const [selectedPrompts, setSelectedPrompts] = useState<Set<number>>(new Set())
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [referencePreviews, setReferencePreviews] = useState<string[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const MAX_REFERENCE_IMAGES = 4
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [batchError, setBatchError] = useState<ErrorInfo | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Generation Settings
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [numImagesPerPrompt, setNumImagesPerPrompt] = useState(1)
  const [outputFormat, setOutputFormat] = useState('jpeg')
  const [resolution, setResolution] = useState('2K')

  const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', '4:5', '5:4', '3:2', '2:3', '21:9']
  const RESOLUTIONS = ['1K', '2K', '4K']
  const OUTPUT_FORMATS = ['png', 'jpeg', 'webp']

  // Avatar Gallery State
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [avatarsLoading, setAvatarsLoading] = useState(false)
  const [imageSource, setImageSource] = useState<'upload' | 'gallery'>('upload')

  // Custom Prompt State
  const [promptSource, setPromptSource] = useState<'generated' | 'custom'>('generated')
  const [customPromptJson, setCustomPromptJson] = useState('')
  const [customPromptCount, setCustomPromptCount] = useState(1)
  const [customPromptError, setCustomPromptError] = useState<string | null>(null)

  // Image Analysis State
  const [analyzeImage, setAnalyzeImage] = useState<File | null>(null)
  const [analyzePreview, setAnalyzePreview] = useState<string | null>(null)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzedPrompt, setAnalyzedPrompt] = useState<GeneratedPrompt | null>(null)
  const [analyzeError, setAnalyzeError] = useState<ErrorInfo | null>(null)
  const [analyzeCopied, setAnalyzeCopied] = useState(false)

  const sendToImageToPrompt = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const filename = imageUrl.split('/').pop() || 'generated-image.png'
      const file = new File([blob], filename, { type: blob.type })

      setAnalyzeImage(file)
      setAnalyzePreview(imageUrl)
      setAnalyzedPrompt(null)
      setAnalyzeError(null)
      setPreviewImage(null)
      setActiveTab('prompts')
      setPromptMode('image')
    } catch {
      console.error('Failed to load image for analysis')
    }
  }

  // History & Favorites State
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [favorites, setFavorites] = useState<FavoritePrompt[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistoryPrompt, setSelectedHistoryPrompt] = useState<GeneratedPrompt | null>(null)
  const [favoriteAdded, setFavoriteAdded] = useState<string | null>(null)

  // Avatars Tab State
  const [avatarMode, setAvatarMode] = useState<'gallery' | 'generate'>('gallery')
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null)
  const [avatarGender, setAvatarGender] = useState<'female' | 'male'>('female')
  const [avatarAgeGroup, setAvatarAgeGroup] = useState<'young-adult' | 'adult' | 'middle-aged'>('young-adult')
  const [avatarEthnicity, setAvatarEthnicity] = useState<'caucasian' | 'black' | 'asian' | 'hispanic' | 'middle-eastern' | 'south-asian'>('caucasian')
  const [avatarOutfit, setAvatarOutfit] = useState<'casual' | 'business' | 'sporty' | 'elegant' | 'streetwear'>('casual')
  const [avatarCount, setAvatarCount] = useState(1)
  const [avatarGenerating, setAvatarGenerating] = useState(false)
  const [generatedAvatarUrls, setGeneratedAvatarUrls] = useState<string[]>([])
  const [selectedGeneratedIndex, setSelectedGeneratedIndex] = useState(0)
  const [avatarGenerationProgress, setAvatarGenerationProgress] = useState(0)

  // Script Generation State
  const [scriptConcept, setScriptConcept] = useState('')
  const [scriptDuration, setScriptDuration] = useState(30)
  const [scriptTone, setScriptTone] = useState<'casual' | 'professional' | 'energetic' | 'friendly' | 'dramatic'>('energetic')
  const [scriptGenerating, setScriptGenerating] = useState(false)
  const [generatedScript, setGeneratedScript] = useState('')
  const [scriptWordCount, setScriptWordCount] = useState(0)
  const [scriptEstimatedDuration, setScriptEstimatedDuration] = useState(0)

  // Voice & TTS State
  const [voices, setVoices] = useState<Voice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null)
  const [ttsGenerating, setTtsGenerating] = useState(false)
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null)
  const [_audioPlaying, setAudioPlaying] = useState(false)

  // Lipsync State
  const [lipsyncGenerating, setLipsyncGenerating] = useState(false)
  const [lipsyncJob, setLipsyncJob] = useState<LipsyncJob | null>(null)
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null)
  const [avatarsError, setAvatarsError] = useState<ErrorInfo | null>(null)
  const [fullSizeAvatarUrl, setFullSizeAvatarUrl] = useState<string | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement>(null)

  // The Machine State
  const [machineStep, setMachineStep] = useState<MachineStep>('idle')
  const [machineFailedStep, setMachineFailedStep] = useState<MachineStep>('idle')
  const [machineError, setMachineError] = useState<ErrorInfo | null>(null)
  const machineAbort = useRef<AbortController | null>(null)
  const [machineConcept, setMachineConcept] = useState('')
  const [machinePromptCount, setMachinePromptCount] = useState(6)
  const [machineRefImages, setMachineRefImages] = useState<File[]>([])
  const [machineRefPreviews, setMachineRefPreviews] = useState<string[]>([])
  const [machineScriptDuration, setMachineScriptDuration] = useState(30)
  const [machineScriptTone, setMachineScriptTone] = useState<'casual' | 'professional' | 'energetic' | 'friendly' | 'dramatic'>('energetic')
  const [machineSelectedVoice, setMachineSelectedVoice] = useState<Voice | null>(null)
  const [machineSelectedAvatar, setMachineSelectedAvatar] = useState<Avatar | null>(null)
  const [machinePrompts, setMachinePrompts] = useState<GeneratedPrompt[]>([])
  const [machineBatchProgress, setMachineBatchProgress] = useState<BatchProgress | null>(null)
  const [machineScript, setMachineScript] = useState('')
  const [machineAudioUrl, setMachineAudioUrl] = useState<string | null>(null)
  const [machineVideoUrl, setMachineVideoUrl] = useState<string | null>(null)
  const machineRefInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarUpload = async (files: FileList) => {
    const formData = new FormData()
    Array.from(files).forEach(f => formData.append('files', f))

    try {
      const response = await fetch('/api/avatars/upload', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }
      await loadAvatars()
    } catch (err) {
      setAvatarsError(parseError(err))
    }
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const [historyRes, favoritesRes] = await Promise.all([
        fetch('/api/history'),
        fetch('/api/history/favorites'),
      ])
      if (historyRes.ok) {
        const data = await historyRes.json()
        setHistoryEntries(data.history)
      }
      if (favoritesRes.ok) {
        const data = await favoritesRes.json()
        setFavorites(data.favorites)
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadAvatars = async () => {
    setAvatarsLoading(true)
    try {
      const response = await fetch('/api/avatars')
      if (response.ok) {
        const data = await response.json()
        setAvatars(data.avatars)
        // Auto-switch to gallery if avatars exist
        if (data.avatars.length > 0) {
          setImageSource('gallery')
        }
      }
    } catch (err) {
      console.error('Failed to load avatars:', err)
    } finally {
      setAvatarsLoading(false)
    }
  }

  const selectAvatar = async (avatar: Avatar) => {
    try {
      // Check if already selected (toggle off)
      const existingIndex = referenceImages.findIndex((f) => f.name === avatar.filename)
      if (existingIndex >= 0) {
        const newFiles = referenceImages.filter((_, i) => i !== existingIndex)
        setReferenceImages(newFiles)
        setReferencePreviews(newFiles.map((f) => URL.createObjectURL(f)))
                return
      }

      // Check max limit
      if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
        setBatchError({ message: `Maximum ${MAX_REFERENCE_IMAGES} images allowed`, type: 'warning' })
        return
      }

      // Fetch and add to selection
      const response = await fetch(avatar.url)
      if (!response.ok) throw new Error('Failed to fetch avatar')
      const blob = await response.blob()
      const file = new File([blob], avatar.filename, { type: blob.type })

      const newFiles = [...referenceImages, file]
      setReferenceImages(newFiles)
      setReferencePreviews(newFiles.map((f) => URL.createObjectURL(f)))
          } catch (err) {
      console.error('Failed to select avatar:', err)
      setBatchError({ message: 'Failed to load avatar image', type: 'error' })
    }
  }

  const addToFavorites = async (prompt: GeneratedPrompt, name: string) => {
    try {
      const response = await fetch('/api/history/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, name, concept }),
      })
      if (response.ok) {
        const data = await response.json()
        setFavorites((prev) => [data.favorite, ...prev])
        setFavoriteAdded(name)
        setTimeout(() => setFavoriteAdded(null), 2000)
      }
    } catch (err) {
      console.error('Failed to add to favorites:', err)
    }
  }

  const removeFromFavorites = async (id: string) => {
    try {
      const response = await fetch(`/api/history/favorites/${id}`, { method: 'DELETE' })
      if (response.ok) {
        setFavorites((prev) => prev.filter((f) => f.id !== id))
      }
    } catch (err) {
      console.error('Failed to remove from favorites:', err)
    }
  }

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory()
    }
    if (activeTab === 'generate') {
      loadAvatars()
    }
    if (activeTab === 'avatars') {
      loadAvatars()
      loadVoices()
    }
    if (activeTab === 'machine') {
      loadAvatars()
      loadVoices()
    }
  }, [activeTab])

  // Avatars Tab Functions
  const loadVoices = async () => {
    if (voices.length > 0) return
    setVoicesLoading(true)
    try {
      const response = await fetch('/api/avatars/voices')
      if (response.ok) {
        const data = await response.json()
        setVoices(data.voices || [])
        if (data.voices?.length > 0 && !selectedVoice) {
          setSelectedVoice(data.voices[0])
        }
      }
    } catch (err) {
      console.error('Failed to load voices:', err)
    } finally {
      setVoicesLoading(false)
    }
  }

  const handleGenerateAvatar = async () => {
    setAvatarGenerating(true)
    setAvatarsError(null)
    setGeneratedAvatarUrls([])
    setSelectedGeneratedIndex(0)
    setAvatarGenerationProgress(0)

    const ageDescriptions: Record<string, string> = {
      'young-adult': 'young adult in their 20s',
      'adult': 'adult in their 30s',
      'middle-aged': 'middle-aged person in their 40s-50s',
    }

    const ethnicityDescriptions: Record<string, string> = {
      'caucasian': 'caucasian',
      'black': 'black/african',
      'asian': 'east asian',
      'hispanic': 'hispanic/latino',
      'middle-eastern': 'middle eastern',
      'south-asian': 'south asian',
    }

    const outfitDescriptions: Record<string, string> = {
      'casual': 'casual everyday clothes',
      'business': 'professional business attire',
      'sporty': 'athletic sportswear',
      'elegant': 'elegant formal outfit',
      'streetwear': 'trendy streetwear',
    }

    const prompt = `portrait photo of a ${ageDescriptions[avatarAgeGroup]} ${ethnicityDescriptions[avatarEthnicity]} ${avatarGender}
background: solid green color (1ebf1a)
outfit: ${outfitDescriptions[avatarOutfit]}
pose: standing straight, body and face directly facing the camera, arms relaxed at sides
framing: medium shot from waist up
expression: friendly, warm smile, direct eye contact with camera, looking straight at viewer
lighting: soft studio lighting, even illumination
sharp focus, detailed skin texture, 8k uhd, high resolution, photorealistic, professional photography`

    const generatedUrls: string[] = []

    try {
      for (let i = 0; i < avatarCount; i++) {
        setAvatarGenerationProgress(i + 1)

        const response = await fetch('/api/avatars/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            aspectRatio: '9:16',
          }),
        })

        if (!response.ok) {
          let errorMessage = 'Failed to generate avatar'
          try {
            const data = await response.json()
            errorMessage = data.error || errorMessage
          } catch {
            // Response body was empty or not valid JSON
          }
          throw new Error(errorMessage)
        }

        const data = await response.json()
        generatedUrls.push(data.localPath)
        setGeneratedAvatarUrls([...generatedUrls])
      }

      await loadAvatars()
    } catch (err) {
      setAvatarsError(parseError(err))
    } finally {
      setAvatarGenerating(false)
    }
  }

  const handleGenerateScript = async () => {
    if (!scriptConcept.trim()) {
      setAvatarsError({ message: 'Please enter a concept', type: 'warning' })
      return
    }

    setScriptGenerating(true)
    setAvatarsError(null)

    try {
      const response = await fetch('/api/avatars/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: scriptConcept,
          duration: scriptDuration,
          tone: scriptTone,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate script')
      }

      const data = await response.json()
      setGeneratedScript(data.script)
      setScriptWordCount(data.wordCount)
      setScriptEstimatedDuration(data.estimatedDuration)
    } catch (err) {
      setAvatarsError(parseError(err))
    } finally {
      setScriptGenerating(false)
    }
  }

  const handleGenerateTTS = async () => {
    if (!generatedScript.trim()) {
      setAvatarsError({ message: 'Please generate a script first', type: 'warning' })
      return
    }
    if (!selectedVoice) {
      setAvatarsError({ message: 'Please select a voice', type: 'warning' })
      return
    }

    setTtsGenerating(true)
    setAvatarsError(null)
    setGeneratedAudioUrl(null)

    try {
      const response = await fetch('/api/avatars/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: generatedScript,
          voiceId: selectedVoice.id,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate audio')
      }

      const data = await response.json()
      setGeneratedAudioUrl(data.audioUrl)
    } catch (err) {
      setAvatarsError(parseError(err))
    } finally {
      setTtsGenerating(false)
    }
  }

  const handleCreateLipsyncVideo = async () => {
    const avatarUrl = generatedAvatarUrls[selectedGeneratedIndex] || selectedAvatar?.url
    if (!avatarUrl) {
      setAvatarsError({ message: 'Please select or generate an avatar', type: 'warning' })
      return
    }
    if (!generatedAudioUrl) {
      setAvatarsError({ message: 'Please generate audio first', type: 'warning' })
      return
    }

    setLipsyncGenerating(true)
    setAvatarsError(null)
    setLipsyncJob(null)
    setGeneratedVideoUrl(null)

    try {
      const response = await fetch('/api/avatars/lipsync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: avatarUrl,
          audioUrl: generatedAudioUrl,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create lipsync video')
      }

      const data = await response.json()
      // fal.ai OmniHuman returns synchronously with the video
      if (data.success && data.localPath) {
        setGeneratedVideoUrl(data.localPath)
        setLipsyncJob({
          id: `omnihuman_${Date.now()}`,
          status: 'complete',
          videoUrl: data.localPath,
        })
      }
    } catch (err) {
      setAvatarsError(parseError(err))
    } finally {
      setLipsyncGenerating(false)
    }
  }

  // Note: Hedra Character-3 polling happens server-side, client call is synchronous

  // ─── The Machine ─────────────────────────────────────────
  const handleCancelMachine = () => {
    machineAbort.current?.abort()
    machineAbort.current = null
    setMachineStep('idle')
    setMachinePrompts([])
    setMachineBatchProgress(null)
    setMachineScript('')
    setMachineAudioUrl(null)
    setMachineVideoUrl(null)
  }

  const pollMachineBatch = async (jobId: string, signal: AbortSignal): Promise<BatchProgress> => {
    let failedPolls = 0
    while (!signal.aborted) {
      try {
        const res = await fetch(`/api/generate/progress/${jobId}`, { signal })
        if (!res.ok) throw new Error(`${res.status}`)
        failedPolls = 0
        const data: BatchProgress = await res.json()
        setMachineBatchProgress(data)
        if (data.status === 'completed' || data.status === 'failed') return data
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        failedPolls++
        if (failedPolls >= 3) throw new Error('Lost connection to server during image generation')
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new DOMException('Aborted', 'AbortError')
  }

  const handleRunMachine = async (resumeFrom?: MachineStep) => {
    const avatarUrl = machineSelectedAvatar?.url
    if (!machineConcept.trim()) {
      setMachineError({ message: 'Enter a concept to get started', type: 'warning' })
      return
    }
    if (!avatarUrl) {
      setMachineError({ message: 'Select an avatar for the video', type: 'warning' })
      return
    }
    if (!machineSelectedVoice) {
      setMachineError({ message: 'Select a voice for the voiceover', type: 'warning' })
      return
    }

    machineAbort.current?.abort()
    const controller = new AbortController()
    machineAbort.current = controller
    const { signal } = controller
    setMachineError(null)

    const steps: MachineStep[] = ['prompts', 'images', 'script', 'tts', 'lipsync']
    const startIdx = resumeFrom ? steps.indexOf(resumeFrom) : 0

    // Local vars to pass data between steps (avoids stale closure on setState)
    let localPrompts = machinePrompts
    let localScript = machineScript
    let localAudioUrl = machineAudioUrl
    let currentStep: MachineStep = 'idle'
    const voiceId = machineSelectedVoice.id

    try {
      // Step 1: Generate Prompts
      if (startIdx <= 0) {
        currentStep = 'prompts'
        setMachineStep(currentStep)
        const res = await fetch('/api/prompts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concept: machineConcept, count: machinePromptCount }),
          signal,
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Prompt generation failed')
        const data = await res.json()
        localPrompts = data.prompts
        setMachinePrompts(localPrompts)
      }

      // Step 2: Generate Images (avatar = main reference, extra people optional)
      if (startIdx <= 1) {
        currentStep = 'images'
        setMachineStep(currentStep)
        setMachineBatchProgress(null)

        // Fetch avatar image as File for the reference
        const avatarRes = await fetch(avatarUrl!, { signal })
        const avatarBlob = await avatarRes.blob()
        const avatarFilename = avatarUrl!.split('/').pop() || 'avatar.png'
        const avatarFile = new File([avatarBlob], avatarFilename, { type: avatarBlob.type })

        const formData = new FormData()
        formData.append('referenceImages', avatarFile)
        machineRefImages.forEach((f) => formData.append('referenceImages', f))
        formData.append('concept', machineConcept)
        formData.append('prompts', JSON.stringify(localPrompts))
        formData.append('aspectRatio', '9:16')
        formData.append('numImagesPerPrompt', '1')
        formData.append('resolution', '2K')
        formData.append('outputFormat', 'jpeg')

        const res = await fetch('/api/generate/batch', { method: 'POST', body: formData, signal })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Batch generation failed')
        const data = await res.json()
        setMachineBatchProgress({
          jobId: data.jobId, status: data.status, progress: 0,
          totalImages: data.totalImages, completedImages: 0, outputDir: data.outputDir, images: [],
        })
        const final = await pollMachineBatch(data.jobId, signal)
        if (final.status === 'failed') throw new Error('Image generation failed')
      }

      // Step 3: Generate Script
      if (startIdx <= 2) {
        currentStep = 'script'
        setMachineStep(currentStep)
        const res = await fetch('/api/avatars/script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concept: machineConcept, duration: machineScriptDuration, tone: machineScriptTone }),
          signal,
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Script generation failed')
        const data = await res.json()
        localScript = data.script
        setMachineScript(localScript)
      }

      // Step 4: Text-to-Speech
      if (startIdx <= 3) {
        currentStep = 'tts'
        setMachineStep(currentStep)
        const res = await fetch('/api/avatars/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: localScript, voiceId }),
          signal,
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'TTS failed')
        const data = await res.json()
        localAudioUrl = data.audioUrl
        setMachineAudioUrl(localAudioUrl)
      }

      // Step 5: Lipsync Video (auto-retry once on failure)
      if (startIdx <= 4) {
        currentStep = 'lipsync'
        setMachineStep(currentStep)
        let lastErr: Error | null = null
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch('/api/avatars/lipsync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageUrl: avatarUrl, audioUrl: localAudioUrl }),
              signal,
            })
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}))
              throw new Error(errData.details || errData.error || 'Lipsync video failed')
            }
            const data = await res.json()
            if (data.success && data.localPath) setMachineVideoUrl(data.localPath)
            lastErr = null
            break
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err
            lastErr = err as Error
            if (attempt === 0) {
              console.log('[Machine] Lipsync attempt 1 failed, retrying in 3s...', lastErr.message)
              await new Promise((r) => setTimeout(r, 3000))
            }
          }
        }
        if (lastErr) throw lastErr
      }

      setMachineStep('done')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMachineFailedStep(currentStep)
      setMachineStep('error')
      setMachineError(parseError(err))
    }
  }

  // Load favorites on initial mount for badge display
  useEffect(() => {
    const loadFavoritesOnly = async () => {
      try {
        const response = await fetch('/api/history/favorites')
        if (response.ok) {
          const data = await response.json()
          setFavorites(data.favorites)
        }
      } catch {
        // Silently fail - favorites will load when history tab is opened
      }
    }
    loadFavoritesOnly()
  }, [])

  const handleCopy = async () => {
    if (selectedIndex === null || !prompts[selectedIndex]) return
    const json = JSON.stringify(prompts[selectedIndex], null, 2)
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerate = async () => {
    if (!concept.trim()) {
      setError({ message: 'Please enter a concept first.', type: 'warning' })
      return
    }

    // Cancel any existing request
    if (generateAbortController.current) {
      generateAbortController.current.abort()
    }
    generateAbortController.current = new AbortController()

    setLoading(true)
    setError(null)
    setPrompts([])
    setSelectedIndex(null)
    setResearch(null)
    setVarietyScore(null)
    setSelectedPrompts(new Set())

    let response: Response | undefined
    try {
      response = await fetch('/api/prompts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, count }),
        signal: generateAbortController.current.signal,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setPrompts(data.prompts)
      setResearch(data.research)
      setVarietyScore(data.varietyScore)
      if (data.prompts.length > 0) {
        setSelectedIndex(0)
        setEditingPromptText(JSON.stringify(data.prompts[0], null, 2))
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't show error
        return
      }
      const errorInfo = parseError(err, response)
      if (response?.status === 429) {
        errorInfo.action = { label: 'Retry', onClick: () => handleGenerate() }
      }
      setError(errorInfo)
    } finally {
      setLoading(false)
      generateAbortController.current = null
    }
  }

  const handleCancelGenerate = () => {
    if (generateAbortController.current) {
      generateAbortController.current.abort()
      generateAbortController.current = null
      setLoading(false)
    }
  }

  const onDrop = useCallback(
    (acceptedFiles: File[], rejections: FileRejection[]) => {
      setUploadError(null)

      if (rejections.length > 0) {
        const rejection = rejections[0]
        const errorCode = rejection.errors[0]?.code
        if (errorCode === 'file-too-large') {
          setUploadError('One or more files are too large. Maximum size is 10MB each.')
        } else if (errorCode === 'file-invalid-type') {
          setUploadError('Invalid file type. Please use JPEG, PNG, or WebP.')
        } else if (errorCode === 'too-many-files') {
          setUploadError(`Maximum ${MAX_REFERENCE_IMAGES} images allowed.`)
        } else {
          setUploadError('Failed to upload files. Please try again.')
        }
        return
      }

      // Append new files up to max limit
      const newFiles = [...referenceImages, ...acceptedFiles].slice(0, MAX_REFERENCE_IMAGES)
      setReferenceImages(newFiles)
      setReferencePreviews(newFiles.map((f) => URL.createObjectURL(f)))
          },
    [referenceImages]
  )

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxFiles: MAX_REFERENCE_IMAGES,
    maxSize: 10 * 1024 * 1024,
    noClick: false,
    noKeyboard: false,
  })

  const togglePromptSelection = (index: number) => {
    setSelectedPrompts((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const selectAllPrompts = () => {
    setSelectedPrompts(new Set(prompts.map((_, i) => i)))
  }

  const deselectAllPrompts = () => {
    setSelectedPrompts(new Set())
  }

  const adaptPromptFormat = (input: Record<string, unknown>): GeneratedPrompt => {
    // If already in our format (has top-level style), return as-is
    if (typeof input.style === 'string') {
      return input as unknown as GeneratedPrompt
    }

    // Transform from external format to our format
    const scene = input.scene as Record<string, unknown> | undefined
    const subject = input.subject as Record<string, unknown> | undefined
    const lighting = input.lighting as Record<string, unknown> | undefined
    const camera = input.camera as Record<string, unknown> | undefined
    const colorGrading = input.color_grading as Record<string, unknown> | undefined
    const quality = input.quality as Record<string, unknown> | undefined
    const subjectOutfit = subject?.outfit as Record<string, unknown> | undefined

    // Build style summary from scene description
    const styleParts: string[] = []
    if (scene?.environment) styleParts.push(String(scene.environment))
    if (scene?.atmosphere) styleParts.push(String(scene.atmosphere))
    if (lighting?.style) styleParts.push(String(lighting.style))

    const adapted: GeneratedPrompt = {
      style: styleParts.join(', ') || 'Custom prompt',

      pose: {
        framing: camera?.framing as string || '',
        body_position: subject?.pose as string || '',
        arms: subject?.movement_detail as string || '',
        posture: '',
        expression: {
          facial: subject?.expression as string || '',
          eyes: '',
          mouth: ''
        }
      },

      lighting: {
        setup: lighting?.style as string || '',
        key_light: lighting?.key_light as string || '',
        fill_light: lighting?.fill_light as string || lighting?.ambient_light as string || '',
        shadows: '',
        mood: scene?.atmosphere as string || ''
      },

      set_design: {
        backdrop: scene?.environment as string || '',
        surface: scene?.depth as string || '',
        props: Array.isArray(scene?.background_elements) ? scene.background_elements as string[] : [],
        atmosphere: scene?.atmosphere as string || ''
      },

      outfit: {
        main: subjectOutfit?.outer_layer as string || subjectOutfit?.inner_layer as string || '',
        underneath: subjectOutfit?.inner_layer as string || '',
        accessories: '',
        styling: ''
      },

      camera: {
        lens: camera?.lens as string || '',
        aperture: camera?.aperture as string || '',
        angle: camera?.camera_angle as string || '',
        focus: camera?.focus as string || '',
        distortion: ''
      },

      effects: {
        color_grade: colorGrading?.palette as string || '',
        grain: quality?.grain as string || '',
        vignette: '',
        atmosphere: colorGrading?.tone_control as string || ''
      }
    }

    return adapted
  }

  const isJsonString = (str: string): boolean => {
    const trimmed = str.trim()
    return trimmed.startsWith('{') && trimmed.endsWith('}')
  }

  const convertTextToPrompt = async (text: string): Promise<GeneratedPrompt | null> => {
    try {
      const response = await fetch('/api/prompts/text-to-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) {
        const data = await response.json()
        setCustomPromptError(data.error || 'Failed to convert text')
        return null
      }
      const data = await response.json()
      return data.prompt as GeneratedPrompt
    } catch {
      setCustomPromptError('Failed to convert text to prompt')
      return null
    }
  }

  const parseCustomPrompt = async (): Promise<GeneratedPrompt[] | null> => {
    const input = customPromptJson.trim()
    if (!input) {
      setCustomPromptError('Please enter a prompt')
      return null
    }

    // Check if it's JSON or plain text
    if (isJsonString(input)) {
      // Parse as JSON
      try {
        const parsed = JSON.parse(input)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setCustomPromptError('Invalid prompt: must be a JSON object')
          return null
        }
        const adapted = adaptPromptFormat(parsed as Record<string, unknown>)
        setCustomPromptError(null)
        return Array(customPromptCount).fill(adapted)
      } catch {
        setCustomPromptError('Invalid JSON format')
        return null
      }
    } else {
      // Plain text - convert via API
      setCustomPromptError(null)
      const converted = await convertTextToPrompt(input)
      if (!converted) return null
      return Array(customPromptCount).fill(converted)
    }
  }

  const handleBatchGenerate = async () => {
    if (referenceImages.length === 0) {
      setBatchError({ message: 'Please upload at least one reference image.', type: 'warning' })
      return
    }

    let promptsToGenerate: GeneratedPrompt[]

    if (promptSource === 'custom') {
      setBatchLoading(true)
      setBatchError(null)
      const customPrompts = await parseCustomPrompt()
      if (!customPrompts) {
        setBatchLoading(false)
        setBatchError({ message: 'Please fix the prompt errors first.', type: 'warning' })
        return
      }
      promptsToGenerate = customPrompts
    } else {
      if (selectedPrompts.size === 0) {
        setBatchError({ message: 'Please select at least one prompt.', type: 'warning' })
        return
      }
      promptsToGenerate = Array.from(selectedPrompts).map((i) => prompts[i])
    }

    setBatchLoading(true)
    setBatchError(null)
    setBatchProgress(null)

    let response: Response | undefined
    try {
      const formData = new FormData()
      referenceImages.forEach((file) => {
        formData.append('referenceImages', file)
      })
      formData.append('concept', promptSource === 'custom' ? 'custom' : (concept || 'untitled'))
      formData.append('prompts', JSON.stringify(promptsToGenerate))
      formData.append('aspectRatio', aspectRatio)
      formData.append('numImagesPerPrompt', String(numImagesPerPrompt))
      formData.append('resolution', resolution)
      formData.append('outputFormat', outputFormat)

      response = await fetch('/api/generate/batch', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setBatchProgress({
        jobId: data.jobId,
        status: data.status,
        progress: 0,
        totalImages: data.totalImages,
        completedImages: 0,
        outputDir: data.outputDir,
        images: [],
      })
    } catch (err) {
      const errorInfo = parseError(err, response)
      if (response?.status === 429) {
        errorInfo.action = { label: 'Retry', onClick: () => handleBatchGenerate() }
      }
      setBatchError(errorInfo)
      setBatchLoading(false)
    }
  }

  // Warn user before leaving during active generation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (batchLoading) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [batchLoading])

  // Keyboard navigation for image preview
  useEffect(() => {
    if (!previewImage || !batchProgress) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const completedImages = batchProgress.images.filter(img => img.status === 'completed' && img.url)
      const currentIndex = completedImages.findIndex(img => img.url === previewImage)

      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setPreviewImage(completedImages[currentIndex - 1].url!)
      } else if (e.key === 'ArrowRight' && currentIndex < completedImages.length - 1) {
        setPreviewImage(completedImages[currentIndex + 1].url!)
      } else if (e.key === 'Escape') {
        setPreviewImage(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewImage, batchProgress])

  useEffect(() => {
    if (!batchProgress || batchProgress.status === 'completed' || batchProgress.status === 'failed') {
      setBatchLoading(false)
      return
    }

    let failedPolls = 0
    const maxFailedPolls = 3

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/generate/progress/${batchProgress.jobId}`)
        if (response.ok) {
          failedPolls = 0
          const data = await response.json()
          setBatchProgress(data)
          if (data.status === 'completed' || data.status === 'failed') {
            setBatchLoading(false)
          }
        } else {
          failedPolls++
        }
      } catch {
        failedPolls++
        if (failedPolls >= maxFailedPolls) {
          setBatchError({
            message: 'Lost connection to server. Generation may still be running.',
            type: 'warning',
            action: {
              label: 'Refresh Status',
              onClick: async () => {
                try {
                  const response = await fetch(`/api/generate/progress/${batchProgress.jobId}`)
                  if (response.ok) {
                    const data = await response.json()
                    setBatchProgress(data)
                    setBatchError(null)
                  }
                } catch {
                  setBatchError({
                    message: 'Still unable to connect. Please check if the server is running.',
                    type: 'error',
                  })
                }
              },
            },
          })
          setBatchLoading(false)
          clearInterval(interval)
        }
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [batchProgress?.jobId, batchProgress?.status])

  const extractMood = (prompt: GeneratedPrompt): string => {
    return prompt.lighting?.mood || prompt.set_design?.atmosphere || 'N/A'
  }

  const generateFavoriteName = (prompt: GeneratedPrompt, index: number): string => {
    const mood = prompt.lighting?.mood?.split(' ')[0] || ''
    const atmosphere = prompt.set_design?.atmosphere?.split(' ')[0] || ''
    const framing = prompt.pose?.framing?.split(' ')[0] || ''
    const styleWords = prompt.style?.split(' ').slice(0, 4).join(' ') || ''

    if (concept && mood) {
      return `${concept} - ${mood}`
    }
    if (concept && atmosphere) {
      return `${concept} - ${atmosphere}`
    }
    if (concept && framing) {
      return `${concept} - ${framing}`
    }
    if (concept) {
      return `${concept} #${index + 1}`
    }
    if (styleWords) {
      return styleWords.length > 35 ? styleWords.slice(0, 35) + '...' : styleWords
    }
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    return `Prompt ${index + 1} (${timestamp})`
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-8 py-4">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Bot className="w-7 h-7 text-purple-400" />
            Borgflow
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('prompts')}
              className={`px-6 py-3 font-medium transition-colors relative flex items-center gap-2 ${
                activeTab === 'prompts'
                  ? 'text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Wand2 className="w-4 h-4" />
              Prompt Factory
              {activeTab === 'prompts' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('generate')}
              className={`px-6 py-3 font-medium transition-colors relative flex items-center gap-2 ${
                activeTab === 'generate'
                  ? 'text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              Asset Monster
              {prompts.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-gray-800 rounded text-xs">
                  {prompts.length}
                </span>
              )}
              {activeTab === 'generate' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('avatars')}
              className={`px-6 py-3 font-medium transition-colors relative flex items-center gap-2 ${
                activeTab === 'avatars'
                  ? 'text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              Avatars
              {activeTab === 'avatars' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('machine')}
              className={`px-6 py-3 font-medium transition-colors relative flex items-center gap-2 ${
                activeTab === 'machine'
                  ? 'text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              The Machine
              {machineStep !== 'idle' && machineStep !== 'done' && machineStep !== 'error' && (
                <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />
              )}
              {activeTab === 'machine' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 font-medium transition-colors relative flex items-center gap-2 ${
                activeTab === 'history'
                  ? 'text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              History
              {favorites.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-purple-600 rounded text-xs flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  {favorites.length}
                </span>
              )}
              {activeTab === 'history' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-8">
        {activeTab === 'prompts' && (
          <>
            {/* Sub-tabs: Concept / Image */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setPromptMode('concept')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  promptMode === 'concept'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Concept to Prompts
              </button>
              <button
                onClick={() => setPromptMode('image')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  promptMode === 'image'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <ScanSearch className="w-4 h-4" />
                Image to Prompt
              </button>
            </div>

            {promptMode === 'concept' && (
            <>
            {/* Prompt Factory Input */}
            <div className="bg-gray-900 rounded-lg p-6 mb-6">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Concept</label>
                <input
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="e.g., Christmas, Halloween, Summer Beach..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  Number of prompts: {count}
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>

              {loading ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3 text-purple-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Researching & Generating...</span>
                  </div>
                  <button
                    onClick={handleCancelGenerate}
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 rounded-lg px-6 py-3 font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <X className="w-5 h-5" />
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={!concept.trim()}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg px-6 py-3 font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  Generate Prompts
                </button>
              )}
            </div>

            {error && (
              <div className={`rounded-lg p-4 mb-6 flex items-start gap-3 ${
                error.type === 'warning'
                  ? 'bg-yellow-900/50 border border-yellow-700'
                  : 'bg-red-900/50 border border-red-700'
              }`}>
                {error.type === 'warning' ? (
                  <Clock className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                ) : !navigator.onLine ? (
                  <WifiOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={error.type === 'warning' ? 'text-yellow-200' : 'text-red-200'}>
                    {error.message}
                  </p>
                  {error.action && (
                    <button
                      onClick={error.action.onClick}
                      className={`mt-2 text-sm underline ${
                        error.type === 'warning' ? 'text-yellow-300 hover:text-yellow-200' : 'text-red-300 hover:text-red-200'
                      }`}
                    >
                      {error.action.label}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Research Insights */}
            {research && (
              <div className="bg-gray-900 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-5 h-5 text-yellow-400" />
                  <h2 className="text-lg font-semibold">Research Insights</h2>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Key Insights:</p>
                    <ul className="space-y-1">
                      {research.insights.map((insight, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Sub-themes:</p>
                    <div className="flex flex-wrap gap-2">
                      {research.subThemes.slice(0, 6).map((theme, i) => (
                        <span key={i} className="px-2 py-1 bg-gray-800 rounded text-xs">
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {varietyScore && (
                  <div className="flex items-center gap-4 pt-3 border-t border-gray-800">
                    <div className="flex items-center gap-2">
                      {varietyScore.passed ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                      <span className="font-medium">
                        Variety: {varietyScore.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <span className="text-sm text-gray-400">
                      {varietyScore.aesthetics_used.length} aesthetics, {varietyScore.emotions_used.length} emotions
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Prompts Grid */}
            {prompts.length > 0 && (
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-1 bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Prompts</h2>
                  </div>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {prompts.map((prompt, index) => (
                      <div
                        key={index}
                        onClick={() => {
                          setSelectedIndex(index)
                          setEditingPromptText(JSON.stringify(prompts[index], null, 2))
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-colors cursor-pointer ${
                          selectedIndex === index
                            ? 'bg-purple-600'
                            : 'bg-gray-800 hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-sm text-gray-400">#{index + 1}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                addToFavorites(prompt, generateFavoriteName(prompt, index))
                              }}
                              className={`p-1 rounded hover:bg-purple-600/30 transition-colors ${
                                selectedIndex === index ? 'text-purple-300' : 'text-gray-500 hover:text-purple-400'
                              }`}
                              title="Add to favorites"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              selectedIndex === index ? 'bg-purple-500' : 'bg-gray-700'
                            }`}>
                              {extractMood(prompt).split(' ')[0]}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm break-words">{prompt.style}</p>
                      </div>
                    ))}
                  </div>

                  {/* Send to Monster Button */}
                  <button
                    onClick={() => {
                      selectAllPrompts()
                      setImageSource('upload')
                      setActiveTab('generate')
                    }}
                    className="w-full mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg px-4 py-3 font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <Layers className="w-5 h-5" />
                    Send to Monster
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="col-span-2 bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold">Preview</h2>
                      {selectedIndex !== null && prompts[selectedIndex] && (
                        <div className="flex items-center gap-2">
                          <Tags className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-400">
                            {prompts[selectedIndex].outfit?.styling || 'N/A'}
                          </span>
                        </div>
                      )}
                    </div>
                    {selectedIndex !== null && prompts[selectedIndex] && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            addToFavorites(prompts[selectedIndex], generateFavoriteName(prompts[selectedIndex], selectedIndex))
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg text-sm"
                        >
                          <Star className="w-4 h-4" />
                          <span>Favorite</span>
                        </button>
                        <button
                          onClick={handleCopy}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 rounded-lg text-sm"
                        >
                          {copied ? (
                            <>
                              <Check className="w-4 h-4 text-green-400" />
                              <span className="text-green-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedIndex !== null && prompts[selectedIndex] && (
                    <div className="space-y-2">
                      <textarea
                        value={editingPromptText || JSON.stringify(prompts[selectedIndex], null, 2)}
                        onChange={(e) => setEditingPromptText(e.target.value)}
                        className="w-full bg-gray-800 rounded-lg p-4 h-[480px] text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 overflow-y-auto"
                        spellCheck={false}
                      />
                      <button
                        onClick={async () => {
                          const text = editingPromptText || JSON.stringify(prompts[selectedIndex], null, 2)
                          setPromptSaving(true)
                          try {
                            // First try to parse as JSON
                            const parsed = JSON.parse(text)
                            const newPrompts = [...prompts]
                            newPrompts[selectedIndex] = parsed
                            setPrompts(newPrompts)
                            setEditingPromptText(JSON.stringify(parsed, null, 2))
                          } catch {
                            // If not valid JSON, convert text to our format via API
                            try {
                              const converted = await convertTextToPrompt(text)
                              if (converted) {
                                const newPrompts = [...prompts]
                                newPrompts[selectedIndex] = converted
                                setPrompts(newPrompts)
                                setEditingPromptText(JSON.stringify(converted, null, 2))
                              }
                            } catch {
                              // Silent fail - keep current text
                            }
                          }
                          setPromptSaving(false)
                        }}
                        disabled={promptSaving}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                      >
                        {promptSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Converting...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Save Changes
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            </>
            )}

            {promptMode === 'image' && (
              <div className="grid grid-cols-2 gap-6">
                {/* Left: Image Upload */}
                <div className="bg-gray-900 rounded-lg p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ScanSearch className="w-5 h-5 text-purple-400" />
                    Analyze Image
                  </h2>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      analyzePreview
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                    onClick={() => document.getElementById('analyze-input')?.click()}
                  >
                    <input
                      id="analyze-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setAnalyzeImage(file)
                          setAnalyzePreview(URL.createObjectURL(file))
                          setAnalyzedPrompt(null)
                          setAnalyzeError(null)
                        }
                      }}
                    />
                    {analyzePreview ? (
                      <div className="space-y-4">
                        <img
                          src={analyzePreview}
                          alt="To analyze"
                          className="max-h-64 mx-auto rounded-lg"
                        />
                        <p className="text-sm text-gray-400">{analyzeImage?.name}</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setAnalyzeImage(null)
                            setAnalyzePreview(null)
                            setAnalyzedPrompt(null)
                          }}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-10 h-10 mx-auto mb-3 text-gray-500" />
                        <p className="text-gray-400">Click to upload an image to analyze</p>
                        <p className="text-sm text-gray-500 mt-1">JPEG, PNG, WebP</p>
                      </>
                    )}
                  </div>

                  <button
                    onClick={async () => {
                      if (!analyzeImage) return
                      setAnalyzeLoading(true)
                      setAnalyzeError(null)
                      setAnalyzedPrompt(null)

                      try {
                        const formData = new FormData()
                        formData.append('image', analyzeImage)

                        const response = await fetch('/api/generate/analyze-image', {
                          method: 'POST',
                          body: formData,
                        })

                        if (!response.ok) {
                          const data = await response.json()
                          throw new Error(data.error || 'Analysis failed')
                        }

                        const data = await response.json()
                        setAnalyzedPrompt(data.prompt)
                      } catch (err) {
                        setAnalyzeError(parseError(err))
                      } finally {
                        setAnalyzeLoading(false)
                      }
                    }}
                    disabled={analyzeLoading || !analyzeImage}
                    className="w-full mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg px-6 py-3 font-medium transition-all flex items-center justify-center gap-2"
                  >
                    {analyzeLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analyzing with GPT-4 Vision...
                      </>
                    ) : (
                      <>
                        <ScanSearch className="w-5 h-5" />
                        Analyze Image
                      </>
                    )}
                  </button>

                  {analyzeError && (
                    <div className="mt-4 bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <p className="flex-1 text-red-200">{analyzeError.message}</p>
                      <button onClick={() => setAnalyzeError(null)} className="text-gray-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Right: Generated Prompt */}
                <div className="bg-gray-900 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Generated Prompt</h2>
                    {analyzedPrompt && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            const json = JSON.stringify(analyzedPrompt, null, 2)
                            await navigator.clipboard.writeText(json)
                            setAnalyzeCopied(true)
                            setTimeout(() => setAnalyzeCopied(false), 2000)
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
                        >
                          {analyzeCopied ? (
                            <>
                              <Check className="w-4 h-4 text-green-400" />
                              <span className="text-green-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setPrompts([analyzedPrompt])
                            setSelectedIndex(0)
                            setEditingPromptText(JSON.stringify(analyzedPrompt, null, 2))
                            setPromptMode('concept')
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                        >
                          <ArrowRight className="w-4 h-4" />
                          Use in Factory
                        </button>
                        <button
                          onClick={() => {
                            setPrompts([analyzedPrompt])
                            setSelectedIndex(0)
                            setEditingPromptText(JSON.stringify(analyzedPrompt, null, 2))
                            setActiveTab('generate')
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg text-sm"
                        >
                          <Play className="w-4 h-4" />
                          Asset Monster
                        </button>
                      </div>
                    )}
                  </div>

                  {analyzedPrompt ? (
                    <pre className="bg-gray-800 rounded-lg p-4 overflow-y-auto overflow-x-hidden max-h-[600px] text-sm font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(analyzedPrompt, null, 2)}
                    </pre>
                  ) : (
                    <div className="h-96 flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <ScanSearch className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>Upload an image and click Analyze</p>
                        <p className="text-sm mt-1">GPT-4 Vision will extract styling details</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'generate' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Left: Prompt Selection */}
            <div className="col-span-1 bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Prompts</h2>
                {/* Prompt Source Toggle */}
                <div className="flex bg-gray-800 rounded-lg p-1">
                  <button
                    onClick={() => setPromptSource('generated')}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                      promptSource === 'generated'
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <List className="w-3 h-3" />
                    Generated
                  </button>
                  <button
                    onClick={() => setPromptSource('custom')}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                      promptSource === 'custom'
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <FileJson className="w-3 h-3" />
                    Custom
                  </button>
                </div>
              </div>

              {promptSource === 'generated' ? (
                <>
                  {prompts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No prompts yet</p>
                      <button
                        onClick={() => setActiveTab('prompts')}
                        className="mt-2 text-purple-400 hover:text-purple-300 text-sm"
                      >
                        Generate prompts first →
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex gap-2">
                          <button
                            onClick={selectAllPrompts}
                            className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded"
                          >
                            Select All
                          </button>
                          <button
                            onClick={deselectAllPrompts}
                            className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded"
                          >
                            Deselect All
                          </button>
                        </div>
                        <span className="text-sm text-gray-400">
                          {selectedPrompts.size}/{prompts.length}
                        </span>
                      </div>
                      <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {prompts.map((prompt, index) => (
                          <button
                            key={index}
                            onClick={() => togglePromptSelection(index)}
                            className={`w-full text-left p-3 rounded-lg transition-colors flex items-start gap-3 ${
                              selectedPrompts.has(index)
                                ? 'bg-purple-600/30 border border-purple-500'
                                : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                              selectedPrompts.has(index)
                                ? 'bg-purple-500 border-purple-500'
                                : 'border-gray-600'
                            }`}>
                              {selectedPrompts.has(index) && <Check className="w-3 h-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-xs text-gray-400">#{index + 1}</span>
                              <p className="text-sm break-words">{prompt.style}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Custom Prompt
                      <span className="text-gray-500 ml-2 font-normal">(JSON or plain text)</span>
                    </label>
                    <textarea
                      value={customPromptJson}
                      onChange={(e) => {
                        setCustomPromptJson(e.target.value)
                        setCustomPromptError(null)
                      }}
                      placeholder={`Describe the scene or paste JSON...

Examples:
• Black & white editorial photoshoot with dramatic lighting
• {"style": "Romantic portrait...", "lighting": {...}}`}
                      className={`w-full h-64 bg-gray-800 rounded-lg p-3 text-sm resize-none border ${
                        customPromptError
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-transparent focus:border-purple-500'
                      } focus:outline-none`}
                    />
                    {customPromptError && (
                      <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {customPromptError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Number of Images: {customPromptCount}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      value={customPromptCount}
                      onChange={(e) => setCustomPromptCount(Number(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>4</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Upload & Generate */}
            <div className="col-span-2 space-y-6">
              {/* Reference Image Section */}
              <div className="bg-gray-900 rounded-lg p-4">
                {/* Hidden input for openFilePicker to work in any mode */}
                <input {...getInputProps()} />

                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Reference Image</h2>
                  {/* Source Toggle */}
                  <div className="flex bg-gray-800 rounded-lg p-1">
                    <button
                      onClick={() => setImageSource('upload')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                        imageSource === 'upload'
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <ImagePlus className="w-4 h-4" />
                      Upload
                    </button>
                    <button
                      onClick={() => setImageSource('gallery')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                        imageSource === 'gallery'
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      Gallery {avatars.length > 0 && `(${avatars.length})`}
                    </button>
                  </div>
                </div>

                {/* Selected Images Preview */}
                {referencePreviews.length > 0 && (
                  <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-green-400 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        {referencePreviews.length} Image{referencePreviews.length > 1 ? 's' : ''} Selected
                        {referencePreviews.length > 1 && (
                          <span className="text-xs text-gray-400 font-normal">(for couple/family)</span>
                        )}
                      </p>
                      <button
                        onClick={() => {
                          setReferenceImages([])
                          setReferencePreviews([])
                                                  }}
                        className="text-gray-400 hover:text-red-400 text-sm"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {referencePreviews.map((preview, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={preview}
                            alt={`Reference ${index + 1}`}
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                          <button
                            onClick={() => {
                              const newFiles = referenceImages.filter((_, i) => i !== index)
                              setReferenceImages(newFiles)
                              setReferencePreviews(newFiles.map((f) => URL.createObjectURL(f)))
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {referencePreviews.length < MAX_REFERENCE_IMAGES && (
                        <button
                          onClick={openFilePicker}
                          className="w-16 h-16 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-colors"
                        >
                          <ImagePlus className="w-6 h-6" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Upload Area */}
                {imageSource === 'upload' && (
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isDragActive
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="w-10 h-10 mx-auto mb-3 text-gray-500" />
                    <p className="text-gray-400">
                      {isDragActive ? 'Drop image here' : 'Drag & drop or click to upload'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">JPEG, PNG, WebP up to 10MB</p>
                  </div>
                )}

                {/* Avatar Gallery */}
                {imageSource === 'gallery' && (
                  <div>
                    {avatarsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                      </div>
                    ) : avatars.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
                        <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>No avatars in gallery</p>
                        <p className="text-sm mt-1">Add images to <code className="bg-gray-800 px-1 rounded">avatars/</code> folder</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-8 gap-2 max-h-[400px] overflow-auto">
                        {avatars.map((avatar) => {
                          const isSelected = referenceImages.some((f) => f.name === avatar.filename)
                          return (
                            <button
                              key={avatar.filename}
                              onClick={() => selectAvatar(avatar)}
                              className={`aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 relative ${
                                isSelected
                                  ? 'border-purple-500 ring-2 ring-purple-500/50'
                                  : 'border-transparent hover:border-gray-600'
                              }`}
                            >
                              <img
                                src={avatar.url}
                                alt={avatar.name}
                                className="w-full h-full object-cover"
                              />
                              {isSelected && (
                                <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5">
                                  <Check className="w-3 h-3" />
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Generation Settings */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Generation Settings</h3>
                <div className="grid grid-cols-4 gap-4">
                  {/* Aspect Ratio */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Aspect Ratio</label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                    >
                      {ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>{ratio}</option>
                      ))}
                    </select>
                  </div>

                  {/* Images per Prompt */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Images per Prompt</label>
                    <select
                      value={numImagesPerPrompt}
                      onChange={(e) => setNumImagesPerPrompt(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>

                  {/* Resolution */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Resolution</label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                    >
                      {RESOLUTIONS.map((res) => (
                        <option key={res} value={res}>{res}</option>
                      ))}
                    </select>
                  </div>

                  {/* Output Format */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Format</label>
                    <select
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                    >
                      {OUTPUT_FORMATS.map((fmt) => (
                        <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleBatchGenerate}
                disabled={
                  batchLoading ||
                  referenceImages.length === 0 ||
                  (promptSource === 'generated' ? selectedPrompts.size === 0 : !customPromptJson.trim())
                }
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg px-6 py-4 font-medium transition-all flex items-center justify-center gap-2"
              >
                {batchLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating {batchProgress?.completedImages || 0}/{batchProgress?.totalImages || (promptSource === 'custom' ? customPromptCount : selectedPrompts.size)}...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Generate {promptSource === 'custom' ? customPromptCount : selectedPrompts.size} Image{(promptSource === 'custom' ? customPromptCount : selectedPrompts.size) !== 1 ? 's' : ''}
                  </>
                )}
              </button>

              {batchError && (
                <div className={`rounded-lg p-4 flex items-start gap-3 ${
                  batchError.type === 'warning'
                    ? 'bg-yellow-900/50 border border-yellow-700'
                    : 'bg-red-900/50 border border-red-700'
                }`}>
                  {batchError.type === 'warning' ? (
                    <Clock className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                  ) : !navigator.onLine ? (
                    <WifiOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={batchError.type === 'warning' ? 'text-yellow-200' : 'text-red-200'}>
                      {batchError.message}
                    </p>
                    {batchError.action && (
                      <button
                        onClick={batchError.action.onClick}
                        className={`mt-2 text-sm underline ${
                          batchError.type === 'warning' ? 'text-yellow-300 hover:text-yellow-200' : 'text-red-300 hover:text-red-200'
                        }`}
                      >
                        {batchError.action.label}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setBatchError(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {uploadError && (
                <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="flex-1 text-red-200">{uploadError}</p>
                  <button
                    onClick={() => setUploadError(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Progress Cards */}
              {batchProgress && (
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Generation Progress</h2>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        batchProgress.status === 'completed'
                          ? 'bg-green-600'
                          : batchProgress.status === 'failed'
                          ? 'bg-red-600'
                          : 'bg-yellow-600'
                      }`}>
                        {batchProgress.status.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-400">
                        {batchProgress.progress}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-6 gap-3">
                    {batchProgress.images.map((img) => (
                      <button
                        key={img.index}
                        onClick={() => img.status === 'completed' && img.url && setPreviewImage(img.url)}
                        className={`aspect-[9/16] rounded-lg border-2 flex items-center justify-center ${
                          img.status === 'completed'
                            ? 'border-green-500 bg-green-500/10 cursor-pointer hover:border-green-400 hover:scale-105 transition-all'
                            : img.status === 'generating'
                            ? 'border-yellow-500 bg-yellow-500/10'
                            : img.status === 'failed'
                            ? 'border-red-500 bg-red-500/10'
                            : 'border-gray-700 bg-gray-800'
                        }`}
                      >
                        {img.status === 'completed' && img.url ? (
                          <img src={img.url} alt={`Generated ${img.index + 1}`} className="w-full h-full object-cover rounded-lg" />
                        ) : img.status === 'generating' ? (
                          <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
                        ) : img.status === 'failed' ? (
                          <XCircle className="w-6 h-6 text-red-400" />
                        ) : (
                          <Image className="w-6 h-6 text-gray-500" />
                        )}
                      </button>
                    ))}
                  </div>

                  {batchProgress.status === 'completed' && (
                    <div className="mt-4 pt-4 border-t border-gray-800 flex justify-end">
                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/generate/open-folder', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ folderPath: batchProgress.outputDir }),
                            })
                            if (!response.ok) {
                              const data = await response.json()
                              setBatchError({ message: data.error || 'Failed to open folder', type: 'error' })
                            }
                          } catch {
                            setBatchError({ message: 'Failed to open folder', type: 'error' })
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
                      >
                        <FolderOpen className="w-4 h-4" />
                        Open Folder
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Favorite Added Toast */}
        {favoriteAdded && (
          <div className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
            <Star className="w-5 h-5" />
            <span>Added "{favoriteAdded}" to favorites!</span>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Left: Favorites */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-purple-400" />
                Favorites
              </h2>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                </div>
              ) : favorites.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No favorites yet</p>
                  <p className="text-sm mt-1">Star prompts to save them here</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {favorites.map((fav) => (
                    <div
                      key={fav.id}
                      className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-pointer"
                      onClick={() => setSelectedHistoryPrompt(fav.prompt)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{fav.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFromFavorites(fav.id)
                          }}
                          className="text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 break-words">{fav.prompt.style}</p>
                      {fav.concept && (
                        <span className="text-xs text-purple-400">{fav.concept}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Middle: History */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-400" />
                Recent Generations
              </h2>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No history yet</p>
                  <p className="text-sm mt-1">Generate prompts to see them here</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {historyEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-pointer"
                      onClick={() => {
                        if (entry.prompts.length > 0) {
                          setSelectedHistoryPrompt(entry.prompts[0] as GeneratedPrompt)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{entry.concept}</span>
                        <span className="text-xs text-gray-500">
                          {entry.promptCount} prompts
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPrompts(entry.prompts as GeneratedPrompt[])
                            setConcept(entry.concept)
                            setSelectedIndex(0)
                            if (entry.prompts.length > 0) {
                              setEditingPromptText(JSON.stringify(entry.prompts[0], null, 2))
                            }
                            setActiveTab('prompts')
                          }}
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          Load All
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Preview */}
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Preview</h2>
                {selectedHistoryPrompt && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const json = JSON.stringify(selectedHistoryPrompt, null, 2)
                        await navigator.clipboard.writeText(json)
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        const name = prompt('Enter a name for this favorite:')
                        if (name) {
                          addToFavorites(selectedHistoryPrompt, name)
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded text-xs"
                    >
                      <Star className="w-3 h-3" />
                      Favorite
                    </button>
                  </div>
                )}
              </div>
              {selectedHistoryPrompt ? (
                <pre className="bg-gray-800 rounded-lg p-4 overflow-y-auto overflow-x-hidden max-h-[500px] text-xs font-mono whitespace-pre-wrap break-words">
                  {JSON.stringify(selectedHistoryPrompt, null, 2)}
                </pre>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Select a prompt to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'avatars' && (
          <div className="space-y-6">
            {/* Error Display */}
            {avatarsError && (
              <div className={`rounded-lg p-4 flex items-start gap-3 ${
                avatarsError.type === 'warning'
                  ? 'bg-yellow-900/50 border border-yellow-700'
                  : 'bg-red-900/50 border border-red-700'
              }`}>
                <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${
                  avatarsError.type === 'warning' ? 'text-yellow-400' : 'text-red-400'
                }`} />
                <p className={`flex-1 ${
                  avatarsError.type === 'warning' ? 'text-yellow-200' : 'text-red-200'
                }`}>
                  {avatarsError.message}
                </p>
                <button
                  onClick={() => setAvatarsError(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {/* Left Column: Avatar Selection */}
              <div className="space-y-6">
                {/* Step 1: Avatar Selection */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="bg-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                    Select Avatar
                  </h2>

                  {/* Mode Toggle */}
                  <div className="flex bg-gray-800 rounded-lg p-1 mb-4">
                    <button
                      onClick={() => setAvatarMode('gallery')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                        avatarMode === 'gallery'
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      Gallery
                    </button>
                    <button
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors text-gray-400 hover:text-white"
                    >
                      <Upload className="w-4 h-4" />
                      Upload
                    </button>
                    <input
                      ref={avatarFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleAvatarUpload(e.target.files)
                          e.target.value = ''
                        }
                      }}
                    />
                    <button
                      onClick={() => setAvatarMode('generate')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                        avatarMode === 'generate'
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Wand2 className="w-4 h-4" />
                      Generate New
                    </button>
                  </div>

                  {avatarMode === 'gallery' ? (
                    <div>
                      {avatarsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                        </div>
                      ) : avatars.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
                          <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          <p>No avatars in gallery</p>
                          <p className="text-sm mt-1">Generate a new avatar or add images to <code className="bg-gray-800 px-1 rounded">avatars/</code></p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-5 gap-2 max-h-[300px] overflow-auto">
                          {avatars.map((avatar) => (
                            <button
                              key={avatar.filename}
                              onClick={() => {
                                setSelectedAvatar(selectedAvatar?.filename === avatar.filename ? null : avatar)
                                setGeneratedAvatarUrls([])
                                setSelectedGeneratedIndex(0)
                              }}
                              className={`aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 relative ${
                                selectedAvatar?.filename === avatar.filename
                                  ? 'border-purple-500 ring-2 ring-purple-500/50'
                                  : 'border-transparent hover:border-gray-600'
                              }`}
                            >
                              <img
                                src={avatar.url}
                                alt={avatar.name}
                                className="w-full h-full object-cover"
                              />
                              {selectedAvatar?.filename === avatar.filename && (
                                <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5">
                                  <Check className="w-3 h-3" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">Gender</label>
                          <select
                            value={avatarGender}
                            onChange={(e) => setAvatarGender(e.target.value as 'female' | 'male')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">Age Group</label>
                          <select
                            value={avatarAgeGroup}
                            onChange={(e) => setAvatarAgeGroup(e.target.value as 'young-adult' | 'adult' | 'middle-aged')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="young-adult">Young Adult (20s)</option>
                            <option value="adult">Adult (30s)</option>
                            <option value="middle-aged">Middle-aged (40-50s)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">Ethnicity</label>
                          <select
                            value={avatarEthnicity}
                            onChange={(e) => setAvatarEthnicity(e.target.value as 'caucasian' | 'black' | 'asian' | 'hispanic' | 'middle-eastern' | 'south-asian')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="caucasian">Caucasian</option>
                            <option value="black">Black / African</option>
                            <option value="asian">East Asian</option>
                            <option value="hispanic">Hispanic / Latino</option>
                            <option value="middle-eastern">Middle Eastern</option>
                            <option value="south-asian">South Asian</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">Outfit</label>
                          <select
                            value={avatarOutfit}
                            onChange={(e) => setAvatarOutfit(e.target.value as 'casual' | 'business' | 'sporty' | 'elegant' | 'streetwear')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="casual">Casual</option>
                            <option value="business">Business</option>
                            <option value="sporty">Sporty</option>
                            <option value="elegant">Elegant</option>
                            <option value="streetwear">Streetwear</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Number of Avatars: {avatarCount}</label>
                        <input
                          type="range"
                          min="1"
                          max="4"
                          value={avatarCount}
                          onChange={(e) => setAvatarCount(Number(e.target.value))}
                          className="w-full accent-purple-500"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>1</span>
                          <span>2</span>
                          <span>3</span>
                          <span>4</span>
                        </div>
                      </div>
                      <button
                        onClick={handleGenerateAvatar}
                        disabled={avatarGenerating}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                      >
                        {avatarGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating {avatarGenerationProgress}/{avatarCount}...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4" />
                            Generate {avatarCount > 1 ? `${avatarCount} Avatars` : 'Avatar'}
                          </>
                        )}
                      </button>
                      {generatedAvatarUrls.length > 0 && (
                        <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg space-y-3">
                          <p className="text-green-400 text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            {generatedAvatarUrls.length} avatar{generatedAvatarUrls.length > 1 ? 's' : ''} generated and saved to gallery!
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {generatedAvatarUrls.map((url, index) => (
                              <div
                                key={index}
                                className={`cursor-pointer transition-all relative rounded-lg overflow-hidden border-2 ${
                                  selectedGeneratedIndex === index
                                    ? 'border-purple-500 ring-2 ring-purple-500/50'
                                    : 'border-transparent hover:border-gray-600'
                                }`}
                                onClick={() => setSelectedGeneratedIndex(index)}
                              >
                                <img
                                  src={url}
                                  alt={`Generated avatar ${index + 1}`}
                                  className="w-full aspect-[9/16] object-cover"
                                />
                                {selectedGeneratedIndex === index && (
                                  <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5">
                                    <Check className="w-3 h-3" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-gray-400 text-center">Click to select, double-click to view full size</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Avatar Preview */}
                  {(selectedAvatar || generatedAvatarUrls.length > 0) && (
                    <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                      <p className="text-sm text-gray-400 mb-2">Selected Avatar:</p>
                      <div className="flex items-center gap-3">
                        <img
                          src={generatedAvatarUrls[selectedGeneratedIndex] || selectedAvatar?.url || ''}
                          alt="Selected avatar"
                          className="w-16 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setFullSizeAvatarUrl(generatedAvatarUrls[selectedGeneratedIndex] || selectedAvatar?.url || '')}
                        />
                        <div>
                          <p className="font-medium">
                            {generatedAvatarUrls.length > 0
                              ? `Generated Avatar ${selectedGeneratedIndex + 1}/${generatedAvatarUrls.length}`
                              : selectedAvatar?.name}
                          </p>
                          <p className="text-xs text-gray-500">Click image to view full size</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 2: Script Generation */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="bg-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                    Generate Script
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">App/Product Concept</label>
                      <input
                        type="text"
                        value={scriptConcept}
                        onChange={(e) => setScriptConcept(e.target.value)}
                        placeholder="e.g., AI photo transformation app, fitness tracker, dating app..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Duration: {scriptDuration}s</label>
                        <input
                          type="range"
                          min="10"
                          max="60"
                          value={scriptDuration}
                          onChange={(e) => setScriptDuration(Number(e.target.value))}
                          className="w-full accent-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Tone</label>
                        <select
                          value={scriptTone}
                          onChange={(e) => setScriptTone(e.target.value as typeof scriptTone)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                        >
                          <option value="energetic">Energetic</option>
                          <option value="casual">Casual</option>
                          <option value="professional">Professional</option>
                          <option value="friendly">Friendly</option>
                          <option value="dramatic">Dramatic</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleGenerateScript}
                      disabled={scriptGenerating || !scriptConcept.trim()}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                    >
                      {scriptGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating Script...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" />
                          Generate Script
                        </>
                      )}
                    </button>
                    {!scriptGenerating && !scriptConcept.trim() && (
                      <p className="text-xs text-amber-400/80 flex items-center gap-1.5 mt-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Enter an app/product concept above to generate a script
                      </p>
                    )}

                    {generatedScript && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Generated Script:</span>
                          <span className="text-xs text-gray-500">
                            {scriptWordCount} words (~{scriptEstimatedDuration}s)
                          </span>
                        </div>
                        <textarea
                          value={generatedScript}
                          onChange={(e) => setGeneratedScript(e.target.value)}
                          rows={4}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                        />
                        <button
                          onClick={handleGenerateScript}
                          disabled={scriptGenerating}
                          className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Regenerate
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Voice & Video */}
              <div className="space-y-6">
                {/* Step 3: Voice Selection & TTS */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="bg-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
                    Voice & Audio
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Select Voice</label>
                      {voicesLoading ? (
                        <div className="flex items-center gap-2 text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading voices...
                        </div>
                      ) : (
                        <select
                          value={selectedVoice?.id || ''}
                          onChange={(e) => {
                            const voice = voices.find(v => v.id === e.target.value)
                            setSelectedVoice(voice || null)
                          }}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select a voice...</option>
                          {voices.map((voice) => (
                            <option key={voice.id} value={voice.id}>
                              {voice.name} {voice.category ? `(${voice.category})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {selectedVoice?.previewUrl && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const audio = new Audio(selectedVoice.previewUrl)
                            audio.play()
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
                        >
                          <Volume2 className="w-4 h-4" />
                          Preview Voice
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleGenerateTTS}
                      disabled={ttsGenerating || !generatedScript || !selectedVoice}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                    >
                      {ttsGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating Audio...
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" />
                          Generate Audio
                        </>
                      )}
                    </button>
                    {!ttsGenerating && (!generatedScript || !selectedVoice) && (
                      <p className="text-xs text-amber-400/80 flex items-center gap-1.5 mt-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {!generatedScript ? 'Generate a script first (Step 2)' : 'Select a voice above'}
                      </p>
                    )}

                    {generatedAudioUrl && (
                      <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg">
                        <p className="text-green-400 text-sm flex items-center gap-2 mb-2">
                          <CheckCircle className="w-4 h-4" />
                          Audio generated!
                        </p>
                        <audio
                          controls
                          src={generatedAudioUrl}
                          className="w-full"
                          onPlay={() => setAudioPlaying(true)}
                          onPause={() => setAudioPlaying(false)}
                          onEnded={() => setAudioPlaying(false)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 4: Lipsync Video Generation */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="bg-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
                    Generate Video
                  </h2>

                  <div className="space-y-4">
                    {/* Requirements Check */}
                    <div className="space-y-2 text-sm">
                      <div className={`flex items-center gap-2 ${selectedAvatar || generatedAvatarUrls.length > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                        {selectedAvatar || generatedAvatarUrls.length > 0 ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        Avatar selected
                      </div>
                      <div className={`flex items-center gap-2 ${generatedScript ? 'text-green-400' : 'text-gray-500'}`}>
                        {generatedScript ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        Script generated
                      </div>
                      <div className={`flex items-center gap-2 ${generatedAudioUrl ? 'text-green-400' : 'text-gray-500'}`}>
                        {generatedAudioUrl ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        Audio generated
                      </div>
                    </div>

                    <button
                      onClick={handleCreateLipsyncVideo}
                      disabled={lipsyncGenerating || !generatedAudioUrl || (!selectedAvatar && generatedAvatarUrls.length === 0)}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg px-4 py-3 font-medium transition-all flex items-center justify-center gap-2"
                    >
                      {lipsyncGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Generating Video...
                          {lipsyncJob?.progress !== undefined && ` (${lipsyncJob.progress}%)`}
                        </>
                      ) : (
                        <>
                          <Video className="w-5 h-5" />
                          Create Talking Avatar Video
                        </>
                      )}
                    </button>
                    {!lipsyncGenerating && (!generatedAudioUrl || (!selectedAvatar && generatedAvatarUrls.length === 0)) && (
                      <p className="text-xs text-amber-400/80 flex items-center gap-1.5 mt-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {!selectedAvatar && generatedAvatarUrls.length === 0
                          ? 'Select an avatar first (Step 1)'
                          : 'Generate audio first (Step 3)'}
                      </p>
                    )}

                    {lipsyncJob && (
                      <div className={`p-3 rounded-lg ${
                        lipsyncJob.status === 'complete' ? 'bg-green-900/30 border border-green-700' :
                        lipsyncJob.status === 'error' ? 'bg-red-900/30 border border-red-700' :
                        'bg-yellow-900/30 border border-yellow-700'
                      }`}>
                        <div className="flex items-center justify-between">
                          <p className={`text-sm flex items-center gap-2 ${
                            lipsyncJob.status === 'complete' ? 'text-green-400' :
                            lipsyncJob.status === 'error' ? 'text-red-400' :
                            'text-yellow-400'
                          }`}>
                            {lipsyncJob.status === 'complete' ? <CheckCircle className="w-4 h-4" /> :
                             lipsyncJob.status === 'error' ? <XCircle className="w-4 h-4" /> :
                             <Loader2 className="w-4 h-4 animate-spin" />}
                            {lipsyncJob.status === 'pending' && 'Queued...'}
                            {lipsyncJob.status === 'processing' && 'Processing video...'}
                            {lipsyncJob.status === 'complete' && 'Video ready!'}
                            {lipsyncJob.status === 'error' && (lipsyncJob.error || 'Generation failed')}
                          </p>
                          {lipsyncJob.status === 'complete' && generatedVideoUrl && (
                            <a
                              href={generatedVideoUrl}
                              download
                              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg px-3 py-1.5 text-sm font-medium transition-all flex items-center gap-1.5"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 5: Video Output */}
                {generatedVideoUrl && (
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <span className="bg-green-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
                      Output
                    </h2>

                    <div className="space-y-4">
                      <video
                        controls
                        src={generatedVideoUrl}
                        className="w-full rounded-lg"
                      />

                      <div className="flex gap-2">
                        <a
                          href={generatedVideoUrl}
                          download
                          className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download Video
                        </a>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/generate/open-folder', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ folderPath: 'outputs' }),
                              })
                              if (!response.ok) {
                                const data = await response.json()
                                setAvatarsError({ message: data.error || 'Failed to open folder', type: 'error' })
                              }
                            } catch {
                              setAvatarsError({ message: 'Failed to open folder', type: 'error' })
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
                        >
                          <FolderOpen className="w-4 h-4" />
                          Open Folder
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── The Machine Tab ─────────────────────────────────── */}
        {activeTab === 'machine' && (
          <div className="space-y-6">
            {/* Error Display */}
            {machineError && (
              <div className={`rounded-lg p-4 flex items-start gap-3 ${
                machineError.type === 'warning' ? 'bg-yellow-900/50 border border-yellow-700' : 'bg-red-900/50 border border-red-700'
              }`}>
                <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${machineError.type === 'warning' ? 'text-yellow-400' : 'text-red-400'}`} />
                <p className={`flex-1 ${machineError.type === 'warning' ? 'text-yellow-200' : 'text-red-200'}`}>{machineError.message}</p>
                <button onClick={() => setMachineError(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* ─── ERROR: Retry / Start Over ─── */}
            {machineStep === 'error' && (
              <div className="space-y-4">
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Pipeline Failed at {machineFailedStep.charAt(0).toUpperCase() + machineFailedStep.slice(1)}
                  </h2>
                  {machineError && (
                    <p className="text-sm text-red-300/80 mb-4 break-words">{machineError.message}</p>
                  )}
                  <div className="flex gap-3">
                    {machineFailedStep !== 'idle' && (
                      <button
                        onClick={() => handleRunMachine(machineFailedStep)}
                        className="flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all"
                      >
                        <RefreshCw className="w-5 h-5" />
                        Retry from {machineFailedStep.charAt(0).toUpperCase() + machineFailedStep.slice(1)}
                      </button>
                    )}
                    <button
                      onClick={handleCancelMachine}
                      className="flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 transition-all"
                    >
                      Start Over
                    </button>
                  </div>
                </div>

                {/* Show completed results summary */}
                {machinePrompts.length > 0 && (
                  <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-400">
                    <p className="font-medium text-gray-300 mb-1">Completed before failure:</p>
                    <ul className="space-y-1">
                      <li>✅ {machinePrompts.length} prompts generated</li>
                      {machineBatchProgress && machineBatchProgress.completedImages > 0 && (
                        <li>✅ {machineBatchProgress.completedImages} images generated</li>
                      )}
                      {machineScript && <li>✅ Script written</li>}
                      {machineAudioUrl && <li>✅ Audio generated</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ─── IDLE: Settings Panel ─── */}
            {machineStep === 'idle' && (
              <div className="space-y-6">
                {/* Concept */}
                <div className="bg-gray-900 rounded-lg p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    The Machine
                  </h2>
                  <label className="block text-sm text-gray-400 mb-2">Concept</label>
                  <input
                    type="text"
                    value={machineConcept}
                    onChange={(e) => setMachineConcept(e.target.value)}
                    placeholder="e.g. Christmas, Halloween, Summer Beach..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Left: Prompts & Reference Images */}
                  <div className="space-y-6">
                    {/* Prompt Settings */}
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <span className="bg-purple-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">1</span>
                        Prompt Generation
                      </h3>
                      <label className="block text-sm text-gray-400 mb-2">Number of Prompts: {machinePromptCount}</label>
                      <input
                        type="range" min="2" max="12" value={machinePromptCount}
                        onChange={(e) => setMachinePromptCount(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>2</span><span>6</span><span>12</span>
                      </div>
                    </div>

                    {/* Additional People (Optional) */}
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                        <span className="bg-gray-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">+</span>
                        Additional People
                        <span className="text-xs text-gray-500 font-normal">(Optional)</span>
                      </h3>
                      <p className="text-xs text-gray-500 mb-3">Selected avatar is used as the main reference. Add extra people for couple/family concepts.</p>
                      <input
                        ref={machineRefInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            const files = Array.from(e.target.files).slice(0, 3)
                            setMachineRefImages(files)
                            setMachineRefPreviews(files.map((f) => URL.createObjectURL(f)))
                          }
                          e.target.value = ''
                        }}
                      />
                      {machineRefPreviews.length > 0 ? (
                        <div className="flex gap-2 flex-wrap">
                          {machineRefPreviews.map((src, i) => (
                            <div key={i} className="relative w-16 h-16 rounded overflow-hidden">
                              <img src={src} className="w-full h-full object-cover" />
                              <button
                                onClick={() => {
                                  const newFiles = machineRefImages.filter((_, j) => j !== i)
                                  setMachineRefImages(newFiles)
                                  setMachineRefPreviews(newFiles.map((f) => URL.createObjectURL(f)))
                                }}
                                className="absolute top-0 right-0 bg-black/60 rounded-bl p-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {machineRefImages.length < 3 && (
                            <button
                              onClick={() => machineRefInputRef.current?.click()}
                              className="w-16 h-16 border-2 border-dashed border-gray-600 rounded flex items-center justify-center text-gray-500 hover:text-white hover:border-gray-400"
                            >
                              <ImagePlus className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => machineRefInputRef.current?.click()}
                          className="w-full py-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-500 hover:text-white hover:border-gray-400 flex flex-col items-center gap-1"
                        >
                          <Users className="w-5 h-5" />
                          <span className="text-xs">Add extra people for couple/family (max 3)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right: Avatar, Voice Settings */}
                  <div className="space-y-6">
                    {/* Avatar Selection */}
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <span className="bg-purple-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">3</span>
                        Avatar for Video
                      </h3>
                      {avatarsLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                        </div>
                      ) : avatars.length === 0 ? (
                        <p className="text-sm text-gray-500 py-4 text-center">No avatars. Go to the Avatars tab to generate or upload some.</p>
                      ) : (
                        <div className="grid grid-cols-5 gap-2 max-h-[200px] overflow-auto">
                          {avatars.map((avatar) => (
                            <button
                              key={avatar.filename}
                              onClick={() => setMachineSelectedAvatar(machineSelectedAvatar?.filename === avatar.filename ? null : avatar)}
                              className={`aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 relative ${
                                machineSelectedAvatar?.filename === avatar.filename
                                  ? 'border-purple-500 ring-2 ring-purple-500/50'
                                  : 'border-transparent hover:border-gray-600'
                              }`}
                            >
                              <img src={avatar.url} alt={avatar.name} className="w-full h-full object-cover" />
                              {machineSelectedAvatar?.filename === avatar.filename && (
                                <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5">
                                  <Check className="w-3 h-3" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Voiceover Settings */}
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <span className="bg-purple-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">4</span>
                        Voiceover
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Duration</label>
                          <select
                            value={machineScriptDuration}
                            onChange={(e) => setMachineScriptDuration(Number(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value={15}>15s</option>
                            <option value={30}>30s</option>
                            <option value={45}>45s</option>
                            <option value={60}>60s</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Tone</label>
                          <select
                            value={machineScriptTone}
                            onChange={(e) => setMachineScriptTone(e.target.value as typeof machineScriptTone)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="casual">Casual</option>
                            <option value="professional">Professional</option>
                            <option value="energetic">Energetic</option>
                            <option value="friendly">Friendly</option>
                            <option value="dramatic">Dramatic</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-gray-400 mb-1">Voice</label>
                        {voicesLoading ? (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading voices...
                          </div>
                        ) : (
                          <select
                            value={machineSelectedVoice?.id || ''}
                            onChange={(e) => {
                              const v = voices.find((v) => v.id === e.target.value)
                              setMachineSelectedVoice(v || null)
                            }}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="">Select a voice...</option>
                            {voices.map((v) => (
                              <option key={v.id} value={v.id}>{v.name}{v.labels?.accent ? ` (${v.labels.accent})` : ''}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Run Button */}
                <button
                  onClick={() => handleRunMachine()}
                  disabled={!machineConcept.trim() || !machineSelectedAvatar || !machineSelectedVoice}
                  className="w-full py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Zap className="w-6 h-6" />
                  Run The Machine
                </button>

              </div>
            )}

            {/* ─── RUNNING: Progress View ─── */}
            {machineStep !== 'idle' && machineStep !== 'error' && machineStep !== 'done' && (
              <div className="space-y-6">
                <div className="bg-gray-900 rounded-lg p-6">
                  <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
                    Running The Machine
                    <span className="text-sm text-gray-400 ml-auto">Concept: {machineConcept}</span>
                  </h2>

                  {/* Pipeline Steps */}
                  <div className="space-y-4">
                    {(['prompts', 'images', 'script', 'tts', 'lipsync'] as const).map((step, i) => {
                      const labels = { prompts: 'Generate Prompts', images: 'Generate Images', script: 'Write Script', tts: 'Text-to-Speech', lipsync: 'Lipsync Video' }
                      const stepOrder = ['prompts', 'images', 'script', 'tts', 'lipsync']
                      const currentIdx = stepOrder.indexOf(machineStep)
                      const isActive = machineStep === step
                      const isDone = i < currentIdx
                      const isPending = i > currentIdx

                      return (
                        <div key={step} className={`flex items-center gap-4 p-3 rounded-lg ${isActive ? 'bg-gray-800' : ''}`}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                            {isDone ? (
                              <CheckCircle className="w-6 h-6 text-green-400" />
                            ) : isActive ? (
                              <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
                            ) : (
                              <div className="w-6 h-6 rounded-full border-2 border-gray-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={`font-medium ${isDone ? 'text-green-400' : isActive ? 'text-yellow-400' : 'text-gray-500'}`}>
                              {labels[step]}
                            </p>
                            {/* Step-specific details */}
                            {step === 'prompts' && isDone && machinePrompts.length > 0 && (
                              <p className="text-xs text-gray-400">{machinePrompts.length} prompts generated</p>
                            )}
                            {step === 'images' && isActive && machineBatchProgress && (
                              <div className="mt-1">
                                <div className="w-full bg-gray-700 rounded-full h-2">
                                  <div
                                    className="bg-yellow-400 h-2 rounded-full transition-all"
                                    style={{ width: `${machineBatchProgress.totalImages > 0 ? (machineBatchProgress.completedImages / machineBatchProgress.totalImages) * 100 : 0}%` }}
                                  />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{machineBatchProgress.completedImages}/{machineBatchProgress.totalImages} images</p>
                              </div>
                            )}
                            {step === 'images' && isDone && machineBatchProgress && (
                              <p className="text-xs text-gray-400">{machineBatchProgress.completedImages} images generated</p>
                            )}
                            {step === 'script' && isDone && machineScript && (
                              <p className="text-xs text-gray-400">{machineScript.split(/\s+/).length} words</p>
                            )}
                            {step === 'tts' && isDone && machineAudioUrl && (
                              <p className="text-xs text-gray-400">Audio ready</p>
                            )}
                            {isPending && (
                              <p className="text-xs text-gray-600">Waiting...</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <button
                  onClick={handleCancelMachine}
                  className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 transition-all"
                >
                  <X className="w-5 h-5" />
                  Cancel
                </button>
              </div>
            )}

            {/* ─── DONE: Results View ─── */}
            {machineStep === 'done' && (
              <div className="space-y-6">
                <div className="bg-gray-900 rounded-lg p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    Pipeline Complete!
                    <span className="text-sm text-gray-400 ml-auto">{machineConcept}</span>
                  </h2>

                  {/* Generated Images */}
                  {machineBatchProgress && machineBatchProgress.images.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3">Generated Images ({machineBatchProgress.images.filter(i => i.status === 'completed').length})</h3>
                      <div className="grid grid-cols-6 gap-2">
                        {machineBatchProgress.images.filter(i => i.status === 'completed' && i.url).map((img) => (
                          <div key={img.index} className="aspect-[9/16] rounded-lg overflow-hidden bg-gray-800">
                            <img src={img.url} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Script */}
                  {machineScript && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-400 mb-2">Voiceover Script</h3>
                      <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-300 max-h-32 overflow-auto whitespace-pre-wrap">
                        {machineScript}
                      </div>
                    </div>
                  )}

                  {/* Audio */}
                  {machineAudioUrl && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-400 mb-2">Audio</h3>
                      <audio controls src={machineAudioUrl} className="w-full" />
                    </div>
                  )}

                  {/* Video */}
                  {machineVideoUrl && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-400 mb-2">Avatar Video</h3>
                      <div className="flex gap-4 items-start">
                        <video controls src={machineVideoUrl} className="max-w-sm rounded-lg" />
                        <a
                          href={machineVideoUrl}
                          download
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg font-medium transition-all"
                        >
                          <Download className="w-4 h-4" />
                          Download Video
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setMachineStep('idle')
                      setMachinePrompts([])
                      setMachineBatchProgress(null)
                      setMachineScript('')
                      setMachineAudioUrl(null)
                      setMachineVideoUrl(null)
                      setMachineError(null)
                    }}
                    className="flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Run Again
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image Preview Overlay */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          {/* Prev Button */}
          {batchProgress && (() => {
            const completedImages = batchProgress.images.filter(img => img.status === 'completed' && img.url)
            const currentIndex = completedImages.findIndex(img => img.url === previewImage)
            return currentIndex > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewImage(completedImages[currentIndex - 1].url!)
                }}
                className="absolute left-4 bg-black/50 hover:bg-black/70 rounded-full p-3 transition-colors z-10"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            ) : null
          })()}

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a
                href={previewImage}
                download
                className="bg-green-600 hover:bg-green-700 rounded-full p-2 transition-colors"
                title="Download image"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-6 h-6" />
              </a>
              <button
                onClick={() => sendToImageToPrompt(previewImage)}
                className="bg-purple-600 hover:bg-purple-700 rounded-full p-2 transition-colors"
                title="Extract prompt from image"
              >
                <FileJson className="w-6 h-6" />
              </button>
              <button
                onClick={() => setPreviewImage(null)}
                className="bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            {/* Image counter */}
            {batchProgress && (() => {
              const completedImages = batchProgress.images.filter(img => img.status === 'completed' && img.url)
              const currentIndex = completedImages.findIndex(img => img.url === previewImage)
              return currentIndex >= 0 ? (
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-gray-400 bg-black/50 px-3 py-1 rounded">
                  {currentIndex + 1} / {completedImages.length}
                </p>
              ) : (
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-gray-400 bg-black/50 px-3 py-1 rounded">
                  Click anywhere to close
                </p>
              )
            })()}
          </div>

          {/* Next Button */}
          {batchProgress && (() => {
            const completedImages = batchProgress.images.filter(img => img.status === 'completed' && img.url)
            const currentIndex = completedImages.findIndex(img => img.url === previewImage)
            return currentIndex < completedImages.length - 1 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewImage(completedImages[currentIndex + 1].url!)
                }}
                className="absolute right-4 bg-black/50 hover:bg-black/70 rounded-full p-3 transition-colors z-10"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            ) : null
          })()}
        </div>
      )}

      {/* Full Size Avatar Overlay */}
      {fullSizeAvatarUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setFullSizeAvatarUrl(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={fullSizeAvatarUrl}
              alt="Generated Avatar"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a
                href={fullSizeAvatarUrl}
                download
                className="bg-green-600 hover:bg-green-700 rounded-full p-2 transition-colors"
                title="Download avatar"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-6 h-6" />
              </a>
              <button
                onClick={() => setFullSizeAvatarUrl(null)}
                className="bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-gray-400 bg-black/50 px-3 py-1 rounded">
              Click anywhere to close
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
