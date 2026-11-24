import { describe, expect, it } from 'vitest'
import type { KernelBuilder } from '@specd/core/extensions'
import {
  InstallPlugin,
  PluginDestroyError,
  PluginInitError,
  PluginValidationError,
  UninstallPlugin,
  UnsupportedSchemaKeywordError,
  UpdatePlugin,
  assertSupportedConfigSchema,
  registerPlugins,
  resolvePluginConfig,
} from '../../src/index.js'
import type {
  PluginConfigSchema,
  PluginLoader,
  SpecdPlugin,
  SpecdPluginManifest,
} from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

const baseManifest: SpecdPluginManifest = {
  schemaVersion: 2,
  name: '@acme/big',
  version: '1.0.0',
  minCoreVersion: '*',
  contributes: {},
}

function makePlugin(name: string, overrides: Partial<SpecdPlugin> = {}): SpecdPlugin {
  return {
    name,
    version: '1.0.0',
    init: async () => {},
    destroy: async () => {},
    install: async () => {},
    uninstall: async () => {},
    ...overrides,
  }
}

function loaderOf(manifest: SpecdPluginManifest): PluginLoader {
  return { load: async () => ({ plugin: makePlugin('@acme/big'), manifest }) }
}

/** Manifest whose `contributes` getter throws from the second read on. */
function throwingOnSecondRead(): SpecdPluginManifest {
  let reads = 0
  const boom = new Error('second read')
  const hostile = { ...baseManifest }
  Object.defineProperty(hostile, 'contributes', {
    enumerable: true,
    get() {
      reads += 1
      if (reads >= 2) throw boom
      return { skills: { a: {} } }
    },
  })
  return hostile
}

describe('plugin-manager hardening (task 19.1)', () => {
  it.each([
    [
      'InstallPlugin',
      (l: PluginLoader) =>
        new InstallPlugin(l).execute({ pluginName: '@acme/big', config: makeMockConfig() }),
    ],
    [
      'UpdatePlugin',
      (l: PluginLoader) =>
        new UpdatePlugin(l).execute({ pluginName: '@acme/big', config: makeMockConfig() }),
    ],
    [
      'UninstallPlugin',
      (l: PluginLoader) =>
        new UninstallPlugin(l).execute({ pluginName: '@acme/big', config: makeMockConfig() }),
    ],
  ])(
    'given 130,000 contribution ids, when %s runs, then it succeeds without a RangeError',
    async (_n, run) => {
      const blocks: Record<string, unknown> = {}
      for (let i = 0; i < 130_000; i += 1) blocks[`id-${i}`] = {}
      const manifest = { ...baseManifest, contributes: { skills: blocks } }
      const result = (await run(loaderOf(manifest))) as { success: boolean } | undefined
      if (result !== undefined) expect(result.success).toBe(true)
    },
  )

  it('given a throwing defaultConfig getter, when installing, then PluginValidationError on load with cause', async () => {
    const boom = new Error('default boom')
    const hostile = { ...baseManifest }
    Object.defineProperty(hostile, 'defaultConfig', {
      enumerable: true,
      get() {
        throw boom
      },
    })
    const failure = await new InstallPlugin(loaderOf(hostile))
      .execute({ pluginName: '@acme/big', config: makeMockConfig() })
      .catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ fields: ['load'] })
    expect((failure as Error).cause).toBe(boom)
  })

  it.each([
    [
      'InstallPlugin',
      (l: PluginLoader) =>
        new InstallPlugin(l).execute({ pluginName: '@acme/big', config: makeMockConfig() }),
    ],
    [
      'UpdatePlugin',
      (l: PluginLoader) =>
        new UpdatePlugin(l).execute({ pluginName: '@acme/big', config: makeMockConfig() }),
    ],
    [
      'UninstallPlugin',
      (l: PluginLoader) =>
        new UninstallPlugin(l).execute({ pluginName: '@acme/big', config: makeMockConfig() }),
    ],
  ])(
    'given a contributes getter throwing on 2nd read, when %s runs, then PluginValidationError with cause',
    async (_n, run) => {
      const failure = await run(loaderOf(throwingOnSecondRead())).catch((e: unknown) => e)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect((failure as Error).cause).toBeInstanceOf(Error)
      expect(((failure as Error).cause as Error).message).toBe('second read')
    },
  )

  it('given __proto__ in configSchema properties, then UnsupportedSchemaKeywordError on properties', () => {
    const schema = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string"}}}',
    ) as PluginConfigSchema
    for (const run of [
      () => assertSupportedConfigSchema('@acme/x', schema),
      () => resolvePluginConfig('@acme/x', schema, {}),
    ]) {
      let failure: unknown
      try {
        run()
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(UnsupportedSchemaKeywordError)
      expect(failure).toMatchObject({ keyword: 'properties' })
      expect((failure as Error).message).toContain('__proto__')
    }
  })

  it('given registerDisposer throws, then PluginInitError names the configured plugins', async () => {
    const kernel = {
      registerDisposer() {
        throw new Error('dup')
      },
    } as unknown as KernelBuilder
    const config = { ...makeMockConfig(), plugins: [{ name: '@acme/a' }, { name: '@acme/b' }] }
    const destroyed: string[] = []
    const loader: PluginLoader = {
      load: async (name: string) => ({
        plugin: makePlugin(name, { destroy: async () => void destroyed.push(name) }),
        manifest: { ...baseManifest, name },
      }),
    }
    const failure = await registerPlugins(kernel, config, { loader }).catch((e: unknown) => e)
    expect([...destroyed].sort()).toEqual(['@acme/a', '@acme/b'])
    expect(failure).toBeInstanceOf(PluginInitError)
    expect(failure).toMatchObject({ pluginName: '@acme/a, @acme/b' })
  })

  it('given concurrent dispose calls, then both see the same PluginDestroyError', async () => {
    const kernel = { registerDisposer() {} } as unknown as KernelBuilder
    const config = { ...makeMockConfig(), plugins: [{ name: '@acme/a' }] }
    const loader: PluginLoader = {
      load: async (name: string) => ({
        plugin: makePlugin(name, {
          destroy: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            throw new Error('destroy failed')
          },
        }),
        manifest: { ...baseManifest, name },
      }),
    }
    const { dispose } = await registerPlugins(kernel, config, { loader })
    const [first, second] = await Promise.allSettled([dispose(), dispose()])
    expect(first.status).toBe('rejected')
    expect(second.status).toBe('rejected')
    const a = (first as PromiseRejectedResult).reason
    expect(a).toBeInstanceOf(PluginDestroyError)
    expect((second as PromiseRejectedResult).reason).toBe(a)
  })
})
