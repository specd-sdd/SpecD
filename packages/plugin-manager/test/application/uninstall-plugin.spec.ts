import { describe, expect, it, vi } from 'vitest'
import { UninstallPlugin } from '../../src/index.js'
import type { PluginLoader } from '../../src/index.js'
import { PluginValidationError } from '../../src/index.js'
import { makeMockConfig } from '../mock-config.js'

const mockConfig = makeMockConfig()

describe('UninstallPlugin', () => {
  it('given a loadable agent plugin, when execute is called, then uninstalls successfully', async () => {
    const uninstall = vi.fn(async () => {})

    const loader: PluginLoader = {
      load: vi.fn(async () => ({
        name: '@specd/plugin-agent-claude',
        type: 'agent' as const,
        version: '1.0.0',
        configSchema: {},
        init: async () => {},
        destroy: async () => {},
        install: async () => ({ installed: [], skipped: [] }),
        uninstall,
      })),
    }

    const useCase = new UninstallPlugin(loader)
    await useCase.execute({
      pluginName: '@specd/plugin-agent-claude',
      config: mockConfig,
    })

    expect(uninstall).toHaveBeenCalledWith(mockConfig, undefined)
  })
})
