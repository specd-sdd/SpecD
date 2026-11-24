import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStdout,
  attachKernelPluginSpies,
  expectNoKernelPluginCalls,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  makeMockHost,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

const mockUpdate = vi.fn().mockResolvedValue({ success: true, message: 'ok' })
const mockWriterListPlugins = vi.fn()
const mockAddPlugin = vi.fn()
const mockRemovePlugin = vi.fn()
const mockListExecute = vi.fn()

vi.mock('@specd/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@specd/sdk')>()),
  createConfigWriter: vi.fn(() => ({
    listPlugins: mockWriterListPlugins,
    addPlugin: mockAddPlugin,
    removePlugin: mockRemovePlugin,
  })),
}))

vi.mock('@specd/plugin-manager', () => ({
  createPluginLoader: vi.fn().mockReturnValue({}),
  InstallPlugin: vi.fn(function InstallPluginMock() {
    return {
      execute: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    }
  }),
  LoadPlugin: vi.fn(function LoadPluginMock() {
    return {
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
    }
  }),
  ListPlugins: vi.fn(function ListPluginsMock() {
    return { execute: mockListExecute }
  }),
  UninstallPlugin: vi.fn(function UninstallPluginMock() {
    return {
      execute: vi.fn().mockResolvedValue(undefined),
    }
  }),
  UpdatePlugin: vi.fn(function UpdatePluginMock() {
    return { execute: mockUpdate }
  }),
}))

import { UpdatePlugin } from '@specd/plugin-manager'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsUpdate } from '../../src/commands/plugins/update.js'

function setup(configOverrides: Parameters<typeof makeMockConfig>[0] = {}) {
  const kernel = makeMockKernel()
  const kernelSpies = attachKernelPluginSpies(kernel)
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({
      config: makeMockConfig({
        plugins: [{ name: '@specd/plugin-agent-claude' }, { name: '@specd/plugin-agent-copilot' }],
        ...configOverrides,
      }),
      configFilePath: '/project/specd.yaml',
      kernel,
    }),
  )
  const stdout = captureStdout()
  mockProcessExit()
  return { stdout, kernelSpies }
}

afterEach(() => {
  vi.clearAllMocks()
  const exit = process.exit as typeof process.exit & { mockRestore?: () => void }
  exit.mockRestore?.()
})

describe('plugins update', () => {
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

  it('updates a repeated plugin name once and reports the repeat as skipped', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync([
      'node',
      'specd',
      'plugins',
      'update',
      '@specd/plugin-agent-claude',
      '@specd/plugin-agent-claude',
      '--format',
      'json',
    ])
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(JSON.parse(stdout()).plugins).toEqual([
      {
        name: '@specd/plugin-agent-claude',
        status: 'updated',
        detail: "updated '@specd/plugin-agent-claude'",
      },
      { name: '@specd/plugin-agent-claude', status: 'skipped', detail: 'already processed' },
    ])
  })

  it('reports an error and exits 1 when a named plugin is not declared', async () => {
    const { stdout, kernelSpies } = setup()
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await expect(
      program.parseAsync([
        'node',
        'specd',
        'plugins',
        'update',
        '@acme/missing',
        '--format',
        'json',
      ]),
    ).rejects.toMatchObject({ code: 1 })
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(UpdatePlugin).toHaveBeenCalledTimes(1)
    expectNoKernelPluginCalls(kernelSpies)
    const parsed = JSON.parse(stdout())
    expect(parsed.plugins[0]).toMatchObject({
      name: '@acme/missing',
      status: 'error',
    })
    expect(parsed.hasErrors).toBe(true)
  })

  it('passes the recorded allowlist and does not write the config', async () => {
    setup({
      plugins: [{ name: '@acme/checks', contributions: ['lint'] }],
    })
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'update', '@acme/checks'])
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ contributions: ['lint'] }))
    expect(resolveCliContext).toHaveBeenCalledWith(expect.objectContaining({ plugins: false }))
  })

  it('continues after a failure and exits 1', async () => {
    const { stdout } = setup()
    mockUpdate.mockRejectedValueOnce(new Error('disk full'))
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await expect(
      program.parseAsync(['node', 'specd', 'plugins', 'update', '--format', 'json']),
    ).rejects.toMatchObject({ code: 1 })
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    const parsed = JSON.parse(stdout())
    expect(parsed.hasErrors).toBe(true)
    expect(parsed.plugins.map((entry: { status: string }) => entry.status)).toEqual([
      'error',
      'updated',
    ])
  })

  it('uses config.plugins as the declared set, not any plugin listing', async () => {
    const { kernelSpies } = setup()
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'update'])
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expectNoKernelPluginCalls(kernelSpies)
    expect(mockListExecute).not.toHaveBeenCalled()
    expect(mockWriterListPlugins).not.toHaveBeenCalled()
  })

  it('passes no contributions when the entry has no allowlist', async () => {
    setup()
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'update', '@specd/plugin-agent-claude'])
    expect(mockUpdate.mock.calls[0]?.[0]).not.toHaveProperty('contributions')
  })

  it('is idempotent: repeated runs never write specd.yaml', async () => {
    const { stdout } = setup()
    for (let run = 0; run < 2; run++) {
      const program = makeProgram()
      registerPluginsUpdate(program.command('plugins'))
      await program.parseAsync(['node', 'specd', 'plugins', 'update', '--format', 'json'])
    }
    expect(mockUpdate).toHaveBeenCalledTimes(4)
    expect(mockAddPlugin).not.toHaveBeenCalled()
    expect(mockRemovePlugin).not.toHaveBeenCalled()
    expect(stdout()).toContain('updated')
  })

  it('prints one text line per plugin with mixed results and exits 1', async () => {
    const { stdout } = setup()
    mockUpdate.mockRejectedValueOnce(new Error('disk full'))
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await expect(program.parseAsync(['node', 'specd', 'plugins', 'update'])).rejects.toMatchObject({
      code: 1,
    })
    const lines = stdout().trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('@specd/plugin-agent-claude  error  disk full')
    expect(lines[1]).toBe(
      "@specd/plugin-agent-copilot  updated  updated '@specd/plugin-agent-copilot'",
    )
  })

  it('prints an empty message when nothing is declared', async () => {
    const { stdout } = setup({ plugins: [] })
    const program = makeProgram()
    registerPluginsUpdate(program.command('plugins'))
    await program.parseAsync(['node', 'specd', 'plugins', 'update'])
    expect(stdout()).toContain('no plugins to update')
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
