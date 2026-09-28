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
import { ChangeNotFoundError, InvalidateRequiresForceError, SpecdError } from '@specd/sdk'
import { decode as decodeToon } from '@toon-format/toon'

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
      reason: 'rework needed',
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
    expect(out).toContain('reason:      rework needed')
    expect(out).toContain('policy:      none')
    expect(out).toContain('No artifacts were invalidated')
  })

  it.each(['json', 'toon'] as const)('exposes reason as a named %s field', async (format) => {
    const { kernel, stdout } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'implementing' },
      reason: 'semantic review',
      effectivePolicy: { artifacts: 'none', workflow: 'preserve' },
      affected: [],
      projectionChanges: [],
      automaticReturn: null,
      blockers: [{ code: 'ARTIFACT_REVIEW_REQUIRED', message: 'Review required' }],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Review the reported blockers before advancing',
        command: null,
      },
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
      'semantic review',
      '--format',
      format,
    ])

    const parsed = format === 'json' ? JSON.parse(stdout()) : decodeToon(stdout())
    expect(parsed).toMatchObject({
      name: 'feat',
      state: 'implementing',
      reason: 'semantic review',
      blockers: [{ code: 'ARTIFACT_REVIEW_REQUIRED' }],
      nextAction: { targetStep: 'implementing' },
    })
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
      '--artifact-policy',
      'surgical',
      '--force',
    ])

    expect(kernel.changes.invalidate.execute).toHaveBeenCalledWith({
      name: 'feat',
      reason: 'typo',
      targets: [{ artifactId: 'specs', specId: 'default:auth/login' }],
      policyOverride: { artifacts: 'surgical' },
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
      '--artifact-policy',
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
      'No artifacts were invalidated because the effective artifact policy is "none".',
    )
    expect(out).toContain('does not change the stored policy')
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
      '--artifact-policy',
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
    kernel.changes.invalidate.execute.mockRejectedValue(
      new InvalidateRequiresForceError([
        { gate: 'spec', target: 'designing' },
        { gate: 'signoff', target: 'done' },
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
        'approved-change',
        '--reason',
        'rework',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalled()
    expect(stderr()).toContain('--force')
    expect(stderr()).toContain('valid spec consent would be revoked; recovery target: designing')
    expect(stderr()).toContain('valid signoff consent would be revoked; recovery target: done')
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
        '--artifact-policy',
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

  it('passes a command-scoped policy override without the legacy scalar flag', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.invalidate.execute.mockResolvedValue({
      change: { name: 'feat', state: 'verifying' },
      effectivePolicy: { artifacts: 'none', workflow: 'preserve' },
      affected: [],
      projectionChanges: [
        {
          projection: 'verification',
          from: 'valid',
          to: 'stale',
          cause: 'manual-invalidation',
          differences: [],
        },
      ],
      automaticReturn: { cause: 'workflow-redesign', from: 'verifying', to: 'designing' },
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
      'withdraw review',
      '--artifact-policy',
      'none',
      '--workflow-policy',
      'preserve',
    ])

    expect(kernel.changes.invalidate.execute).toHaveBeenCalledWith({
      name: 'feat',
      reason: 'withdraw review',
      policyOverride: { artifacts: 'none', workflow: 'preserve' },
    })
    const out = stdout()
    expect(out).toContain('artifacts=none workflow=preserve')
    expect(out).toContain('command-scoped override')
    expect(out).toContain('stored policy was not changed')
    expect(out).toContain('does not clear existing drift')
    expect(out).toContain('verification valid → stale')
    expect(out).toContain('automatic return: verifying → designing (workflow-redesign)')
  })
})
