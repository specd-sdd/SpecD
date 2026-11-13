import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
  captureStderr,
  captureStdout,
  attachKernelPluginSpies,
  expectNoKernelPluginCalls,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  makeMockHost,
} from './helpers.js'

const mockInstall = vi.fn().mockResolvedValue({ success: true, message: 'ok' })
const mockAddPlugin = vi.fn().mockResolvedValue(undefined)
const mockRemovePlugin = vi.fn().mockResolvedValue(undefined)
const mockWriterListPlugins = vi.fn()
const mockUninstall = vi.fn().mockResolvedValue(undefined)
const mockList = vi.fn().mockResolvedValue({
  plugins: [
    {
      name: '@specd/plugin-agent-claude',
      status: 'loaded',
      plugin: { version: '0.0.1' },
      contributions: ['claude'],
    },
  ],
})
const mockLoad = vi.fn().mockResolvedValue({
  plugin: {
    name: '@specd/plugin-agent-claude',
    version: '0.0.1',
    init: vi.fn(),
    destroy: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
  },
  manifest: {
    name: '@specd/plugin-agent-claude',
    version: '0.0.1',
    contributes: { agents: { claude: { description: 'Claude' } } },
  },
})

vi.mock('@specd/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@specd/sdk')>()
  return {
    ...original,
    createConfigWriter: vi.fn(() => ({
      initProject: vi.fn(),
      addPlugin: mockAddPlugin,
      removePlugin: mockRemovePlugin,
      listPlugins: mockWriterListPlugins,
    })),
  }
})

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('@specd/plugin-manager', () => ({
  PluginNotFoundError: class PluginNotFoundError extends Error {},
  createPluginLoader: vi.fn().mockReturnValue({}),
  buildContributionAddress: (name: string, id: string) => `${name}.${id}`,
  InstallPlugin: vi.fn(function InstallPluginMock() {
    return {
      execute: mockInstall,
    }
  }),
  UpdatePlugin: vi.fn(function UpdatePluginMock() {
    return {
      execute: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    }
  }),
  LoadPlugin: vi.fn(function LoadPluginMock() {
    return { execute: mockLoad }
  }),
  ListPlugins: vi.fn(function ListPluginsMock() {
    return { execute: mockList }
  }),
  UninstallPlugin: vi.fn(function UninstallPluginMock() {
    return { execute: mockUninstall }
  }),
}))

import { LoadPlugin, PluginNotFoundError } from '@specd/plugin-manager'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsInstall } from '../../src/commands/plugins/install.js'
import { registerPluginsList } from '../../src/commands/plugins/list.js'
import { registerPluginsShow } from '../../src/commands/plugins/show.js'
import { registerPluginsUninstall } from '../../src/commands/plugins/uninstall.js'

function setup(configOverrides: Parameters<typeof makeMockConfig>[0] = {}) {
  const kernel = makeMockKernel()
  const kernelSpies = attachKernelPluginSpies(kernel)
  const config = makeMockConfig(configOverrides)
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({
      config,
      configFilePath: '/project/specd.yaml',
      kernel,
    }),
  )
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { kernel, kernelSpies, config, stdout, stderr }
}

/**
 * Returns the global invocation order of the first call matching `predicate`.
 * Throws when no call matches, so an ordering assertion can never pass vacuously.
 *
 * @param mock - Mock to inspect
 * @param predicate - Selects the call by its arguments
 * @returns The vitest invocation order number
 */
function callOrderOf(mock: Mock, predicate: (args: unknown[]) => boolean): number {
  const index = mock.mock.calls.findIndex(predicate)
  const order = mock.mock.invocationCallOrder[index]
  if (index < 0 || order === undefined) throw new Error('no matching call recorded')
  return order
}

/**
 * Reads `pluginName` from a use-case input.
 *
 * @param input - Use-case input argument
 * @returns The plugin name, or `undefined`
 */
function pluginNameOf(input: unknown): unknown {
  return (input as { pluginName?: unknown }).pluginName
}

afterEach(() => {
  vi.clearAllMocks()
  const exit = process.exit as typeof process.exit & { mockRestore?: () => void }
  exit.mockRestore?.()
})

describe('plugins install', () => {
  it('installs plugin and persists declaration', async () => {
    const { config, kernelSpies } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))

    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])
    expectNoKernelPluginCalls(kernelSpies)

    expect(mockInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginName: '@specd/plugin-agent-claude',
        config,
      }),
    )
    expect(mockAddPlugin).toHaveBeenCalledWith(
      '/project/specd.yaml',
      '@specd/plugin-agent-claude',
      {},
    )
    expect(mockAddPlugin.mock.calls[0]?.[2]).not.toHaveProperty('config')
    expect(resolveCliContext).toHaveBeenCalledWith(expect.objectContaining({ plugins: false }))
  })

  it('rejects an unscoped name and a contributions flag used with several plugins', async () => {
    const { stdout, stderr } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await expect(
      program.parseAsync(['node', 'specd', 'plugins', 'install', 'my-plugin']),
    ).rejects.toMatchObject({ code: 1 })
    expect(stdout()).toContain('my-plugin')

    const again = makeProgram()
    registerPluginsInstall(again.command('plugins'))
    await expect(
      again.parseAsync([
        'node',
        'specd',
        'plugins',
        'install',
        '@specd/plugin-agent-claude',
        '@specd/plugin-agent-copilot',
        '--contributions',
        'claude',
      ]),
    ).rejects.toMatchObject({ code: 1 })
    expect(stderr()).toContain('--contributions requires exactly one plugin')
  })

  it('persists contributions and default config when install returns them', async () => {
    setup()
    mockInstall.mockResolvedValueOnce({
      success: true,
      message: 'ok',
      defaultConfig: { mode: 'fast' },
    })
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'install',
      '@specd/plugin-agent-claude',
      '--contributions',
      'claude',
    ])
    expect(mockInstall).toHaveBeenCalledWith(expect.objectContaining({ contributions: ['claude'] }))
    expect(mockAddPlugin).toHaveBeenCalledWith(
      '/project/specd.yaml',
      '@specd/plugin-agent-claude',
      { config: { mode: 'fast' }, contributions: ['claude'] },
    )
  })

  it('skips already-installed plugin with warning', async () => {
    const { stderr, kernelSpies } = setup({
      plugins: [{ name: '@specd/plugin-agent-claude' }],
    })

    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])

    expect(stderr()).toContain('already installed')
    expect(stderr()).toContain('update')
    expect(mockInstall).not.toHaveBeenCalled()
    expect(mockAddPlugin).not.toHaveBeenCalled()
    expectNoKernelPluginCalls(kernelSpies)
  })

  it('does not install or record an unscoped name, and continues after a later failure', async () => {
    const { stdout } = setup()
    mockInstall.mockRejectedValueOnce(new Error('disk full'))
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await expect(
      program.parseAsync([
        'node',
        'specd',
        'plugins',
        'install',
        'my-plugin',
        '@specd/plugin-agent-claude',
        '@specd/plugin-agent-copilot',
        '--format',
        'json',
      ]),
    ).rejects.toMatchObject({ code: 1 })
    expect(mockInstall).toHaveBeenCalledTimes(2)
    expect(mockAddPlugin).toHaveBeenCalledTimes(1)
    expect(mockAddPlugin).toHaveBeenCalledWith(
      '/project/specd.yaml',
      '@specd/plugin-agent-copilot',
      {},
    )
    const parsed = JSON.parse(stdout())
    expect(parsed.hasErrors).toBe(true)
    expect(parsed.plugins.map((entry: { status: string }) => entry.status)).toEqual([
      'error',
      'error',
      'installed',
    ])
  })

  it('rejects an empty --contributions value without installing or writing', async () => {
    const { stderr } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await expect(
      program.parseAsync([
        'node',
        'specd',
        'plugins',
        'install',
        '@specd/plugin-agent-claude',
        '--contributions',
        '',
      ]),
    ).rejects.toMatchObject({ code: 1 })
    expect(stderr()).toContain('--contributions requires at least one contribution id')
    expect(resolveCliContext).not.toHaveBeenCalled()
    expect(mockInstall).not.toHaveBeenCalled()
    expect(mockAddPlugin).not.toHaveBeenCalled()
  })

  it.each([',', ' ', ',,', ' , '])(
    'rejects the comma-only or blank --contributions value %j before resolving the context',
    async (value) => {
      const { stderr } = setup()
      const program = makeProgram()
      registerPluginsInstall(program.command('plugins'))
      await expect(
        program.parseAsync([
          'node',
          'specd',
          'plugins',
          'install',
          '@specd/plugin-agent-claude',
          '--contributions',
          value,
        ]),
      ).rejects.toMatchObject({ code: 1 })
      expect(stderr()).toContain('--contributions requires at least one contribution id')
      expect(resolveCliContext).not.toHaveBeenCalled()
      expect(mockInstall).not.toHaveBeenCalled()
      expect(mockAddPlugin).not.toHaveBeenCalled()
    },
  )

  it('never loads or initializes the plugin and never lists plugins from the writer', async () => {
    setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])
    expect(LoadPlugin).not.toHaveBeenCalled()
    expect(mockLoad).not.toHaveBeenCalled()
    expect(mockWriterListPlugins).not.toHaveBeenCalled()
  })

  it('does not list plugins from the writer when the plugin is already installed', async () => {
    setup({ plugins: [{ name: '@specd/plugin-agent-claude' }] })
    captureStderr()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])
    expect(mockWriterListPlugins).not.toHaveBeenCalled()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('installs a duplicated name once and reports the second as already installed', async () => {
    const { stdout, stderr } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'install',
      '@acme/x',
      '@acme/x',
      '--format',
      'json',
    ])
    expect(mockInstall).toHaveBeenCalledTimes(1)
    expect(mockAddPlugin).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(stdout())
    expect(parsed.plugins.map((entry: { status: string }) => entry.status)).toEqual([
      'installed',
      'skipped',
    ])
    expect(parsed.plugins[1].detail).toContain('already installed')
    expect(stderr()).toContain('already installed')
  })

  it('does not list plugins nor load/init them while installing', async () => {
    setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])
    expect(mockWriterListPlugins).not.toHaveBeenCalled()
    expect(mockList).not.toHaveBeenCalled()
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('prints the install header in text output', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude'])
    expect(stdout()).toContain('Installed plugins:')
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
    expect(parsed.hasErrors).toBe(false)
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
    mockInstall.mockRejectedValueOnce(new Error('install failed'))

    const program = makeProgram()
    registerPluginsInstall(program.command('plugins'))

    await expect(
      program.parseAsync(['node', 'specd', 'plugins', 'install', '@specd/plugin-agent-claude']),
    ).rejects.toMatchObject({ code: 1 })
  })
})

describe('plugins list/show/uninstall', () => {
  it('lists declared plugins with status', async () => {
    const { stdout } = setup({
      plugins: [{ name: '@specd/plugin-agent-claude' }],
    })

    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.plugins[0].status).toBe('installed')
  })

  it('shows selected and available contributions in text output', async () => {
    const { stdout } = setup({
      plugins: [{ name: '@specd/plugin-agent-claude', contributions: ['claude'] }],
    })
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list'])
    const text = stdout()
    expect(text).toContain('selected: [claude]')
  })

  it('returns empty output when no plugins are declared', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list', '--format', 'json'])

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
    expect(parsed.contributions).toEqual([
      { kind: 'agents', id: 'claude', address: '@specd/plugin-agent-claude.claude' },
    ])
    expect(resolveCliContext).toHaveBeenCalledWith(expect.objectContaining({ plugins: false }))
  })

  it('prints contribution addresses and omits init from text capabilities', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsShow(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'show', '@specd/plugin-agent-claude'])
    const text = stdout()
    expect(text).toContain('agents claude @specd/plugin-agent-claude.claude')
    expect(text).toContain('capabilities: install, uninstall')
    expect(text).not.toContain('init')
  })

  it('uninstalls plugin and removes declaration', async () => {
    const { kernelSpies } = setup({ plugins: [{ name: '@specd/plugin-agent-claude' }] })
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
      '@specd/plugin-agent-claude',
    )
    expectNoKernelPluginCalls(kernelSpies)
  })

  it('outputs machine-parseable JSON on uninstall', async () => {
    const { stdout } = setup({ plugins: [{ name: '@specd/plugin-agent-claude' }] })
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

  it('passes the allowlist and opens the host with plugins disabled', async () => {
    setup({ plugins: [{ name: '@acme/checks', contributions: ['lint'] }] })
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'uninstall', '@acme/checks'])
    expect(mockUninstall).toHaveBeenCalledWith(expect.objectContaining({ contributions: ['lint'] }))
    expect(resolveCliContext).toHaveBeenCalledWith(expect.objectContaining({ plugins: false }))
  })

  it('keeps the declaration when the hook fails and still processes the next plugin', async () => {
    const { stdout } = setup({
      plugins: [{ name: '@acme/one' }, { name: '@acme/two' }],
    })
    mockUninstall.mockRejectedValueOnce(new Error('busy'))
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await expect(
      program.parseAsync([
        'node',
        'specd',
        'plugins',
        'uninstall',
        '@acme/one',
        '@acme/two',
        '--format',
        'json',
      ]),
    ).rejects.toMatchObject({ code: 1 })
    expect(mockRemovePlugin).not.toHaveBeenCalledWith('/project/specd.yaml', '@acme/one')
    expect(mockRemovePlugin).toHaveBeenCalledWith('/project/specd.yaml', '@acme/two')
    const parsed = JSON.parse(stdout())
    expect(parsed.plugins.map((entry: { status: string }) => entry.status)).toEqual([
      'error',
      'uninstalled',
    ])
    // The hook of the plugin whose declaration was removed ran before that removal.
    const hookOrder = callOrderOf(mockUninstall, (args) => pluginNameOf(args[0]) === '@acme/two')
    const removeOrder = callOrderOf(mockRemovePlugin, (args) => args[1] === '@acme/two')
    expect(hookOrder).toBeLessThan(removeOrder)
  })

  it('reports an undeclared plugin without removing it', async () => {
    const { kernelSpies } = setup({ plugins: [] })
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await expect(
      program.parseAsync(['node', 'specd', 'plugins', 'uninstall', '@acme/missing']),
    ).rejects.toMatchObject({ code: 1 })
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(mockUninstall).not.toHaveBeenCalled()
    expect(mockRemovePlugin).not.toHaveBeenCalled()
    expectNoKernelPluginCalls(kernelSpies)
  })

  it('prints the header when every declared plugin is not_found or error', async () => {
    const { stdout } = setup({ plugins: [{ name: '@acme/missing' }, { name: '@acme/bad' }] })
    mockList.mockResolvedValueOnce({
      plugins: [
        { name: '@acme/missing', status: 'not_found', error: 'not installed' },
        { name: '@acme/bad', status: 'error', error: 'bad manifest' },
      ],
    })
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list'])
    const lines = stdout().trim().split('\n')
    expect(lines[0]).toBe('Installed plugins:')
    expect(lines).toHaveLength(3)
  })

  it('lists not_found and error rows, a missing version, and available ids', async () => {
    const { stdout } = setup({
      plugins: [
        { name: '@acme/missing' },
        { name: '@acme/bad' },
        { name: '@acme/checks', contributions: ['lint'] },
      ],
    })
    mockList.mockResolvedValueOnce({
      plugins: [
        { name: '@acme/missing', status: 'not_found', error: 'not installed' },
        { name: '@acme/bad', status: 'error', error: 'bad manifest' },
        {
          name: '@acme/checks',
          status: 'loaded',
          contributions: ['lint', 'scan'],
        },
      ],
    })
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list'])
    const text = stdout()
    const lines = text.trim().split('\n')
    expect(lines[0]).toBe('Installed plugins:')
    expect(text).toContain('@acme/missing  not_found  -')
    expect(text).toContain('@acme/bad  error  -')
    // Both the not_found and the error rows end with their detail message.
    expect(lines.find((line) => line.includes('@acme/missing'))).toMatch(/ {2}not installed$/)
    expect(lines.find((line) => line.includes('@acme/bad'))).toMatch(/ {2}bad manifest$/)
    expect(text).toContain('selected: [lint]')
    expect(text).toContain('available: scan')
  })

  it('prints no plugins declared when the list is empty', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list'])
    expect(stdout()).toContain('no plugins declared')
  })

  it('exits 1 when show cannot load the plugin', async () => {
    setup()
    mockLoad.mockRejectedValueOnce(
      Object.assign(new Error("plugin '@acme/missing' failed validation"), {
        specd: true,
        code: 'PLUGIN_VALIDATION_FAILED',
      }),
    )
    const program = makeProgram()
    registerPluginsShow(program.command('plugins'))
    await expect(
      program.parseAsync(['node', 'specd', 'plugins', 'show', '@acme/missing']),
    ).rejects.toMatchObject({ code: 1 })
  })

  it('shows schema and default config and omits capabilities for a checks plugin', async () => {
    const { stdout } = setup()
    const init = vi.fn()
    mockLoad.mockResolvedValueOnce({
      plugin: {
        name: '@acme/checks',
        version: '1.0.0',
        init,
        destroy: vi.fn(),
      },
      manifest: {
        name: '@acme/checks',
        version: '1.0.0',
        contributes: { checks: { lint: {} } },
        configSchema: { type: 'object' },
        defaultConfig: { mode: 'fast' },
      },
    })
    const program = makeProgram()
    registerPluginsShow(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'show',
      '@acme/checks',
      '--format',
      'json',
    ])
    const parsed = JSON.parse(stdout())
    expect(parsed.configSchema).toEqual({ type: 'object' })
    expect(parsed.defaultConfig).toEqual({ mode: 'fast' })
    expect(parsed).not.toHaveProperty('capabilities')
    expect(init).not.toHaveBeenCalled()
  })
})

describe('plugins uninstall (spec scenarios)', () => {
  it('uninstalls a plugin that has no uninstall hook and removes its declaration', async () => {
    const { stdout } = setup({ plugins: [{ name: '@acme/checks' }] })
    // The use case resolves without doing anything for plugins that expose no hook.
    mockUninstall.mockResolvedValueOnce(undefined)
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@acme/checks',
      '--format',
      'json',
    ])
    expect(mockUninstall).toHaveBeenCalledTimes(1)
    expect(mockUninstall.mock.calls[0]?.[0]).not.toHaveProperty('contributions')
    expect(mockRemovePlugin).toHaveBeenCalledWith('/project/specd.yaml', '@acme/checks')
    expect(JSON.parse(stdout()).plugins[0].status).toBe('uninstalled')
  })

  it('uninstalls two plugins and removes both declarations', async () => {
    const { stdout } = setup({ plugins: [{ name: '@acme/one' }, { name: '@acme/two' }] })
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@acme/one',
      '@acme/two',
      '--format',
      'json',
    ])
    expect(mockUninstall).toHaveBeenCalledTimes(2)
    expect(mockRemovePlugin).toHaveBeenNthCalledWith(1, '/project/specd.yaml', '@acme/one')
    expect(mockRemovePlugin).toHaveBeenNthCalledWith(2, '/project/specd.yaml', '@acme/two')
    const parsed = JSON.parse(stdout())
    expect(parsed.plugins.map((entry: { status: string }) => entry.status)).toEqual([
      'uninstalled',
      'uninstalled',
    ])
  })

  it('passes contributions only when the entry has an allowlist', async () => {
    setup({
      plugins: [{ name: '@acme/all' }, { name: '@acme/some', contributions: ['lint'] }],
    })
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'uninstall', '@acme/all', '@acme/some'])
    expect(mockUninstall.mock.calls[0]?.[0]).not.toHaveProperty('contributions')
    expect(mockUninstall.mock.calls[1]?.[0]).toMatchObject({ contributions: ['lint'] })
  })
})

describe('plugins list (spec scenarios)', () => {
  it('opens the host with plugins disabled and does not use the writer listing', async () => {
    const { kernelSpies } = setup({ plugins: [{ name: '@specd/plugin-agent-claude' }] })
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list'])
    expect(resolveCliContext).toHaveBeenCalledWith(expect.objectContaining({ plugins: false }))
    expect(mockWriterListPlugins).not.toHaveBeenCalled()
    expectNoKernelPluginCalls(kernelSpies)
  })

  it('lists plugins regardless of kind and shows a known version in text', async () => {
    const { stdout } = setup({
      plugins: [{ name: '@acme/agents' }, { name: '@acme/checks' }],
    })
    mockList.mockResolvedValueOnce({
      plugins: [
        {
          name: '@acme/agents',
          status: 'loaded',
          plugin: { version: '1.2.3' },
          contributions: ['claude'],
        },
        {
          name: '@acme/checks',
          status: 'loaded',
          plugin: { version: '4.5.6' },
          contributions: ['lint'],
        },
      ],
    })
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list'])
    const text = stdout()
    expect(text).toContain('@acme/agents  installed  1.2.3')
    expect(text).toContain('@acme/checks  installed  4.5.6')
  })

  it('reports contributions for not_found and error rows in JSON', async () => {
    const { stdout } = setup({
      plugins: [{ name: '@acme/missing', contributions: ['lint'] }, { name: '@acme/bad' }],
    })
    mockList.mockResolvedValueOnce({
      plugins: [
        { name: '@acme/missing', status: 'not_found', error: 'not installed' },
        { name: '@acme/bad', status: 'error', error: 'bad manifest' },
      ],
    })
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list', '--format', 'json'])
    const parsed = JSON.parse(stdout())
    expect(parsed.plugins[0]).toMatchObject({
      name: '@acme/missing',
      status: 'not_found',
      contributions: { declared: [], selected: ['lint'] },
      detail: 'not installed',
    })
    expect(parsed.plugins[1]).toMatchObject({
      name: '@acme/bad',
      status: 'error',
      contributions: { declared: [], selected: [] },
      detail: 'bad manifest',
    })
  })
})

describe('plugins show (spec scenarios)', () => {
  it('omits the capabilities line in text output for a checks-only plugin', async () => {
    const { stdout } = setup()
    mockLoad.mockResolvedValueOnce({
      plugin: { name: '@acme/checks', version: '1.0.0', init: vi.fn(), destroy: vi.fn() },
      manifest: {
        name: '@acme/checks',
        version: '1.0.0',
        contributes: { checks: { lint: {} } },
      },
    })
    const program = makeProgram()
    registerPluginsShow(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'show', '@acme/checks'])
    const text = stdout()
    expect(text).toContain('checks lint @acme/checks.lint')
    expect(text).not.toContain('capabilities')
  })

  it('exits 1 with an error for a plugin that cannot be found', async () => {
    const { stderr } = setup()
    mockLoad.mockRejectedValueOnce(
      Object.assign(new Error("plugin 'nonexistent-plugin' not found"), {
        specd: true,
        code: 'PLUGIN_NOT_FOUND',
      }),
    )
    const program = makeProgram()
    registerPluginsShow(program.command('plugins'))
    await expect(
      program.parseAsync(['node', 'specd', 'plugins', 'show', 'nonexistent-plugin']),
    ).rejects.toMatchObject({ code: 1 })
    expect(stderr()).toContain('error:')
    expect(stderr()).toContain('nonexistent-plugin')
  })
})

describe('plugins uninstall (duplicates and missing packages)', () => {
  it('processes a duplicated name once and reports the repeat as skipped', async () => {
    const { stdout } = setup({ plugins: [{ name: '@acme/x' }] })
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@acme/x',
      '@acme/x',
      '--format',
      'json',
    ])
    expect(mockUninstall).toHaveBeenCalledTimes(1)
    expect(mockRemovePlugin).toHaveBeenCalledTimes(1)
    expect(JSON.parse(stdout()).plugins).toEqual([
      { name: '@acme/x', status: 'uninstalled', detail: "uninstalled '@acme/x'" },
      { name: '@acme/x', status: 'skipped', detail: 'already processed' },
    ])
  })

  it('renders the skipped repeat in text and exits 0', async () => {
    const { stdout } = setup({ plugins: [{ name: '@acme/x' }] })
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'uninstall', '@acme/x', '@acme/x'])
    expect(stdout().trim().split('\n')[1]).toBe('@acme/x  skipped  already processed')
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('removes only the declaration when the package cannot be loaded', async () => {
    const { stdout } = setup({ plugins: [{ name: '@acme/gone' }] })
    mockLoad.mockRejectedValueOnce(new PluginNotFoundError('@acme/gone'))
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'uninstall',
      '@acme/gone',
      '--format',
      'json',
    ])
    expect(mockRemovePlugin).toHaveBeenCalledWith('/project/specd.yaml', '@acme/gone')
    expect(JSON.parse(stdout()).plugins).toEqual([
      {
        name: '@acme/gone',
        status: 'uninstalled',
        detail: 'package not found; only the declaration was removed',
      },
    ])
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('keeps the declaration when the uninstall hook fails', async () => {
    const { stdout } = setup({ plugins: [{ name: '@acme/bad' }] })
    mockUninstall.mockRejectedValueOnce(new Error('manifest invalid'))
    const program = makeProgram()
    registerPluginsUninstall(program.command('plugins'))
    await expect(
      program.parseAsync([
        'node',
        'specd',
        'plugins',
        'uninstall',
        '@acme/bad',
        '--format',
        'json',
      ]),
    ).rejects.toMatchObject({ code: 1 })
    expect(mockRemovePlugin).not.toHaveBeenCalled()
    expect(JSON.parse(stdout()).plugins[0]).toMatchObject({
      status: 'error',
      detail: 'manifest invalid',
    })
  })
})

describe('plugins list/show rendering', () => {
  it('prints - for a loaded plugin without a version', async () => {
    const { stdout } = setup({ plugins: [{ name: '@acme/nover' }] })
    mockList.mockResolvedValueOnce({
      plugins: [{ name: '@acme/nover', status: 'loaded', plugin: {}, contributions: ['lint'] }],
    })
    const program = makeProgram()
    registerPluginsList(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'list'])
    expect(stdout()).toContain('@acme/nover  installed  -  selected: [lint]')
  })

  it('renders configSchema and defaultConfig in text', async () => {
    const { stdout } = setup()
    mockLoad.mockResolvedValueOnce({
      plugin: { name: '@acme/checks', version: '1.0.0', init: vi.fn(), destroy: vi.fn() },
      manifest: {
        name: '@acme/checks',
        version: '1.0.0',
        contributes: { checks: { lint: {} } },
        configSchema: { type: 'object' },
        defaultConfig: { mode: 'fast' },
      },
    })
    const program = makeProgram()
    registerPluginsShow(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'show', '@acme/checks'])
    const lines = stdout().trim().split('\n')
    expect(lines).toContain('configSchema: {"type":"object"}')
    expect(lines).toContain('defaultConfig: {"mode":"fast"}')
    expect(lines.some((line) => line.startsWith('capabilities:'))).toBe(false)
  })
})
