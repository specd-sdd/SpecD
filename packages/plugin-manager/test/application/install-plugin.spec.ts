import { describe, expect, it, vi } from 'vitest'
import { InstallPlugin } from '../../src/index.js'
import type { PluginLoader, SpecdPlugin, SpecdPluginManifest } from '../../src/index.js'
import {
  PluginNotFoundError,
  PluginValidationError,
  UnknownContributionError,
} from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

const mockConfig = makeMockConfig()

function manifest(overrides: Partial<SpecdPluginManifest> = {}): SpecdPluginManifest {
  return {
    schemaVersion: 2,
    name: '@specd/plugin-agent-claude',
    version: '1.0.0',
    minCoreVersion: '*',
    contributes: { agents: { claude: {} } },
    ...overrides,
  }
}

function plugin(overrides: Partial<SpecdPlugin> = {}): SpecdPlugin {
  return {
    name: '@specd/plugin-agent-claude',
    version: '1.0.0',
    init: async () => {},
    destroy: async () => {},
    ...overrides,
  }
}

/** First argument of the first call of a mock, typed loosely. */
function firstArg(mock: { mock: { calls: unknown } }): unknown {
  return (mock.mock.calls as unknown[][])[0]?.[0]
}

describe('InstallPlugin', () => {
  it('given a loadable agent plugin, when execute is called, then installs the selected contributions', async () => {
    const install = vi.fn(async () => ({
      installed: [{ skill: 'specd', path: '/tmp/specd.md' }],
      skipped: [],
    }))
    const init = vi.fn(async () => {})
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({ init, install, uninstall: async () => {} }),
        manifest: manifest(),
      })),
    }

    const result = await new InstallPlugin(loader).execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
    })

    expect(result.success).toBe(true)
    expect(result.contributions).toEqual(['claude'])
    expect(init).not.toHaveBeenCalled()
    // toStrictEqual: an absent `options` is not the same as `options: undefined`.
    expect(firstArg(install)).toStrictEqual({ config: mockConfig, contributions: ['claude'] })
  })

  it('forwards caller options to the install hook', async () => {
    const install = vi.fn(async () => ({
      installed: [{ skill: 'specd', path: '/tmp/specd.md' }],
      skipped: [],
    }))
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({ install, uninstall: async () => {} }),
        manifest: manifest(),
      })),
    }

    await new InstallPlugin(loader).execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
      options: { dryRun: true },
    })

    expect(install).toHaveBeenCalledWith({
      config: mockConfig,
      contributions: ['claude'],
      options: { dryRun: true },
    })
  })

  it('given an agents contribution without install hooks, when execute is called, then throws', async () => {
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({ name: '@acme/plain' }),
        manifest: manifest({ name: '@acme/plain', contributes: { agents: { plain: {} } } }),
      })),
    }

    await expect(
      new InstallPlugin(loader).execute({ pluginName: '@acme/plain', config: mockConfig }),
    ).rejects.toThrow(PluginValidationError)
  })

  it('given a plugin without hooks, when execute is called, then succeeds without calling init', async () => {
    const init = vi.fn(async () => {})
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({ name: '@acme/plain', init }),
        manifest: manifest({ name: '@acme/plain', contributes: {} }),
      })),
    }

    const result = await new InstallPlugin(loader).execute({
      pluginName: '@acme/plain',
      config: mockConfig,
    })

    expect(result.success).toBe(true)
    expect(result.contributions).toEqual([])
    expect(init).not.toHaveBeenCalled()
  })

  it('given a default config, when execute is called, then returns it without writing config', async () => {
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({ install: async () => {}, uninstall: async () => {} }),
        manifest: manifest({ defaultConfig: { mode: 'fast' } }),
      })),
    }
    const result = await new InstallPlugin(loader).execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
    })
    expect(result.defaultConfig).toEqual({ mode: 'fast' })
  })

  it('given an unknown contribution, when execute is called, then throws', async () => {
    const loader: PluginLoader = {
      load: vi.fn(async () => ({ plugin: plugin(), manifest: manifest() })),
    }
    await expect(
      new InstallPlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
        contributions: ['missing'],
      }),
    ).rejects.toBeInstanceOf(UnknownContributionError)
  })

  it('given agents and another kind, when execute is called, then the context lists only agent ids', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({ install, uninstall: async () => {} }),
        manifest: manifest({
          contributes: { agents: { claude: {} }, checks: { audit: {} } },
        }),
      })),
    }
    const result = await new InstallPlugin(loader).execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
    })
    expect(result.contributions).toEqual(['claude'])
    expect(install).toHaveBeenCalledWith({ config: mockConfig, contributions: ['claude'] })
  })

  it('given a hook that throws a plain error, when execute is called, then it is wrapped with cause', async () => {
    const cause = new Error('disk full')
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({
          install: async () => {
            throw cause
          },
          uninstall: async () => {},
        }),
        manifest: manifest(),
      })),
    }
    await expect(
      new InstallPlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toMatchObject({
      pluginName: '@specd/plugin-agent-claude',
      cause,
      fields: ['install'],
      message: expect.stringContaining('disk full') as unknown,
    })
  })

  it('given a hook that throws SpecdError, when execute is called, then that error is rethrown', async () => {
    const specd = new UnknownContributionError('@specd/plugin-agent-claude', 'missing')
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({
          install: async () => {
            throw specd
          },
          uninstall: async () => {},
        }),
        manifest: manifest(),
      })),
    }
    await expect(
      new InstallPlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toBe(specd)
  })

  it('given a missing package, when execute is called, then PluginNotFoundError propagates', async () => {
    const error = new PluginNotFoundError('@acme/missing')
    const loader: PluginLoader = {
      load: vi.fn(async () => {
        throw error
      }),
    }
    await expect(
      new InstallPlugin(loader).execute({
        pluginName: '@acme/missing',
        config: mockConfig,
      }),
    ).rejects.toBe(error)
  })

  const checksManifest = (): SpecdPluginManifest =>
    manifest({
      name: '@acme/checks',
      contributes: { checks: { a: {}, b: {} } },
    })

  it('given a non-agent plugin with install, when execute is called without a selection, then it receives every declared id', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({ name: '@acme/checks', install }),
        manifest: checksManifest(),
      })),
    }
    const result = await new InstallPlugin(loader).execute({
      pluginName: '@acme/checks',
      config: mockConfig,
    })
    expect(install).toHaveBeenCalledWith({ config: mockConfig, contributions: ['a', 'b'] })
    expect(result.contributions).toEqual(['a', 'b'])
  })

  it('given a non-agent plugin with install, when execute is called with an allowlist, then it receives only the allowlisted ids', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: plugin({ name: '@acme/checks', install }),
        manifest: checksManifest(),
      })),
    }
    const result = await new InstallPlugin(loader).execute({
      pluginName: '@acme/checks',
      config: mockConfig,
      contributions: ['b'],
    })
    expect(install).toHaveBeenCalledWith({ config: mockConfig, contributions: ['b'] })
    expect(result.contributions).toEqual(['b'])
  })
})
