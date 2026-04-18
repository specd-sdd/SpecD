import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/plugin-manager', () => ({
  createPluginLoader: vi.fn().mockReturnValue({}),
  InstallPlugin: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  })),
  UpdatePlugin: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  })),
  LoadPlugin: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      plugin: {
        name: '@specd/plugin-agent-claude',
        type: 'agent',
        version: '0.0.1',
        configSchema: {},
        init: vi.fn(),
        destroy: vi.fn(),
        install: vi.fn(),
        uninstall: vi.fn(),
      },
    }),
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

function setup() {
  const kernel = makeMockKernel()
  kernel.project.listPlugins.execute.mockResolvedValue([])
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: makeMockConfig(),
    configFilePath: '/project/specd.yaml',
    kernel,
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { kernel, stdout, stderr }
}

afterEach(() => vi.clearAllMocks())

describe('plugins install', () => {
  it('installs plugin and persists declaration', async () => {
    const { kernel } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))

    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])

    expect(kernel.project.addPlugin.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agents',
        name: '@specd/plugin-agent-claude',
      }),
    )
  })

  it('skips already-installed plugin with warning', async () => {
    const { kernel, stderr } = setup()
    kernel.project.listPlugins.execute.mockResolvedValue([{ name: '@specd/plugin-agent-claude' }])

    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])

    expect(stderr()).toContain('already installed')
    expect(stderr()).toContain('update')
  })
})

describe('plugins list/show/uninstall', () => {
  it('lists declared plugins with status', async () => {
    const { kernel, stdout } = setup()
    kernel.project.listPlugins.execute.mockResolvedValue([{ name: '@specd/plugin-agent-claude' }])

    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.plugins[0].status).toBe('installed')
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
    const { kernel } = setup()
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@specd/plugin-agent-claude',
    ])

    expect(kernel.project.removePlugin.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agents',
        name: '@specd/plugin-agent-claude',
      }),
    )
  })
})
