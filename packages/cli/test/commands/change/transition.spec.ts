import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeMockChange,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
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
  ArchiveDependencyMismatchError,
  ArchiveImplementationStateError,
  HappyPathNextUnavailableError,
} from '@specd/sdk'

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
  it('Missing arguments', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/either <step> or --next is required/)
  })

  it('rejects combining explicit step with --next', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/mutually exclusive/)
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
    expect(call.allowOutOfScope).toBe(true)
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
    expect(call.allowOutOfScope).toBeUndefined()
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
          command: null,
        },
      })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('ready', 'implementing', {
        type: 'approval-required',
        gate: 'spec',
      }),
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
          command: null,
        },
      })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('done', 'archivable', {
        type: 'approval-required',
        gate: 'signoff',
      }),
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
          command: null,
        },
      })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('ready', 'implementing', {
        type: 'approval-required',
        gate: 'spec',
      }),
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
        command: '/specd-design',
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
        command: '/specd-design',
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

  it('surfaces approval-required message for blocked signoff transition', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-signoff' }),
      artifactStatuses: [],
      blockers: [],
      nextAction: {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Approval required',
        command: '/specd-design',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('pending-signoff', 'signed-off', {
        type: 'approval-required',
        gate: 'signoff',
      }),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'signed-off'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/waiting for human signoff/)
  })
})

describe('--next failures', () => {
  it('fails clearly in pending-spec-approval state', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-spec-approval' }),
      artifactStatuses: [],
    })

    kernel.changes.transition.execute.mockRejectedValue(
      new HappyPathNextUnavailableError('pending-spec-approval'),
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
    expect(stderr()).toMatch(/waiting for human spec approval/)
  })

  it('fails clearly in pending-signoff state', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-signoff' }),
      artifactStatuses: [],
    })

    kernel.changes.transition.execute.mockRejectedValue(
      new HappyPathNextUnavailableError('pending-signoff'),
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
    expect(stderr()).toMatch(/waiting for human signoff/)
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
        command: '/specd-implement',
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
        command: '/specd-implement',
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
        command: '/specd-implement',
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
            command: '/specd-implement',
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
        command: '/specd-implement',
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
        command: '/specd-verify',
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
        command: '/specd-design',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new ReadOnlyWorkspaceError('Workspace "core" is read-only'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'ready'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repair guide:')
    expect(stderr()).toContain('command: /specd-design')
    expect(stderr()).toContain(
      '! READ_ONLY_WORKSPACE — Checking workspace ownership: Workspace "core" is read-only',
    )
  })

  it('catches ArchiveDependencyMismatchError', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
      blockers: [{ code: 'DEPS_INCONSISTENT', message: 'Dependencies drifted' }],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Re-extract dependencies',
        command: '/specd-implement',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new ArchiveDependencyMismatchError('core:change', ['core:a'], ['core:b']),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repair guide:')
    expect(stderr()).toContain('! DEPS_INCONSISTENT')
  })

  it('catches ArchiveImplementationStateError', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
      blockers: [{ code: 'IMPL_UNRESOLVED', message: 'Open implementation files' }],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Resolve implementation files',
        command: '/specd-implement',
      },
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new ArchiveImplementationStateError(['src/a.ts'], 'unresolved files'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('repair guide:')
    expect(stderr()).toContain('! IMPL_UNRESOLVED')
  })
})
