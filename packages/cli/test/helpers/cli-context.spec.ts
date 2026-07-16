import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeMockConfig, makeMockKernel } from '../commands/helpers.js'

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
    openSpecdHost: vi.fn(),
  }
})

import { resolveCliContext, buildCliKernelOptions } from '../../src/helpers/cli-context.js'
import { openSpecdHost } from '@specd/sdk'

describe('resolveCliContext', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps -vv to trace console destination via openSpecdHost kernelOptions', async () => {
    const config = makeMockConfig()
    const kernel = makeMockKernel()
    vi.mocked(openSpecdHost).mockResolvedValue({
      config,
      configFilePath: '/project/specd.yaml',
      kernel,
      createGraphProvider: vi.fn(),
    })

    const previousArgv = process.argv
    process.argv = ['node', 'specd', '-vv']

    await resolveCliContext()

    expect(openSpecdHost).toHaveBeenCalled()
    const call = vi.mocked(openSpecdHost).mock.calls[0]?.[0]
    expect(call?.startDir).toBeUndefined()
    expect(call?.kernelOptions?.additionalDestinations?.[0]).toMatchObject({
      target: 'console',
      level: 'trace',
    })
    process.argv = previousArgv
  })

  it('buildCliKernelOptions includes CLI node_modules paths', () => {
    const options = buildCliKernelOptions()
    expect(options.extraNodeModulesPaths?.length).toBeGreaterThan(0)
  })
})
