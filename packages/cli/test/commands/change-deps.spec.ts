/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerChangeDeps } from '../../src/commands/change/deps.js'
import { ChangeNotFoundError, SpecNotInChangeError } from '@specd/core'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, kernel })
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
      specId: 'auth/login',
      dependsOn: ['auth/shared', 'auth/jwt'],
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
    expect(out).toContain('updated deps for auth/login in change add-auth')
    expect(out).toContain('dependsOn: auth/shared, auth/jwt')
  })

  it('Remove deps from a spec in the change', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'auth/login',
      dependsOn: ['auth/shared'],
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

    expect(stdout()).toContain('dependsOn: auth/shared')
  })

  it('Set (replace) deps for a spec', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'auth/login',
      dependsOn: ['auth/session'],
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

    expect(stdout()).toContain('dependsOn: auth/session')
    expect(kernel.changes.updateSpecDeps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ set: ['auth/session'] }),
    )
  })
})

describe('Output', () => {
  it('JSON output format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.updateSpecDeps.execute.mockResolvedValue({
      specId: 'auth/login',
      dependsOn: ['auth/shared'],
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
    expect(parsed.specId).toBe('auth/login')
    expect(Array.isArray(parsed.dependsOn)).toBe(true)
  })

  it('No deps remaining shows none', async () => {
    const { kernel, stdout } = setup()
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

  it('Error when no flags provided', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeDeps(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'deps', 'add-auth', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
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
})
