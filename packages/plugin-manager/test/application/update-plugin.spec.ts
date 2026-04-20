import { describe, expect, it, vi } from 'vitest'
import { UpdatePlugin } from '../../src/index.js'
import type { PluginLoader } from '../../src/index.js'
import { PluginValidationError } from '../../src/index.js'

describe('UpdatePlugin', () => {
  it('given a loadable agent plugin, when execute is called, then reinstalls and returns success', async () => {
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

    const useCase = new UpdatePlugin(loader)
    const result = await useCase.execute({
      pluginName: '@specd/plugin-agent-claude',
      projectRoot: '/tmp/project',
    })

    expect(result.success).toBe(true)
    expect(install).toHaveBeenCalledOnce()
  })

  it('given a non-agent plugin, when execute is called, then throws PluginValidationError', async () => {
    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        name: 'some-plugin',
        type: 'agent' as const,
        version: '1.0.0',
        configSchema: {},
        init: async () => {},
        destroy: async () => {},
      })),
    }

    const useCase = new UpdatePlugin(loader)
    await expect(
      useCase.execute({
        pluginName: 'some-plugin',
        projectRoot: '/tmp/project',
      }),
    ).rejects.toThrow(PluginValidationError)
  })
})
