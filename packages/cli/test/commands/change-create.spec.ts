import { describe, it, expect, vi, afterEach } from 'vitest'
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
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerChangeCreate } from '../../src/commands/change/create.js'
import { ChangeAlreadyExistsError } from '@specd/core'

function setup(configOverrides: Record<string, unknown> = {}) {
  const config = makeMockConfig(configOverrides)
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Command signature', () => {
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
    expect(stdout()).toContain('created change my-change')
  })
})

describe('Workspace resolution', () => {
  it('Workspace prefix omitted defaults to default', async () => {
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
      expect.objectContaining({ specIds: ['default:auth/login'] }),
    )
  })

  it('Explicit workspace prefix used', async () => {
    const { kernel, stdout } = setup({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned' as const,
          isExternal: false,
        },
        {
          name: 'billing-ws',
          specsPath: '/project/billing/specs',
          schemasPath: null,
          codeRoot: '/project/billing',
          ownership: 'owned' as const,
          isExternal: false,
        },
      ],
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
      '--spec',
      'billing-ws:invoices',
    ])

    expect(kernel.changes.create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specIds: ['billing-ws:invoices'] }),
    )
    expect(stdout()).toContain('created change my-change')
  })

  it('Unknown workspace prefix', async () => {
    const { stderr } = setup()

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

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
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

describe('ReadOnly workspace rejection', () => {
  it('rejects --spec targeting readOnly workspace', async () => {
    const { kernel, stderr } = setup({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned' as const,
          isExternal: false,
        },
        {
          name: 'platform',
          specsPath: '/external/platform/specs',
          schemasPath: null,
          codeRoot: '/external/platform',
          ownership: 'readOnly' as const,
          isExternal: true,
        },
      ],
    })

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

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('workspace "platform" is readOnly')
    expect(kernel.changes.create.execute).not.toHaveBeenCalled()
  })
})
