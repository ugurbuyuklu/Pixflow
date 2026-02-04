import { useState, useCallback, useEffect } from 'react'
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
  pose: { framing?: string }
  lighting: { mood?: string; setup?: string }
  set_design: { atmosphere?: string }
  outfit: { styling?: string }
  camera: object
  hairstyle: object
  makeup: object
  effects: object
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

function App() {
  const [activeTab, setActiveTab] = useState<'prompts' | 'generate' | 'analyze' | 'history'>('prompts')

  // Prompt Factory State
  const [concept, setConcept] = useState('')
  const [count, setCount] = useState(8)
  const [loading, setLoading] = useState(false)
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const [research, setResearch] = useState<ResearchData | null>(null)
  const [varietyScore, setVarietyScore] = useState<VarietyScore | null>(null)

  // Batch Generate State
  const [selectedPrompts, setSelectedPrompts] = useState<Set<number>>(new Set())
  const [referenceImage, setReferenceImage] = useState<File | null>(null)
  const [referencePreview, setReferencePreview] = useState<string | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [batchError, setBatchError] = useState<ErrorInfo | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Avatar Gallery State
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [avatarsLoading, setAvatarsLoading] = useState(false)
  const [imageSource, setImageSource] = useState<'upload' | 'gallery'>('gallery')
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null)

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

  // History & Favorites State
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [favorites, setFavorites] = useState<FavoritePrompt[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistoryPrompt, setSelectedHistoryPrompt] = useState<GeneratedPrompt | null>(null)
  const [favoriteAdded, setFavoriteAdded] = useState<string | null>(null)

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
      setSelectedAvatarUrl(avatar.url)
      setReferencePreview(avatar.url)

      // Fetch the image and convert to File
      const response = await fetch(avatar.url)
      if (!response.ok) throw new Error('Failed to fetch avatar')
      const blob = await response.blob()
      const file = new File([blob], avatar.filename, { type: blob.type })
      setReferenceImage(file)
    } catch (err) {
      console.error('Failed to select avatar:', err)
      setSelectedAvatarUrl(null)
      setReferencePreview(null)
      setReferenceImage(null)
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
  }, [activeTab])

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
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setPrompts(data.prompts)
      setResearch(data.research)
      setVarietyScore(data.varietyScore)
      if (data.prompts.length > 0) setSelectedIndex(0)
    } catch (err) {
      const errorInfo = parseError(err, response)
      if (response?.status === 429) {
        errorInfo.action = { label: 'Retry', onClick: () => handleGenerate() }
      }
      setError(errorInfo)
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useCallback((acceptedFiles: File[], rejections: FileRejection[]) => {
    setUploadError(null)

    if (rejections.length > 0) {
      const rejection = rejections[0]
      const errorCode = rejection.errors[0]?.code
      if (errorCode === 'file-too-large') {
        setUploadError('File is too large. Maximum size is 10MB.')
      } else if (errorCode === 'file-invalid-type') {
        setUploadError('Invalid file type. Please use JPEG, PNG, or WebP.')
      } else {
        setUploadError('Failed to upload file. Please try again.')
      }
      return
    }

    const file = acceptedFiles[0]
    if (file) {
      setReferenceImage(file)
      setReferencePreview(URL.createObjectURL(file))
      setSelectedAvatarUrl(null) // Clear avatar selection when uploading
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
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

  const parseCustomPrompt = (): GeneratedPrompt[] | null => {
    try {
      const parsed = JSON.parse(customPromptJson)
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
  }

  const handleBatchGenerate = async () => {
    if (!referenceImage) {
      setBatchError({ message: 'Please upload a reference image first.', type: 'warning' })
      return
    }

    let promptsToGenerate: GeneratedPrompt[]

    if (promptSource === 'custom') {
      const customPrompts = parseCustomPrompt()
      if (!customPrompts) {
        setBatchError({ message: 'Please fix the JSON errors first.', type: 'warning' })
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
      formData.append('referenceImage', referenceImage)
      formData.append('concept', promptSource === 'custom' ? 'custom' : (concept || 'untitled'))
      formData.append('prompts', JSON.stringify(promptsToGenerate))

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
            <Sparkles className="w-7 h-7 text-purple-400" />
            Borgflow Prompt Factory
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('prompts')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'prompts'
                  ? 'text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Prompt Factory
              {activeTab === 'prompts' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('generate')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'generate'
                  ? 'text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Batch Generate
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
              onClick={() => setActiveTab('analyze')}
              className={`px-6 py-3 font-medium transition-colors relative flex items-center gap-2 ${
                activeTab === 'analyze'
                  ? 'text-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ScanSearch className="w-4 h-4" />
              Image to Prompt
              {activeTab === 'analyze' && (
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
                <span className="ml-1 px-1.5 py-0.5 bg-yellow-600 rounded text-xs flex items-center gap-1">
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

              <button
                onClick={handleGenerate}
                disabled={loading || !concept.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Researching & Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Prompts
                  </>
                )}
              </button>
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
                    <button
                      onClick={() => setActiveTab('generate')}
                      className="text-sm text-purple-400 hover:text-purple-300"
                    >
                      Send to Batch →
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[600px] overflow-auto">
                    {prompts.map((prompt, index) => (
                      <div
                        key={index}
                        onClick={() => setSelectedIndex(index)}
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
                              className={`p-1 rounded hover:bg-yellow-600/30 transition-colors ${
                                selectedIndex === index ? 'text-yellow-300' : 'text-gray-500 hover:text-yellow-400'
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
                        <p className="text-sm line-clamp-2">{prompt.style}</p>
                      </div>
                    ))}
                  </div>
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
                          className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm"
                        >
                          <Star className="w-4 h-4" />
                          <span>Favorite</span>
                        </button>
                        <button
                          onClick={handleCopy}
                          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
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
                    <pre className="bg-gray-800 rounded-lg p-4 overflow-auto max-h-[550px] text-sm font-mono">
                      {JSON.stringify(prompts[selectedIndex], null, 2)}
                    </pre>
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
                      <div className="space-y-2 max-h-[500px] overflow-auto">
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
                              <p className="text-sm line-clamp-2">{prompt.style}</p>
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
                      Paste JSON Prompt
                    </label>
                    <textarea
                      value={customPromptJson}
                      onChange={(e) => {
                        setCustomPromptJson(e.target.value)
                        setCustomPromptError(null)
                      }}
                      placeholder='{"style": "...", "pose": {...}, ...}'
                      className={`w-full h-64 bg-gray-800 rounded-lg p-3 font-mono text-sm resize-none border ${
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
                      Number of Images
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customPromptCount}
                      onChange={(e) => setCustomPromptCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                      className="w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Generate {customPromptCount} image{customPromptCount > 1 ? 's' : ''} using this prompt
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Upload & Generate */}
            <div className="col-span-2 space-y-6">
              {/* Reference Image Section */}
              <div className="bg-gray-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Reference Image</h2>
                  {/* Source Toggle */}
                  <div className="flex bg-gray-800 rounded-lg p-1">
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
                  </div>
                </div>

                {/* Selected Preview */}
                {referencePreview && (
                  <div className="mb-4 p-3 bg-gray-800 rounded-lg flex items-center gap-4">
                    <img
                      src={referencePreview}
                      alt="Selected"
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-green-400 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Image Selected
                      </p>
                      <p className="text-sm text-gray-400">{referenceImage?.name}</p>
                    </div>
                    <button
                      onClick={() => {
                        setReferenceImage(null)
                        setReferencePreview(null)
                        setSelectedAvatarUrl(null)
                      }}
                      className="text-gray-400 hover:text-red-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
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
                        {avatars.map((avatar) => (
                          <button
                            key={avatar.filename}
                            onClick={() => selectAvatar(avatar)}
                            className={`aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                              selectedAvatarUrl === avatar.url
                                ? 'border-purple-500 ring-2 ring-purple-500/50'
                                : 'border-transparent hover:border-gray-600'
                            }`}
                          >
                            <img
                              src={avatar.url}
                              alt={avatar.name}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
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
              </div>

              {/* Generate Button */}
              <button
                onClick={handleBatchGenerate}
                disabled={
                  batchLoading ||
                  !referenceImage ||
                  (promptSource === 'generated' ? selectedPrompts.size === 0 : !customPromptJson.trim())
                }
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2"
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

                  <div className="grid grid-cols-4 gap-3">
                    {batchProgress.images.map((img) => (
                      <button
                        key={img.index}
                        onClick={() => img.status === 'completed' && img.url && setPreviewImage(img.url)}
                        className={`aspect-square rounded-lg border-2 flex items-center justify-center ${
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
                    <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
                      <span className="text-sm text-gray-400">
                        Saved to: {batchProgress.outputDir}
                      </span>
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

        {activeTab === 'analyze' && (
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
                className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg px-6 py-3 font-medium transition-colors flex items-center justify-center gap-2"
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
                        setActiveTab('prompts')
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Use in Factory
                    </button>
                  </div>
                )}
              </div>

              {analyzedPrompt ? (
                <pre className="bg-gray-800 rounded-lg p-4 overflow-auto max-h-[600px] text-sm font-mono">
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

        {/* Favorite Added Toast */}
        {favoriteAdded && (
          <div className="fixed bottom-6 right-6 bg-yellow-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
            <Star className="w-5 h-5" />
            <span>Added "{favoriteAdded}" to favorites!</span>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Left: Favorites */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" />
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
                <div className="space-y-2 max-h-[500px] overflow-auto">
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
                      <p className="text-xs text-gray-400 line-clamp-2">{fav.prompt.style}</p>
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
                <div className="space-y-2 max-h-[500px] overflow-auto">
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
                      className="flex items-center gap-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs"
                    >
                      <Star className="w-3 h-3" />
                      Favorite
                    </button>
                  </div>
                )}
              </div>
              {selectedHistoryPrompt ? (
                <pre className="bg-gray-800 rounded-lg p-4 overflow-auto max-h-[500px] text-xs font-mono">
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
      </div>

      {/* Image Preview Overlay */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative">
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
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
