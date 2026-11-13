import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureStdout, makeMockConfig, makeProgram, mockProcessExit } from './helpers.js'

const mockInitProject = vi.fn().mockResolvedValue({
  configPath: '/project/specd.yaml',
  schemaRef: '@specd/schema-std',
  workspaces: ['default'],
  metadataCachePath: '.specd/metadata',
})

vi.mock('@specd/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@specd/sdk')>()
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

const clackMock = vi.hoisted(() => ({
  validators: new Map<string, (value: string | undefined) => string | undefined>(),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  isCancel: vi.fn(() => false),
  confirm: vi.fn().mockResolvedValue(true),
  multiselect: vi.fn().mockResolvedValue([]),
  text: vi.fn(
    async (opts: {
      message: string
      initialValue?: string
      validate?: (value: string | undefined) => string | undefined
    }) => {
      if (opts.validate !== undefined) clackMock.validators.set(opts.message, opts.validate)
      return opts.initialValue ?? ''
    },
  ),
}))

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/commands/plugins/install.js', () => ({
  installPluginsWithKernel: vi.fn(),
}))

import { createConfigWriter } from '@specd/sdk'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { installPluginsWithKernel } from '../../src/commands/plugins/install.js'
import { registerProjectInit } from '../../src/commands/project/init.js'
import { makeMockKernel } from './helpers.js'

function setup() {
  mockInitProject.mockResolvedValue({
    configPath: '/project/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: ['default'],
    metadataCachePath: '.specd/metadata',
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

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('project init', () => {
  it('documents its structured output', () => {
    const program = makeProgram()
    registerProjectInit(program.command('project'))
    const stdout = captureStdout()
    program.commands[0]!.commands.find((c) => c.name() === 'init')!.outputHelp()
    expect(stdout()).toContain('JSON/TOON output schema:')
    expect(stdout()).toContain('metadataCachePath: string')
  })
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
      expect(parsed.metadataCachePath).toBe('.specd/metadata')
    })

    it('prints metadata cache line in text output', async () => {
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
      ])

      expect(stdout()).toContain('metadata cache: .specd/metadata (ignored in .gitignore)')
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

describe('project init workspace id validation (audit hardening)', () => {
  it.each(['a', 'Core', 'nul'])('rejects --workspace %j without writing files', async (id) => {
    setup()
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const program = makeProgram()
    registerProjectInit(program)
    await program
      .parseAsync(['node', 'specd', 'init', '--workspace', id, '--workspace-path', 'specs/'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    const err = stderr.mock.calls.map((call) => String(call[0])).join('')
    expect(err).toContain(`'${id}'`)
    expect(err).toContain('a-z')
    expect(mockInitProject).not.toHaveBeenCalled()
  })

  it('does not trim the typed value', async () => {
    setup()
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const program = makeProgram()
    registerProjectInit(program)
    await program
      .parseAsync(['node', 'specd', 'init', '--workspace', ' ab ', '--workspace-path', 'specs/'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr.mock.calls.map((call) => String(call[0])).join('')).toContain("' ab '")
    expect(mockInitProject).not.toHaveBeenCalled()
  })

  it('accepts a two-character workspace id', async () => {
    setup()

    const program = makeProgram()
    registerProjectInit(program)
    await program.parseAsync([
      'node',
      'specd',
      'init',
      '--workspace',
      'ab',
      '--workspace-path',
      'specs/',
    ])

    expect(mockInitProject).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ab' }))
  })

  it('wizard validator rejects the same ids and accepts default/ab', async () => {
    setup()
    const original = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      clackMock.validators.clear()
      const program = makeProgram()
      registerProjectInit(program)
      await program.parseAsync(['node', 'specd', 'init']).catch(() => {})

      const validate = clackMock.validators.get('Default workspace ID')!
      expect(validate).toBeDefined()
      for (const bad of ['a', 'Core', 'nul', ' ab ']) {
        expect(validate(bad)).toContain(`'${bad}'`)
      }
      expect(validate('default')).toBeUndefined()
      expect(validate('ab')).toBeUndefined()
    } finally {
      if (original !== undefined) Object.defineProperty(process.stdout, 'isTTY', original)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
  })

  it('has no ad hoc workspace-name regex in the CLI sources', async () => {
    const { readdir, readFile } = await import('node:fs/promises')
    const root = new URL('../../src/', import.meta.url)
    const entries = await readdir(root, { recursive: true })
    const offenders: string[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.ts')) continue
      const content = await readFile(new URL(entry, root), 'utf8')
      if (content.includes('[a-z][a-z0-9-]')) offenders.push(entry)
    }
    expect(offenders).toEqual([])
  })
})
