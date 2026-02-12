import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  subscribeMock,
  uploadMock,
  readFileMock,
  ensureFalConfigMock,
  isMockProvidersEnabledMock,
  runWithRetriesMock,
  recordMockProviderSuccessMock,
} = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  uploadMock: vi.fn(),
  readFileMock: vi.fn(),
  ensureFalConfigMock: vi.fn(),
  isMockProvidersEnabledMock: vi.fn(),
  runWithRetriesMock: vi.fn(),
  recordMockProviderSuccessMock: vi.fn(),
}))

vi.mock('@fal-ai/client', () => ({
  fal: {
    storage: {
      upload: uploadMock,
    },
    subscribe: subscribeMock,
  },
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: readFileMock,
    unlink: vi.fn(),
  },
}))

vi.mock('./falConfig.js', () => ({
  ensureFalConfig: ensureFalConfigMock,
}))

vi.mock('./providerRuntime.js', () => ({
  isMockProvidersEnabled: isMockProvidersEnabledMock,
  runWithRetries: runWithRetriesMock,
  recordMockProviderSuccess: recordMockProviderSuccessMock,
}))

import { transcribeAudio } from './wizper.js'

beforeEach(() => {
  vi.clearAllMocks()
  readFileMock.mockResolvedValue(Buffer.from('audio-bytes'))
  uploadMock.mockResolvedValue('https://fal.storage/audio.mp3')
  isMockProvidersEnabledMock.mockReturnValue(false)
  runWithRetriesMock.mockImplementation(async (work: () => Promise<unknown>) => await work())
})

describe('transcribeAudio', () => {
  it('forces transcribe task and language auto-detect (no english default lock)', async () => {
    subscribeMock.mockResolvedValue({
      data: {
        text: 'Merhaba dunya',
        duration: 7.2,
        languages: ['tr'],
      },
    })

    const result = await transcribeAudio('/tmp/source-audio.mp3')

    expect(ensureFalConfigMock).toHaveBeenCalledTimes(1)
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(runWithRetriesMock).toHaveBeenCalledTimes(1)
    expect(subscribeMock).toHaveBeenCalledWith(
      'fal-ai/wizper',
      expect.objectContaining({
        input: expect.objectContaining({
          audio_url: 'https://fal.storage/audio.mp3',
          task: 'transcribe',
          language: null,
        }),
      }),
    )
    expect(result).toEqual({
      transcript: 'Merhaba dunya',
      duration: 7.2,
      language: 'tr',
    })
  })

  it('returns mock transcript in mock-provider mode', async () => {
    isMockProvidersEnabledMock.mockReturnValue(true)

    const result = await transcribeAudio('/tmp/source-audio.mp3')

    expect(recordMockProviderSuccessMock).toHaveBeenCalledTimes(1)
    expect(subscribeMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      transcript: 'Mock transcript for testing purposes.',
      duration: 30,
      language: 'en',
    })
  })
})
