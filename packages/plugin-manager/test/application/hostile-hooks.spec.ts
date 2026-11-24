import { describe, expect, it, vi } from 'vitest'
import { Logger } from '@specd/core'
import {
  InstallPlugin,
  ListPlugins,
  PluginInitError,
  PluginNotFoundError,
  PluginValidationError,
  UninstallPlugin,
  UpdatePlugin,
  registerPlugins,
} from '../../src/index.js'
import type { PluginLoader, SpecdPluginManifest } from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

const config = makeMockConfig()
const name = '@acme/x'

const agentsManifest: SpecdPluginManifest = {
  schemaVersion: 2,
  name,
  version: '1.0.0',
  minCoreVersion: '*',
  contributes: { agents: { claude: {} } },
}

function hostileProxy(): object {
  return new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error('trap')
      },
    },
  )
}

function basePlugin(extra: object): never {
  return {
    name,
    version: '1.0.0',
    init: async () => {},
    destroy: async () => {},
    ...extra,
  } as never
}

const useCases = [
  [
    'InstallPlugin',
    (l: PluginLoader) => new InstallPlugin(l).execute({ pluginName: name, config }),
    'install',
  ],
  [
    'UpdatePlugin',
    (l: PluginLoader) => new UpdatePlugin(l).execute({ pluginName: name, config }),
    'install',
  ],
  [
    'UninstallPlugin',
    (l: PluginLoader) => new UninstallPlugin(l).execute({ pluginName: name, config }),
    'uninstall',
  ],
] as const

describe.each(useCases)('%s with hostile plugins', (_n, run, hook) => {
  it('given a hook throwing a Proxy whose getPrototypeOf throws, then it is wrapped with the original cause', async () => {
    const hostile = hostileProxy()
    const loader: PluginLoader = {
      load: async () => ({
        plugin: basePlugin({
          install: async () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw hostile
          },
          uninstall: async () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw hostile
          },
        }),
        manifest: { ...agentsManifest, contributes: { widgets: { a: {} } } },
      }),
    }
    const failure: unknown = await run(loader).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginValidationError)
    expect(failure).toMatchObject({ pluginName: name, fields: [hook] })
    expect((failure as PluginValidationError).cause).toBe(hostile)
  })

  it.each(['install', 'uninstall'])(
    'given an agents manifest and a throwing %s accessor, then it is wrapped, not raw',
    async (accessor) => {
      // `install` must be a function so that `uninstall` is read at all.
      const plugin = basePlugin(accessor === 'uninstall' ? { install: async () => ({}) } : {})
      const boom = new Error('accessor boom')
      Object.defineProperty(plugin, accessor, {
        get() {
          throw boom
        },
        enumerable: true,
      })
      const loader: PluginLoader = { load: async () => ({ plugin, manifest: agentsManifest }) }
      const failure: unknown = await run(loader).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginValidationError)
      expect(failure).toMatchObject({ pluginName: name, fields: ['install', 'uninstall'] })
      expect((failure as PluginValidationError).cause).toBe(boom)
    },
  )
})

describe('ListPlugins with hostile loaders', () => {
  it('given a loader rejecting a hostile Proxy, then the entry is an error and listing continues', async () => {
    const loader: PluginLoader = {
      load: async (pluginName) => {
        if (pluginName === '@acme/bad') {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw hostileProxy()
        }
        throw new PluginNotFoundError(pluginName)
      },
    }
    const result = await new ListPlugins(loader).execute({
      pluginNames: ['@acme/bad', '@acme/none'],
    })
    expect(result.plugins.map((entry) => entry.status)).toEqual(['error', 'not_found'])
  })

  it.each([
    ['without a plugin', { manifest: agentsManifest }],
    ['with a function as plugin', { plugin: () => {}, manifest: agentsManifest }],
    ['with no contributes', { plugin: {}, manifest: {} }],
  ])(
    'given a loader result %s, then the status is error and never loaded',
    async (_label, value) => {
      const loader: PluginLoader = { load: async () => value as never }
      const result = await new ListPlugins(loader).execute({ pluginNames: [name] })
      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0]?.status).toBe('error')
      expect(result.plugins[0]?.plugin).toBeUndefined()
      expect(result.plugins[0]?.error).toContain('load')
    },
  )
})

describe('registerPlugins with a hostile thrown value', () => {
  it('given init throwing a Proxy whose getPrototypeOf throws, then PluginInitError.cause is the original value', async () => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => {})
    const hostile = hostileProxy()
    const loader: PluginLoader = {
      load: async () => ({
        plugin: basePlugin({
          init: async () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw hostile
          },
        }),
        manifest: { ...agentsManifest, contributes: {} },
      }),
    }
    const builder = { registerDisposer: vi.fn() }
    const failure: unknown = await registerPlugins(
      builder as never,
      { ...config, plugins: [{ name }] },
      { loader },
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginInitError)
    expect((failure as PluginInitError).cause).toBe(hostile)
    expect(builder.registerDisposer).not.toHaveBeenCalled()
  })
})
