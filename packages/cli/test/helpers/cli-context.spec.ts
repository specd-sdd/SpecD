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

  it('maps -vv to trace console destination via openSpecdHost options.kernel', async () => {
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
    expect(call?.options?.kernel?.additionalDestinations?.[0]).toMatchObject({
      target: 'console',
      level: 'trace',
    })
    process.argv = previousArgv
  })

  it('reads bootstrap warnings from config and returns the CLI context shape', async () => {
    const config = {
      ...makeMockConfig(),
      warnings: ['legacy config warning'],
    }
    const kernel = makeMockKernel()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(openSpecdHost).mockResolvedValue({
      config,
      configFilePath: '/project/specd.yaml',
      kernel,
      createGraphProvider: vi.fn(),
    })

    const result = await resolveCliContext()

    expect(result).toEqual({
      config,
      configFilePath: '/project/specd.yaml',
      kernel,
    })
    expect(warnSpy).toHaveBeenCalledWith('warning: legacy config warning')
  })

  it('emits each warning once per bootstrap call', async () => {
    const config = {
      ...makeMockConfig(),
      warnings: ['warning one', 'warning two'],
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(openSpecdHost).mockResolvedValue({
      config,
      configFilePath: '/project/specd.yaml',
      kernel: makeMockKernel(),
      createGraphProvider: vi.fn(),
    })

    await resolveCliContext()

    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenNthCalledWith(1, 'warning: warning one')
    expect(warnSpy).toHaveBeenNthCalledWith(2, 'warning: warning two')
  })

  it('does not emit warnings when config.warnings is missing or empty', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.mocked(openSpecdHost).mockResolvedValueOnce({
      config: makeMockConfig(),
      configFilePath: '/project/specd.yaml',
      kernel: makeMockKernel(),
      createGraphProvider: vi.fn(),
    })
    await resolveCliContext()

    vi.mocked(openSpecdHost).mockResolvedValueOnce({
      config: {
        ...makeMockConfig(),
        warnings: [],
      },
      configFilePath: '/project/specd.yaml',
      kernel: makeMockKernel(),
      createGraphProvider: vi.fn(),
    })
    await resolveCliContext()

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('buildCliKernelOptions includes CLI node_modules paths', () => {
    const options = buildCliKernelOptions()
    expect(options.extraNodeModulesPaths?.length).toBeGreaterThan(0)
  })
})
