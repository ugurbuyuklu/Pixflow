import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import rateLimit from 'express-rate-limit'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendSuccess } from '../utils/http.js'
import { transcribeVideo } from '../services/wizper.js'

interface VideosRouterConfig {
  projectRoot: string
}

// Rate limiter for expensive transcription operations
const transcriptionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: 'Too many transcription requests. Please try again in a minute.',
  standardHeaders: true,
  legacyHeaders: false,
})

export function createVideosRouter(config: VideosRouterConfig) {
  const router = express.Router()
  const outputsDir = path.join(config.projectRoot, 'outputs')

  /**
   * Sanitize and validate file path to prevent directory traversal.
   * Only allows files from outputs directory.
   */
  function sanitizePath(userPath: string): string {
    // Remove leading slash if present
    const cleanPath = userPath.startsWith('/') ? userPath.slice(1) : userPath

    // Resolve to absolute path
    const absolutePath = path.join(config.projectRoot, cleanPath)

    // Verify it's within outputs directory
    if (!absolutePath.startsWith(outputsDir)) {
      throw new Error('Invalid path: must be within outputs directory')
    }

    return absolutePath
  }

  /**
   * GET /api/videos/list
   * List all video files in outputs directory
   */
  router.get('/list', async (_req, res) => {
    try {
      const files = await fs.readdir(outputsDir)

      const videoFiles = await Promise.all(
        files
          .filter((f) => f.endsWith('.mp4'))
          .map(async (filename) => {
            const filePath = path.join(outputsDir, filename)
            const stats = await fs.stat(filePath)
            return {
              filename,
              url: `/outputs/${filename}`,
              size: stats.size,
              modifiedAt: stats.mtime.toISOString(),
            }
          }),
      )

      // Sort by modification time (newest first)
      videoFiles.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

      sendSuccess(res, { videos: videoFiles })
    } catch (error) {
      console.error('[Videos] Failed to list videos:', error)
      sendError(res, 500, 'Failed to list videos', 'VIDEO_LIST_FAILED')
    }
  })

  /**
   * POST /api/videos/transcribe
   * Extract audio from video and transcribe using fal-ai/wizper
   */
  router.post('/transcribe', transcriptionLimiter, async (req: AuthRequest, res) => {
    // Set long timeout for transcription (5 minutes)
    req.setTimeout(300_000)
    res.setTimeout(300_000)

    try {
      const { videoUrl } = req.body

      // Validation
      if (!videoUrl || typeof videoUrl !== 'string') {
        sendError(res, 400, 'Video URL is required', 'MISSING_VIDEO_URL')
        return
      }

      if (!videoUrl.startsWith('/outputs/')) {
        sendError(res, 400, 'Invalid video URL: must be from outputs directory', 'INVALID_VIDEO_URL')
        return
      }

      // Sanitize and resolve path
      let videoPath: string
      try {
        videoPath = sanitizePath(videoUrl)
      } catch (err) {
        sendError(res, 400, 'Invalid video path', 'INVALID_VIDEO_PATH', err instanceof Error ? err.message : undefined)
        return
      }

      // Check file exists
      try {
        await fs.access(videoPath)
      } catch {
        sendError(res, 404, 'Video file not found', 'VIDEO_NOT_FOUND')
        return
      }

      // Check file extension
      if (!videoPath.endsWith('.mp4')) {
        sendError(res, 400, 'Invalid file type: only MP4 videos supported', 'INVALID_FILE_TYPE')
        return
      }

      console.log(`[Videos] Transcribing video: ${videoPath}`)

      // Transcribe video
      const result = await transcribeVideo(videoPath)

      console.log(`[Videos] Transcription complete: ${result.transcript.length} characters`)

      sendSuccess(res, {
        transcript: result.transcript,
        duration: result.duration,
        language: result.language,
      })
    } catch (error) {
      console.error('[Videos] Transcription failed:', error)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Handle specific error types
      if (errorMessage.includes('No audio track') || errorMessage.includes('Stream not found')) {
        sendError(res, 400, 'Video has no audio track to transcribe', 'NO_AUDIO_TRACK')
      } else if (errorMessage.includes('timed out')) {
        sendError(res, 408, 'Transcription timed out. Try a shorter video.', 'TRANSCRIPTION_TIMEOUT')
      } else if (errorMessage.includes('FFmpeg not available')) {
        sendError(res, 500, 'Audio extraction failed. Contact support.', 'FFMPEG_UNAVAILABLE')
      } else {
        sendError(res, 500, 'Transcription failed', 'TRANSCRIPTION_FAILED', errorMessage)
      }
    }
  })

  return router
}
