import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  openSpecdHost: vi.fn(),
  createSdkContext: vi.fn(),
}))

vi.mock('../../src/helpers/cli-cleanup.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/helpers/cli-cleanup.js')>()
  return { ...original, registerCliCleanup: vi.fn(original.registerCliCleanup) }
})

import { createSdkContext, openSpecdHost } from '@specd/sdk'
import { openCliHost } from '../../src/helpers/cli-host.js'
import {
  registerCliCleanup,
  resetCliCleanupForTests,
  runCliCleanup,
} from '../../src/helpers/cli-cleanup.js'
import { makeMockConfig, makeMockHost } from '../commands/helpers.js'

afterEach(() => {
  vi.clearAllMocks()
  resetCliCleanupForTests()
})

describe('openCliHost', () => {
  it('opens through openSpecdHost and registers the host disposal for cleanup', async () => {
    const host = makeMockHost()
    vi.mocked(openSpecdHost).mockResolvedValue(host)
    const input = { configPath: '/project/specd.yaml', options: { kernel: {} } }

    const opened = await openCliHost(input)

    expect(opened).toBe(host)
    expect(openSpecdHost).toHaveBeenCalledWith(input)
    expect(host.dispose).not.toHaveBeenCalled()
    await runCliCleanup()
    expect(host.dispose).toHaveBeenCalledTimes(1)
  })

  it('opens an already-resolved config through createSdkContext and registers it too', async () => {
    const host = makeMockHost()
    vi.mocked(createSdkContext).mockResolvedValue(host)
    const config = makeMockConfig()

    const opened = await openCliHost({ config, options: { kernel: {} } })

    expect(opened).toBe(host)
    expect(createSdkContext).toHaveBeenCalledWith(config, { kernel: {} })
    expect(openSpecdHost).not.toHaveBeenCalled()
    await runCliCleanup()
    expect(host.dispose).toHaveBeenCalledTimes(1)
  })

  it('forwards the caller input unchanged to the SDK bootstrap function', async () => {
    const host = makeMockHost()
    vi.mocked(openSpecdHost).mockResolvedValue(host)
    const input = {
      configPath: '/p/specd.yaml',
      options: { kernel: { additionalDestinations: [] } },
    }

    await openCliHost(input)

    expect(vi.mocked(openSpecdHost).mock.calls[0]?.[0]).toBe(input)
  })

  it('a failed open registers nothing', async () => {
    vi.mocked(openSpecdHost).mockRejectedValue(new Error('no config'))

    vi.mocked(registerCliCleanup).mockClear()

    await expect(openCliHost()).rejects.toThrow('no config')
    await expect(runCliCleanup()).resolves.toBeUndefined()

    expect(registerCliCleanup).not.toHaveBeenCalled()
  })
})
