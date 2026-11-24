import { describe, expect, it, vi } from 'vitest'
import { LoadPlugin, PluginNotFoundError } from '../../src/index.js'
import type { PluginLoader } from '../../src/index.js'

describe('LoadPlugin', () => {
  it('given a loader, when execute is called, then returns the plugin and manifest', async () => {
    const loaded = {
      plugin: {
        name: '@acme/checks',
        version: '1.0.0',
        init: async () => {},
        destroy: async () => {},
      },
      manifest: {
        schemaVersion: 2 as const,
        name: '@acme/checks',
        version: '1.0.0',
        minCoreVersion: '*',
        contributes: {},
      },
    }
    const load = vi.fn(async () => loaded)
    const result = await new LoadPlugin({ load } as PluginLoader).execute({
      pluginName: '@acme/checks',
    })
    expect(result).toBe(loaded)
    expect(load).toHaveBeenCalledWith('@acme/checks')
    const init = vi.fn()
    const destroy = vi.fn()
    loaded.plugin.init = init
    loaded.plugin.destroy = destroy
    await new LoadPlugin({ load } as PluginLoader).execute({ pluginName: '@acme/checks' })
    expect(init).not.toHaveBeenCalled()
    expect(destroy).not.toHaveBeenCalled()
  })

  it('given a plugin with every lifecycle hook, when execute is called, then none is called', async () => {
    const calls: string[] = []
    const loaded = {
      plugin: {
        name: '@acme/checks',
        version: '1.0.0',
        init: async () => void calls.push('init'),
        destroy: async () => void calls.push('destroy'),
        install: async () => {
          calls.push('install')
          return { installed: [], skipped: [] }
        },
        uninstall: async () => void calls.push('uninstall'),
      },
      manifest: {
        schemaVersion: 2 as const,
        name: '@acme/checks',
        version: '1.0.0',
        minCoreVersion: '*',
        contributes: { agents: { checks: {} } },
      },
    }
    await new LoadPlugin({ load: async () => loaded } as PluginLoader).execute({
      pluginName: '@acme/checks',
    })
    expect(calls).toEqual([])
  })

  it('given a missing plugin, when execute is called, then PluginNotFoundError propagates', async () => {
    const error = new PluginNotFoundError('@acme/missing')
    const loader: PluginLoader = {
      load: vi.fn(async () => {
        throw error
      }),
    }
    await expect(new LoadPlugin(loader).execute({ pluginName: '@acme/missing' })).rejects.toBe(
      error,
    )
  })
})
