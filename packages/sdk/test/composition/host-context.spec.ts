import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type SpecdConfig } from '@specd/core'

const mockKernel = { id: 'kernel' }
const mockProviderA = { id: 'provider-a' }
const mockProviderB = { id: 'provider-b' }
let providerCallCount = 0

const createKernel = vi.fn(async () => mockKernel)
const createConfigLoader = vi.fn(() => ({ load, resolvePath }))
const createCodeGraphProvider = vi.fn(() => {
  providerCallCount += 1
  return providerCallCount === 1 ? mockProviderA : mockProviderB
})
const load = vi.fn()
const resolvePath = vi.fn()

vi.mock('@specd/core', () => ({
  createKernel,
  createConfigLoader,
}))

vi.mock('@specd/code-graph', () => ({
  createCodeGraphProvider,
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
    expect(createCodeGraphProvider).toHaveBeenCalledWith(sampleConfig)
    expect(ctx.kernel).toBe(mockKernel)
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
    expect(load).toHaveBeenCalled()
    expect(result.config).toBe(sampleConfig)
    expect(result.configFilePath).toBe('/tmp/project/specd.yaml')
    expect(result.kernel).toBe(mockKernel)
  })

  it('forwards kernelOptions to createKernel', async () => {
    const kernelOptions = { additionalDestinations: [] }
    await openSpecdHost({ kernelOptions })
    expect(createKernel).toHaveBeenCalledWith(sampleConfig, kernelOptions)
  })

  it('uses forced configPath when provided', async () => {
    await openSpecdHost({ configPath: '/forced/specd.yaml' })
    expect(createConfigLoader).toHaveBeenCalledWith({ configPath: '/forced/specd.yaml' })
  })
})
