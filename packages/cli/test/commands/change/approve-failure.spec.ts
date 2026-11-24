import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeMockChange,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  makeMockHost,
} from '../helpers.js'

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { registerChangeApprove } from '../../../src/commands/change/approve.js'
import { SpecdError } from '@specd/sdk'

class ApprovalBlockedError extends SpecdError {
  override get code(): string {
    return 'APPROVAL_BLOCKED'
  }

  constructor() {
    super('approval is blocked')
  }
}

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({ config, configFilePath: null, kernel }),
  )
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

async function runApprove(
  gate: 'spec' | 'signoff',
  nextAction: Record<string, unknown>,
  format: 'text' | 'json' = 'text',
) {
  const { kernel, stdout, stderr } = setup()
  const useCase = gate === 'spec' ? kernel.changes.approveSpec : kernel.changes.approveSignoff
  useCase.execute.mockRejectedValue(new ApprovalBlockedError())
  kernel.changes.status.execute.mockResolvedValue({
    change: makeMockChange({ name: 'my-change', state: 'ready' }),
    artifactStatuses: [],
    blockers: [{ code: 'X', message: 'blocked', checkId: 'a.b', isSkippable: true }],
    nextAction: { targetStep: 'ready', actionType: 'cognitive', reason: 'Do it', ...nextAction },
  })
  const program = makeProgram()
  registerChangeApprove(program.command('change'))
  await program
    .parseAsync([
      'node',
      'specd',
      'change',
      'approve',
      gate,
      'my-change',
      '--reason',
      'ok',
      ...(format === 'json' ? ['--format', 'json'] : []),
    ])
    .catch(() => {})
  return { stdout: stdout(), stderr: stderr() }
}

describe('change approve failure path', () => {
  it.each(['spec', 'signoff'] as const)(
    'prints a guidance line for %s when nextAction.command is null',
    async (gate) => {
      const { stderr } = await runApprove(gate, {
        intent: null,
        action: { kind: '@security.audit-fix', guidance: 'pnpm audit:fix' },
      })
      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr).toContain('guidance: pnpm audit:fix')
      expect(stderr).toContain('reason: Do it')
      expect(stderr).toContain('next action: (none)')
    },
  )

  it('prints the command and no guidance when the action maps to a command', async () => {
    const { stderr } = await runApprove('spec', { intent: 'design' })
    expect(stderr).toContain('next action: /specd-design')
    expect(stderr).not.toContain('guidance:')
  })

  it('projects intent, action and guidance in the structured error payload', async () => {
    const action = { kind: '@security.audit-fix', guidance: 'pnpm audit:fix' }
    const { stdout } = await runApprove('spec', { intent: null, action }, 'json')
    const payload = JSON.parse(stdout.trim().split('\n').pop()!) as {
      metadata: { state: string; nextAction?: Record<string, unknown> }
    }
    expect(payload.metadata.state).toBe('ready')
    expect(payload.metadata.nextAction).toMatchObject({
      command: null,
      guidance: 'pnpm audit:fix',
      intent: null,
      action,
    })
  })
})

class GetterOnlyError extends SpecdError {
  override get code(): string {
    return 'GETTER_ONLY'
  }

  get state(): string {
    return 'original'
  }

  get blockers(): readonly unknown[] {
    return []
  }

  constructor() {
    super('getter-only failure')
  }
}

describe('change approve failure ordering and read-only errors', () => {
  it('prints the error line before state, labelled blocker, bypass and next action', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.approveSpec.execute.mockRejectedValue(new ApprovalBlockedError())
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
      blockers: [
        { code: 'X', message: 'blocked', label: 'My label', checkId: 'a.b', isSkippable: true },
      ],
      nextAction: {
        targetStep: 'ready',
        actionType: 'cognitive',
        reason: 'Do it',
        intent: 'design',
      },
    })
    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'approve', 'spec', 'my-change', '--reason', 'ok'])
      .catch(() => {})
    const err = stderr()
    const iError = err.indexOf('error: ')
    const iState = err.indexOf('state: ready')
    const iBlocker = err.indexOf('! X — My label: blocked')
    const iNext = err.indexOf('next action: /specd-design')
    expect(iError).toBeGreaterThanOrEqual(0)
    expect(iState).toBeGreaterThan(iError)
    expect(iBlocker).toBeGreaterThan(iState)
    expect(iNext).toBeGreaterThan(iBlocker)
    expect(err).toContain('bypass: --skip-checks a.b')
    expect(err).not.toContain('blocker:')
  })

  it('prints the error line, then state, blocker, next action, guidance and reason in order', async () => {
    const { stderr } = await runApprove('spec', {
      intent: null,
      action: { kind: '@security.audit-fix', guidance: 'pnpm audit:fix' },
    })
    const iError = stderr.indexOf('error: ')
    const iState = stderr.indexOf('state: ready')
    const iBlocker = stderr.indexOf('! X: blocked')
    const iNext = stderr.indexOf('next action: (none)')
    const iGuidance = stderr.indexOf('guidance: pnpm audit:fix')
    const iReason = stderr.indexOf('reason: Do it')
    expect(iError).toBeGreaterThanOrEqual(0)
    expect(iState).toBeGreaterThan(iError)
    expect(iBlocker).toBeGreaterThan(iState)
    expect(iNext).toBeGreaterThan(iBlocker)
    expect(iGuidance).toBeGreaterThan(iNext)
    expect(iReason).toBeGreaterThan(iGuidance)
  })

  it.each(['spec', 'signoff'] as const)(
    'rejects an invalid --format for %s before the use case mutates',
    async (gate) => {
      const { kernel, stderr } = setup()
      const useCase = gate === 'spec' ? kernel.changes.approveSpec : kernel.changes.approveSignoff
      const program = makeProgram()
      registerChangeApprove(program.command('change'))
      await program
        .parseAsync([
          'node',
          'specd',
          'change',
          'approve',
          gate,
          'my-change',
          '--reason',
          'ok',
          '--format',
          'bogus',
        ])
        .catch(() => {})
      expect(useCase.execute).not.toHaveBeenCalled()
      expect(kernel.changes.status.execute).not.toHaveBeenCalled()
      expect(stderr()).toContain("invalid format 'bogus'")
      expect(process.exit).toHaveBeenCalledWith(1)
    },
  )

  it('does not throw when the error exposes getter-only state and blockers', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.approveSpec.execute.mockRejectedValue(new GetterOnlyError())
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      artifactStatuses: [],
      blockers: [{ code: 'X', message: 'blocked' }],
      nextAction: {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Do it',
        intent: null,
      },
    })
    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'approve',
        'spec',
        'my-change',
        '--reason',
        'ok',
        '--format',
        'json',
      ])
      .catch(() => {})
    expect(stderr()).toContain('error: getter-only failure')
    const payload = JSON.parse(stdout().trim().split('\n').pop()!) as {
      code: string
      metadata: { state: string; blockers: { code: string }[] }
    }
    expect(payload.code).toBe('GETTER_ONLY')
    expect(payload.metadata.state).toBe('designing')
    expect(payload.metadata.blockers[0]!.code).toBe('X')
  })

  it('does not throw for a frozen error', async () => {
    const { kernel, stderr } = setup()
    const frozen = Object.freeze(new ApprovalBlockedError())
    kernel.changes.approveSpec.execute.mockRejectedValue(frozen)
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
      blockers: [{ code: 'X', message: 'blocked' }],
      nextAction: { targetStep: 'ready', actionType: 'cognitive', reason: 'Do it', intent: null },
    })
    const program = makeProgram()
    registerChangeApprove(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'approve', 'spec', 'my-change', '--reason', 'ok'])
      .catch(() => {})
    expect(stderr()).toContain('error: approval is blocked')
    expect(stderr()).toContain('state: ready')
    expect(stderr()).toContain('! X: blocked')
    // Reflect.defineProperty returned false for the frozen error: it stays untouched.
    expect(Object.prototype.hasOwnProperty.call(frozen, 'state')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(frozen, 'blockers')).toBe(false)
    expect(process.exit).toHaveBeenCalledWith(1)
  })
})

describe('change approve --help', () => {
  it.each(['spec', 'signoff'] as const)(
    'documents state, approval, intent, action, guidance and bypassFlag for %s',
    async (gate) => {
      const { stdout } = setup()
      const program = makeProgram()
      registerChangeApprove(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'approve', gate, '--help'])
        .catch(() => {})
      const help = stdout()
      for (const term of ['state', 'approval', 'intent', 'action', 'guidance', 'bypassFlag']) {
        expect(help).toContain(term)
      }
    },
  )
})
