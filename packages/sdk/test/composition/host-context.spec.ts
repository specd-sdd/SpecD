import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { type KernelOptions, type SpecdConfig } from '@specd/core'
import type { OpenSpecdHostInput, SdkContextOptions } from '../../src/composition/host-context.js'

const kernelDispose = vi.fn(async () => {})
const mockKernel = { id: 'kernel', dispose: kernelDispose }
const mockProviderA = { id: 'provider-a' }
const mockProviderB = { id: 'provider-b' }
let providerCallCount = 0

const build = vi.fn(async () => mockKernel)
const registerDisposer = vi.fn()
const createKernelBuilder = vi.fn(() => ({ build, registerDisposer }))
const registerPlugins = vi.fn(async () => ({ dispose: vi.fn(async () => {}) }))
const createDefaultConfigLoader = vi.fn(async () => ({ load, resolvePath }))
const createVcsAdapter = vi.fn()
const createBootstrapGraphConfig = vi.fn()
class ConfigNotFoundError extends Error {}
const loggerWarn = vi.fn()
const Logger = { warn: loggerWarn }
const createCodeGraphProvider = vi.fn(() => {
  providerCallCount += 1
  return providerCallCount === 1 ? mockProviderA : mockProviderB
})
const load = vi.fn()
const resolvePath = vi.fn()

vi.mock('@specd/core', () => ({
  createDefaultConfigLoader,
  createVcsAdapter,
  ConfigNotFoundError,
  Logger,
}))

vi.mock('@specd/core/extensions', () => ({
  createKernelBuilder,
}))

vi.mock('@specd/plugin-manager', () => ({
  registerPlugins,
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
    expect(createKernelBuilder).toHaveBeenCalledWith(sampleConfig, undefined)
    expect(registerPlugins).toHaveBeenCalled()
    expect(build).toHaveBeenCalled()
    ctx.createGraphProvider()
    expect(createCodeGraphProvider).toHaveBeenCalledWith(sampleConfig, undefined)
    expect(ctx.kernel).toBe(mockKernel)
    const registerOrder = registerPlugins.mock.invocationCallOrder[0]
    const buildOrder = build.mock.invocationCallOrder[0]
    expect(registerOrder).toBeLessThan(buildOrder ?? 0)
  })

  it('skips plugin registration when plugins is false', async () => {
    await createSdkContext(sampleConfig, { plugins: false })
    expect(registerPlugins).not.toHaveBeenCalled()
    expect(build).toHaveBeenCalled()
  })

  it('rejects with the plugin init error and never builds a kernel', async () => {
    const initError = new Error('plugin init failed')
    registerPlugins.mockRejectedValueOnce(initError)
    await expect(createSdkContext(sampleConfig)).rejects.toBe(initError)
    expect(build).not.toHaveBeenCalled()
  })

  it('forwards plugin handlers and disposes them when build fails', async () => {
    const dispose = vi.fn(async () => {})
    registerPlugins.mockResolvedValueOnce({ dispose })
    build.mockRejectedValueOnce(new Error('build failed'))
    const handler = { kind: 'checks', blockSchema: { safeParse: () => ({ success: true }) } }
    await expect(
      createSdkContext(sampleConfig, { pluginHandlers: [handler as never] }),
    ).rejects.toThrow('build failed')
    expect(registerPlugins).toHaveBeenCalledWith(
      expect.anything(),
      sampleConfig,
      expect.objectContaining({ handlers: [handler] }),
    )
    expect(dispose).toHaveBeenCalled()
  })

  it('keeps the build error when plugin disposal fails', async () => {
    const disposeError = new Error('destroy failed')
    registerPlugins.mockResolvedValueOnce({
      dispose: vi.fn(async () => {
        throw disposeError
      }),
    })
    const buildError = new Error('build failed')
    build.mockRejectedValueOnce(buildError)
    await expect(createSdkContext(sampleConfig)).rejects.toBe(buildError)
    expect(buildError).toMatchObject({ rollbackErrors: [disposeError] })
  })

  it.each([
    ['string', 'boom'],
    ['null', null],
    ['number', 42],
  ])(
    'rethrows a primitive build error unchanged and logs the rollback errors (%s)',
    async (_label, primitive) => {
      const disposeError = new Error('destroy failed')
      registerPlugins.mockResolvedValueOnce({
        dispose: vi.fn(async () => {
          throw disposeError
        }),
      })
      build.mockRejectedValueOnce(primitive)
      loggerWarn.mockClear()
      const thrown: unknown = await createSdkContext(sampleConfig).catch((e: unknown) => e)
      expect(thrown).toBe(primitive)
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('plugin disposal failed'),
        expect.objectContaining({ rollbackErrors: ['destroy failed'] }),
      )
    },
  )

  it('forwards graph composition options into createGraphProvider', async () => {
    const graphOptions = { graphStoreId: 'sqlite' }
    const ctx = await createSdkContext(sampleConfig, { graph: graphOptions })

    ctx.createGraphProvider()

    expect(createKernelBuilder).toHaveBeenCalledWith(sampleConfig, undefined)
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
    expect(createKernelBuilder).toHaveBeenCalledWith(sampleConfig, kernelOptions)
    expect(createCodeGraphProvider).toHaveBeenCalledWith(sampleConfig, graphOptions)
  })

  it('forwards plugins: false through openSpecdHost', async () => {
    await openSpecdHost({ options: { plugins: false } })
    expect(registerPlugins).not.toHaveBeenCalled()
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

  it.each([
    ['omitted', {}],
    ['false', { allowBootstrapFallback: false }],
  ] as const)(
    'keeps config discovery failing when allowBootstrapFallback is %s',
    async (_label, flag) => {
      const missing = new ConfigNotFoundError('missing config')
      load.mockRejectedValue(missing)

      await expect(openSpecdHost({ startDir: '/tmp/repository', ...flag })).rejects.toBe(missing)

      expect(createVcsAdapter).not.toHaveBeenCalled()
      expect(createBootstrapGraphConfig).not.toHaveBeenCalled()
    },
  )

  it('keeps config discovery failing when no input is given at all', async () => {
    const missing = new ConfigNotFoundError('missing config')
    load.mockRejectedValue(missing)

    await expect(openSpecdHost()).rejects.toBe(missing)

    expect(createVcsAdapter).not.toHaveBeenCalled()
  })

  it('rethrows non-ConfigNotFoundError failures even when the fallback is enabled', async () => {
    const broken = new Error('config is corrupt')
    load.mockRejectedValue(broken)

    await expect(
      openSpecdHost({ startDir: '/tmp/repository', allowBootstrapFallback: true }),
    ).rejects.toBe(broken)

    expect(createVcsAdapter).not.toHaveBeenCalled()
    expect(createBootstrapGraphConfig).not.toHaveBeenCalled()
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

  it('has bootstrap signatures that cannot accept a kernel instance', () => {
    // Semantic (type-level, enforced by tsc): the only inputs are a config or loader
    // parameters, and the `kernel` option is KernelOptions, never a built Kernel.
    expectTypeOf<Parameters<typeof createSdkContext>[0]>().toEqualTypeOf<SpecdConfig>()
    expectTypeOf<keyof SdkContextOptions>().toEqualTypeOf<
      'kernel' | 'graph' | 'plugins' | 'pluginHandlers'
    >()
    expectTypeOf<SdkContextOptions['kernel']>().toEqualTypeOf<KernelOptions | undefined>()
    expectTypeOf<keyof OpenSpecdHostInput>().toEqualTypeOf<
      'configPath' | 'startDir' | 'allowBootstrapFallback' | 'options'
    >()
    // Runtime: a kernel-shaped object passed as config is not adopted as the host kernel.
    expect(createSdkContext.length).toBeLessThanOrEqual(2)
  })

  it('unpacks AggregateError failures into rollbackErrors', async () => {
    const first = new Error('destroy a')
    const second = new Error('destroy b')
    registerPlugins.mockResolvedValueOnce({
      dispose: vi.fn(async () => {
        throw new AggregateError([first, second], 'many')
      }),
    })
    const buildError = new Error('build failed')
    build.mockRejectedValueOnce(buildError)
    await expect(createSdkContext(sampleConfig)).rejects.toBe(buildError)
    expect(buildError).toMatchObject({ rollbackErrors: [first, second] })
  })

  it.each([
    ['frozen', () => Object.freeze(new Error('build failed'))],
    ['non-extensible', () => Object.preventExtensions(new Error('build failed'))],
  ])(
    'rethrows a %s build error unchanged and logs the rollback errors at warn',
    async (_label, make) => {
      const disposeError = new Error('destroy failed')
      registerPlugins.mockResolvedValueOnce({
        dispose: vi.fn(async () => {
          throw disposeError
        }),
      })
      const buildError = make()
      build.mockRejectedValueOnce(buildError)
      loggerWarn.mockClear()
      const thrown: unknown = await createSdkContext(sampleConfig).catch((e: unknown) => e)
      expect(thrown).toBe(buildError)
      expect(thrown).not.toBeInstanceOf(TypeError)
      expect(Object.prototype.hasOwnProperty.call(buildError, 'rollbackErrors')).toBe(false)
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('plugin disposal failed'),
        expect.objectContaining({ rollbackErrors: ['destroy failed'] }),
      )
    },
  )

  it('unpacks the individual destroy failures of a plugin disposal error into rollbackErrors', async () => {
    const first = new Error('destroy a')
    const second = new Error('destroy b')
    const destroyError = Object.assign(new Error('2 plugin(s) failed during destroy'), {
      code: 'PLUGIN_DESTROY_FAILED',
      errors: [first, second],
    })
    registerPlugins.mockResolvedValueOnce({
      dispose: vi.fn(async () => {
        throw destroyError
      }),
    })
    const buildError = new Error('build failed')
    build.mockRejectedValueOnce(buildError)
    await expect(createSdkContext(sampleConfig)).rejects.toBe(buildError)
    expect(buildError).toMatchObject({ rollbackErrors: [first, second] })
  })
})
