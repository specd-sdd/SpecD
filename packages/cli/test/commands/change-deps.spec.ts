import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  makeMockHost,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/helpers/cli-context.js')>()),
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/helpers/confirm.js', () => ({
  confirmOrExit: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { confirmOrExit } from '../../src/helpers/confirm.js'
import { registerChangeDeps } from '../../src/commands/change/deps.js'
import {
  ChangeNotFoundError,
  InvalidSpecIdError,
  SpecNotInChangeError,
  WorkspaceNotFoundError,
  createKernel,
  type SpecdConfig,
} from '@specd/sdk'
import { buildCliKernelOptions } from '../../src/helpers/cli-context.js'

function setup() {
  const config = makeMockConfig()
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

describe('Command signature', () => {
  it('Add deps to a spec in the change', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared', 'default:auth/jwt'],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--add',
      'auth/shared',
      '--add',
      'auth/jwt',
    ])

    const out = stdout()
    expect(out).toContain('updated deps for default:auth/login in change add-auth')
    expect(out).toContain('dependsOn: default:auth/shared, default:auth/jwt')
  })

  it('Remove deps from a spec in the change', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--remove',
      'auth/jwt',
    ])

    expect(stdout()).toContain('dependsOn: default:auth/shared')
  })

  it('Set (replace) deps for a spec', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/session'],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--set',
      'auth/session',
    ])

    expect(stdout()).toContain('dependsOn: default:auth/session')
    expect(kernel.changes.updateSpecDeps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ set: ['auth/session'] }),
    )
  })
})

describe('Core-to-CLI dependency output', () => {
  it('renders normalized IDs from a real kernel mutation', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-change-deps-int-'))
    try {
      const specsPath = path.join(tmpDir, 'specs')
      const changesPath = path.join(tmpDir, '.specd', 'changes')
      const draftsPath = path.join(tmpDir, '.specd', 'drafts')
      const discardedPath = path.join(tmpDir, '.specd', 'discarded')
      const archivePath = path.join(tmpDir, '.specd', 'archive')
      await Promise.all(
        [specsPath, changesPath, draftsPath, discardedPath, archivePath].map((dir) =>
          fs.mkdir(dir, { recursive: true }),
        ),
      )
      execFileSync('git', ['init', '-q'], { cwd: tmpDir })
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir })
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      const config: SpecdConfig = {
        projectRoot: tmpDir,
        configPath: path.join(tmpDir, 'specd.yaml'),
        schemaRef: '@specd/schema-std',
        plugins: [],
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
        invalidation: { artifacts: 'downstream', workflow: 'preserve' },
      }
      const kernel = await createKernel(config, buildCliKernelOptions())
      await kernel.changes.create.execute({ name: 'add-auth', specIds: ['auth/login'] })
      vi.mocked(resolveCliContext).mockResolvedValue(
        makeMockHost({
          config,
          configFilePath: config.configPath,
          kernel,
        }),
      )
      const stdout = captureStdout()
      mockProcessExit()

      const program = makeProgram()
      registerChangeDeps(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'add-auth',
        'auth/login',
        '--add',
        'auth/shared',
        '--add',
        'auth/jwt',
      ])

      expect(stdout()).toContain('updated deps for default:auth/login in change add-auth')
      expect(stdout()).toContain('dependsOn: default:auth/shared, default:auth/jwt')
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('Output', () => {
  it('JSON output format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--add',
      'auth/shared',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('add-auth')
    expect(parsed.specId).toBe('default:auth/login')
    expect(parsed.dependsOn).toEqual(['default:auth/shared'])
  })

  it('No deps remaining shows none', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--remove',
      'auth/shared',
    ])

    expect(stdout()).toContain('dependsOn: (none)')
  })
})

describe('Error cases', () => {
  it('Error when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.updateSpecDeps.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'nonexistent',
        'auth/login',
        '--add',
        'auth/shared',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('Error when specId not in change.specIds', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.updateSpecDeps.execute.mockRejectedValue(
      new SpecNotInChangeError('billing/invoices', 'add-auth'),
    )

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'add-auth',
        'billing/invoices',
        '--add',
        'auth/shared',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('Error when --set used with --add', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'add-auth',
        'auth/login',
        '--set',
        'auth/session',
        '--add',
        'auth/shared',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
    expect(stderr()).toContain('mutually exclusive')
  })

  it('List all dependencies in the change', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: {
        name: 'add-auth',
        specIds: ['auth/login', 'auth/logout'],
      },
      specDependsOn: {
        'auth/login': ['auth/shared'],
      },
      artifactStatuses: [],
      lifecycle: {},
      implementationTracking: { trackedFiles: [], links: [] },
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'deps', 'add-auth'])

    const out = stdout()
    expect(out).toContain('spec dependencies for change add-auth:')
    expect(out).toContain('- auth/login: auth/shared')
    expect(out).toContain('- auth/logout: (none)')
  })

  it('Display dependencies for a specific spec via GetChangeSpecDeps', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getSpecDeps.execute.mockResolvedValue({
      name: 'add-auth',
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', 'auth/login'])

    const out = stdout()
    expect(kernel.changes.getSpecDeps.execute).toHaveBeenCalledWith({
      name: 'add-auth',
      specId: 'auth/login',
    })
    expect(kernel.changes.status.execute).not.toHaveBeenCalled()
    expect(out).toContain('spec dependencies for default:auth/login in change add-auth:')
    expect(out).toContain('dependsOn: default:auth/shared')
  })

  it('Error when modification flags provided without specId', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', '--add', 'auth/shared'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
    expect(stderr()).toContain('require a specId')
  })

  it('Error when removing non-existent dep', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.updateSpecDeps.execute.mockRejectedValue(
      new ChangeNotFoundError('dep auth/shared not found'),
    )

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'add-auth',
        'auth/login',
        '--remove',
        'auth/shared',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('Error when --clear used with --add', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'add-auth',
        'auth/login',
        '--clear',
        '--add',
        'auth/shared',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('mutually exclusive')
  })

  it.each([
    ['--remove', 'auth/shared'],
    ['--set', 'auth/shared'],
  ] as const)('Error when --clear used with %s', async (flag, value) => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'add-auth',
        'auth/login',
        '--clear',
        flag,
        value,
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('mutually exclusive')
  })

  it('Error when --clear provided without specId', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', '--clear'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('require a specId')
  })

  it('rejects --set "" before storing anything', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.updateSpecDeps.execute.mockRejectedValue(
      new InvalidSpecIdError('', 'must not be empty or blank'),
    )

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', 'auth/login', '--set', ''])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
    expect(kernel.changes.updateSpecDeps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ set: [''] }),
    )
  })

  it('forwards --set "core:a,b" as one ID', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.updateSpecDeps.execute.mockRejectedValue(
      new InvalidSpecIdError('core:a,b', "segment 'a,b' is invalid"),
    )

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'add-auth',
        'auth/login',
        '--set',
        'core:a,b',
      ])
      .catch(() => {})

    expect(kernel.changes.updateSpecDeps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ set: ['core:a,b'] }),
    )
    expect(stderr()).toMatch(/error:/)
  })

  it('forwards the raw bare specId untouched', async () => {
    const { kernel } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--add',
      'auth/shared',
    ])

    expect(kernel.changes.updateSpecDeps.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'add-auth',
        specId: 'auth/login',
        add: ['auth/shared'],
      }),
    )
  })
})

describe('Clear confirmation', () => {
  it('clears after confirmation is accepted', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(confirmOrExit).mockResolvedValue(true)
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'auth/login',
      dependsOn: [],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--clear',
    ])

    expect(confirmOrExit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Clear all dependencies of auth/login?' }),
    )
    expect(kernel.changes.updateSpecDeps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ clear: true }),
    )
    expect(stdout()).toContain('dependsOn: (none)')
  })

  it('prints cancelled and exits 0 when confirmation is declined', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(confirmOrExit).mockResolvedValue(false)

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--clear',
    ])

    expect(kernel.changes.updateSpecDeps.execute).not.toHaveBeenCalled()
    expect(stdout()).toContain('cancelled')
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('skips confirmation with --force', async () => {
    const { kernel } = setup()
    vi.mocked(confirmOrExit).mockResolvedValue(true)
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'auth/login',
      dependsOn: [],
    })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--clear',
      '--force',
    ])

    expect(confirmOrExit).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
        nonInteractiveMessage: '--clear requires confirmation; pass --force to skip it',
      }),
    )
    expect(kernel.changes.updateSpecDeps.execute).toHaveBeenCalled()
  })

  it('exits 1 when confirmOrExit rejects for a non-TTY shell', async () => {
    const { kernel, stderr } = setup()
    const { cliError } = await import('../../src/handle-error.js')
    vi.mocked(confirmOrExit).mockImplementation(() =>
      cliError('--clear requires confirmation; pass --force to skip it', 'text'),
    )

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', 'auth/login', '--clear'])
      .catch(() => {})

    expect(kernel.changes.updateSpecDeps.execute).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('--force')
  })
})

describe('Display mode (audit hardening)', () => {
  const shown = {
    name: 'add-auth',
    specId: 'default:auth/login',
    dependsOn: ['default:auth/shared', 'core:storage'],
  }

  it('prints the normalized ID and deps in JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getSpecDeps.execute.mockResolvedValue(shown)

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--format',
      'json',
    ])

    expect(JSON.parse(stdout())).toEqual({
      result: 'ok',
      name: 'add-auth',
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared', 'core:storage'],
    })
  })

  it('prints the normalized ID and deps in TOON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getSpecDeps.execute.mockResolvedValue(shown)

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'deps',
      'add-auth',
      'auth/login',
      '--format',
      'toon',
    ])

    const out = stdout()
    expect(out).toContain('default:auth/login')
    expect(out).toContain('core:storage')
  })

  it('prints (none) for empty deps', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.getSpecDeps.execute.mockResolvedValue({ ...shown, dependsOn: [] })

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', 'auth/login'])

    expect(stdout()).toContain('dependsOn: (none)')
  })

  it.each([
    ['Bad Id', new InvalidSpecIdError('Bad Id', 'contains a space')],
    ['nope:auth/login', new WorkspaceNotFoundError('nope', { specId: 'nope:auth/login' })],
  ])('maps the use-case error for %j to exit 1', async (specId, error) => {
    const { kernel, stderr } = setup()
    kernel.changes.getSpecDeps.execute.mockRejectedValue(error)

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', specId])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain(specId)
  })

  it('forwards the raw typed value (blank included) to the use case', async () => {
    const { kernel } = setup()
    kernel.changes.getSpecDeps.execute.mockRejectedValue(new InvalidSpecIdError('', 'blank'))

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', ' ']).catch(() => {})

    expect(kernel.changes.getSpecDeps.execute).toHaveBeenCalledWith({
      name: 'add-auth',
      specId: ' ',
    })
  })

  it('rejects a blank --add value through updateSpecDeps', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.updateSpecDeps.execute.mockRejectedValue(new InvalidSpecIdError(' ', 'blank'))

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', 'auth/login', '--add', ' '])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('lists --clear and --force in the help output', () => {
    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    const help = program.commands[0]!.commands.find((c) => c.name() === 'deps')!.helpInformation()

    expect(help).toContain('--clear')
    expect(help).toContain('--force')
  })

  it('does not import parseSpecId or call listWorkspaces in the command source', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(
      new URL('../../src/commands/change/deps.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toContain('parseSpecId')
    expect(source).not.toContain('listWorkspaces')
  })

  it('renders centralized operation-flags hint when UpdateSpecDeps throws InvalidInputError', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.updateSpecDeps.execute.mockRejectedValue(
      Object.assign(new Error('set is mutually exclusive with add, remove, and clear'), {
        specd: true,
        code: 'INVALID_INPUT',
      }),
    )

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'deps',
        'add-auth',
        'auth/login',
        '--set',
        'auth/session',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('set is mutually exclusive')
    expect(stderr()).toContain('--add, --remove, --set, or --clear')
  })
})
