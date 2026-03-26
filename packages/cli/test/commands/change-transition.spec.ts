/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeMockChange,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerChangeTransition } from '../../src/commands/change/transition.js'
import { InvalidStateTransitionError, HookFailedError, InvalidChangeError } from '@specd/core'

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

    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'designing' }),
      expect.any(Function),
    )
    expect(stdout()).toContain('transitioned my-change: drafting')
  })
})

describe('Approval-gate routing', () => {
  it('Spec approval gate active', async () => {
    const { kernel, stdout } = setup({
      approvals: { spec: true, signoff: false },
    })
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-spec-approval' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'implementing'])

    const out = stdout()
    expect(out).toContain('transitioned my-change: ready')
    expect(out).toContain('pending-spec-approval')
  })

  it('Signoff gate active', async () => {
    const { kernel, stdout } = setup({
      approvals: { spec: false, signoff: true },
    })
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'done' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-signoff' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'archivable'])

    const out = stdout()
    expect(out).toContain('transitioned my-change: done')
    expect(out).toContain('pending-signoff')
  })

  it('resolves ready --next and preserves approval routing', async () => {
    const { kernel, stdout } = setup({
      approvals: { spec: true, signoff: false },
    })
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'ready' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-spec-approval' }),
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])

    expect(kernel.changes.transition.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'implementing', approvalsSpec: true }),
      expect.any(Function),
    )
    expect(stdout()).toContain('pending-spec-approval')
  })
})

describe('Pre- and post-hooks', () => {
  it('Hook failure', async () => {
    const { kernel } = setup()
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

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('my-change')
    expect(parsed.from).toBe('drafting')
    expect(parsed.to).toBe('designing')
  })
})

describe('Invalid transition error', () => {
  it('Illegal state transition', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
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

  it('surfaces approval-required message for blocked signoff transition', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-signoff' }),
      artifactStatuses: [],
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

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(kernel.changes.transition.execute).not.toHaveBeenCalled()
    expect(stderr()).toMatch(/waiting for human spec approval/)
  })

  it('fails clearly in pending-signoff state', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'pending-signoff' }),
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(kernel.changes.transition.execute).not.toHaveBeenCalled()
    expect(stderr()).toMatch(/waiting for human signoff/)
  })

  it('fails clearly in archivable state', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'archivable' }),
      artifactStatuses: [],
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', '--next'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(kernel.changes.transition.execute).not.toHaveBeenCalled()
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

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.postHookFailures).toBeUndefined()
  })
})

describe('Incomplete tasks error', () => {
  it('Unchecked checkboxes block verifying', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'implementing' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidChangeError('artifact "tasks" has unchecked checkboxes'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'verifying'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})
