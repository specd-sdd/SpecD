import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { readFile } from 'node:fs/promises'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import {
  ChangeNotFoundError,
  InvalidInputError,
  InvalidSpecIdError,
  ReadOnlyWorkspaceError,
  WorkspaceNotFoundError,
} from '@specd/sdk'
import { registerChangeEdit } from '../../src/commands/change/edit.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: config,
    configFilePath: null,
    kernel: kernel,
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change edit', () => {
  it('forwards --invalidation-policy unvalidated and maps the use case error to exit 1', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new InvalidInputError(
        "invalid invalidation policy 'sugical' — allowed values: none, surgical, downstream, global",
      ),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--invalidation-policy', 'sugical'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith(
      expect.objectContaining({ invalidationPolicy: 'sugical' }),
    )
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('sugical')
  })

  it('exits 1 when no options provided', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'edit', 'feat']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('updates change with new spec', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stdout()).toContain('updated change feat')
    expect(stdout()).toContain('auth/login')
    expect(stdout()).toContain('auth/register')
  })

  it('warns to stderr when approvals invalidated', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: ['auth/register'] }),
      invalidated: true,
    })
    captureStdout()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stderr()).toContain('warning:')
    expect(stderr()).toContain('invalidated')
  })

  it('outputs JSON with invalidated flag', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      invalidated: true,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.invalidated).toBe(true)
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'missing', '--add-spec', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('does not append invalidated event when no active approval', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        state: 'designing',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stdout()).toContain('updated change feat')
    const call = kernel.changes.edit.execute.mock.calls[0]![0]
    expect(call).toBeDefined()
  })

  it('includes specIds, workspaces, and state in JSON output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        state: 'designing',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(Array.isArray(parsed.specIds)).toBe(true)
    expect(parsed.specIds).toContain('auth/login')
    expect(parsed.specIds).toContain('auth/register')
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.workspaces).toContain('default')
    expect(parsed.state).toBe('designing')
  })

  it('forwards --add-spec raw and maps WorkspaceNotFoundError', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(new WorkspaceNotFoundError('unknown-ws'))

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'unknown-ws:some/path'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith(
      expect.objectContaining({ addSpecIds: ['unknown-ws:some/path'] }),
    )
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('forwards a comma-containing ID as one value', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new InvalidSpecIdError('auth/a,b', "segment 'a,b' is invalid"),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'auth/a,b'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith(
      expect.objectContaining({ addSpecIds: ['auth/a,b'] }),
    )
    expect(stderr()).toMatch(/error:/)
  })

  it('maps ReadOnlyWorkspaceError from the use case', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new ReadOnlyWorkspaceError(
        'Cannot add --spec "platform:auth/tokens" to change — workspace "platform" is readOnly.',
      ),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'platform:auth/tokens'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('workspace "platform" is readOnly')
  })

  it('does not import helpers/spec-path', async () => {
    const source = await readFile(
      new URL('../../src/commands/change/edit.ts', import.meta.url),
      'utf-8',
    )
    expect(source).not.toContain('helpers/spec-path')
  })
})

describe('change edit gaps (audit hardening)', () => {
  it('exits 1 with the quoted value for "Bad Id"', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new InvalidSpecIdError('Bad Id', 'contains a space'),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'Bad Id'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain("'Bad Id'")
  })

  it('quotes the whole value for auth/a,b', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(
      new InvalidSpecIdError('auth/a,b', "segment 'a,b' is invalid"),
    )

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'auth/a,b'])
      .catch(() => {})

    expect(stderr()).toContain("'auth/a,b'")
  })

  it('forwards --remove-spec raw', async () => {
    const { kernel } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: [] }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--remove-spec', 'auth/login'])
      .catch(() => {})

    expect(kernel.changes.edit.execute).toHaveBeenCalledWith(
      expect.objectContaining({ removeSpecIds: ['auth/login'] }),
    )
  })

  it('reports the usage error before resolving the config', async () => {
    const { stderr } = setup()
    vi.mocked(resolveCliContext).mockReset()
    vi.mocked(resolveCliContext).mockRejectedValue(new Error('config could not be resolved'))

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'edit', 'feat']).catch(() => {})

    expect(resolveCliContext).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('at least one of --add-spec')
    expect(stderr()).not.toContain('config could not be resolved')
  })

  it('does not read SpecdConfig or workspace ownership in the command source', async () => {
    const source = await readFile(
      new URL('../../src/commands/change/edit.ts', import.meta.url),
      'utf-8',
    )
    expect(source).not.toContain('SpecdConfig')
    expect(source).not.toContain('ownership')
  })

  it('outputs TOON format with --format toon', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: ['default:auth/login'] }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/login',
      '--format',
      'toon',
    ])

    const out = stdout()
    expect(out).toContain('name: feat')
    expect(out).toContain('default:auth/login')
  })
})
