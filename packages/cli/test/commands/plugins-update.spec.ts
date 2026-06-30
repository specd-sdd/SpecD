import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

const mockUpdate = vi.fn().mockResolvedValue({ success: true, message: 'ok' })

function pluginTypeForName(pluginName: string): 'agent' | 'ui' {
  return pluginName.includes('studio') || pluginName.includes('ui-studio') ? 'ui' : 'agent'
}

function mockLoadedPlugin(pluginName: string) {
  const type = pluginTypeForName(pluginName)
  return {
    name: pluginName,
    type,
    version: '0.0.1',
    configSchema: {},
    init: vi.fn(),
    destroy: vi.fn(),
    ...(type === 'agent' ? { install: vi.fn(), uninstall: vi.fn() } : {}),
  }
}

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/plugin-manager', () => ({
  createPluginLoader: vi.fn().mockReturnValue({}),
  InstallPlugin: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  })),
  LoadPlugin: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockImplementation(({ pluginName }: { pluginName: string }) => ({
      plugin: mockLoadedPlugin(pluginName),
    })),
  })),
  ListPlugins: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      plugins: [
        {
          name: '@specd/plugin-agent-claude',
          status: 'loaded',
          plugin: { version: '0.0.1' },
        },
      ],
    }),
  })),
  UninstallPlugin: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue(undefined),
  })),
  UpdatePlugin: vi.fn().mockImplementation(() => ({
    execute: mockUpdate,
  })),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsUpdate } from '../../src/commands/plugins/update.js'

function setup(configOverrides: Parameters<typeof makeMockConfig>[0] = {}) {
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: makeMockConfig({
      plugins: {
        agents: [{ name: '@specd/plugin-agent-claude' }, { name: '@specd/plugin-agent-copilot' }],
      },
      ...configOverrides,
    }),
    configFilePath: '/project/specd.yaml',
    kernel,
  })
  const stdout = captureStdout()
  mockProcessExit()
  return { stdout }
}

afterEach(() => vi.clearAllMocks())

describe('plugins update', () => {
  it('updates declared ui plugins when listed under plugins.ui', async () => {
    const { stdout } = setup({
      plugins: {
        agents: [{ name: '@specd/plugin-agent-claude' }],
        ui: [{ name: '@specd/plugin-ui-studio' }],
      },
    })
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'update'])

    expect(stdout()).toContain('@specd/plugin-ui-studio')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ pluginName: '@specd/plugin-ui-studio' }),
    )
  })

  it('updates all declared plugins when no args are provided', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'update'])

    expect(stdout()).toContain('@specd/plugin-agent-claude')
    expect(stdout()).toContain('@specd/plugin-agent-copilot')
  })

  it('updates only specified plugin names when provided', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'update',
      '@specd/plugin-agent-claude',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.plugins).toHaveLength(1)
    expect(parsed.plugins[0].name).toBe('@specd/plugin-agent-claude')
  })
})
