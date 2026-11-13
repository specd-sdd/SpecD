import { afterEach, describe, expect, it, vi } from 'vitest'

const mockLoad = vi.fn()

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  createDefaultConfigLoader: vi.fn(async () => ({ load: mockLoad, resolvePath: vi.fn() })),
}))

import { makeMockConfig } from './commands/helpers.js'
import { loadConfig } from '../src/load-config.js'

afterEach(() => {
  vi.restoreAllMocks()
  mockLoad.mockReset()
})

describe('loadConfig warnings', () => {
  it('prints each loader warning to stderr before returning the config', async () => {
    const config = { ...makeMockConfig(), warnings: ['legacy format', 'second'] }
    mockLoad.mockResolvedValue(config)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await loadConfig()

    expect(result).toBe(config)
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenNthCalledWith(1, 'warning: legacy format')
    expect(warn).toHaveBeenNthCalledWith(2, 'warning: second')
  })

  it('prints nothing when the config has no warnings', async () => {
    mockLoad.mockResolvedValue(makeMockConfig())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await loadConfig()
    expect(warn).not.toHaveBeenCalled()
  })
})
