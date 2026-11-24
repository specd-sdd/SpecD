import { describe, expect, it } from 'vitest'
import { ListPlugins, PluginNotFoundError, PluginValidationError } from '../../src/index.js'
import type { PluginLoader } from '../../src/index.js'

describe('ListPlugins', () => {
  it('given one valid and one invalid plugin, when listed, then both are reported', async () => {
    const loader: PluginLoader = {
      load: async (name) => {
        if (name === '@acme/bad') throw new PluginValidationError(name, ['manifest'])
        return {
          plugin: {
            name,
            version: '1.2.0',
            init: async () => {},
            destroy: async () => {},
          },
          manifest: {
            schemaVersion: 2,
            name,
            version: '1.2.0',
            minCoreVersion: '*',
            contributes: { agents: { claude: {} } },
          },
        }
      },
    }
    const result = await new ListPlugins(loader).execute({
      pluginNames: ['@acme/good', '@acme/bad'],
    })
    expect(result.plugins[0]).toMatchObject({
      name: '@acme/good',
      status: 'loaded',
      contributions: ['claude'],
    })
    expect(result.plugins[1]?.status).toBe('error')
  })

  it('given a missing package, when listed, then the entry is not_found and listing continues', async () => {
    const loader: PluginLoader = {
      load: async (name) => {
        if (name === '@acme/missing') throw new PluginNotFoundError(name)
        return {
          plugin: { name, version: '1.0.0', init: async () => {}, destroy: async () => {} },
          manifest: {
            schemaVersion: 2,
            name,
            version: '1.0.0',
            minCoreVersion: '*',
            contributes: {},
          },
        }
      },
    }
    const result = await new ListPlugins(loader).execute({
      pluginNames: ['@acme/missing', '@acme/present'],
    })
    expect(result.plugins.map((entry) => entry.status)).toEqual(['not_found', 'loaded'])
  })

  it('given several names, when listed, then entries keep the input order and list every contribution id', async () => {
    const loader: PluginLoader = {
      load: async (name) => ({
        plugin: { name, version: '1.0.0', init: async () => {}, destroy: async () => {} },
        manifest: {
          schemaVersion: 2,
          name,
          version: '1.0.0',
          minCoreVersion: '*',
          contributes: { agents: { claude: {}, codex: {} } },
        },
      }),
    }
    const result = await new ListPlugins(loader).execute({
      pluginNames: ['@acme/c', '@acme/a', '@acme/b'],
    })
    expect(result.plugins.map((entry) => entry.name)).toEqual(['@acme/c', '@acme/a', '@acme/b'])
    expect(result.plugins[0]?.contributions).toEqual(['claude', 'codex'])
  })

  it('given a manifest with an unscoped name, when listed, then the entry is an error and the others are still listed', async () => {
    const loader: PluginLoader = {
      load: async (name) => {
        if (name === 'unscoped-plugin') throw new PluginValidationError(name, ['name'])
        return {
          plugin: { name, version: '1.0.0', init: async () => {}, destroy: async () => {} },
          manifest: {
            schemaVersion: 2,
            name,
            version: '1.0.0',
            minCoreVersion: '*',
            contributes: { agents: { claude: {} } },
          },
        }
      },
    }
    const result = await new ListPlugins(loader).execute({
      pluginNames: ['unscoped-plugin', '@acme/ok'],
    })
    expect(result.plugins[0]).toMatchObject({ name: 'unscoped-plugin', status: 'error' })
    expect(result.plugins[0]?.error).toContain('unscoped-plugin')
    expect(result.plugins[1]).toMatchObject({ name: '@acme/ok', status: 'loaded' })
  })

  it.each([
    [{ message: 'object message' }, 'object message'],
    [{ message: 5 }, 'unknown error'],
    ['plain string', 'plain string'],
    [undefined, 'unknown error'],
  ])(
    'given a non-Error rejection %j, when listed, then the entry renders it safely',
    async (thrown, expected) => {
      const loader: PluginLoader = {
        load: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw thrown
        },
      }
      const result = await new ListPlugins(loader).execute({ pluginNames: ['@acme/x'] })
      expect(result.plugins[0]).toMatchObject({ status: 'error' })
      expect(result.plugins[0]?.error).toContain(expected)
    },
  )
})
