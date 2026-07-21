import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type SpecdConfig } from '@specd/core'

const mockKernel = { id: 'kernel' }
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
    const graphOptions = { graphStoreId: 'ladybug' }
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
    const graphOptions = { graphStoreId: 'ladybug' }

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
      options: { graph: { graphStoreId: 'ladybug' } },
    })

    expect(createVcsAdapter).toHaveBeenCalledWith('/tmp/repository/subdir')
    expect(createBootstrapGraphConfig).toHaveBeenCalledWith({
      projectRoot: '/tmp/repository',
      vcsRoot: '/tmp/repository',
    })
    expect(result.configFilePath).toBeNull()
    result.createGraphProvider()
    expect(createCodeGraphProvider).toHaveBeenCalledWith(syntheticConfig, {
      graphStoreId: 'ladybug',
    })
  })
})
