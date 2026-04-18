import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
  UpdatePlugin: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  })),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerPluginsUpdate } from '../../src/commands/plugins/update.js'

function setup() {
  const kernel = makeMockKernel()
  kernel.project.listPlugins.execute.mockResolvedValue([
    { name: '@specd/plugin-agent-claude' },
    { name: '@specd/plugin-agent-copilot' },
  ])
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: makeMockConfig(),
    configFilePath: '/project/specd.yaml',
    kernel,
  })
  const stdout = captureStdout()
  mockProcessExit()
  return { stdout }
}

afterEach(() => vi.clearAllMocks())

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
})
