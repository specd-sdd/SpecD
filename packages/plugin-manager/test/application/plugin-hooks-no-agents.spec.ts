import { describe, expect, it, vi } from 'vitest'
import {
  InstallPlugin,
  UninstallPlugin,
  UpdatePlugin,
  type PluginLoader,
  type SpecdPlugin,
  type SpecdPluginManifest,
} from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

const config = makeMockConfig()
const name = '@acme/mixed'

function loaderWith(
  hooks: { install?: ReturnType<typeof vi.fn>; uninstall?: ReturnType<typeof vi.fn> },
  contributes: SpecdPluginManifest['contributes'],
  extra: Partial<SpecdPluginManifest> = {},
): PluginLoader {
  const plugin = {
    name,
    version: '1.0.0',
    init: async () => {},
    destroy: async () => {},
    install: hooks.install ?? vi.fn(async () => ({ installed: [], skipped: [] })),
    uninstall: hooks.uninstall ?? vi.fn(async () => {}),
  } as unknown as SpecdPlugin
  return {
    load: async () => ({
      plugin,
      manifest: {
        schemaVersion: 2,
        name,
        version: '1.0.0',
        minCoreVersion: '*',
        contributes,
        ...extra,
      },
    }),
  }
}

const mixed = { agents: { claude: {}, codex: {} }, checks: { audit: {} } }

describe('plugin hooks when no agents id is selected', () => {
  it('install still calls the hook with an empty contributions list', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    const result = await new InstallPlugin(loaderWith({ install }, mixed)).execute({
      pluginName: name,
      config,
      contributions: ['audit'],
    })
    expect(install).toHaveBeenCalledWith({ config, contributions: [] })
    expect(result.contributions).toEqual([])
  })

  it('uninstall still calls the hook with an empty contributions list', async () => {
    const uninstall = vi.fn(async () => {})
    await new UninstallPlugin(loaderWith({ uninstall }, mixed)).execute({
      pluginName: name,
      config,
      contributions: ['audit'],
    })
    expect(uninstall).toHaveBeenCalledWith({ config, contributions: [] })
  })

  it('update still calls the hook with an empty contributions list', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    const result = await new UpdatePlugin(loaderWith({ install }, mixed)).execute({
      pluginName: name,
      config,
      contributions: ['audit'],
    })
    expect(install).toHaveBeenCalledWith({ config, contributions: [] })
    expect(result.contributions).toEqual([])
  })
})

describe('plugin hooks with mixed kinds', () => {
  it('install passes only agents ids when the whole manifest is selected', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    await new InstallPlugin(loaderWith({ install }, mixed)).execute({ pluginName: name, config })
    expect(install).toHaveBeenCalledWith({ config, contributions: ['claude', 'codex'] })
  })

  it('uninstall passes only agents ids', async () => {
    const uninstall = vi.fn(async () => {})
    await new UninstallPlugin(loaderWith({ uninstall }, mixed)).execute({
      pluginName: name,
      config,
      contributions: ['claude', 'audit'],
    })
    expect(uninstall).toHaveBeenCalledWith({ config, contributions: ['claude'] })
  })

  it('update passes only agents ids', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    await new UpdatePlugin(loaderWith({ install }, mixed)).execute({
      pluginName: name,
      config,
      contributions: ['codex', 'audit'],
    })
    expect(install).toHaveBeenCalledWith({ config, contributions: ['codex'] })
  })

  it('selection is preserved when a sibling agent is not selected', async () => {
    const install = vi.fn(async () => ({ installed: [], skipped: [] }))
    const uninstall = vi.fn(async () => {})
    const loader = loaderWith({ install, uninstall }, mixed)
    await new InstallPlugin(loader).execute({ pluginName: name, config, contributions: ['claude'] })
    await new UninstallPlugin(loader).execute({
      pluginName: name,
      config,
      contributions: ['claude'],
    })
    await new UpdatePlugin(loader).execute({ pluginName: name, config, contributions: ['claude'] })
    expect(install).toHaveBeenNthCalledWith(1, { config, contributions: ['claude'] })
    expect(uninstall).toHaveBeenCalledWith({ config, contributions: ['claude'] })
    expect(install).toHaveBeenNthCalledWith(2, { config, contributions: ['claude'] })
  })

  it('update output never carries defaultConfig even when the manifest declares one', async () => {
    const result = await new UpdatePlugin(
      loaderWith({}, mixed, { defaultConfig: { mode: 'fast' } }),
    ).execute({ pluginName: name, config })
    expect(result).not.toHaveProperty('defaultConfig')
  })
})
