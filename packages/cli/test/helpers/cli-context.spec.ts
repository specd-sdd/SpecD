import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeMockConfig, makeMockKernel } from '../commands/helpers.js'

vi.mock('../../src/load-config.js', () => ({
  loadConfig: vi.fn(),
  resolveConfigPath: vi.fn(),
}))

vi.mock('../../src/kernel.js', () => ({
  createCliKernel: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { loadConfig, resolveConfigPath } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'

describe('resolveCliContext', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps -vv to trace console destination', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeMockConfig())
    vi.mocked(resolveConfigPath).mockResolvedValue('/project/specd.yaml')
    vi.mocked(createCliKernel).mockResolvedValue(makeMockKernel())

    const previousArgv = process.argv
    process.argv = ['node', 'specd', '-vv']

    await resolveCliContext()

    expect(createCliKernel).toHaveBeenCalled()
    const call = vi.mocked(createCliKernel).mock.calls[0]?.[1]
    expect(call?.additionalDestinations?.[0]).toMatchObject({
      target: 'console',
      level: 'trace',
    })
    process.argv = previousArgv
  })
})
