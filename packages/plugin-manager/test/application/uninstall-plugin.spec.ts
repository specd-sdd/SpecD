import { describe, expect, it, vi } from 'vitest'
import {
  PluginNotFoundError,
  PluginValidationError,
  UninstallPlugin,
  UnknownContributionError,
} from '../../src/index.js'
import type { PluginLoader, SpecdPluginManifest, UninstallPluginOutput } from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

const mockConfig = makeMockConfig()
const manifest: SpecdPluginManifest = {
  schemaVersion: 2,
  name: '@specd/plugin-agent-claude',
  version: '1.0.0',
  minCoreVersion: '*',
  contributes: { agents: { claude: {} } },
}

/** First argument of the first call of a mock, typed loosely. */
function firstArg(mock: { mock: { calls: unknown } }): unknown {
  return (mock.mock.calls as unknown[][])[0]?.[0]
}

describe('UninstallPlugin', () => {
  it('given the package root, then UninstallPluginOutput is exported and is void', () => {
    const output: UninstallPluginOutput = undefined
    expect(output).toBeUndefined()
  })

  it('given a loadable agent plugin, when execute is called, then uninstalls the selected contributions', async () => {
    const uninstall = vi.fn(async () => {})
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install: async () => ({ installed: [], skipped: [] }),
          uninstall,
        },
        manifest,
      })),
    }

    await new UninstallPlugin(loader).execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
    })

    // toStrictEqual: an absent `options` is not the same as `options: undefined`.
    expect(firstArg(uninstall)).toStrictEqual({ config: mockConfig, contributions: ['claude'] })
  })

  it('forwards caller options to the uninstall hook', async () => {
    const uninstall = vi.fn(async () => {})
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install: async () => ({ installed: [], skipped: [] }),
          uninstall,
        },
        manifest,
      })),
    }

    await new UninstallPlugin(loader).execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
      options: { force: true },
    })

    expect(uninstall).toHaveBeenCalledWith({
      config: mockConfig,
      contributions: ['claude'],
      options: { force: true },
    })
  })

  it('given a plain uninstall failure, when execute is called, then it is wrapped with cause', async () => {
    const cause = new Error('busy')
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install: async () => ({ installed: [], skipped: [] }),
          uninstall: async () => {
            throw cause
          },
        },
        manifest,
      })),
    }
    await expect(
      new UninstallPlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toMatchObject({ cause, fields: ['uninstall'] })
  })

  it('given a SpecdError from uninstall, when execute is called, then it is rethrown', async () => {
    const specd = new UnknownContributionError('@specd/plugin-agent-claude', 'claude')
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install: async () => ({ installed: [], skipped: [] }),
          uninstall: async () => {
            throw specd
          },
        },
        manifest,
      })),
    }
    await expect(
      new UninstallPlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toBe(specd)
  })

  it('given an unknown contribution, when execute is called, then throws', async () => {
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          uninstall: async () => {},
        },
        manifest,
      })),
    }
    await expect(
      new UninstallPlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
        contributions: ['missing'],
      }),
    ).rejects.toBeInstanceOf(UnknownContributionError)
  })

  it('given agents without the agent contract, when execute is called, then throws', async () => {
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
        },
        manifest,
      })),
    }
    await expect(
      new UninstallPlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toMatchObject({ fields: ['install', 'uninstall'] })
  })

  it('given no uninstall hook, when execute is called, then it resolves without calling init', async () => {
    const init = vi.fn(async () => {})
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@acme/checks',
          version: '1.0.0',
          init,
          destroy: async () => {},
        },
        manifest: { ...manifest, name: '@acme/checks', contributes: { checks: { lint: {} } } },
      })),
    }
    await expect(
      new UninstallPlugin(loader).execute({
        pluginName: '@acme/checks',
        config: mockConfig,
      }),
    ).resolves.toBeUndefined()
    expect(init).not.toHaveBeenCalled()
  })

  it('given a missing package, when execute is called, then PluginNotFoundError propagates', async () => {
    const error = new PluginNotFoundError('@acme/missing')
    const loader: PluginLoader = {
      load: vi.fn(async () => {
        throw error
      }),
    }
    await expect(
      new UninstallPlugin(loader).execute({
        pluginName: '@acme/missing',
        config: mockConfig,
      }),
    ).rejects.toBe(error)
  })

  it.each([
    ['no selection', undefined, ['a', 'b']],
    ['an allowlist', ['b'], ['b']],
  ])(
    'given a non-agent plugin with an uninstall hook and %s, when execute is called, then the hook receives %j',
    async (_label, selection, expected) => {
      const uninstall = vi.fn(async () => {})
      const loader: PluginLoader = {
        load: vi.fn(async () => ({
          plugin: {
            name: '@acme/checks',
            version: '1.0.0',
            init: async () => {},
            destroy: async () => {},
            uninstall,
          },
          manifest: {
            ...manifest,
            name: '@acme/checks',
            contributes: { checks: { a: {}, b: {} } },
          },
        })),
      }
      await new UninstallPlugin(loader).execute({
        pluginName: '@acme/checks',
        config: mockConfig,
        ...(selection !== undefined ? { contributions: selection } : {}),
      })
      expect(uninstall).toHaveBeenCalledWith({ config: mockConfig, contributions: expected })
    },
  )
})
