import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { CommanderError } from 'commander'
import {
  makeMockConfig,
  makeMockKernel,
  makeMockChange,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
  makeMockHost,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/helpers/cli-context.js')>()
  return {
    ...actual,
    resolveCliContext: vi.fn(),
  }
})

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerChangeCreate } from '../../src/commands/change/create.js'
import {
  ChangeAlreadyExistsError,
  createKernel,
  DEFAULT_INVALIDATION_POLICY,
  InvalidInputError,
  InvalidSpecIdError,
  ReadOnlyWorkspaceError,
  WorkspaceNotFoundError,
  type Kernel,
  type SpecdConfig,
} from '@specd/sdk'
import { buildCliKernelOptions } from '../../src/helpers/cli-context.js'

function setup(configOverrides: Record<string, unknown> = {}) {
  const config = makeMockConfig(configOverrides)
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({ config, configFilePath: null, kernel }),
  )
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Invalid invalidation policy', () => {
  it('rejects an unknown --artifact-policy value with exit 1', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'create', 'feat', '--artifact-policy', 'sugical'])
      .catch(() => {})

    expect(kernel.changes.create.execute).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('sugical')
  })
})

describe('Command signature', () => {
  it('documents changePath in its structured output', () => {
    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    const stdout = captureStdout()
    program.commands[0]!.commands.find((c) => c.name() === 'create')!.outputHelp()
    expect(stdout()).toContain('JSON/TOON output schema:')
    expect(stdout()).toContain('changePath: string')
  })
  it('Missing name argument', async () => {
    setup()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'create'])).rejects.toThrow(
      CommanderError,
    )
  })

  it('No --spec flag creates change with empty specIds', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting', specIds: [] }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'my-change'])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: [] }),
    )
    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ includeOverlapCheck: true }),
    )
    expect(stdout()).toContain('created change my-change')
  })
})

describe('Workspace resolution', () => {
  it('forwards a bare spec ID raw to the use case', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'auth/login',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: ['auth/login'] }),
    )
  })

  it('forwards an explicit workspace-qualified ID raw', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'billing-ws:invoices',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: ['billing-ws:invoices'] }),
    )
    expect(stdout()).toContain('created change my-change')
  })

  it('maps WorkspaceNotFoundError for an unknown workspace', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockRejectedValue(new WorkspaceNotFoundError('nonexistent-ws'))

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'create',
        'my-change',
        '--spec',
        'nonexistent-ws:some/path',
      ])
      .catch(() => {})

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: ['nonexistent-ws:some/path'] }),
    )
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('forwards a comma-containing ID as one value', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockRejectedValue(
      new InvalidSpecIdError('auth/a,b', "segment 'a,b' is invalid"),
    )

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'create', 'my-change', '--spec', 'auth/a,b'])
      .catch(() => {})

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: ['auth/a,b'] }),
    )
    expect(stderr()).toMatch(/error:/)
  })

  it('does not import helpers/spec-path and the helper file is gone', async () => {
    const source = await fs.readFile(
      new URL('../../src/commands/change/create.ts', import.meta.url),
      'utf-8',
    )
    expect(source).not.toContain('helpers/spec-path')
    await expect(
      fs.access(new URL('../../src/helpers/spec-path.ts', import.meta.url)),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('Output on success', () => {
  it('Successful creation', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'add-login', state: 'drafting' }),
      changePath: '/tmp/test-changes/add-login',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'add-login',
      '--spec',
      'auth/login',
    ])

    expect(stdout()).toContain('created change add-login')
    expect(stderr()).toBe('')
  })

  it('JSON output on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'add-login', state: 'drafting' }),
      changePath: '/tmp/test-changes/add-login',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'add-login',
      '--spec',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.state).toBe('drafting')
    expect(parsed.name).toBe('add-login')
    expect(parsed.changePath).toBe('/tmp/test-changes/add-login')
  })
})

describe('Duplicate name error', () => {
  it('Name already exists', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockRejectedValue(new ChangeAlreadyExistsError('my-change'))

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'create', 'my-change', '--spec', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

describe('Schema resolution delegation', () => {
  it('does not call getActiveSchema in the CLI handler', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'my-change'])

    expect(kernel.specs.getActiveSchema.execute).not.toHaveBeenCalled()
    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({
        schemaName: expect.anything(),
        schemaVersion: expect.anything(),
      }),
    )
  })

  it('passes includeOverlapCheck when specs are present', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'auth/login',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ includeOverlapCheck: true }),
    )
    expect(kernel.changes.detectOverlap.execute).not.toHaveBeenCalled()
  })
})

describe('Overlap warning delegation', () => {
  it('emits stderr warning from create result overlapReport', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
      overlapReport: {
        hasOverlap: true,
        entries: [
          {
            specId: 'default:auth/login',
            changes: [{ name: 'other-change', state: 'designing' }],
          },
        ],
      },
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'auth/login',
    ])

    expect(stderr()).toContain('warning: spec overlap detected')
    expect(kernel.changes.detectOverlap.execute).not.toHaveBeenCalled()
  })
})

describe('ReadOnly workspace rejection', () => {
  it('maps ReadOnlyWorkspaceError from the use case', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockRejectedValue(
      new ReadOnlyWorkspaceError(
        'Cannot add --spec "platform:auth/tokens" to change — workspace "platform" is readOnly.',
      ),
    )

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'create',
        'my-change',
        '--spec',
        'platform:auth/tokens',
      ])
      .catch(() => {})

    expect(kernel.changes.create.execute).toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('workspace "platform" is readOnly')
  })
})

describe('create gaps (audit hardening)', () => {
  it('maps an invalid change name rejected by core', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockRejectedValue(
      new InvalidSpecIdError('Bad Id', 'contains a space'),
    )

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'create', 'my-change', '--spec', 'Bad Id'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("'Bad Id'")
  })

  it('prints every readOnly offender line for mixed owned/readOnly specs', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockRejectedValue(
      new ReadOnlyWorkspaceError(
        'Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.\n\nReadOnly workspaces are protected.',
      ),
    )

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'create',
        'my-change',
        '--spec',
        'default:auth/login',
        '--spec',
        'platform:auth/tokens',
      ])
      .catch(() => {})

    const err = stderr()
    expect(err).toContain('platform:auth/tokens')
    expect(err).not.toContain('Cannot add spec "default:auth/login"')
  })

  it('prints one line per readOnly offender for multiple readOnly specs', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.create.execute.mockRejectedValue(
      new ReadOnlyWorkspaceError(
        [
          'Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.',
          'Cannot add spec "vendor:lib/core" to change — workspace "vendor" is readOnly.',
          '',
          'ReadOnly workspaces are protected.',
        ].join('\n'),
      ),
    )

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'create',
        'my-change',
        '--spec',
        'platform:auth/tokens',
        '--spec',
        'vendor:lib/core',
      ])
      .catch(() => {})

    const err = stderr()
    expect(err).toContain('platform:auth/tokens')
    expect(err).toContain('vendor:lib/core')
  })
})

describe('Integration (real kernel)', () => {
  let tmpDir: string
  let config: SpecdConfig
  let kernel: Kernel

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-change-create-int-'))
    const specsPath = path.join(tmpDir, 'specs')
    const changesPath = path.join(tmpDir, '.specd', 'changes')
    const draftsPath = path.join(tmpDir, '.specd', 'drafts')
    const discardedPath = path.join(tmpDir, '.specd', 'discarded')
    const archivePath = path.join(tmpDir, '.specd', 'archive')
    await Promise.all([
      fs.mkdir(specsPath, { recursive: true }),
      fs.mkdir(changesPath, { recursive: true }),
      fs.mkdir(draftsPath, { recursive: true }),
      fs.mkdir(discardedPath, { recursive: true }),
      fs.mkdir(archivePath, { recursive: true }),
    ])
    execSync('git init', { cwd: tmpDir })
    execSync('git config user.email test@example.com', { cwd: tmpDir })
    execSync('git config user.name Test User', { cwd: tmpDir })
    config = {
      projectRoot: tmpDir,
      configPath: path.join(tmpDir, 'specd.yaml'),
      schemaRef: '@specd/schema-std',
      workspaces: [
        {
          name: 'default',
          specsPath,
          specsAdapter: { adapter: 'fs', config: { path: specsPath } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: tmpDir,
          ownership: 'owned',
          isExternal: false,
        },
      ],
      storage: {
        changesPath,
        changesAdapter: { adapter: 'fs', config: { path: changesPath } },
        draftsPath,
        draftsAdapter: { adapter: 'fs', config: { path: draftsPath } },
        discardedPath,
        discardedAdapter: { adapter: 'fs', config: { path: discardedPath } },
        archivePath,
        archiveAdapter: { adapter: 'fs', config: { path: archivePath } },
      },
      approvals: { spec: false, signoff: false },
      invalidation: DEFAULT_INVALIDATION_POLICY,
    }
    kernel = await createKernel(config, buildCliKernelOptions())
    vi.mocked(resolveCliContext).mockResolvedValue(
      makeMockHost({
        config,
        configFilePath: config.configPath,
        kernel,
      }),
    )
    mockProcessExit()
  }, 20_000)

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('persists effective schema identity on manifest without CLI schema prelude', async () => {
    const executeSpy = vi.spyOn(kernel.changes.create, 'execute')
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'my-change', '--format', 'json'])

    expect(executeSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({
        schemaName: expect.anything(),
        schemaVersion: expect.anything(),
      }),
    )

    const parsed = JSON.parse(stdout()) as { result: string; changePath: string }
    expect(parsed.result).toBe('ok')

    const manifest = JSON.parse(
      await fs.readFile(path.join(parsed.changePath, 'manifest.json'), 'utf8'),
    ) as {
      schema: { name: string; version: number }
      history: Array<{ type: string; schemaName?: string; schemaVersion?: number }>
    }

    expect(manifest.schema).toEqual({ name: 'schema-std', version: 1 })
    const created = manifest.history.find((event) => event.type === 'created')
    expect(created?.schemaName).toBe('schema-std')
    expect(created?.schemaVersion).toBe(1)
  }, 20_000)

  it('emits overlap warning from real DetectOverlap when another change targets the spec', async () => {
    await kernel.changes.create.execute({
      name: 'existing-change',
      specIds: ['default:auth/login'],
      includeOverlapCheck: false,
    })

    const stdout = captureStdout()
    const stderr = captureStderr()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--spec',
      'auth/login',
    ])

    expect(stderr()).toContain('warning: spec overlap detected')
    expect(stderr()).toContain('existing-change')
    expect(stdout()).toContain('created change my-change')
  }, 20_000)
})

describe('structured invalidation policy flags', () => {
  it('passes config defaults when neither policy flag is set', async () => {
    const { kernel } = setup({
      invalidation: { artifacts: 'global', workflow: 'redesign' },
    })
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'my-change'])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        invalidation: { artifacts: 'global', workflow: 'redesign' },
      }),
    )
  })

  it('overlays only the artifact flag and keeps the configured workflow', async () => {
    const { kernel } = setup({
      invalidation: { artifacts: 'global', workflow: 'preserve' },
    })
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--artifact-policy',
      'surgical',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        invalidation: { artifacts: 'surgical', workflow: 'preserve' },
      }),
    )
  })

  it('overlays only the workflow flag and keeps the configured artifact policy', async () => {
    const { kernel } = setup({
      invalidation: { artifacts: 'surgical', workflow: 'preserve' },
    })
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })
    const program = makeProgram()
    registerChangeCreate(program.command('change'))

    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--workflow-policy',
      'redesign',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        invalidation: { artifacts: 'surgical', workflow: 'redesign' },
      }),
    )
  })

  it('passes both explicit policy dimensions together', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })
    const program = makeProgram()
    registerChangeCreate(program.command('change'))

    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-change',
      '--artifact-policy',
      'none',
      '--workflow-policy',
      'redesign',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        invalidation: { artifacts: 'none', workflow: 'redesign' },
      }),
    )
  })

  it('rejects an unknown workflow policy before create', async () => {
    const { kernel, stderr } = setup()
    const program = makeProgram()
    registerChangeCreate(program.command('change'))

    await program
      .parseAsync(['node', 'specd', 'change', 'create', 'my-change', '--workflow-policy', 'rewind'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("invalid --workflow-policy 'rewind'")
    expect(kernel.changes.create.execute).not.toHaveBeenCalled()
  })

  it('rejects an unknown artifact policy before create', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'create', 'my-change', '--artifact-policy', 'wide'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("invalid --artifact-policy 'wide'")
    expect(kernel.changes.create.execute).not.toHaveBeenCalled()
  })

  it('outputs TOON format with --format toon', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-toon-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-toon-change',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'my-toon-change',
      '--spec',
      'auth/login',
      '--format',
      'toon',
    ])

    const out = stdout()
    expect(out).toContain('result: ok')
    expect(out).toContain('name: my-toon-change')
    expect(out).toContain('state: drafting')
    expect(out).toContain('changePath:')
  })
})
