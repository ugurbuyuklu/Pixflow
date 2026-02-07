import { useEffect, useRef } from 'react'
import {
  Check, CheckCircle, XCircle, Upload, Loader2, FolderOpen, AlertCircle, X,
  Users, Wand2, MessageSquare, Mic, Volume2, RefreshCw, Download, Video, AlertTriangle,
} from 'lucide-react'
import { apiUrl, assetUrl, authFetch, getApiError } from '../../lib/api'
import { useAvatarStore } from '../../stores/avatarStore'
import type { AvatarGender, AvatarAgeGroup, AvatarEthnicity, AvatarOutfit, ScriptTone } from '../../stores/avatarStore'

export default function AvatarStudioPage() {
  const avatarFileInputRef = useRef<HTMLInputElement>(null)

  const {
    mode, avatars, avatarsLoading, selectedAvatar, fullSizeAvatarUrl, error,
    gender, ageGroup, ethnicity, outfit, avatarCount, generating, generatedUrls, selectedGeneratedIndex, generationProgress,
    scriptConcept, scriptDuration, scriptTone, scriptGenerating, generatedScript, scriptWordCount, scriptEstimatedDuration,
    voices, voicesLoading, selectedVoice, ttsGenerating, generatedAudioUrl,
    lipsyncGenerating, lipsyncJob, generatedVideoUrl,
    i2vPrompt, i2vDuration, i2vLoading, i2vVideoUrl, i2vError,
    setMode, setSelectedAvatar, setFullSizeAvatarUrl, setGender, setAgeGroup, setEthnicity, setOutfit, setAvatarCount, setSelectedGeneratedIndex,
    setScriptConcept, setScriptDuration, setScriptTone, setGeneratedScript, setSelectedVoice,
    setI2vPrompt, setI2vDuration,
    loadAvatars, loadVoices, uploadAvatars, generateAvatar, generateScript, generateTTS, createLipsync, generateI2V,
  } = useAvatarStore()

  useEffect(() => {
    loadAvatars()
    loadVoices()
  }, [])

  return (
    <div className="space-y-6">
      {error && (
        <div className={`rounded-lg p-4 flex items-start gap-3 ${
          error.type === 'warning'
            ? 'bg-warning-muted/50 border border-warning/40'
            : 'bg-danger-muted/50 border border-danger/40'
        }`}>
          <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${
            error.type === 'warning' ? 'text-warning' : 'text-danger'
          }`} />
          <p className={`flex-1 ${
            error.type === 'warning' ? 'text-warning' : 'text-danger'
          }`}>
            {error.message}
          </p>
          <button
            onClick={() => useAvatarStore.setState({ error: null })}
            className="text-surface-400 hover:text-surface-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Left Column: Avatar Selection */}
        <div className="space-y-6">
          {/* Step 1: Avatar Selection */}
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
              Select Avatar
            </h2>

            {/* Mode Toggle */}
            <div className="flex bg-surface-100 rounded-lg p-1 mb-4">
              <button
                onClick={() => setMode('gallery')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  mode === 'gallery'
                    ? 'bg-brand-600 text-surface-900'
                    : 'text-surface-400 hover:text-surface-900'
                }`}
              >
                <Users className="w-4 h-4" />
                Gallery
              </button>
              <button
                onClick={() => avatarFileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors text-surface-400 hover:text-surface-900"
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
                    uploadAvatars(e.target.files)
                    e.target.value = ''
                  }
                }}
              />
              <button
                onClick={() => setMode('generate')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  mode === 'generate'
                    ? 'bg-brand-600 text-surface-900'
                    : 'text-surface-400 hover:text-surface-900'
                }`}
              >
                <Wand2 className="w-4 h-4" />
                Generate New
              </button>
            </div>

            {mode === 'gallery' ? (
              <div>
                {avatarsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
                  </div>
                ) : avatars.length === 0 ? (
                  <div className="text-center py-8 text-surface-400 border-2 border-dashed border-surface-200 rounded-lg">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No avatars in gallery</p>
                    <p className="text-sm mt-1">Generate a new avatar or add images to <code className="bg-surface-100 px-1 rounded">avatars/</code></p>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2 max-h-[300px] overflow-auto">
                    {avatars.map((avatar) => (
                      <button
                        key={avatar.filename}
                        onClick={() => {
                          setSelectedAvatar(selectedAvatar?.filename === avatar.filename ? null : avatar)
                          useAvatarStore.setState({ generatedUrls: [], selectedGeneratedIndex: 0 })
                        }}
                        className={`aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 relative ${
                          selectedAvatar?.filename === avatar.filename
                            ? 'border-brand-500 ring-2 ring-brand-500/50'
                            : 'border-transparent hover:border-surface-200'
                        }`}
                      >
                        <img
                          src={assetUrl(avatar.url)}
                          alt={avatar.name}
                          className="w-full h-full object-cover"
                        />
                        {selectedAvatar?.filename === avatar.filename && (
                          <div className="absolute top-1 right-1 bg-brand-500 rounded-full p-0.5">
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
                    <label className="block text-sm text-surface-400 mb-2">Gender</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as AvatarGender)}
                      className="w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-brand-500"
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-surface-400 mb-2">Age Group</label>
                    <select
                      value={ageGroup}
                      onChange={(e) => setAgeGroup(e.target.value as AvatarAgeGroup)}
                      className="w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-brand-500"
                    >
                      <option value="young-adult">Young Adult (20s)</option>
                      <option value="adult">Adult (30s)</option>
                      <option value="middle-aged">Middle-aged (40-50s)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-surface-400 mb-2">Ethnicity</label>
                    <select
                      value={ethnicity}
                      onChange={(e) => setEthnicity(e.target.value as AvatarEthnicity)}
                      className="w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-brand-500"
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
                    <label className="block text-sm text-surface-400 mb-2">Outfit</label>
                    <select
                      value={outfit}
                      onChange={(e) => setOutfit(e.target.value as AvatarOutfit)}
                      className="w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-brand-500"
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
                  <label className="block text-sm text-surface-400 mb-2">Number of Avatars: {avatarCount}</label>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    value={avatarCount}
                    onChange={(e) => setAvatarCount(Number(e.target.value))}
                    className="w-full accent-brand-500"
                  />
                  <div className="flex justify-between text-xs text-surface-400 mt-1">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                  </div>
                </div>
                <button
                  onClick={generateAvatar}
                  disabled={generating}
                  className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 disabled:bg-surface-200 disabled:from-surface-200 disabled:to-surface-200 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating {generationProgress}/{avatarCount}...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Generate {avatarCount > 1 ? `${avatarCount} Avatars` : 'Avatar'}
                    </>
                  )}
                </button>
                {generatedUrls.length > 0 && (
                  <div className="p-3 bg-success-muted/30 border border-success/40 rounded-lg space-y-3">
                    <p className="text-success text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {generatedUrls.length} avatar{generatedUrls.length > 1 ? 's' : ''} generated and saved to gallery!
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {generatedUrls.map((url, index) => (
                        <div
                          key={index}
                          className={`cursor-pointer transition-all relative rounded-lg overflow-hidden border-2 ${
                            selectedGeneratedIndex === index
                              ? 'border-brand-500 ring-2 ring-brand-500/50'
                              : 'border-transparent hover:border-surface-200'
                          }`}
                          onClick={() => setSelectedGeneratedIndex(index)}
                        >
                          <img
                            src={assetUrl(url)}
                            alt={`Generated avatar ${index + 1}`}
                            className="w-full aspect-[9/16] object-cover"
                          />
                          {selectedGeneratedIndex === index && (
                            <div className="absolute top-1 right-1 bg-brand-500 rounded-full p-0.5">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-surface-400 text-center">Click to select, double-click to view full size</p>
                  </div>
                )}
              </div>
            )}

            {(selectedAvatar || generatedUrls.length > 0) && (
              <div className="mt-4 p-3 bg-surface-100 rounded-lg">
                <p className="text-sm text-surface-400 mb-2">Selected Avatar:</p>
                <div className="flex items-center gap-3">
                  <img
                    src={assetUrl(generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url || '')}
                    alt="Selected avatar"
                    className="w-16 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setFullSizeAvatarUrl(generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url || '')}
                  />
                  <div>
                    <p className="font-medium">
                      {generatedUrls.length > 0
                        ? `Generated Avatar ${selectedGeneratedIndex + 1}/${generatedUrls.length}`
                        : selectedAvatar?.name}
                    </p>
                    <p className="text-xs text-surface-400">Click image to view full size</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Script Generation */}
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
              Generate Script
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-surface-400 mb-2">App/Product Concept</label>
                <input
                  type="text"
                  value={scriptConcept}
                  onChange={(e) => setScriptConcept(e.target.value)}
                  placeholder="e.g., AI photo transformation app, fitness tracker, dating app..."
                  className="w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Duration: {scriptDuration}s</label>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={scriptDuration}
                    onChange={(e) => setScriptDuration(Number(e.target.value))}
                    className="w-full accent-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Tone</label>
                  <select
                    value={scriptTone}
                    onChange={(e) => setScriptTone(e.target.value as ScriptTone)}
                    className="w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-brand-500"
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
                onClick={generateScript}
                disabled={scriptGenerating || !scriptConcept.trim()}
                className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 disabled:bg-surface-200 disabled:from-surface-200 disabled:to-surface-200 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
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
                <p className="text-xs text-warning/80 flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Enter an app/product concept above to generate a script
                </p>
              )}

              {generatedScript && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-surface-400">Generated Script:</span>
                    <span className="text-xs text-surface-400">
                      {scriptWordCount} words (~{scriptEstimatedDuration}s)
                    </span>
                  </div>
                  <textarea
                    value={generatedScript}
                    onChange={(e) => setGeneratedScript(e.target.value)}
                    rows={4}
                    className="w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-brand-500"
                  />
                  <button
                    onClick={generateScript}
                    disabled={scriptGenerating}
                    className="text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1"
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
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
              Voice & Audio
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-surface-400 mb-2">Select Voice</label>
                {voicesLoading ? (
                  <div className="flex items-center gap-2 text-surface-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading voices...
                  </div>
                ) : (
                  <select
                    value={selectedVoice?.id || ''}
                    onChange={(e) => setSelectedVoice(voices.find(v => v.id === e.target.value) || null)}
                    className="w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-brand-500"
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
                    onClick={() => new Audio(selectedVoice.previewUrl).play()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface-100 hover:bg-surface-200 rounded-lg text-sm"
                  >
                    <Volume2 className="w-4 h-4" />
                    Preview Voice
                  </button>
                </div>
              )}

              <button
                onClick={generateTTS}
                disabled={ttsGenerating || !generatedScript || !selectedVoice}
                className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 disabled:bg-surface-200 disabled:from-surface-200 disabled:to-surface-200 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
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
                <p className="text-xs text-warning/80 flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {!generatedScript ? 'Generate a script first (Step 2)' : 'Select a voice above'}
                </p>
              )}

              {generatedAudioUrl && (
                <div className="p-3 bg-success-muted/30 border border-success/40 rounded-lg">
                  <p className="text-success text-sm flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4" />
                    Audio generated!
                  </p>
                  <audio
                    controls
                    src={assetUrl(generatedAudioUrl)}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Lipsync Video Generation */}
          <div className="bg-surface-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
              Generate Video
            </h2>

            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className={`flex items-center gap-2 ${selectedAvatar || generatedUrls.length > 0 ? 'text-success' : 'text-surface-400'}`}>
                  {selectedAvatar || generatedUrls.length > 0 ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  Avatar selected
                </div>
                <div className={`flex items-center gap-2 ${generatedScript ? 'text-success' : 'text-surface-400'}`}>
                  {generatedScript ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  Script generated
                </div>
                <div className={`flex items-center gap-2 ${generatedAudioUrl ? 'text-success' : 'text-surface-400'}`}>
                  {generatedAudioUrl ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  Audio generated
                </div>
              </div>

              <button
                onClick={createLipsync}
                disabled={lipsyncGenerating || !generatedAudioUrl || (!selectedAvatar && generatedUrls.length === 0)}
                className="w-full bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success disabled:bg-surface-200 disabled:from-surface-200 disabled:to-surface-200 disabled:cursor-not-allowed rounded-lg px-4 py-3 font-medium transition-all flex items-center justify-center gap-2"
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
              {!lipsyncGenerating && (!generatedAudioUrl || (!selectedAvatar && generatedUrls.length === 0)) && (
                <p className="text-xs text-warning/80 flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {!selectedAvatar && generatedUrls.length === 0
                    ? 'Select an avatar first (Step 1)'
                    : 'Generate audio first (Step 3)'}
                </p>
              )}

              {lipsyncJob && (
                <div className={`p-3 rounded-lg ${
                  lipsyncJob.status === 'complete' ? 'bg-success-muted/30 border border-success/40' :
                  lipsyncJob.status === 'error' ? 'bg-danger-muted/30 border border-danger/40' :
                  'bg-warning-muted/30 border border-warning/40'
                }`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm flex items-center gap-2 ${
                      lipsyncJob.status === 'complete' ? 'text-success' :
                      lipsyncJob.status === 'error' ? 'text-danger' :
                      'text-warning'
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
                        href={assetUrl(generatedVideoUrl)}
                        download
                        className="bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success rounded-lg px-3 py-1.5 text-sm font-medium transition-all flex items-center gap-1.5"
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
            <div className="bg-surface-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-success rounded-full w-6 h-6 flex items-center justify-center text-sm">5</span>
                Output
              </h2>

              <div className="space-y-4">
                <video
                  controls
                  src={assetUrl(generatedVideoUrl)}
                  className="w-full rounded-lg"
                />

                <div className="flex gap-2">
                  <a
                    href={assetUrl(generatedVideoUrl)}
                    download
                    className="flex-1 bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success rounded-lg px-4 py-2 font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Video
                  </a>
                  <button
                    onClick={async () => {
                      const response = await authFetch(apiUrl('/api/generate/open-folder'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderPath: 'outputs' }),
                      })
                      if (!response.ok) {
                        const raw = await response.json().catch(() => ({}))
                        useAvatarStore.setState({ error: { message: getApiError(raw, 'Failed to open folder'), type: 'error' } })
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-surface-100 hover:bg-surface-200 rounded-lg"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Open Folder
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Image to Video (Kling AI) */}
        <div className="bg-surface-100/50 rounded-xl border border-surface-200/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Video className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-semibold text-surface-900">Image to Video</h3>
            <span className="text-xs text-surface-400 ml-auto">Powered by Kling AI</span>
          </div>

          {i2vError && (
            <div className={`rounded-lg p-3 mb-4 flex items-start gap-2 ${
              i2vError.type === 'warning' ? 'bg-warning-muted/50 border border-warning/40' : 'bg-danger-muted/50 border border-danger/40'
            }`}>
              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${i2vError.type === 'warning' ? 'text-warning' : 'text-danger'}`} />
              <p className={`text-sm ${i2vError.type === 'warning' ? 'text-warning' : 'text-danger'}`}>{i2vError.message}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-500 mb-2">Motion Prompt</label>
              <textarea
                value={i2vPrompt}
                onChange={(e) => setI2vPrompt(e.target.value)}
                placeholder="Describe the motion or scene... e.g., 'Camera slowly zooms in while the subject smiles and waves'"
                className="w-full px-4 py-3 bg-surface-50/50 border border-surface-200 rounded-lg text-surface-900 placeholder-surface-400 focus:outline-none focus:border-accent transition-colors resize-none h-20"
              />
            </div>

            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-500 mb-2">Duration</label>
                <div className="flex gap-2">
                  {(['5', '10'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setI2vDuration(d)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        i2vDuration === d
                          ? 'bg-accent text-white'
                          : 'bg-surface-200 text-surface-500 hover:bg-surface-200'
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex justify-end">
                <button
                  onClick={generateI2V}
                  disabled={i2vLoading || !i2vPrompt.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-accent to-accent-hover text-surface-900 font-medium rounded-lg hover:from-accent-hover hover:to-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {i2vLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Video className="w-5 h-5" />
                      Generate Video
                    </>
                  )}
                </button>
              </div>
            </div>

            {i2vVideoUrl && (
              <div className="space-y-3">
                <video
                  controls
                  src={assetUrl(i2vVideoUrl)}
                  className="w-full rounded-lg"
                />
                <a
                  href={assetUrl(i2vVideoUrl)}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-success to-success-hover hover:from-success-hover hover:to-success rounded-lg font-medium transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Video
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
