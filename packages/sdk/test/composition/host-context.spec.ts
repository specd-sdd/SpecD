import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type SpecdConfig } from '@specd/core'

const kernelDispose = vi.fn(async () => {})
const mockKernel = { id: 'kernel', dispose: kernelDispose }
const mockProviderA = { id: 'provider-a' }
const mockProviderB = { id: 'provider-b' }
let providerCallCount = 0

const createKernel = vi.fn(async () => mockKernel)
const createDefaultConfigLoader = vi.fn(async () => ({ load, resolvePath }))
const createVcsAdapter = vi.fn()
const createBootstrapGraphConfig = vi.fn()
class ConfigNotFoundError extends Error {}
const createCodeGraphProvider = vi.fn(() => {
  providerCallCount += 1
  return providerCallCount === 1 ? mockProviderA : mockProviderB
})
const load = vi.fn()
const resolvePath = vi.fn()

vi.mock('@specd/core', () => ({
  createKernel,
  createDefaultConfigLoader,
  createVcsAdapter,
  ConfigNotFoundError,
}))

vi.mock('@specd/code-graph', () => ({
  createCodeGraphProvider,
  createBootstrapGraphConfig,
}))

const { createSdkContext, openSpecdHost } = await import('../../src/composition/host-context.js')

const sampleConfig = {
  projectRoot: '/tmp/project',
  configPath: '/tmp/project/specd.yaml',
} as SpecdConfig

describe('createSdkContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    providerCallCount = 0
  })

  it('passes the same config to createKernel and createCodeGraphProvider', async () => {
    const ctx = await createSdkContext(sampleConfig)
    expect(createKernel).toHaveBeenCalledWith(sampleConfig, undefined)
    ctx.createGraphProvider()
    expect(createCodeGraphProvider).toHaveBeenCalledWith(sampleConfig, undefined)
    expect(ctx.kernel).toBe(mockKernel)
  })

  it('forwards graph composition options into createGraphProvider', async () => {
    const graphOptions = { graphStoreId: 'sqlite' }
    const ctx = await createSdkContext(sampleConfig, { graph: graphOptions })

    ctx.createGraphProvider()

    expect(createKernel).toHaveBeenCalledWith(sampleConfig, undefined)
    expect(createCodeGraphProvider).toHaveBeenCalledWith(sampleConfig, graphOptions)
  })

  it('returns a new provider on each createGraphProvider call', async () => {
    const ctx = await createSdkContext(sampleConfig)
    expect(ctx.createGraphProvider()).toBe(mockProviderA)
    expect(ctx.createGraphProvider()).toBe(mockProviderB)
  })
})

describe('openSpecdHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    load.mockResolvedValue(sampleConfig)
    resolvePath.mockResolvedValue('/tmp/project/specd.yaml')
  })

  it('loads config via discovery when configPath is omitted', async () => {
    const result = await openSpecdHost()
    expect(createDefaultConfigLoader).toHaveBeenCalledWith({ startDir: process.cwd() })
    expect(load).toHaveBeenCalled()
    expect(result.config).toBe(sampleConfig)
    expect(result.configFilePath).toBe('/tmp/project/specd.yaml')
    expect(result.kernel).toBe(mockKernel)
  })

  it('preserves loader warnings on the returned config', async () => {
    const warningConfig = {
      ...sampleConfig,
      warnings: ['legacy config warning'],
    } as SpecdConfig
    load.mockResolvedValue(warningConfig)

    const result = await openSpecdHost()

    expect(result.config.warnings).toEqual(['legacy config warning'])
  })

  it('keeps warnings on config instead of duplicating them on the host result', async () => {
    const warningConfig = {
      ...sampleConfig,
      warnings: ['legacy config warning'],
    } as SpecdConfig
    load.mockResolvedValue(warningConfig)

    const result = await openSpecdHost()

    expect(result).toMatchObject({
      config: warningConfig,
      configFilePath: '/tmp/project/specd.yaml',
      kernel: mockKernel,
      createGraphProvider: expect.any(Function),
    })
    expect('warnings' in result).toBe(false)
  })

  it('forwards sdk options to createKernel and createGraphProvider', async () => {
    const kernelOptions = { additionalDestinations: [] }
    const graphOptions = { graphStoreId: 'sqlite' }

    const result = await openSpecdHost({
      options: {
        kernel: kernelOptions,
        graph: graphOptions,
      },
    })

    result.createGraphProvider()
    expect(createKernel).toHaveBeenCalledWith(sampleConfig, kernelOptions)
    expect(createCodeGraphProvider).toHaveBeenCalledWith(sampleConfig, graphOptions)
  })

  it('uses forced configPath when provided', async () => {
    await openSpecdHost({ configPath: '/forced/specd.yaml' })
    expect(createDefaultConfigLoader).toHaveBeenCalledWith({ configPath: '/forced/specd.yaml' })
  })

  it('uses discovery mode from an explicit startDir when provided', async () => {
    await openSpecdHost({ startDir: '/selected/project/subdir' })
    expect(createDefaultConfigLoader).toHaveBeenCalledWith({
      startDir: '/selected/project/subdir',
    })
  })

  it('rejects mixed configPath and startDir inputs before loader creation', async () => {
    await expect(
      openSpecdHost({
        configPath: '/forced/specd.yaml',
        startDir: '/selected/project',
      }),
    ).rejects.toThrow('openSpecdHost accepts either configPath or startDir, but never both')
    expect(createDefaultConfigLoader).not.toHaveBeenCalled()
  })

  it('uses a synthetic graph host only when discovery fallback is enabled', async () => {
    const syntheticConfig = { ...sampleConfig, projectRoot: '/tmp/repository' } as SpecdConfig
    load.mockRejectedValue(new ConfigNotFoundError('missing config'))
    createVcsAdapter.mockResolvedValue({ rootDir: vi.fn().mockReturnValue('/tmp/repository') })
    createBootstrapGraphConfig.mockReturnValue(syntheticConfig)

    const result = await openSpecdHost({
      startDir: '/tmp/repository/subdir',
      allowBootstrapFallback: true,
      options: { graph: { graphStoreId: 'sqlite' } },
    })

    expect(createVcsAdapter).toHaveBeenCalledWith('/tmp/repository/subdir')
    expect(createBootstrapGraphConfig).toHaveBeenCalledWith({
      projectRoot: '/tmp/repository',
      vcsRoot: '/tmp/repository',
    })
    expect(result.configFilePath).toBeNull()
    result.createGraphProvider()
    expect(createCodeGraphProvider).toHaveBeenCalledWith(syntheticConfig, {
      graphStoreId: 'sqlite',
    })
  })

  it('never falls back to a synthetic host when an explicit configPath cannot be loaded', async () => {
    load.mockRejectedValue(new ConfigNotFoundError('missing config'))

    await expect(
      openSpecdHost({ configPath: '/tmp/project/specd.yaml', allowBootstrapFallback: true }),
    ).rejects.toBeInstanceOf(ConfigNotFoundError)

    expect(createVcsAdapter).not.toHaveBeenCalled()
    expect(createBootstrapGraphConfig).not.toHaveBeenCalled()
  })
})

describe('host disposal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    providerCallCount = 0
    load.mockResolvedValue(sampleConfig)
    resolvePath.mockResolvedValue('/tmp/project/specd.yaml')
  })

  it('exposes kernel, provider factory and disposal members without a top-level config', async () => {
    const ctx = await createSdkContext(sampleConfig)

    expect(Object.keys(ctx).sort()).toEqual(['createGraphProvider', 'dispose', 'kernel'])
    expect(typeof ctx[Symbol.asyncDispose]).toBe('function')
    expect('config' in ctx).toBe(false)
  })

  it('exposes no config mutation methods on the host context', async () => {
    const ctx = (await createSdkContext(sampleConfig)) as unknown as Record<string, unknown>

    expect(ctx['initProject']).toBeUndefined()
    expect(ctx['addPlugin']).toBeUndefined()
    expect(ctx['removePlugin']).toBeUndefined()
  })

  it('delegates dispose to the kernel and aliases Symbol.asyncDispose', async () => {
    const ctx = await createSdkContext(sampleConfig)

    await ctx.dispose()

    expect(kernelDispose).toHaveBeenCalledTimes(1)
    expect(ctx[Symbol.asyncDispose]).toBe(ctx.dispose)
  })

  it('returns the kernel disposal promise on repeated calls', async () => {
    const shared = Promise.resolve()
    kernelDispose.mockReturnValue(shared)
    const ctx = await createSdkContext(sampleConfig)

    expect(ctx.dispose()).toBe(shared)
    expect(ctx.dispose()).toBe(shared)
  })

  it('releases the host when an await using scope exits', async () => {
    {
      await using host = await openSpecdHost()
      expect(host.kernel).toBe(mockKernel)
      expect(kernelDispose).not.toHaveBeenCalled()
    }

    expect(kernelDispose).toHaveBeenCalledTimes(1)
  })

  it('carries the disposal members through the openSpecdHost spread', async () => {
    const host = await openSpecdHost()

    expect(typeof host.dispose).toBe('function')
    expect(typeof host[Symbol.asyncDispose]).toBe('function')
  })

  it('does not close graph providers created by the host', async () => {
    const provider = { close: vi.fn(async () => {}) }
    createCodeGraphProvider.mockReturnValueOnce(provider as never)
    const host = await openSpecdHost()
    host.createGraphProvider()

    await host.dispose()

    expect(provider.close).not.toHaveBeenCalled()
  })

  it('exposes no API that wraps a foreign kernel into a host context', async () => {
    const { readFile } = await import('node:fs/promises')
    const barrel = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8')
    const contextFactories = [
      ...barrel.matchAll(/\b(create\w*Context|open\w*Host|\w*[Ww]rap\w*Kernel\w*)\b/g),
    ]
      .map((match) => match[1])
      .filter((name, index, all) => all.indexOf(name) === index)
      .sort()

    expect(contextFactories).toEqual(['createSdkContext', 'openSpecdHost'])
  })
})
