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
import { registerChangeTransition } from '../../../src/commands/change/transition.js'
import { registerChangeStatus } from '../../../src/commands/change/status.js'
import {
  InvalidStateTransitionError,
  HookFailedError,
  ReadOnlyWorkspaceError,
  ArchiveImplementationStateError,
  HappyPathNextUnavailableError,
  CheckPredicateFailedError,
  CheckNotSkippableError,
  UnknownCheckError,
} from '@specd/sdk'

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

describe('Command signature', () => {
  it('Missing arguments', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/either <step> or --next is required/)
    expect(kernel.changes.transition.execute).not.toHaveBeenCalled()
  })

  it('rejects a missing change name without calling TransitionChange', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    program.exitOverride()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition']).catch(() => {})

    expect(stderr()).toMatch(/missing required argument 'name'/)
    expect(kernel.changes.transition.execute).not.toHaveBeenCalled()
  })

  it('rejects combining explicit step with --next', async () => {
    const { kernel, stderr } = setup()

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/mutually exclusive/)
    expect(kernel.changes.transition.execute).not.toHaveBeenCalled()
  })

  it('resolves target from --next without positional step', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])

    expect(kernel.changes.refreshImplementationTracking.execute).not.toHaveBeenCalled()
    expect(kernel.changes.status.execute).toHaveBeenCalledWith({
      name: 'my-change',
      refreshImplementationTracking: false,
    })
    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'next' }),
      expect.any(Function),
    )
    expect(stdout()).toContain('transitioned my-change: drafting')
  })

  it('keeps --next as a nearest-step request when status recommends an optional shortcut', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
      blockers: [],
      nextAction: {
        targetStep: 'verifying',
        actionType: 'mechanical',
        reason: 'The optional implementing step can be bypassed',
        command: 'specd changes transition my-change verifying',
      },
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])

    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'next' }),
      expect.any(Function),
    )
    expect(stdout()).toContain('ready → implementing')
    expect(stdout()).not.toContain('verifying')
  })

  it('Allow-out-of-scope is forwarded to execute', async () => {
    const { kernel } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'verifying' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'transition',
      'my-change',
      'verifying',
      '--allow-out-of-scope',
    ])

    const call = kernel.changes.transition.execute.mock.calls[0]![0]
    expect(call.skipChecks).toContain('impl.linksInScope')
  })

  it('Allow-out-of-scope is omitted by default', async () => {
    const { kernel } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])

    const call = kernel.changes.transition.execute.mock.calls[0]![0]
    expect(call.skipChecks).toEqual([])
  })

  it('Transition execute omits approval flags', async () => {
    const { kernel } = setup({
      approvals: { spec: true, signoff: false },
    })
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'implementing'])

    const call = kernel.changes.transition.execute.mock.calls[0]![0] as Record<string, unknown>
    expect(call.to).toBe('implementing')
    expect(call.skipHookPhases).toEqual(new Set())
    expect(call.allowOutOfScope).toBeUndefined()
    expect(call).not.toHaveProperty('approvals')
    expect(call).not.toHaveProperty('approvalsSpec')
    expect(call).not.toHaveProperty('approvalsSignoff')
  })
})

describe('Approval-gate routing', () => {
  it('does not rewrite ready → implementing into pending-spec-approval', async () => {
    const { kernel, stdout } = setup({
      approvals: { spec: true, signoff: false },
    })
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'implementing'])

    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'implementing' }),
      expect.any(Function),
    )
    const out = stdout()
    expect(out).toContain('transitioned my-change: ready → implementing')
    expect(out).not.toContain('pending-spec-approval')
  })

  it('does not rewrite done → archivable into pending-signoff', async () => {
    const { kernel, stdout } = setup({
      approvals: { spec: false, signoff: true },
    })
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'done' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'archivable' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'archivable'])

    const out = stdout()
    expect(out).toContain('transitioned my-change: done → archivable')
    expect(out).not.toContain('pending-signoff')
  })

  it('resolves ready --next to implementing without pending routing', async () => {
    const { kernel, stdout } = setup({
      approvals: { spec: true, signoff: false },
    })
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])

    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'next' }),
      expect.any(Function),
    )
    expect(stdout()).toContain('implementing')
    expect(stdout()).not.toContain('pending-spec-approval')
  })

  it('exits 1 when spec gate blocks ready → implementing without pending routing', async () => {
    const { kernel, stdout, stderr } = setup({
      approvals: { spec: true, signoff: false },
    })
    kernel.changes.status.execute
      .mockResolvedValueOnce({
        change: makeMockChange({ name: 'my-change', state: 'ready' }),
        artifactStatuses: [],
      })
      .mockResolvedValueOnce({
        change: makeMockChange({ name: 'my-change', state: 'ready' }),
        artifactStatuses: [],
        blockers: [
          {
            code: 'APPROVAL_REQUIRED',
            label: 'Waiting for spec approval',
            message: 'Spec approval required before implementation',
          },
        ],
        nextAction: {
          targetStep: 'ready',
          actionType: 'human',
          reason: 'Spec approval required',
          intent: null,
          action: { kind: 'approve-spec' },
        },
      })
    kernel.changes.transition.execute.mockRejectedValue(
      new CheckPredicateFailedError(
        'approval.spec',
        'Checking spec approval',
        'APPROVAL_REQUIRED',
        'Spec approval required',
        { kind: 'approve-spec' },
        { gate: 'spec' },
        false,
        { from: 'ready', to: 'implementing' },
      ),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'implementing'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stdout()).not.toContain('pending-spec-approval')
    expect(stdout()).not.toContain('transitioned')
    expect(stderr()).toContain('repair guide:')
    expect(kernel.changes.status.execute).toHaveBeenNthCalledWith(2, {
      name: 'my-change',
      refreshImplementationTracking: false,
    })
  })

  it('exits 1 when signoff gate blocks done → archivable without pending routing', async () => {
    const { kernel, stdout, stderr } = setup({
      approvals: { spec: false, signoff: true },
    })
    kernel.changes.status.execute
      .mockResolvedValueOnce({
        change: makeMockChange({ name: 'my-change', state: 'done' }),
        artifactStatuses: [],
      })
      .mockResolvedValueOnce({
        change: makeMockChange({ name: 'my-change', state: 'done' }),
        artifactStatuses: [],
        blockers: [
          {
            code: 'APPROVAL_REQUIRED',
            label: 'Waiting for signoff',
            message: 'Signoff required before archiving',
          },
        ],
        nextAction: {
          targetStep: 'done',
          actionType: 'human',
          reason: 'Signoff required',
          intent: null,
          action: { kind: 'approve-signoff' },
        },
      })
    kernel.changes.transition.execute.mockRejectedValue(
      new CheckPredicateFailedError(
        'approval.signoff',
        'Checking human signoff',
        'APPROVAL_REQUIRED',
        'Signoff required before archiving',
        { kind: 'approve-signoff' },
        { gate: 'signoff' },
        false,
        { from: 'done', to: 'archivable' },
      ),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'archivable'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stdout()).not.toContain('pending-signoff')
    expect(stdout()).not.toContain('transitioned')
    expect(stderr()).toContain('repair guide:')
  })

  it('exits 1 when spec gate blocks ready --next without pending routing', async () => {
    const { kernel, stdout, stderr } = setup({
      approvals: { spec: true, signoff: false },
    })
    kernel.changes.status.execute
      .mockResolvedValueOnce({
        change: makeMockChange({ name: 'my-change', state: 'ready' }),
        artifactStatuses: [],
      })
      .mockResolvedValueOnce({
        change: makeMockChange({ name: 'my-change', state: 'ready' }),
        artifactStatuses: [],
        blockers: [{ code: 'APPROVAL_REQUIRED', message: 'Spec approval required' }],
        nextAction: {
          targetStep: 'ready',
          actionType: 'human',
          reason: 'Spec approval required',
          intent: null,
          action: { kind: 'approve-spec' },
        },
      })
    kernel.changes.transition.execute.mockRejectedValue(
      new CheckPredicateFailedError(
        'approval.spec',
        'Checking spec approval',
        'APPROVAL_REQUIRED',
        'Spec approval required',
        { kind: 'approve-spec' },
        { gate: 'spec' },
        false,
        { from: 'ready', to: 'implementing' },
      ),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'next' }),
      expect.any(Function),
    )
    expect(stdout()).not.toContain('pending-spec-approval')
    expect(stderr()).toContain('repair guide:')
  })

  it('resolves signed-off --next to archivable', async () => {
    const { kernel } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'signed-off' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'archivable' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])

    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'next' }),
      expect.any(Function),
    )
  })
})

describe('Pre- and post-hooks', () => {
  it('Hook failure', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new HookFailedError('lint', 1, 'lint failed output'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(2)
    expect(stderr()).not.toContain('repair guide:')
    expect(stdout()).not.toContain('repair guide:')
  })

  it('renders failed hook progress via check bus before transition failure', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockImplementation((_input, onProgress) => {
      onProgress?.({ type: 'check-start', id: 'hook.pre', label: 'Running pre hooks' })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-start',
        hookId: 'lint',
        command: 'pnpm lint',
        message: 'pnpm lint',
      })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-output',
        hookId: 'lint',
        stream: 'stdout',
        line: 'line-a',
      })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-output',
        hookId: 'lint',
        stream: 'stderr',
        line: 'line-b',
      })
      onProgress?.({
        type: 'check-done',
        id: 'hook.pre',
        label: 'Running pre hooks',
        outcome: 'fail',
        reason: 'Hook failed: lint',
      })
      throw new HookFailedError('lint', 1, 'line-a\nline-b\n')
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])
      .catch(() => {})

    const output = stderr()
    expect(output).toContain('Running pre hooks (hook.pre)')
    expect(output).toContain('command: pnpm lint')
    expect(output).toContain('  | line-a')
    expect(output).toContain('  ! line-b')
    expect(output).toContain('✗ Running pre hooks: Hook failed: lint')
    expect(output).not.toContain('Executing:')
    expect(process.exit).toHaveBeenCalledWith(2)
  })
})

describe('Output on success', () => {
  it('Successful direct transition', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])

    const out = stdout()
    expect(out).toContain('transitioned my-change: drafting')
    expect(out).toContain('designing')
  })

  it('JSON output on successful transition', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockImplementation((_input, onProgress) => {
      onProgress?.({ type: 'check-start', id: 'hook.pre', label: 'Running pre hooks' })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-start',
        hookId: 'lint',
        command: 'pnpm lint',
        message: 'pnpm lint',
      })
      onProgress?.({
        type: 'check-done',
        id: 'hook.pre',
        label: 'Running pre hooks',
        outcome: 'pass',
      })
      onProgress?.({ type: 'transitioned', from: 'drafting', to: 'designing' })
      return {
        change: makeMockChange({ name: 'my-change', state: 'designing' }),
      }
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'transition',
      'my-change',
      'designing',
      '--format',
      'json',
    ])

    expect(stderr()).toBe('')
    const lines = stdout()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines[0]).toEqual({
      stream: 'change-transition',
      event: { type: 'check-start', id: 'hook.pre', label: 'Running pre hooks' },
    })
    expect(lines[1]).toEqual({
      stream: 'change-transition',
      event: {
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-start',
        hookId: 'lint',
        command: 'pnpm lint',
        message: 'pnpm lint',
      },
    })
    expect(lines[2]).toEqual({
      stream: 'change-transition',
      event: {
        type: 'check-done',
        id: 'hook.pre',
        label: 'Running pre hooks',
        outcome: 'pass',
      },
    })
    expect(lines[3]).toEqual({
      stream: 'change-transition',
      event: { type: 'transitioned', from: 'drafting', to: 'designing' },
    })
    expect(lines[4]).toEqual({
      stream: 'change-transition',
      event: {
        type: 'complete',
        result: { result: 'ok', name: 'my-change', from: 'drafting', to: 'designing' },
      },
    })
    expect(lines.every((line) => line.stream !== 'hook-progress')).toBe(true)
  })

  it('renders check progress to stderr before transition success', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockImplementation((_input, onProgress) => {
      onProgress?.({ type: 'check-start', id: 'hook.pre', label: 'Running pre hooks' })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-start',
        hookId: 'lint',
        command: 'pnpm lint',
        message: 'pnpm lint',
      })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-output',
        hookId: 'lint',
        stream: 'stdout',
        line: 'running lint',
      })
      onProgress?.({
        type: 'check-progress',
        id: 'hook.pre',
        label: 'Running pre hooks',
        detail: 'hook-heartbeat',
        hookId: 'lint',
        elapsedMs: 5000,
        message: '5s',
      })
      onProgress?.({
        type: 'check-done',
        id: 'hook.pre',
        label: 'Running pre hooks',
        outcome: 'pass',
      })
      onProgress?.({ type: 'transitioned', from: 'drafting', to: 'designing' })
      return {
        change: makeMockChange({ name: 'my-change', state: 'designing' }),
      }
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])

    const output = stderr()
    expect(output).toContain('Running pre hooks (hook.pre)')
    expect(output).toContain('command: pnpm lint')
    expect(output).toContain('running lint')
    expect(output).toContain('still running (5s)')
    expect(output).toContain('✓ Running pre hooks')
    expect(output).not.toContain('Executing:')
  })

  it('renders predicate check progress with gerund label and no Executing prefix', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockImplementation((_input, onProgress) => {
      onProgress?.({
        type: 'check-start',
        id: 'impl.linksInScope',
        label: 'Checking implementation links',
      })
      onProgress?.({
        type: 'check-done',
        id: 'impl.linksInScope',
        label: 'Checking implementation links',
        outcome: 'pass',
      })
      onProgress?.({ type: 'transitioned', from: 'implementing', to: 'verifying' })
      return {
        change: makeMockChange({ name: 'my-change', state: 'verifying' }),
      }
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])

    const output = stderr()
    expect(output).toContain('Checking implementation links (impl.linksInScope)')
    expect(output).toContain('✓ Checking implementation links')
    expect(output).not.toContain('Executing:')
  })
})

describe('Invalid transition error', () => {
  it('Illegal state transition', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
      blockers: [],
      nextAction: {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: '...',
        intent: 'design',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('drafting', 'done'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'done'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('renders Repair Guide on InvalidStateTransitionError', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValueOnce({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('designing', 'ready', {
        type: 'incomplete-artifact',
        artifactId: 'specs',
      }),
    )
    kernel.changes.status.execute.mockResolvedValueOnce({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      artifactStatuses: [],
      blockers: [
        { code: 'INCOMPLETE_ARTIFACT', message: "Required artifact 'specs' is incomplete" },
      ],
      nextAction: {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Missing specs',
        intent: 'design',
      },
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'ready'])
      .catch(() => {})

    const err = stderr()
    expect(err).toContain('repair guide:')
    expect(stdout()).not.toContain('repair guide:')
    expect(err).toContain("Cannot transition from 'designing' to 'ready'")
    expect(err).toContain("artifact 'specs' is not complete")
    expect(err).toContain("! INCOMPLETE_ARTIFACT: Required artifact 'specs' is incomplete")
    expect(err).toContain('target:  designing')
    expect(err).toContain('command: /specd-design')
    expect(err).toContain('reason:  Missing specs')
    expect(kernel.changes.refreshImplementationTracking.execute).not.toHaveBeenCalled()
    expect(kernel.changes.status.execute).toHaveBeenNthCalledWith(1, {
      name: 'my-change',
      refreshImplementationTracking: false,
    })
    expect(kernel.changes.status.execute).toHaveBeenNthCalledWith(2, {
      name: 'my-change',
      refreshImplementationTracking: false,
    })
  })

  const failingStatusReadCases = [
    {
      label: 'InvalidStateTransitionError',
      code: 'INVALID_STATE_TRANSITION',
      standardHint: false,
      message: "Cannot transition from 'designing' to 'ready'",
      make: () =>
        new InvalidStateTransitionError('designing', 'ready', {
          type: 'incomplete-artifact',
          artifactId: 'specs',
        }),
    },
    {
      label: 'CheckPredicateFailedError',
      code: 'OVERLAP_CONFLICT',
      // handleError itself emits the skip-checks hint for skippable checks (standard field).
      standardHint: true,
      message: 'Specs overlap',
      make: () =>
        new CheckPredicateFailedError(
          'spec.overlap',
          'Checking spec overlap',
          'OVERLAP_CONFLICT',
          'Specs overlap',
          undefined,
          undefined,
          true,
        ),
    },
  ]

  describe.each(failingStatusReadCases)(
    'failing repair-guide status read ($label)',
    ({ code, message, make, standardHint }) => {
      async function run(format: 'text' | 'json' | 'toon') {
        const { kernel, stdout, stderr } = setup()
        kernel.changes.status.execute.mockResolvedValueOnce({
          change: makeMockChange({ name: 'my-change', state: 'designing' }),
          artifactStatuses: [],
        })
        kernel.changes.transition.execute.mockRejectedValue(make())
        kernel.changes.status.execute.mockRejectedValueOnce(new Error('status exploded'))

        const program = makeProgram()
        registerChangeTransition(program.command('change'))
        await program
          .parseAsync([
            'node',
            'specd',
            'change',
            'transition',
            'my-change',
            'ready',
            ...(format !== 'text' ? ['--format', format] : []),
          ])
          .catch(() => {})
        return { stdout: stdout(), stderr: stderr(), exit: vi.mocked(process.exit) }
      }

      it('text: prints only the original error, no repair guide, exit 1', async () => {
        const { stdout, stderr, exit } = await run('text')
        const out = `${stderr}\n${stdout}`
        expect(exit).toHaveBeenCalledTimes(1)
        expect(exit).toHaveBeenCalledWith(1)
        expect(out).toContain(message)
        expect(out).not.toContain('status exploded')
        for (const line of ['repair guide:', 'bypass:', 'command:', 'target:']) {
          expect(out).not.toContain(line)
        }
      })

      it('json: failure record carries only standard error fields, exit 1', async () => {
        const { stdout, stderr, exit } = await run('json')
        expect(exit).toHaveBeenCalledTimes(1)
        expect(exit).toHaveBeenCalledWith(1)
        const out = `${stderr}\n${stdout}`
        expect(out).toContain(code)
        expect(out).toContain(message)
        expect(out).not.toContain('status exploded')
        const absent = ['blockers', 'nextAction', 'state', 'validity']
        if (!standardHint) absent.push('hint')
        for (const key of absent) expect(out).not.toContain(`"${key}"`)
      })

      it('toon: failure record carries only standard error fields, exit 1', async () => {
        const { stdout, stderr, exit } = await run('toon')
        expect(exit).toHaveBeenCalledTimes(1)
        expect(exit).toHaveBeenCalledWith(1)
        const out = `${stderr}\n${stdout}`
        expect(out).toContain(code)
        expect(out).toContain(message)
        expect(out).not.toContain('status exploded')
        const absent = ['blockers', 'nextAction', 'state', 'validity']
        if (!standardHint) absent.push('hint')
        for (const key of absent) {
          expect(out).not.toMatch(new RegExp(`^\\s*${key}[:\\[]`, 'm'))
        }
      })
    },
  )

  it('surfaces approval-required message for blocked signoff transition', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'done' }),
      artifactStatuses: [],
      blockers: [],
      nextAction: {
        targetStep: 'archivable',
        actionType: 'mechanical',
        reason: 'Approval required',
        intent: null,
        action: { kind: 'approve-signoff' },
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new CheckPredicateFailedError(
        'approval.signoff',
        'Checking human signoff',
        'APPROVAL_REQUIRED',
        'Human signoff is required before archiving.',
        { kind: 'approve-signoff' },
        { gate: 'signoff' },
        false,
        { from: 'done', to: 'archivable' },
      ),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'archivable'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain(
      "Check 'approval.signoff' failed: Human signoff is required before archiving.",
    )
    expect(stderr()).toContain('command: specd changes approve signoff')
  })
})

describe('--next failures', () => {
  it('fails clearly in archived state', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'archived' }),
      artifactStatuses: [],
    })

    kernel.changes.transition.execute.mockRejectedValue(
      new HappyPathNextUnavailableError('archived' as never),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'next' }),
      expect.any(Function),
    )
    expect(stderr()).toContain('archived')
    expect(stderr()).not.toContain('--to')
  })

  it('includes centralized hint in json mode for HappyPathNextUnavailableError', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'archivable' }),
      artifactStatuses: [],
      blockers: [],
      nextAction: {
        targetStep: 'archivable',
        actionType: 'mechanical',
        reason: 'Ready to archive',
        intent: 'archive',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new HappyPathNextUnavailableError('archivable'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        '--next',
        '--format',
        'json',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    const lines = stdout().trim().split('\n')
    const completeEvent = JSON.parse(lines[lines.length - 1]!) as {
      event?: { result?: { hint?: string } }
    }
    expect(completeEvent.event?.result?.hint).toContain(
      'Specify an explicit target <step> instead of --next',
    )
  })

  it('fails clearly in cancelled state', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'cancelled' }),
      artifactStatuses: [],
    })

    kernel.changes.transition.execute.mockRejectedValue(
      new HappyPathNextUnavailableError('cancelled' as never),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'next' }),
      expect.any(Function),
    )
    expect(stderr()).toMatch(/cancelled/)
  })

  it('fails clearly in archivable state', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'archivable' }),
      artifactStatuses: [],
    })

    kernel.changes.transition.execute.mockRejectedValue(
      new HappyPathNextUnavailableError('archivable'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'next' }),
      expect.any(Function),
    )
    expect(stderr()).toMatch(/archiving is not a lifecycle transition/)
  })
})

describe('--skip-hooks flag', () => {
  it('passes skipHookPhases with all to the use case when --skip-hooks all is set', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'transition',
      'my-change',
      'designing',
      '--skip-hooks',
      'all',
    ])

    const call = kernel.changes.transition.execute.mock.calls[0]![0]
    expect(call.skipHookPhases).toEqual(new Set(['all']))
    expect(stdout()).toContain('transitioned')
  })

  it('passes empty skipHookPhases by default (no --skip-hooks flag)', async () => {
    const { kernel } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])

    const call = kernel.changes.transition.execute.mock.calls[0]![0]
    expect(call.skipHookPhases).toEqual(new Set())
  })

  it('parses comma-separated phases', async () => {
    const { kernel } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'transition',
      'my-change',
      'designing',
      '--skip-hooks',
      'target.pre,source.post',
    ])

    const call = kernel.changes.transition.execute.mock.calls[0]![0]
    expect(call.skipHookPhases).toEqual(new Set(['target.pre', 'source.post']))
  })

  it('JSON output does not include postHookFailures', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'transition',
      'my-change',
      'designing',
      '--format',
      'json',
    ])

    const lines = stdout()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { stream: string; event: Record<string, unknown> })
    expect(lines.at(-1)).toEqual({
      stream: 'change-transition',
      event: {
        type: 'complete',
        result: { result: 'ok', name: 'my-change', from: 'drafting', to: 'designing' },
      },
    })
  })
})

describe('Incomplete tasks error', () => {
  it('status omits verifying before incomplete-tasks transition fails', async () => {
    const { kernel, stdout, stderr } = setup()
    const sharedStatus = {
      schemaWarnings: [],
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: {
        validTransitions: ['implementing', 'verifying'],
        availableTransitions: ['implementing'],
        availableSteps: [],
        blockers: [],
        approvals: { spec: false, signoff: false },
        nextArtifact: null,
        changePath: '.specd/changes/my-change',
        schemaInfo: { name: '@specd/schema-std', version: 1, artifacts: [] },
      },
      blockers: [
        { code: 'INCOMPLETE_TASKS', message: 'artifact "tasks" has unchecked checkboxes' },
      ],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Tasks are incomplete',
        intent: 'implement',
      },
    }
    kernel.changes.status.execute.mockResolvedValue(sharedStatus)
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('implementing', 'verifying', {
        type: 'incomplete-artifact',
        artifactId: 'tasks',
      }),
    )

    const program = makeProgram()
    const change = program.command('change')
    registerChangeStatus(change)
    registerChangeTransition(change)

    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])
    const statusOut = stdout()
    expect(statusOut).toContain('transitions:')
    expect(statusOut).toContain('implementing')
    expect(statusOut).not.toMatch(/transitions:.*verifying/)

    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repair guide:')
    expect(kernel.changes.status.execute).toHaveBeenCalled()
    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'verifying' }),
      expect.any(Function),
    )
  })

  it('Unchecked checkboxes block verifying', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
      blockers: [
        { code: 'INCOMPLETE_TASKS', message: 'artifact "tasks" has unchecked checkboxes' },
      ],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Tasks are incomplete',
        intent: 'implement',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('implementing', 'verifying', {
        type: 'incomplete-artifact',
        artifactId: 'tasks',
      }),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
    expect(stderr()).toContain('repair guide:')
  })

  it('JSON incomplete-tasks failure is a change-transition stream failure record', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
      blockers: [
        { code: 'INCOMPLETE_TASKS', message: 'artifact "tasks" has unchecked checkboxes' },
      ],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Tasks are incomplete',
        intent: 'implement',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('implementing', 'verifying', {
        type: 'incomplete-artifact',
        artifactId: 'tasks',
      }),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        'verifying',
        '--format',
        'json',
      ])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    const lines = stdout()
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            stream: string
            event: { type: string; result?: { result: string; name: string } }
          },
      )
    expect(lines.at(-1)).toMatchObject({
      stream: 'change-transition',
      event: {
        type: 'complete',
        result: {
          result: 'failure',
          name: 'my-change',
          blockers: [
            { code: 'INCOMPLETE_TASKS', message: 'artifact "tasks" has unchecked checkboxes' },
          ],
          nextAction: {
            targetStep: 'implementing',
            actionType: 'cognitive',
            reason: 'Tasks are incomplete',
            intent: 'implement',
          },
        },
      },
    })
  })

  it('skip-hooks does not bypass incomplete task checks', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
      blockers: [
        { code: 'INCOMPLETE_TASKS', message: 'artifact "tasks" has unchecked checkboxes' },
      ],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Tasks are incomplete',
        intent: 'implement',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('implementing', 'verifying', {
        type: 'incomplete-artifact',
        artifactId: 'tasks',
      }),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        'verifying',
        '--skip-hooks',
        'all',
      ])
      .catch(() => {})

    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'verifying', skipHookPhases: new Set(['all']) }),
      expect.any(Function),
    )
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repair guide:')
  })
})

describe('Repair Guide from GetStatus nextAction', () => {
  it('recommends verify when GetStatus nextAction is the verify skill', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
      blockers: [],
      nextAction: {
        targetStep: 'verifying',
        actionType: 'cognitive',
        reason: 'Tasks are complete',
        intent: 'verify',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('implementing', 'done'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'done'])
      .catch(() => {})

    const err = stderr()
    expect(err).toContain('repair guide:')
    expect(err).toContain('command: /specd-verify')
    expect(err).not.toContain('command: /specd-implement')
  })
})

describe('Typed transition failures render Repair Guide', () => {
  it('catches ReadOnlyWorkspaceError', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      artifactStatuses: [],
      blockers: [
        {
          code: 'READ_ONLY_WORKSPACE',
          message: 'Workspace "core" is read-only',
          label: 'Checking workspace ownership',
          checkId: 'workspace.readOnly',
        },
      ],
      nextAction: {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Remove read-only specs',
        intent: 'design',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new CheckPredicateFailedError(
        'workspace.readOnly',
        'Checking workspace ownership',
        'READ_ONLY_WORKSPACE',
        'Workspace "core" is read-only',
        undefined,
        { specs: ['core:a'] },
        false,
        { from: 'designing', to: 'ready' },
      ),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'ready'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repair guide:')
    expect(stderr()).toContain('command: /specd-design')
    expect(stderr()).toContain('check:   Checking workspace ownership (workspace.readOnly)')
  })

  it('catches CheckPredicateFailedError for deps.consistent', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
      blockers: [{ code: 'DEPS_INCONSISTENT', message: 'Dependencies drifted' }],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Re-extract dependencies',
        intent: 'implement',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new CheckPredicateFailedError(
        'deps.consistent',
        'Checking dependency consistency',
        'DEPS_INCONSISTENT',
        'Dependencies drifted',
        undefined,
        {
          mismatches: [{ specId: 'core:a', extracted: ['core:b'], persisted: ['core:c'] }],
        },
        false,
        { from: 'implementing', to: 'verifying' },
      ),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repair guide:')
    expect(stderr()).toContain('check:   Checking dependency consistency (deps.consistent)')
    expect(stderr()).toContain('detail:  core:a: extracted [core:b] vs persisted [core:c]')
  })

  it('catches CheckPredicateFailedError for impl.filesResolved', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
      blockers: [{ code: 'IMPL_FILES_UNRESOLVED', message: 'Open implementation files' }],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Resolve implementation files',
        intent: 'implement',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new CheckPredicateFailedError(
        'impl.filesResolved',
        'Checking implementation file resolution',
        'IMPL_FILES_UNRESOLVED',
        'Open implementation files',
        undefined,
        { files: ['src/a.ts'] },
        false,
        { from: 'implementing', to: 'verifying' },
      ),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repair guide:')
    expect(stderr()).toContain('detail:  Open files: src/a.ts')
  })
})

describe('validity-aware transition guidance', () => {
  it('prints core recovery and the in-place verification command without a restart flag', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      artifactStatuses: [],
      blockers: [{ code: 'APPROVAL_STALE', message: 'Spec approval is stale' }],
      nextAction: {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Spec consent must be renewed',
        intent: 'design',
      },
      validity: {
        specApproval: 'stale',
        signoff: 'not-required',
        verification: 'stale',
        recovery: { cause: 'spec-approval', from: 'verifying', to: 'designing' },
        blockers: [{ code: 'APPROVAL_STALE', message: 'Spec approval is stale' }],
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('verifying', 'done'),
    )

    const program = makeProgram()
    const change = program.command('change')
    registerChangeTransition(change)
    const transition = change.commands.find((command) => command.name() === 'transition')
    expect(transition?.options.map((option) => option.long)).not.toContain('--restart-verification')

    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'done'])
      .catch(() => {})

    const err = stderr()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(err).toContain('repair guide:')
    expect(err).toContain('state:   designing')
    expect(err).toContain('recovery:      verifying → designing (spec-approval)')
    expect(err).toContain('command: /specd-design')
    expect(err).not.toContain('restart')
  })

  describe('--skip-checks and CheckPredicateFailedError Repair Guide', () => {
    it('forwards comma-separated --skip-checks to transition execute', async () => {
      const { kernel } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'verifying' }),
      })

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        'verifying',
        '--skip-checks',
        'impl.linksInScope,spec.overlap',
      ])

      const call = kernel.changes.transition.execute.mock.calls[0]![0]
      expect(call.skipChecks).toEqual(['impl.linksInScope', 'spec.overlap'])
    })

    it('translates --allow-overlap into skipChecks: ["spec.overlap"]', async () => {
      const { kernel } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'done' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'archivable' }),
      })

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        'archivable',
        '--allow-overlap',
      ])

      const call = kernel.changes.transition.execute.mock.calls[0]![0]
      expect(call.skipChecks).toContain('spec.overlap')
    })

    it('deduplicates repeated checks in --skip-checks, trimming whitespace and ignoring empty elements', async () => {
      const { kernel } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'verifying' }),
      })

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        'verifying',
        '--skip-checks',
        '  impl.linksInScope , impl.linksInScope , ,  spec.overlap , spec.overlap  ',
      ])

      const call = kernel.changes.transition.execute.mock.calls[0]![0]
      expect(call.skipChecks).toEqual(['impl.linksInScope', 'spec.overlap'])
    })

    it('deduplicates alias flags (--allow-out-of-scope, --allow-overlap) when combined with --skip-checks', async () => {
      const { kernel } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'verifying' }),
      })

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        'verifying',
        '--allow-out-of-scope',
        '--allow-overlap',
        '--skip-checks',
        'impl.linksInScope,spec.overlap',
      ])

      const call = kernel.changes.transition.execute.mock.calls[0]![0]
      expect(call.skipChecks).toEqual(['impl.linksInScope', 'spec.overlap'])
    })

    it('renders Repair Guide with check label, guidance, and bypass for CheckPredicateFailedError', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockRejectedValue(
        new CheckPredicateFailedError(
          'impl.linksInScope',
          'Checking implementation links',
          'IMPL_LINKS_OUT_OF_SCOPE',
          'Links out of scope',
          { kind: 'custom', guidance: '/specd-implement my-change' },
          undefined,
          true,
        ),
      )

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      const err = stderr()
      expect(err).toContain('repair guide:')
      expect(err).toContain('check:   Checking implementation links (impl.linksInScope)')
      expect(err).toContain('guidance: /specd-implement my-change')
      expect(err).not.toContain('command: /specd-implement my-change')
      expect(err).toContain(
        'bypass:  Retry with --skip-checks impl.linksInScope if an exception is granted',
      )
    })

    it('omits bypass guidance in Repair Guide when failed check is mandatory (skippable: false)', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockRejectedValue(
        new CheckPredicateFailedError(
          'impl.filesResolved',
          'Checking implementation file resolution',
          'IMPL_FILES_UNRESOLVED',
          'Open files remain',
          { kind: 'custom', guidance: '/specd-implement my-change' },
          undefined,
          false, // skippable: false
        ),
      )

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      const err = stderr()
      expect(err).toContain('repair guide:')
      expect(err).toContain('check:   Checking implementation file resolution (impl.filesResolved)')
      expect(err).toContain('guidance: /specd-implement my-change')
      expect(err).not.toContain('command: /specd-implement my-change')
      expect(err).not.toContain('bypass:')
    })

    it('handles UnknownCheckError when unregistered check is passed to --skip-checks', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockRejectedValue(new UnknownCheckError('@security.fake'))

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program
        .parseAsync([
          'node',
          'specd',
          'change',
          'transition',
          'my-change',
          'verifying',
          '--skip-checks',
          '@security.fake',
        ])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain("Check '@security.fake' is not registered in the check registry")
    })

    it('handles CheckNotSkippableError when non-skippable check is passed to --skip-checks', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockRejectedValue(
        new CheckNotSkippableError('protocol.edge', 'predicate'),
      )

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program
        .parseAsync([
          'node',
          'specd',
          'change',
          'transition',
          'my-change',
          'verifying',
          '--skip-checks',
          'protocol.edge',
        ])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      expect(stderr()).toContain("Check 'protocol.edge' cannot be skipped")
    })

    it('renders the approval command declared by approval.spec and no bypass', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'checkout-retry', state: 'ready' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockRejectedValue(
        new CheckPredicateFailedError(
          'approval.spec',
          'Checking spec approval',
          'APPROVAL_REQUIRED',
          'Spec approval is required',
          { kind: 'approve-spec' },
          undefined,
          false,
        ),
      )
      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'transition', 'checkout-retry', 'implementing'])
        .catch(() => {})
      const err = stderr()
      expect(err).toContain('command: specd changes approve spec')
      expect(err).not.toContain('bypass:')
    })

    it('renders the start-verification command with the real change name', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'checkout-retry', state: 'done' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockRejectedValue(
        new CheckPredicateFailedError(
          'verification.current',
          'Checking verification freshness',
          'VERIFICATION_STALE',
          'Verification evidence is stale',
          { kind: 'start-verification', params: { changeName: 'checkout-retry' } },
          undefined,
          false,
        ),
      )
      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'transition', 'checkout-retry', 'archivable'])
        .catch(() => {})
      const err = stderr()
      expect(err).toContain('command: specd changes verification start checkout-retry')
      expect(err).not.toContain('<name>')
    })

    it('renders Repair Guide for custom check failure with command and bypass', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'drafting' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockRejectedValue(
        new CheckPredicateFailedError(
          '@qa.smoke',
          'QA Smoke Test',
          'QA_SMOKE_FAILED',
          'Smoke assertions failed',
          { kind: 'custom', guidance: 'pnpm test:smoke' },
          undefined,
          true,
        ),
      )

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      const err = stderr()
      expect(err).toContain('repair guide:')
      expect(err).toContain('check:   QA Smoke Test (@qa.smoke)')
      expect(err).toContain('guidance: pnpm test:smoke')
      expect(err).not.toContain('command: pnpm test:smoke')
      expect(err).toContain(
        'bypass:  Retry with --skip-checks @qa.smoke if an exception is granted',
      )
    })

    it('renders Repair Guide and exits with code 1 on HappyPathNextUnavailableError', async () => {
      const { kernel, stderr } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'archivable' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockRejectedValue(
        new HappyPathNextUnavailableError('archivable'),
      )

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program
        .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])
        .catch(() => {})

      expect(process.exit).toHaveBeenCalledWith(1)
      const err = stderr()
      expect(err).toContain('repair guide:')
      expect(err).toContain('cannot advance to next state: archiving is not a lifecycle transition')
    })

    it('passes custom checks to transition execute when --skip-checks is provided', async () => {
      const { kernel, stdout } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'ready' }),
        artifactStatuses: [],
      })
      kernel.changes.transition.execute.mockResolvedValue({
        change: makeMockChange({ name: 'my-change', state: 'verifying' }),
      })

      const program = makeProgram()
      registerChangeTransition(program.command('change'))
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        'verifying',
        '--skip-checks',
        '@qa.bypass-gate',
      ])

      expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-change',
          to: 'verifying',
          skipChecks: ['@qa.bypass-gate'],
        }),
        expect.any(Function),
      )
      expect(stdout()).toContain('my-change')
    })
  })
})

describe('host-neutral failure rendering', () => {
  const statusWith = (extra: Record<string, unknown>) => ({
    change: makeMockChange({ name: 'my-change', state: 'implementing' }),
    artifactStatuses: [],
    blockers: [],
    nextAction: {
      targetStep: 'implementing',
      actionType: 'cognitive',
      reason: 'Fix the blockers',
      intent: 'implement',
    },
    ...extra,
  })

  async function runFailing(
    format: 'text' | 'json' | 'toon',
    error: Error,
    status: Record<string, unknown>,
    progress?: (onProgress: (evt: Record<string, unknown>) => void) => void,
  ) {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue(status)
    kernel.changes.transition.execute.mockImplementation(
      (_input: unknown, onProgress?: (evt: Record<string, unknown>) => void) => {
        if (progress !== undefined && onProgress !== undefined) progress(onProgress)
        throw error
      },
    )
    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'transition',
        'my-change',
        'verifying',
        ...(format !== 'text' ? ['--format', format] : []),
      ])
      .catch(() => {})
    return { kernel, stdout: stdout(), stderr: stderr() }
  }

  it('re-reads status without refreshing implementation tracking after a failure', async () => {
    const { kernel } = await runFailing(
      'text',
      new InvalidStateTransitionError('implementing', 'done'),
      statusWith({}),
    )
    expect(kernel.changes.status.execute).toHaveBeenCalledWith({
      name: 'my-change',
      refreshImplementationTracking: false,
    })
    expect(kernel.changes.refreshImplementationTracking.execute).not.toHaveBeenCalled()
  })

  it('prints the Re-checking after hooks heading once when a hook ran before a failure', async () => {
    const check = (type: string, id: string, label: string, extra: object = {}) => ({
      type,
      id,
      label,
      ...extra,
    })
    const { stderr } = await runFailing(
      'text',
      new InvalidStateTransitionError('implementing', 'done'),
      statusWith({}),
      (onProgress) => {
        onProgress(check('check-start', 'workflow.requires', 'Checking required artifacts'))
        onProgress(
          check('check-done', 'workflow.requires', 'Checking required artifacts', {
            outcome: 'pass',
          }),
        )
        onProgress(check('check-start', 'hook.post', 'Running post hooks'))
        onProgress(check('check-done', 'hook.post', 'Running post hooks', { outcome: 'pass' }))
        onProgress(check('check-start', 'workflow.requires', 'Checking required artifacts'))
        onProgress(
          check('check-done', 'workflow.requires', 'Checking required artifacts', {
            outcome: 'fail',
          }),
        )
      },
    )
    expect(stderr.match(/Re-checking after hooks/g)).toHaveLength(1)
  })

  it('includes intent, action and bypassFlag in the structured failure record', async () => {
    const action = { kind: 'approve-spec' }
    const { stdout } = await runFailing(
      'json',
      new CheckPredicateFailedError(
        'spec.overlap',
        'Checking spec overlap',
        'OVERLAP_CONFLICT',
        'Specs overlap',
        undefined,
        undefined,
        true,
      ),
      statusWith({
        blockers: [
          {
            code: 'OVERLAP_CONFLICT',
            message: 'Specs overlap',
            checkId: 'spec.overlap',
            isSkippable: true,
          },
          { code: 'OTHER', message: 'locked', checkId: 'x.y', isSkippable: false },
        ],
        nextAction: {
          targetStep: 'ready',
          actionType: 'mechanical',
          reason: 'Approve the spec',
          intent: null,
          action,
        },
      }),
    )
    const record = JSON.parse(stdout.trim().split('\n').pop()!) as {
      event: {
        result: {
          result: string
          blockers: Array<Record<string, unknown>>
          nextAction: Record<string, unknown>
        }
      }
    }
    const result = record.event.result
    expect(result.result).toBe('failure')
    expect(result.blockers[0]?.bypassFlag).toBe('--skip-checks spec.overlap')
    expect('bypassFlag' in result.blockers[1]!).toBe(false)
    expect(result.nextAction).toMatchObject({
      intent: null,
      action,
      command: 'specd changes approve spec',
    })
  })

  it('treats a name-only CheckPredicateFailedError like the real class in json mode', async () => {
    const duck = Object.assign(new Error('Specs overlap'), {
      name: 'CheckPredicateFailedError',
      code: 'OVERLAP_CONFLICT',
      checkId: 'spec.overlap',
      label: 'Checking spec overlap',
      checkCode: 'OVERLAP_CONFLICT',
      skippable: true,
    })
    const { stdout } = await runFailing(
      'json',
      duck,
      statusWith({
        blockers: [
          {
            code: 'OVERLAP_CONFLICT',
            message: 'Specs overlap',
            checkId: 'spec.overlap',
            isSkippable: true,
          },
        ],
      }),
    )
    const record = JSON.parse(stdout.trim().split('\n').pop()!) as {
      event: { result: { result: string; hint?: string } }
    }
    expect(record.event.result.result).toBe('failure')
    expect(record.event.result.hint).toContain('--skip-checks spec.overlap')
  })

  it('emits failure error and hint fields in toon format', async () => {
    const { stdout } = await runFailing(
      'toon',
      new CheckPredicateFailedError(
        'spec.overlap',
        'Checking spec overlap',
        'OVERLAP_CONFLICT',
        'Specs overlap',
        undefined,
        undefined,
        true,
      ),
      statusWith({
        blockers: [
          {
            code: 'OVERLAP_CONFLICT',
            message: 'Specs overlap',
            checkId: 'spec.overlap',
            isSkippable: true,
          },
        ],
      }),
    )
    expect(stdout).toContain('result: failure')
    expect(stdout).toMatch(/error:\s*\n\s+code: OVERLAP_CONFLICT/)
    expect(stdout).toContain('checkId: spec.overlap')
    expect(stdout).toContain('hint:')
    expect(stdout).toContain('--skip-checks spec.overlap')
  })

  it('prints a single bypass line for blockers sharing a checkId', async () => {
    const blockers = [
      { code: 'OVERLAP_CONFLICT', message: 'one', checkId: 'spec.overlap', isSkippable: true },
      { code: 'OVERLAP_CONFLICT', message: 'two', checkId: 'spec.overlap', isSkippable: true },
    ]
    const withCheckError = await runFailing(
      'text',
      new CheckPredicateFailedError(
        'impl.filesResolved',
        'Checking implementation file resolution',
        'IMPL_FILES_UNRESOLVED',
        'Open files remain',
      ),
      statusWith({ blockers }),
    )
    expect(withCheckError.stderr.match(/bypass:  .*--skip-checks spec\.overlap/g)).toHaveLength(1)

    const withoutCheckError = await runFailing(
      'text',
      new InvalidStateTransitionError('implementing', 'done'),
      statusWith({ blockers }),
    )
    expect(withoutCheckError.stderr.match(/bypass:  /g)).toHaveLength(1)
  })

  it('prints guidance and never command for a guidance-only check action', async () => {
    const { stderr } = await runFailing(
      'text',
      new CheckPredicateFailedError(
        '@security.code-scan',
        'Scanning code',
        'SECURITY_FINDINGS',
        '2 findings',
        { kind: '@security.audit-fix', guidance: 'pnpm audit:fix' },
        undefined,
        false,
      ),
      statusWith({
        nextAction: {
          targetStep: 'implementing',
          actionType: 'cognitive',
          reason: 'Fix findings',
          intent: null,
        },
      }),
    )
    expect(stderr).toContain('guidance: pnpm audit:fix')
    expect(stderr).not.toContain('command:')
  })

  it('prints the check guidance together with the next-action command', async () => {
    const { stderr } = await runFailing(
      'text',
      new CheckPredicateFailedError(
        '@security.code-scan',
        'Scanning code',
        'SECURITY_FINDINGS',
        '2 findings',
        { kind: '@security.audit-fix', guidance: 'pnpm audit:fix' },
        undefined,
        false,
      ),
      statusWith({}),
    )
    expect(stderr).toContain('guidance: pnpm audit:fix')
    expect(stderr).toContain('command: /specd-implement')
  })

  it("prints the failed check's diagnostic code even when status carries no matching blocker", async () => {
    const { stderr } = await runFailing(
      'text',
      new CheckPredicateFailedError(
        '@security.code-scan',
        'Scanning code',
        'SECURITY_FINDINGS',
        '2 findings',
        undefined,
        undefined,
        false,
      ),
      statusWith({ blockers: [] }),
    )
    expect(stderr).toContain('code:    SECURITY_FINDINGS')
  })

  it('projects structured failure blockers without the raw isSkippable flag', async () => {
    const { stdout } = await runFailing(
      'json',
      new CheckPredicateFailedError(
        'spec.overlap',
        'Checking spec overlap',
        'OVERLAP_CONFLICT',
        'Specs overlap',
        undefined,
        undefined,
        true,
      ),
      statusWith({
        blockers: [
          {
            code: 'OVERLAP_CONFLICT',
            message: 'Specs overlap',
            label: 'Checking spec overlap',
            checkId: 'spec.overlap',
            isSkippable: true,
          },
        ],
      }),
    )
    const record = JSON.parse(stdout.trim().split('\n').pop()!) as {
      event: { result: { blockers: Array<Record<string, unknown>> } }
    }
    const blocker = record.event.result.blockers[0]!
    expect(blocker).toMatchObject({
      code: 'OVERLAP_CONFLICT',
      label: 'Checking spec overlap',
      checkId: 'spec.overlap',
      bypassFlag: '--skip-checks spec.overlap',
    })
    expect('isSkippable' in blocker).toBe(false)
  })

  it('falls back to the next-action command when the failed check declares no action', async () => {
    const { stderr } = await runFailing(
      'text',
      new CheckPredicateFailedError(
        'impl.filesResolved',
        'Checking implementation file resolution',
        'IMPL_FILES_UNRESOLVED',
        'Open files remain',
        undefined,
        undefined,
        false,
      ),
      statusWith({}),
    )
    expect(stderr).toContain('command: /specd-implement')
  })

  it('falls back to next-action guidance for a non-check failure with no command', async () => {
    const { stderr } = await runFailing(
      'text',
      new InvalidStateTransitionError('implementing', 'done'),
      statusWith({
        nextAction: {
          targetStep: 'implementing',
          actionType: 'cognitive',
          reason: 'r',
          intent: null,
          action: { kind: '@security.audit-fix', guidance: 'pnpm audit:fix' },
        },
      }),
    )
    expect(stderr).toContain('guidance: pnpm audit:fix')
    expect(stderr).not.toContain('command:')
  })

  it('transition --help documents intent, action, guidance, bypassFlag and hint', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', '--help']).catch(() => {})
    const help = stdout()
    for (const term of ['intent', 'action', 'guidance', 'bypassFlag', 'hint']) {
      expect(help).toContain(term)
    }
  })

  it('prints a bypass line for every extra skippable blocker beside a CheckPredicateFailedError', async () => {
    const { stderr } = await runFailing(
      'text',
      new CheckPredicateFailedError(
        'impl.linksInScope',
        'Checking implementation links',
        'LINKS_OUT_OF_SCOPE',
        'links out of scope',
        undefined,
        undefined,
        true,
      ),
      statusWith({
        blockers: [
          { code: 'A', message: 'a', checkId: 'impl.linksInScope', isSkippable: true },
          { code: 'B', message: 'b', checkId: 'spec.overlap', isSkippable: true },
          { code: 'C', message: 'c', checkId: 'other', isSkippable: false },
        ],
      }),
    )
    const lines = stderr.split('\n').filter((l) => l.includes('bypass:'))
    expect(lines).toHaveLength(2)
    expect(stderr).toContain('bypass:  Retry with --skip-checks impl.linksInScope')
    expect(stderr).toContain('bypass:  Retry with --skip-checks spec.overlap')
    expect(stderr).not.toContain('--skip-checks other')
  })

  it('renders the --skip-hooks hint for a non-skippable hook check', async () => {
    const err = new CheckNotSkippableError('hook.pre')
    const text = await runFailing('text', err, statusWith({}))
    expect(text.stderr).toContain('--skip-hooks')
    const json = await runFailing('json', err, statusWith({}))
    const result = JSON.parse(json.stdout.trim().split('\n').at(-1) as string).event.result
    expect(result.hint).toContain('--skip-hooks')
    expect(result.error).toEqual({
      code: 'CHECK_NOT_SKIPPABLE',
      message: err.message,
      checkId: 'hook.pre',
    })
  })

  it('treats a name-only CheckNotSkippableError like the real class in text mode', async () => {
    const real = new CheckNotSkippableError('hook.pre')
    const duck = Object.assign(new Error(real.message), {
      name: 'CheckNotSkippableError',
      code: 'CHECK_NOT_SKIPPABLE',
      checkId: 'hook.pre',
    })
    const realOut = await runFailing('text', real, statusWith({}))
    const duckOut = await runFailing('text', duck, statusWith({}))
    expect(duckOut.stderr).toContain('--skip-hooks')
    expect(duckOut.stderr).toBe(realOut.stderr)
  })

  it.each(['protocol.edge', 'spec.overlap'])('gives no hint for non-hook check %s', async (id) => {
    const err = new CheckNotSkippableError(id)
    const text = await runFailing('text', err, statusWith({}))
    expect(text.stderr).not.toContain('--skip-hooks')
    const json = await runFailing('json', err, statusWith({}))
    const result = JSON.parse(json.stdout.trim().split('\n').at(-1) as string).event.result
    expect(result.hint).toBeUndefined()
    expect(result.error.checkId).toBe(id)
  })

  it('json failure carries error and the bypass hint for a skippable check', async () => {
    const { stdout } = await runFailing(
      'json',
      new CheckPredicateFailedError(
        'spec.overlap',
        'Checking overlap',
        'OVERLAP_CONFLICT',
        'overlap',
        undefined,
        undefined,
        true,
      ),
      statusWith({}),
    )
    const result = JSON.parse(stdout.trim().split('\n').at(-1) as string).event.result
    expect(result.error).toEqual({
      code: 'OVERLAP_CONFLICT',
      message: "Check 'spec.overlap' failed: overlap",
      checkId: 'spec.overlap',
    })
    expect(result.hint).toBe('Retry with --skip-checks spec.overlap if an exception is granted')
  })

  const depsError = (skippable: boolean) =>
    new CheckPredicateFailedError(
      'deps.consistent',
      'Checking dependency consistency',
      'DEPS_INCONSISTENT',
      'Dependencies drifted',
      undefined,
      { mismatches: [{ specId: 'core:a', extracted: ['core:b'], persisted: [] }] },
      skippable,
    )

  it('renders the dependency extraction hint for a non-skippable deps.consistent failure', async () => {
    const { stderr } = await runFailing('text', depsError(false), statusWith({}))
    expect(stderr).toContain('  hint:    Re-run dependency extraction')
    expect(stderr).not.toContain('bypass:')
  })

  it('omits the dependency extraction hint when deps.consistent is skippable', async () => {
    const { stderr } = await runFailing('text', depsError(true), statusWith({}))
    expect(stderr).not.toContain('hint:')
    expect(stderr).toContain('bypass:  Retry with --skip-checks deps.consistent')
  })

  it('transition --help lists the error field', async () => {
    const { stdout } = setup()
    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', '--help']).catch(() => {})
    expect(stdout()).toContain('error?: { code, message, checkId? }')
  })
})

describe('Duck-typed CheckPredicateFailedError in text mode (transition)', () => {
  async function run(err: unknown): Promise<string> {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      artifactStatuses: [],
      blockers: [],
      nextAction: {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Remove read-only specs',
        intent: 'design',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(err)
    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'ready'])
      .catch(() => {})
    expect(process.exit).toHaveBeenCalledWith(1)
    return stderr()
  }

  it('renders the same repair guide as the real class', async () => {
    const real = new CheckPredicateFailedError(
      'workspace.readOnly',
      'Checking workspace ownership',
      'READ_ONLY_WORKSPACE',
      'Workspace "core" is read-only',
      undefined,
      { specs: ['core:a'] },
      false,
      { from: 'designing', to: 'ready' },
    )
    const duck = Object.assign(new Error(real.message), {
      name: 'CheckPredicateFailedError',
      checkId: real.checkId,
      label: real.label,
      checkCode: real.checkCode,
      action: real.action,
      details: real.details,
      skippable: real.skippable,
      from: real.from,
      to: real.to,
    })
    const realOut = await run(real)
    vi.restoreAllMocks()
    const duckOut = await run(duck)
    expect(realOut).toContain('repair guide:')
    expect(duckOut).toBe(realOut)
  })
})
