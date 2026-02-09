import path from 'node:path'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'

export interface YtDlpDownloadResult {
  videoPath: string
  title: string
  duration: number
  platform: string
}

/**
 * Download video from URL using yt-dlp binary
 * Supports: Facebook, Instagram, TikTok, YouTube, and 1000+ sites
 */
export async function downloadVideoWithYtDlp(
  url: string,
  outputDir: string,
): Promise<YtDlpDownloadResult> {
  const timestamp = Date.now()
  const sanitizedFilename = `ytdlp_${timestamp}_%(title).50s.%(ext)s`
  const outputTemplate = path.join(outputDir, sanitizedFilename)

  console.log('[yt-dlp] Downloading video from:', url)

  return new Promise((resolve, reject) => {
    // Spawn yt-dlp process
    const ytdlp = spawn('yt-dlp', [
      url,
      '--output', outputTemplate,
      '--format', 'best[ext=mp4]/best',
      '--yes-playlist', // Allow playlists (Facebook Ads Library returns playlists)
      '--max-downloads', '1', // Only download first video from playlist
      '--cookies-from-browser', 'chrome', // Use Chrome cookies for authentication
      '--print', '%(title)s|%(duration)s|%(extractor)s', // Print metadata
    ])

    let stdout = ''
    let stderr = ''
    let metadata = { title: 'Downloaded Video', duration: 0, platform: 'unknown' }

    ytdlp.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output
      console.log('[yt-dlp]', output.trim())

      // Parse metadata from print output
      const metaMatch = output.match(/^([^|]+)\|([^|]+)\|([^|]+)$/m)
      if (metaMatch) {
        metadata = {
          title: metaMatch[1].trim(),
          duration: Number.parseFloat(metaMatch[2]) || 0,
          platform: metaMatch[3].trim(),
        }
      }
    })

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error('[yt-dlp]', data.toString().trim())
    })

    ytdlp.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr || 'Unknown error'}`))
        return
      }

      try {
        // Find downloaded file
        const files = await fs.readdir(outputDir)
        const downloadedFile = files.find(
          (f) => f.startsWith(`ytdlp_${timestamp}_`) && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')),
        )

        if (!downloadedFile) {
          reject(new Error('Downloaded video file not found'))
          return
        }

        const videoPath = path.join(outputDir, downloadedFile)
        console.log('[yt-dlp] Download complete:', videoPath)

        resolve({
          videoPath,
          ...metadata,
        })
      } catch (error) {
        reject(error)
      }
    })

    ytdlp.on('error', (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`))
    })
  })
}

/**
 * Check if URL is supported by yt-dlp
 * Returns platform name if supported, null otherwise
 */
export function detectPlatform(url: string): string | null {
  const platforms = [
    { pattern: /facebook\.com|fb\.watch/i, name: 'Facebook' },
    { pattern: /instagram\.com/i, name: 'Instagram' },
    { pattern: /tiktok\.com/i, name: 'TikTok' },
    { pattern: /youtube\.com|youtu\.be/i, name: 'YouTube' },
    { pattern: /twitter\.com|x\.com/i, name: 'Twitter/X' },
    { pattern: /vimeo\.com/i, name: 'Vimeo' },
    { pattern: /dailymotion\.com/i, name: 'Dailymotion' },
  ]

  for (const { pattern, name } of platforms) {
    if (pattern.test(url)) {
      return name
    }
  }

  return null
}
