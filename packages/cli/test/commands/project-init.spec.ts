import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureStdout, makeMockConfig, makeProgram, mockProcessExit } from './helpers.js'

const mockInitProject = vi.fn().mockResolvedValue({
  configPath: '/project/specd.yaml',
  schemaRef: '@specd/schema-std',
  workspaces: ['default'],
})

vi.mock('@specd/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@specd/core')>()
  return {
    ...original,
    createConfigWriter: vi.fn(() => ({
      initProject: mockInitProject,
      addPlugin: vi.fn(),
      removePlugin: vi.fn(),
    })),
    createVcsAdapter: vi.fn().mockResolvedValue({
      rootDir: vi.fn().mockResolvedValue('/project'),
      branch: vi.fn().mockResolvedValue('main'),
      isClean: vi.fn().mockResolvedValue(true),
      ref: vi.fn().mockResolvedValue('abc1234'),
      show: vi.fn().mockResolvedValue(null),
    }),
  }
})

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/commands/plugins/install.js', () => ({
  installPluginsWithKernel: vi.fn(),
}))

import { createConfigWriter } from '@specd/core'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { installPluginsWithKernel } from '../../src/commands/plugins/install.js'
import { registerProjectInit } from '../../src/commands/project/init.js'
import { makeMockKernel } from './helpers.js'

function setup() {
  mockInitProject.mockResolvedValue({
    configPath: '/project/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: ['default'],
  })
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: makeMockConfig(),
    configFilePath: '/project/specd.yaml',
    kernel: makeMockKernel(),
  })
  vi.mocked(installPluginsWithKernel).mockResolvedValue({
    plugins: [],
    hasErrors: false,
  })
  const stdout = captureStdout()
  mockProcessExit()
  return { stdout }
}

afterEach(() => vi.restoreAllMocks())

describe('project init', () => {
  it('supports --plugin and installs selected plugins after init', async () => {
    setup()
    const program = makeProgram()
    registerProjectInit(program.command('project'))

    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
      '--plugin',
      '@specd/plugin-agent-claude',
    ])

    expect(mockInitProject).toHaveBeenCalledOnce()
    expect(installPluginsWithKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginNames: ['@specd/plugin-agent-claude'],
      }),
    )
  })

  it('supports --plugin with @specd/plugin-agent-opencode', async () => {
    setup()
    const program = makeProgram()
    registerProjectInit(program.command('project'))

    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
      '--plugin',
      '@specd/plugin-agent-opencode',
    ])

    expect(mockInitProject).toHaveBeenCalledOnce()
    expect(installPluginsWithKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginNames: ['@specd/plugin-agent-opencode'],
      }),
    )
  })

  it('outputs JSON with plugin results', async () => {
    const { stdout } = setup()
    vi.mocked(installPluginsWithKernel).mockResolvedValue({
      plugins: [{ name: '@specd/plugin-agent-claude', status: 'installed', detail: 'ok' }],
      hasErrors: false,
    })

    const program = makeProgram()
    registerProjectInit(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'init',
      '--workspace',
      'default',
      '--workspace-path',
      'specs/',
      '--plugin',
      '@specd/plugin-agent-claude',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.plugins).toEqual([
      { name: '@specd/plugin-agent-claude', status: 'installed', detail: 'ok' },
    ])
  })

  describe('specd init (top-level alias)', () => {
    it('exits 0 and calls createConfigWriter().initProject with specd init', async () => {
      setup()
      const program = makeProgram()
      registerProjectInit(program)

      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
      ])

      expect(createConfigWriter).toHaveBeenCalled()
      expect(mockInitProject).toHaveBeenCalledOnce()
      expect(mockInitProject).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaRef: '@specd/schema-std',
          workspaceId: 'default',
          specsPath: 'specs/',
        }),
      )
    })

    it('produces valid JSON output with specd init --format json', async () => {
      const { stdout } = setup()

      const program = makeProgram()
      registerProjectInit(program)
      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
        '--format',
        'json',
      ])

      const parsed = JSON.parse(stdout())
      expect(parsed.result).toBe('ok')
      expect(parsed.configPath).toBe('/project/specd.yaml')
      expect(parsed.schema).toBe('@specd/schema-std')
      expect(parsed.workspaces).toEqual(['default'])
    })

    it('exits 1 when specd.yaml exists and --force is not given', async () => {
      setup()
      mockInitProject.mockRejectedValue(new Error('already exists'))

      const program = makeProgram()
      registerProjectInit(program)

      await expect(
        program.parseAsync([
          'node',
          'specd',
          'init',
          '--workspace',
          'default',
          '--workspace-path',
          'specs/',
        ]),
      ).rejects.toThrow()
      expect(mockInitProject).toHaveBeenCalledOnce()
    })

    it('overwrites config with specd init --force', async () => {
      setup()

      const program = makeProgram()
      registerProjectInit(program)
      await program.parseAsync([
        'node',
        'specd',
        'init',
        '--workspace',
        'default',
        '--workspace-path',
        'specs/',
        '--force',
      ])

      expect(mockInitProject).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    })

    it('rejects excess positional arguments', async () => {
      const program = makeProgram()
      registerProjectInit(program)

      await expect(program.parseAsync(['node', 'specd', 'init', 'extra-arg'])).rejects.toThrow(
        /too many arguments/i,
      )
    })
  })
})
