import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'

const DEFAULT_FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg'

export type ComposeBlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'darken' | 'lighten'

export interface ComposeLayerInput {
  mediaUrl: string
  mediaType: 'image' | 'video'
  startTime: number
  duration: number
  blendMode: ComposeBlendMode
  opacity: number
}

export interface ComposeExportParams {
  layers: ComposeLayerInput[]
  width: number
  height: number
  fps: number
  outputDir: string
  outputFile: string
  projectRoot: string
}

export interface ComposeExportResult {
  outputPath: string
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
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg failed (binary=${binary}, code ${code}): ${stderr || 'unknown error'}`))
      })
      proc.on('error', (error: Error) => {
        reject(new Error(`ffmpeg spawn failed (binary=${binary}): ${error.message}`))
      })
    })

  return candidates
    .reduce<Promise<void>>(
      (chain, binary) => chain.catch(() => runWithBinary(binary)),
      Promise.reject(new Error('ffmpeg execution not started')),
    )
    .catch((error) => {
      throw error instanceof Error ? error : new Error('ffmpeg execution failed')
    })
}

function resolveMediaPath(projectRoot: string, mediaUrl: string): string {
  const prefix = mediaUrl.startsWith('/uploads/') ? '/uploads/' : mediaUrl.startsWith('/outputs/') ? '/outputs/' : null
  if (!prefix) throw new Error(`Invalid media URL prefix: ${mediaUrl}`)
  const relative = decodeURIComponent(mediaUrl.slice(prefix.length)).trim()
  if (!relative || relative.includes('\0')) throw new Error(`Invalid media URL: ${mediaUrl}`)
  const baseDir = path.join(projectRoot, prefix.slice(1, -1))
  const resolved = path.resolve(baseDir, relative)
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) throw new Error(`Path traversal detected: ${mediaUrl}`)
  return resolved
}

export async function runComposeExport(params: ComposeExportParams): Promise<ComposeExportResult> {
  const { layers, width, height, fps, outputDir, outputFile, projectRoot } = params
  await fs.mkdir(outputDir, { recursive: true })

  const totalDuration = Math.max(...layers.map((l) => l.startTime + l.duration))
  const outputPath = path.join(outputDir, outputFile)

  const inputArgs: string[] = []
  const filterParts: string[] = []

  // Input 0: black base canvas
  inputArgs.push('-f', 'lavfi', '-i', `color=black:s=${width}x${height}:d=${totalDuration}:r=${fps}`)
  filterParts.push(`[0:v]format=rgba[base]`)

  // Add each layer as an input
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]
    const mediaPath = resolveMediaPath(projectRoot, layer.mediaUrl)

    if (layer.mediaType === 'image') {
      inputArgs.push('-loop', '1', '-t', String(layer.duration), '-framerate', String(fps), '-i', mediaPath)
    } else {
      inputArgs.push('-i', mediaPath)
    }

    const inputIdx = i + 1
    const scaledLabel = `scaled_${i}`
    const readyLabel = `ready_${i}`

    // Scale + pad to canvas size, trim to layer duration, then shift PTS to match timeline position
    filterParts.push(
      `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,` +
        `format=rgba,trim=duration=${layer.duration},setpts=PTS-STARTPTS+${layer.startTime}/TB[${scaledLabel}]`,
    )

    // Apply opacity if needed
    if (layer.opacity < 1) {
      filterParts.push(`[${scaledLabel}]colorchannelmixer=aa=${layer.opacity}[${readyLabel}]`)
    } else {
      filterParts.push(`[${scaledLabel}]copy[${readyLabel}]`)
    }
  }

  // Build blend chain
  let currentLabel = 'base'
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]
    const nextLabel = i === layers.length - 1 ? 'final' : `blend_${i}`

    if (layer.blendMode === 'normal') {
      filterParts.push(
        `[${currentLabel}][ready_${i}]overlay=0:0:enable='between(t,${layer.startTime},${layer.startTime + layer.duration})'[${nextLabel}]`,
      )
    } else {
      filterParts.push(
        `[${currentLabel}][ready_${i}]blend=all_mode=${layer.blendMode}:enable='between(t,${layer.startTime},${layer.startTime + layer.duration})'[${nextLabel}]`,
      )
    }

    currentLabel = nextLabel
  }

  const filterComplex = filterParts.join(';\n')

  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[final]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-t',
    String(totalDuration),
    outputPath,
  ]

  console.log('[compose] Running FFmpeg export:', outputPath)
  await runFfmpeg(args)
  console.log('[compose] Export complete:', outputPath)

  return { outputPath }
}
