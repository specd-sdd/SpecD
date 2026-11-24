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
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { ReconciledOperationBlockedError, CheckPredicateFailedError } from '@specd/sdk'
import { registerChangeTransition } from '../../../src/commands/change/transition.js'
import { registerChangeArchive } from '../../../src/commands/change/archive.js'

function makeError(operation: 'transition' | 'archive'): ReconciledOperationBlockedError {
  return new ReconciledOperationBlockedError({
    operation,
    changeName: 'my-change',
    state: 'designing',
    automaticReturn: { cause: 'spec-approval', from: 'implementing', to: 'designing' },
    blockers: [
      {
        code: 'APPROVAL_STALE',
        message: 'spec approval is stale',
        label: 'Spec approval',
        checkId: 'approval.spec',
        isSkippable: true,
        action: { kind: 'start-verification', params: { changeName: 'my-change' } },
      },
    ] as never,
    nextAction: {
      targetStep: 'designing',
      actionType: 'cognitive',
      reason: 'Revise the design artifacts',
      intent: 'design',
    },
  })
}

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue(
    makeMockHost({ config, configFilePath: null, kernel }),
  )
  kernel.changes.status.execute.mockResolvedValue({
    change: makeMockChange({ name: 'my-change', state: 'implementing' }),
    artifactStatuses: [],
    blockers: [],
    nextAction: { targetStep: 'x', actionType: 'cognitive', reason: 'r', intent: null },
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

const cases = [
  {
    operation: 'transition' as const,
    register: registerChangeTransition,
    args: ['transition', 'my-change', 'verifying'],
    stream: 'change-transition',
    exec: (k: ReturnType<typeof makeMockKernel>) => k.changes.transition.execute,
  },
  {
    operation: 'archive' as const,
    register: registerChangeArchive,
    args: ['archive', 'my-change'],
    stream: 'change-archive',
    exec: (k: ReturnType<typeof makeMockKernel>) => k.changes.archive.execute,
  },
]

describe.each(cases)('$operation committed recovery', (c) => {
  it('renders a repair guide in text mode without an error line', async () => {
    const { kernel, stdout, stderr } = setup()
    c.exec(kernel).mockRejectedValue(makeError(c.operation))
    const program = makeProgram()
    c.register(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', ...c.args]).catch(() => {})
    const err = stderr()
    expect(process.exit).toHaveBeenCalledWith(1)
    expect(err).not.toContain('error:')
    expect(err).not.toContain("'design' next action")
    const lines = err.split('\n')
    const head = lines.findIndex((l) => l.startsWith("change 'my-change' was returned to"))
    expect(head).toBeGreaterThanOrEqual(0)
    expect(lines.slice(head, head + 12)).toEqual([
      `change 'my-change' was returned to 'designing' by validity reconciliation; ${c.operation} was not performed`,
      '! APPROVAL_STALE — Spec approval: spec approval is stale',
      '  check:   approval.spec',
      '  bypass:  Retry with --skip-checks approval.spec if an exception is granted',
      '  command: specd changes verification start my-change',
      '',
      'repair guide:',
      '  state:   designing',
      '  return:  spec-approval (implementing → designing)',
      '  target:  designing',
      '  command: /specd-design',
      '  reason:  Revise the design artifacts',
    ])
    expect(err.match(/repair guide:/g)).toHaveLength(1)
    expect(err.match(/bypass:/g)).toHaveLength(1)
    expect(err.match(/^ {2}command: /gm)).toHaveLength(2)
    expect(err).not.toContain('isSkippable')
    expect(stdout()).toBe('')
  })

  it('emits projected state, automaticReturn, blockers and nextAction in json', async () => {
    const { kernel, stdout } = setup()
    c.exec(kernel).mockRejectedValue(makeError(c.operation))
    const program = makeProgram()
    c.register(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', ...c.args, '--format', 'json'])
      .catch(() => {})
    expect(process.exit).toHaveBeenCalledWith(1)
    const record = JSON.parse(stdout().trim().split('\n').at(-1) as string)
    expect(record.stream).toBe(c.stream)
    const result = record.event.result
    expect(result.result).toBe('failure')
    expect(result.state).toBe('designing')
    expect(result.automaticReturn).toEqual({
      cause: 'spec-approval',
      from: 'implementing',
      to: 'designing',
    })
    if (c.operation === 'transition') {
      expect(result.from).toBe('implementing')
      expect(result.to).toBe('verifying')
      expect(result.error).toMatchObject({ code: 'RECONCILED_OPERATION_BLOCKED' })
    }
    expect(result.blockers).toEqual([
      {
        code: 'APPROVAL_STALE',
        message: 'spec approval is stale',
        label: 'Spec approval',
        checkId: 'approval.spec',
        action: { kind: 'start-verification', params: { changeName: 'my-change' } },
        bypassFlag: '--skip-checks approval.spec',
      },
    ])
    expect(result.nextAction).toMatchObject({
      targetStep: 'designing',
      actionType: 'cognitive',
      intent: 'design',
      command: '/specd-design',
    })
  })
})

describe('transition repair guide bypass lines', () => {
  it('prints one bypass line per skippable blocker', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute
      .mockResolvedValueOnce({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
      })
      .mockResolvedValueOnce({
        change: makeMockChange({ name: 'my-change', state: 'implementing' }),
        artifactStatuses: [],
        blockers: [
          { code: 'A', message: 'a', checkId: 'impl.linksInScope', isSkippable: true },
          { code: 'B', message: 'b', checkId: 'spec.overlap', isSkippable: true },
          { code: 'C', message: 'c', checkId: 'other', isSkippable: false },
        ],
        nextAction: { targetStep: 'x', actionType: 'cognitive', reason: 'r', intent: null },
      })
    kernel.changes.transition.execute.mockRejectedValue(
      new (await import('@specd/sdk')).InvalidStateTransitionError('implementing', 'archivable'),
    )
    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'archivable'])
      .catch(() => {})
    const err = stderr()
    const bypassLines = err.split('\n').filter((l) => l.includes('bypass:'))
    expect(bypassLines).toEqual([
      '  bypass:  Retry with --skip-checks impl.linksInScope if an exception is granted',
      '  bypass:  Retry with --skip-checks spec.overlap if an exception is granted',
    ])
    expect(err).not.toContain('--skip-checks other')
  })

  it('help lists actionType in the nextAction schema', () => {
    setup()
    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    const cmd = program.commands[0]!.commands.find((x) => x.name() === 'transition')!
    let help = ''
    cmd.configureOutput({ writeOut: (s) => (help += s) })
    cmd.outputHelp()
    expect(help).toMatch(/nextAction: \{ targetStep, actionType,/)
  })
})

describe('archive skip hooks', () => {
  it('reports the user-skip reason for hooks skipped with --skip-hooks', async () => {
    const { kernel, stderr } = setup()
    const impl = (_input: unknown, onProgress?: (e: unknown) => void): Promise<never> => {
      onProgress?.({ type: 'check-start', id: 'hook.pre', label: 'Running pre hooks' })
      onProgress?.({
        type: 'check-done',
        id: 'hook.pre',
        label: 'Running pre hooks',
        outcome: 'skip',
      })
      return Promise.reject(
        new CheckPredicateFailedError('x.y', 'X', 'X_FAILED', 'boom', undefined, undefined, false),
      )
    }
    kernel.changes.archive.execute.mockImplementation(impl as never)
    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'archive', 'my-change', '--skip-hooks', 'pre'])
      .catch(() => {})
    expect(stderr()).toContain('(skipped: --skip-hooks)')
  })
})

describe('archive hook skip reasons by phase', () => {
  it('does not label hook.post as --skip-hooks when only pre was skipped', async () => {
    const { kernel, stderr } = setup()
    const impl = (_input: unknown, onProgress?: (e: unknown) => void): Promise<never> => {
      for (const id of ['hook.pre', 'hook.post']) {
        onProgress?.({ type: 'check-start', id, label: `Running ${id}` })
        onProgress?.({
          type: 'check-done',
          id,
          label: `Running ${id}`,
          outcome: 'skip',
          reason: 'no hooks configured',
        })
      }
      return Promise.reject(
        new CheckPredicateFailedError('x.y', 'X', 'X_FAILED', 'boom', undefined, undefined, false),
      )
    }
    kernel.changes.archive.execute.mockImplementation(impl as never)
    const program = makeProgram()
    registerChangeArchive(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'archive', 'my-change', '--skip-hooks', 'pre'])
      .catch(() => {})
    const err = stderr()
    expect(err).toContain('Running hook.pre (skipped: --skip-hooks)')
    expect(err).toContain('Running hook.post (skipped: no hooks configured)')
  })
})
