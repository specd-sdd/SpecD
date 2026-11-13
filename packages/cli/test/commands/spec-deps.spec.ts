import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  makeMockHost,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

vi.mock('../../src/helpers/confirm.js', () => ({
  confirmOrExit: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { confirmOrExit } from '../../src/helpers/confirm.js'
import { registerSpecDeps } from '../../src/commands/spec/deps.js'
import {
  ArtifactConflictError,
  InvalidSpecIdError,
  InvalidSpecLockError,
  ReadOnlyWorkspaceError,
  SpecNotFoundError,
} from '@specd/sdk'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({
      config,
      configFilePath: null,
      kernel,
    }),
  )
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('spec deps', () => {
  it('documents structured output on all five leaves', () => {
    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    const group = program.commands[0]!.commands.find((c) => c.name() === 'deps')!
    expect(group.commands).toHaveLength(5)
    for (const leaf of group.commands) {
      const stdout = captureStdout()
      leaf.outputHelp()
      expect(stdout()).toContain('JSON/TOON output schema:')
      expect(stdout()).toContain('dependsOn: string[]')
      vi.restoreAllMocks()
    }
  })
  it('list delegates to kernel.specs.getPersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
      initialized: true,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'list', 'auth/login'])

    expect(kernel.specs.getPersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'auth/login',
    })
  })

  it('set delegates to kernel.specs.updatePersistedDeps', async () => {
    const { kernel } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: ['default:auth/shared'],
      created: false,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'set',
      'auth/login',
      '--dep',
      'default:auth/shared',
    ])

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'auth/login',
      set: ['default:auth/shared'],
    })
  })

  it('rejects --dep ""', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockRejectedValue(
      new InvalidSpecIdError('', 'must not be empty or blank'),
    )

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'deps', 'add', 'auth/login', '--dep', ''])
      .catch(() => {})

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'auth/login',
      add: [''],
    })
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when a dependency target is missing', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockRejectedValue(
      new SpecNotFoundError('default:auth/missing'),
    )

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program
      .parseAsync([
        'node',
        'specd',
        'spec',
        'deps',
        'add',
        'auth/login',
        '--dep',
        'default:auth/missing',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 on InvalidSpecLockError with the message and no stack', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockRejectedValue(
      new InvalidSpecLockError(
        'default:auth/login',
        'specs/auth/login/spec-lock.json',
        'dependsOn.0',
        'must be a fully-qualified valid spec ID',
      ),
    )

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'deps', 'list', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    const err = stderr()
    expect(err).toContain('dependsOn.0')
    expect(err).not.toMatch(/at\s+\S+\s+\(/)
  })
})

describe('spec deps clear confirmation', () => {
  it('clears after confirmation is accepted', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(confirmOrExit).mockResolvedValue(true)
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      created: false,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'clear', 'auth/login'])

    expect(confirmOrExit).toHaveBeenCalled()
    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'auth/login',
      clear: true,
    })
    expect(stdout()).toContain('dependsOn: (empty)')
  })

  it('prints cancelled when confirmation is declined', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(confirmOrExit).mockResolvedValue(false)

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'clear', 'auth/login'])

    expect(kernel.specs.updatePersistedDeps.execute).not.toHaveBeenCalled()
    expect(stdout()).toContain('cancelled')
  })

  it('skips confirmation with --force', async () => {
    const { kernel } = setup()
    vi.mocked(confirmOrExit).mockResolvedValue(true)
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      created: false,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'clear', 'auth/login', '--force'])

    expect(confirmOrExit).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })

  it('exits 1 when confirmOrExit rejects for a non-TTY shell', async () => {
    const { kernel, stderr } = setup()
    const { cliError } = await import('../../src/handle-error.js')
    vi.mocked(confirmOrExit).mockImplementation(() =>
      cliError('--clear requires confirmation; pass --force to skip it', 'text'),
    )

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'deps', 'clear', 'auth/login'])
      .catch(() => {})

    expect(kernel.specs.updatePersistedDeps.execute).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('--force')
  })
})

describe('spec deps uninitialized and clear wording (audit hardening)', () => {
  it('list prints a not-initialized hint when no durable state exists', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      initialized: false,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'list', 'auth/login'])

    expect(stdout()).toContain('not initialized')
    expect(stdout()).not.toContain('dependsOn: (empty)')
  })

  it('list prints dependsOn: (empty) for an initialized spec with no deps', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      initialized: true,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'list', 'auth/login'])

    expect(stdout()).toContain('dependsOn: (empty)')
  })

  it('json output carries initialized', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      initialized: false,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'list',
      'auth/login',
      '--format',
      'json',
    ])

    expect(JSON.parse(stdout())).toMatchObject({ initialized: false, dependsOn: [] })
  })

  it('remove on an uninitialized spec says nothing was removed', async () => {
    const { kernel, stdout } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      created: false,
      initialized: false,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'deps',
      'remove',
      'auth/login',
      '--dep',
      'default:auth/shared',
    ])

    expect(stdout()).toContain('nothing was removed')
  })

  it('clear confirmation does not mention --clear', async () => {
    const { kernel } = setup()
    vi.mocked(confirmOrExit).mockResolvedValue(true)
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockResolvedValue({
      specId: 'default:auth/login',
      dependsOn: [],
      created: false,
      initialized: true,
    })

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'clear', 'auth/login'])

    const call = vi.mocked(confirmOrExit).mock.calls[0]![0]
    expect(call.nonInteractiveMessage).not.toContain('--clear')
    expect(call.nonInteractiveMessage).toContain('--force')
  })

  it('exits 1 when the use case rejects with an invalid spec ID', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.getPersistedDeps.execute).mockRejectedValue(
      new InvalidSpecIdError('Bad Id', 'contains a space'),
    )

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'deps', 'list', 'Bad Id']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('Bad Id')
  })
})

describe('spec deps error mapping (audit hardening)', () => {
  it('forwards --dep "a,b" as one value and exits 1 when rejected', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockRejectedValue(
      new InvalidSpecIdError('a,b', "segment 'a,b' is invalid"),
    )

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'deps', 'add', 'auth/login', '--dep', 'a,b'])
      .catch(() => {})

    expect(kernel.specs.updatePersistedDeps.execute).toHaveBeenCalledWith({
      specId: 'auth/login',
      add: ['a,b'],
    })
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('a,b')
  })

  it('exits 1 on ArtifactConflictError', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockRejectedValue(
      new ArtifactConflictError('spec-lock.json', 'new', 'old'),
    )

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'deps', 'add', 'auth/login', '--dep', 'auth/shared'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('save aborted')
  })

  it('exits 1 on ReadOnlyWorkspaceError', async () => {
    const { kernel, stderr } = setup()
    vi.mocked(kernel.specs.updatePersistedDeps.execute).mockRejectedValue(
      ReadOnlyWorkspaceError.forSpec('ro:auth/login', 'ro'),
    )

    const program = makeProgram()
    registerSpecDeps(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'deps', 'clear', 'ro:auth/login', '--force'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('readOnly')
  })
})
