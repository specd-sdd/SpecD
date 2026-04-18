import { describe, expect, it, vi } from 'vitest'
import { InstallPlugin } from '../../src/index.js'
import type { PluginLoader } from '../../src/index.js'

describe('InstallPlugin', () => {
  it('given a loadable agent plugin, when execute is called, then installs and returns success', async () => {
    const install = vi.fn(async () => ({
      installed: [{ skill: 'specd', path: '/tmp/specd.md' }],
      skipped: [],
    }))

    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        name: '@specd/plugin-agent-claude',
        type: 'agent' as const,
        version: '1.0.0',
        configSchema: {},
        init: async () => {},
        destroy: async () => {},
        install,
        uninstall: async () => {},
      })),
    }

    const useCase = new InstallPlugin(loader)
    const result = await useCase.execute({
      pluginName: '@specd/plugin-agent-claude',
      projectRoot: '/tmp/project',
    })

    expect(result.success).toBe(true)
    expect(install).toHaveBeenCalledOnce()
    expect(loader.load).toHaveBeenCalledWith('@specd/plugin-agent-claude')
  })
})
