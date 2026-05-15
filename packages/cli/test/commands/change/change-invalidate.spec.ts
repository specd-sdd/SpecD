import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from '../helpers.js'

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { registerChangeInvalidate } from '../../../src/commands/change/invalidate.js'
import { ChangeNotFoundError, SpecdError } from '@specd/core'

class TestInvalidateRequiresForceError extends SpecdError {
  override get code(): string {
    return 'INVALIDATE_REQUIRES_FORCE'
  }

  constructor() {
    super(
      'Change has an active approval or signoff. Use --force to return the change to designing and invalidate the active approval/signoff.',
    )
  }
}

class TestInvalidInvalidateTargetError extends SpecdError {
  override get code(): string {
    return 'INVALID_INVALIDATE_TARGET'
  }

  constructor(errors: readonly string[]) {
    super(`Invalid targets:\n${errors.map((error) => `  - ${error}`).join('\n')}`)
  }
}

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change invalidate', () => {
  it('minimal invocation with --reason outputs text with change state', async () => {
    const { kernel, stdout } = setup()
    const mockChange = { name: 'my-change', state: 'designing' }
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: mockChange,
      effectivePolicy: 'none',
      affected: [],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'invalidate',
      'my-change',
      '--reason',
      'rework needed',
    ])

    const out = stdout()
    expect(out).toContain('change:      my-change')
    expect(out).toContain('state:       designing')
    expect(out).toContain('policy:      none')
    expect(out).toContain('No artifacts were invalidated')
  })

  it('passes name, reason, targets, policy, and force to execute', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'surgical',
      affected: [
        {
          artifactId: 'specs',
          key: 'default:auth/login',
          filename: 'spec.md',
          expansion: 'direct',
        },
      ],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'invalidate',
      'feat',
      '--reason',
      'typo',
      '--target',
      'specs@default:auth/login',
      '--policy',
      'surgical',
      '--force',
    ])

    expect(kernel.changes.invalidate.execute).toHaveBeenCalledWith({
      name: 'feat',
      reason: 'typo',
      targets: [{ artifactId: 'specs', specId: 'default:auth/login' }],
      policyOverride: 'surgical',
      force: true,
    })
  })

  it('parses bare artifactId target (no @)', async () => {
    const { kernel } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'surgical',
      affected: [
        { artifactId: 'proposal', key: 'proposal', filename: 'proposal.md', expansion: 'direct' },
      ],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'invalidate',
      'feat',
      '--reason',
      'redo',
      '--target',
      'proposal',
      '--policy',
      'surgical',
    ])

    expect(kernel.changes.invalidate.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [{ artifactId: 'proposal' }],
      }),
    )
  })

  it('renders affected files grouped by artifact in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'downstream',
      affected: [
        {
          artifactId: 'specs',
          key: 'default:auth/login',
          filename: 'spec.md',
          expansion: 'direct',
        },
        {
          artifactId: 'specs',
          key: 'default:auth/login',
          filename: 'verify.md',
          expansion: 'direct',
        },
        { artifactId: 'design', key: 'design', filename: 'design.md', expansion: 'downstream' },
      ],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'invalidate',
      'feat',
      '--reason',
      'rework',
      '--target',
      'specs@default:auth/login',
    ])

    const out = stdout()
    expect(out).toContain('policy:      downstream')
    expect(out).toContain('affected:')
    expect(out).toContain('  specs:')
    expect(out).toContain('    - default:auth/login  spec.md')
    expect(out).toContain('    - default:auth/login  verify.md')
    expect(out).toContain('  design:')
    expect(out).toContain('    - design  design.md  (downstream)')
  })

  it('preserves linear DAG-forest artifact order in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'downstream',
      affected: [
        { artifactId: 'proposal', key: 'proposal', filename: 'proposal.md', expansion: 'direct' },
        { artifactId: 'verify', key: 'verify', filename: 'verify.md', expansion: 'direct' },
        { artifactId: 'design', key: 'design', filename: 'design.md', expansion: 'downstream' },
        { artifactId: 'tasks', key: 'tasks', filename: 'tasks.md', expansion: 'downstream' },
        { artifactId: 'notes', key: 'notes', filename: 'notes.md', expansion: 'downstream' },
      ],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'invalidate',
      'feat',
      '--reason',
      'rework',
      '--target',
      'proposal',
      '--target',
      'verify',
    ])

    const out = stdout()
    const proposalIndex = out.indexOf('  proposal:')
    const verifyIndex = out.indexOf('  verify:')
    const designIndex = out.indexOf('  design:')
    const tasksIndex = out.indexOf('  tasks:')
    const notesIndex = out.indexOf('  notes:')

    expect(proposalIndex).toBeGreaterThan(-1)
    expect(verifyIndex).toBeGreaterThan(proposalIndex)
    expect(designIndex).toBeGreaterThan(verifyIndex)
    expect(tasksIndex).toBeGreaterThan(designIndex)
    expect(notesIndex).toBeGreaterThan(tasksIndex)
  })

  it('renders "no artifacts were affected" when affected is empty but policy is not none', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'downstream',
      affected: [],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'invalidate', 'feat', '--reason', 'check'])

    const out = stdout()
    expect(out).toContain('No artifacts were affected.')
  })

  it('renders none policy informational message', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'none',
      affected: [],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'invalidate',
      'feat',
      '--reason',
      'review',
    ])

    const out = stdout()
    expect(out).toContain(
      'No artifacts were invalidated because the effective invalidation policy is "none".',
    )
    expect(out).toContain('Use --policy <policy> to force a different propagation policy')
  })

  it('--format json outputs structured result', async () => {
    const { kernel, stdout } = setup()
    const affected = [
      { artifactId: 'specs', key: 'default:auth/login', filename: 'spec.md', expansion: 'direct' },
    ]
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'surgical',
      affected,
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'invalidate',
      'feat',
      '--reason',
      'fix',
      '--target',
      'specs@default:auth/login',
      '--policy',
      'surgical',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout()) as {
      name: string
      state: string
      effectivePolicy: string
      affected: Array<{ artifactId: string; key: string; filename: string; expansion: string }>
    }
    expect(parsed.name).toBe('feat')
    expect(parsed.state).toBe('designing')
    expect(parsed.effectivePolicy).toBe('surgical')
    expect(parsed.affected).toHaveLength(1)
    expect(parsed.affected[0]?.artifactId).toBe('specs')
    expect(parsed.affected[0]?.expansion).toBe('direct')
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.invalidate.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'invalidate', 'missing', '--reason', 'test'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits with error when approval guard blocks without --force', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.invalidate.execute.mockRejectedValue(new TestInvalidateRequiresForceError())

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'invalidate',
        'approved-change',
        '--reason',
        'rework',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalled()
    expect(stderr()).toContain('--force')
    expect(stderr()).toContain('invalidate the active approval/signoff')
  })

  it('exits with error when targets are invalid for policy', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.invalidate.execute.mockRejectedValue(
      new TestInvalidInvalidateTargetError([
        "At least one --target is required with policy 'surgical'",
      ]),
    )

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'invalidate',
        'feat',
        '--reason',
        'test',
        '--policy',
        'surgical',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalled()
    expect(stderr()).toContain('At least one --target')
  })

  it('does not pass targets when none provided', async () => {
    const { kernel } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'downstream',
      affected: [],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'invalidate', 'feat', '--reason', 'test'])

    const call = kernel.changes.invalidate.execute.mock.calls[0]
    const input = call?.[0] as Record<string, unknown>
    expect(input.targets).toBeUndefined()
  })

  it('does not pass force when flag is absent', async () => {
    const { kernel } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'designing' },
      effectivePolicy: 'downstream',
      affected: [],
    })

    const program = makeProgram()
    registerChangeInvalidate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'invalidate', 'feat', '--reason', 'test'])

    const call = kernel.changes.invalidate.execute.mock.calls[0]
    const input = call?.[0] as Record<string, unknown>
    expect(input.force).toBeUndefined()
  })
})
