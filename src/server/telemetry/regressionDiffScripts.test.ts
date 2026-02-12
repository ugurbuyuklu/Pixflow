import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-regression-diff-'))
  tempDirs.push(dir)
  return dir
}

function runNodeScript(scriptPath: string, args: string[]): string {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

function runTsScript(scriptPath: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(process.execPath, ['--import', 'tsx', scriptPath, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('telemetry regression diff scripts', () => {
  it('renders pipeline row as n/a when that pipeline has no previous-window baseline', async () => {
    const dir = await makeTempDir()
    const reportFile = path.join(dir, 'report.json')
    const trendsFile = path.join(dir, 'trends.json')
    const outFile = path.join(dir, 'dashboard.md')

    await fs.writeFile(
      reportFile,
      JSON.stringify({
        window: { start: '2026-02-12T00:00:00.000Z', end: '2026-02-12T00:05:00.000Z' },
        totals: { events: 10, attempts: 10 },
        overall: { successRate: 1, durationP95Ms: 10 },
        providers: {},
        pipelines: {},
      }),
      'utf8',
    )
    await fs.writeFile(
      trendsFile,
      JSON.stringify({
        generatedAt: '2026-02-12T00:00:00.000Z',
        sourceFile: '/tmp/pipeline-events.jsonl',
        windowSize: 300,
        current: {
          windowEvents: 10,
          overallSuccessRate: 1,
          overallP95Ms: 10,
          providerFailRate: {},
          pipelineMetrics: {
            'frontend.tab.switch': { attempts: 5, successRate: 1, failRate: 0, p95Ms: 15 },
            'prompts.new-model': { attempts: 5, successRate: 0.5, failRate: 0.5, p95Ms: 900 },
          },
        },
        previous: {
          windowEvents: 10,
          overallSuccessRate: 0.9,
          overallP95Ms: 20,
          providerFailRate: {},
          pipelineMetrics: {
            'frontend.tab.switch': { attempts: 5, successRate: 0.9, failRate: 0.1, p95Ms: 30 },
          },
        },
        delta: {
          successRate: 0.1,
          p95Ms: -10,
          providerFailRate: {},
          pipelineSuccessRate: { 'frontend.tab.switch': 0.1, 'prompts.new-model': 0.5 },
          pipelineP95Ms: { 'frontend.tab.switch': -15, 'prompts.new-model': 900 },
          pipelineFailRate: { 'frontend.tab.switch': -0.1, 'prompts.new-model': 0.5 },
        },
      }),
      'utf8',
    )

    runNodeScript(path.resolve(process.cwd(), 'scripts/build-telemetry-dashboard.js'), [
      '--report',
      reportFile,
      '--trends',
      trendsFile,
      '--out',
      outFile,
    ])

    const md = await fs.readFile(outFile, 'utf8')
    expect(md).toMatch(
      /\| prompts\.new-model \| 5 \| n\/a \| 50\.00% \| n\/a \| n\/a \| 900\.0ms \| n\/a \| n\/a \| 50\.00% \| n\/a \| n\/a \| n\/a \|/,
    )
    expect(md).toMatch(/\| frontend\.tab\.switch .* \| improved \|/)
  })

  it('ignores baseline-missing pipeline regressions in highlights', async () => {
    const dir = await makeTempDir()
    const trendsFile = path.join(dir, 'trends.json')
    const outFile = path.join(dir, 'highlights.md')

    await fs.writeFile(
      trendsFile,
      JSON.stringify({
        generatedAt: '2026-02-12T00:00:00.000Z',
        sourceFile: '/tmp/pipeline-events.jsonl',
        windowSize: 300,
        current: {
          windowEvents: 10,
          overallSuccessRate: 1,
          overallP95Ms: 10,
          providerFailRate: {},
          pipelineMetrics: {
            'frontend.tab.switch': { attempts: 5, successRate: 1, failRate: 0, p95Ms: 15 },
            'prompts.new-model': { attempts: 5, successRate: 0.4, failRate: 0.6, p95Ms: 1000 },
          },
        },
        previous: {
          windowEvents: 10,
          overallSuccessRate: 0.95,
          overallP95Ms: 20,
          providerFailRate: {},
          pipelineMetrics: {
            'frontend.tab.switch': { attempts: 5, successRate: 0.9, failRate: 0.1, p95Ms: 30 },
          },
        },
        delta: {
          successRate: 0.05,
          p95Ms: -10,
          providerFailRate: {},
          pipelineSuccessRate: { 'frontend.tab.switch': 0.1, 'prompts.new-model': -0.5 },
          pipelineP95Ms: { 'frontend.tab.switch': -15, 'prompts.new-model': 1000 },
          pipelineFailRate: { 'frontend.tab.switch': -0.1, 'prompts.new-model': 0.6 },
        },
      }),
      'utf8',
    )

    runNodeScript(path.resolve(process.cwd(), 'scripts/build-telemetry-highlights.js'), [
      '--trends',
      trendsFile,
      '--out',
      outFile,
    ])

    const highlights = await fs.readFile(outFile, 'utf8')
    expect(highlights).toContain('- Pipeline regressions: none.')
    expect(highlights).toContain('- Frontend interaction regressions: none.')
    expect(highlights).not.toContain('prompts.new-model')
  })

  it('blocks when frontend pipeline regression exceeds thresholds', async () => {
    const dir = await makeTempDir()
    const trendsFile = path.join(dir, 'trends.json')

    await fs.writeFile(
      trendsFile,
      JSON.stringify({
        generatedAt: '2026-02-12T00:00:00.000Z',
        sourceFile: '/tmp/pipeline-events.jsonl',
        windowSize: 300,
        current: {
          windowEvents: 10,
          overallSuccessRate: 1,
          overallP95Ms: 10,
          providerFailRate: {},
          pipelineMetrics: {
            'frontend.tab.switch': { attempts: 5, successRate: 0.7, failRate: 0.3, p95Ms: 400 },
          },
        },
        previous: {
          windowEvents: 10,
          overallSuccessRate: 1,
          overallP95Ms: 10,
          providerFailRate: {},
          pipelineMetrics: {
            'frontend.tab.switch': { attempts: 5, successRate: 1, failRate: 0, p95Ms: 50 },
          },
        },
        delta: {
          successRate: 0,
          p95Ms: 0,
          providerFailRate: {},
          pipelineSuccessRate: { 'frontend.tab.switch': -0.3 },
          pipelineP95Ms: { 'frontend.tab.switch': 350 },
          pipelineFailRate: { 'frontend.tab.switch': 0.3 },
        },
      }),
      'utf8',
    )

    expect(() =>
      runTsScript(
        path.resolve(process.cwd(), 'src/server/telemetry/checkRegression.ts'),
        ['--mode', 'block', '--file', trendsFile],
        {
          PIXFLOW_REGRESSION_MAX_SUCCESS_DROP: '1',
          PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS: '999999',
          PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE: '1',
          PIXFLOW_REGRESSION_MAX_PIPELINE_SUCCESS_DROP: '0.05',
          PIXFLOW_REGRESSION_MAX_PIPELINE_P95_INCREASE_MS: '100',
          PIXFLOW_REGRESSION_MAX_PIPELINE_FAILRATE_INCREASE: '0.05',
          PIXFLOW_REGRESSION_MAX_FRONTEND_SUCCESS_DROP: '0.05',
          PIXFLOW_REGRESSION_MAX_FRONTEND_P95_INCREASE_MS: '100',
          PIXFLOW_REGRESSION_MAX_FRONTEND_FAILRATE_INCREASE: '0.05',
          PIXFLOW_REGRESSION_PIPELINE_MIN_SAMPLES: '3',
        },
      ),
    ).toThrow(/pipeline frontend\.tab\.switch/i)
  })
})
