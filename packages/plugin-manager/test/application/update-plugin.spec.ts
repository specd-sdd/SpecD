import { describe, expect, it, vi } from 'vitest'
import { PluginNotFoundError, PluginValidationError, UpdatePlugin } from '../../src/index.js'
import type { PluginLoader, SpecdPluginManifest } from '../../src/index.js'
import { UnknownContributionError } from '../../src/index.js'
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

describe('UpdatePlugin', () => {
  it('given a selected contribution, when execute is called, then reinstalls without writing config', async () => {
    const install = vi.fn(async () => ({
      installed: [{ skill: 'specd', path: '/tmp/specd.md' }],
      skipped: [],
    }))
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install,
          uninstall: async () => {},
        },
        manifest,
      })),
    }

    const result = await new UpdatePlugin(loader).execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
      contributions: ['claude'],
    })

    expect(result.success).toBe(true)
    expect(result.contributions).toEqual(['claude'])
    expect(result).not.toHaveProperty('defaultConfig')
    // toStrictEqual: an absent `options` is not the same as `options: undefined`.
    expect(firstArg(install)).toStrictEqual({ config: mockConfig, contributions: ['claude'] })
  })

  it('forwards caller options to the install hook during update', async () => {
    const install = vi.fn(async () => ({
      installed: [{ skill: 'specd', path: '/tmp/specd.md' }],
      skipped: [],
    }))
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install,
          uninstall: async () => {},
        },
        manifest,
      })),
    }

    await new UpdatePlugin(loader).execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
      contributions: ['claude'],
      options: { refresh: true },
    })

    expect(install).toHaveBeenCalledWith({
      config: mockConfig,
      contributions: ['claude'],
      options: { refresh: true },
    })
  })

  it('given a contribution the manifest no longer declares, when execute is called, then throws', async () => {
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install: async () => ({ installed: [], skipped: [] }),
          uninstall: async () => {},
        },
        manifest,
      })),
    }

    await expect(
      new UpdatePlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
        contributions: ['missing'],
      }),
    ).rejects.toBeInstanceOf(UnknownContributionError)
  })

  it('given a plain install failure, when execute is called, then it is wrapped with cause', async () => {
    const cause = new Error('disk full')
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install: async () => {
            throw cause
          },
          uninstall: async () => {},
        },
        manifest,
      })),
    }
    await expect(
      new UpdatePlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toBeInstanceOf(PluginValidationError)
    await expect(
      new UpdatePlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toMatchObject({ cause })
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
      new UpdatePlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toBeInstanceOf(PluginValidationError)
  })

  it('given a SpecdError from install, when execute is called, then it is rethrown', async () => {
    const specd = new UnknownContributionError('@specd/plugin-agent-claude', 'claude')
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install: async () => {
            throw specd
          },
          uninstall: async () => {},
        },
        manifest,
      })),
    }
    await expect(
      new UpdatePlugin(loader).execute({
        pluginName: '@specd/plugin-agent-claude',
        config: mockConfig,
      }),
    ).rejects.toBe(specd)
  })

  it('given the same selection twice, when execute is called, then both calls succeed with the same ids', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        plugin: {
          name: '@specd/plugin-agent-claude',
          version: '1.0.0',
          init: async () => {},
          destroy: async () => {},
          install,
          uninstall: async () => {},
        },
        manifest,
      })),
    }
    const useCase = new UpdatePlugin(loader)
    const input = {
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
      contributions: ['claude'] as const,
    }
    const first = await useCase.execute(input)
    const second = await useCase.execute(input)
    expect(first).toEqual(second)
    expect(install).toHaveBeenCalledTimes(2)
  })

  it('given a missing package, when execute is called, then PluginNotFoundError propagates', async () => {
    const error = new PluginNotFoundError('@acme/missing')
    const loader: PluginLoader = {
      load: vi.fn(async () => {
        throw error
      }),
    }
    await expect(
      new UpdatePlugin(loader).execute({ pluginName: '@acme/missing', config: mockConfig }),
    ).rejects.toBe(error)
  })
})
