import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  ExitSentinel,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

const mockInstallAgent = vi.fn().mockResolvedValue({ success: true, message: 'ok' })
const mockInstallUi = vi.fn().mockResolvedValue({ success: true, message: 'ok ui' })
const mockAddPlugin = vi.fn().mockResolvedValue(undefined)
const mockRemovePlugin = vi.fn().mockResolvedValue(undefined)

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

vi.mock('@specd/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@specd/sdk')>()
  return {
    ...original,
    createConfigWriter: vi.fn(() => ({
      initProject: vi.fn(),
      addPlugin: mockAddPlugin,
      removePlugin: mockRemovePlugin,
      listPlugins: vi.fn(),
    })),
  }
})

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/plugin-manager', () => ({
  createPluginLoader: vi.fn().mockReturnValue({}),
  isUiPlugin: vi.fn().mockReturnValue(false),
  InstallPlugin: vi.fn().mockImplementation(() => ({
    execute: mockInstallAgent,
  })),
  InstallUiPlugin: vi.fn().mockImplementation(() => ({
    execute: mockInstallUi,
  })),
  UpdatePlugin: vi.fn().mockImplementation(() => ({
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
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsInstall } from '../../src/commands/plugins/install.js'
import { registerPluginsList } from '../../src/commands/plugins/list.js'
import { registerPluginsShow } from '../../src/commands/plugins/show.js'
import { registerPluginsUninstall } from '../../src/commands/plugins/uninstall.js'

function setup(configOverrides: Parameters<typeof makeMockConfig>[0] = {}) {
  const kernel = makeMockKernel()
  const config = makeMockConfig(configOverrides)
  vi.mocked(resolveCliContext).mockResolvedValue({
    config,
    configFilePath: '/project/specd.yaml',
    kernel,
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { kernel, config, stdout, stderr }
}

afterEach(() => vi.clearAllMocks())

describe('plugins install', () => {
  it('installs plugin and persists declaration', async () => {
    const { config } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))

    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])

    expect(mockInstallAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginName: '@specd/plugin-agent-claude',
        config,
      }),
    )
    expect(mockAddPlugin).toHaveBeenCalledWith(
      '/project/specd.yaml',
      'agents',
      '@specd/plugin-agent-claude',
    )
  })

  it('installs ui plugin via InstallUiPlugin and persists plugins.ui', async () => {
    const { config } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))

    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-ui-studio'])

    expect(mockInstallUi).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginName: '@specd/plugin-ui-studio',
        config,
      }),
    )
    expect(mockInstallAgent).not.toHaveBeenCalled()
    expect(mockAddPlugin).toHaveBeenCalledWith(
      '/project/specd.yaml',
      'ui',
      '@specd/plugin-ui-studio',
    )
  })

  it('skips already-installed plugin with warning', async () => {
    const { stderr } = setup({
      plugins: {
        agents: [{ name: '@specd/plugin-agent-claude' }],
      },
    })

    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])

    expect(stderr()).toContain('already installed')
    expect(stderr()).toContain('update')
  })

  it('outputs machine-parseable JSON on install', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))

    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'install',
      '@specd/plugin-agent-claude',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '@specd/plugin-agent-claude',
          status: 'installed',
        }),
      ]),
    )
  })

  it('exits 1 when any plugin install fails', async () => {
    setup()
    mockInstallAgent.mockRejectedValueOnce(new Error('install failed'))

    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))

    await expect(
      program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude']),
    ).rejects.toThrow(ExitSentinel)
  })
})

describe('plugins list/show/uninstall', () => {
  it('lists declared plugins with status', async () => {
    const { stdout } = setup({
      plugins: {
        agents: [{ name: '@specd/plugin-agent-claude' }],
      },
    })

    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.plugins[0].status).toBe('installed')
  })

  it('returns empty output for unknown plugin type', async () => {
    const { stdout } = setup({
      plugins: {
        agents: [{ name: '@specd/plugin-agent-claude' }],
      },
    })

    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'list',
      '--type',
      'missing',
      '--format',
      'json',
    ])

    expect(JSON.parse(stdout())).toEqual({ plugins: [] })
  })

  it('shows plugin metadata', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsShow(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'show',
      '@specd/plugin-agent-claude',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('@specd/plugin-agent-claude')
    expect(parsed.capabilities).toContain('install')
  })

  it('uninstalls plugin and removes declaration', async () => {
    setup()
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@specd/plugin-agent-claude',
    ])

    expect(mockRemovePlugin).toHaveBeenCalledWith(
      '/project/specd.yaml',
      'agents',
      '@specd/plugin-agent-claude',
    )
  })

  it('outputs machine-parseable JSON on uninstall', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))

    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@specd/plugin-agent-claude',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '@specd/plugin-agent-claude',
          status: 'uninstalled',
        }),
      ]),
    )
  })
})
