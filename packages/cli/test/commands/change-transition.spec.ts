/* eslint-disable @typescript-eslint/unbound-method */

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
  vi.mocked(resolveCliContext).mockResolvedValue({ config, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Command signature', () => {
  it('Missing arguments', async () => {
    setup()

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change']),
    ).rejects.toThrow(CommanderError)
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
      postHookFailures: [],
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
      postHookFailures: [],
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'archivable'])

    const out = stdout()
    expect(out).toContain('transitioned my-change: done')
    expect(out).toContain('pending-signoff')
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
      postHookFailures: [],
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
      postHookFailures: [],
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
})

describe('--no-hooks flag', () => {
  it('passes skipHooks: true to the use case when --no-hooks is set', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      postHookFailures: [],
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
      '--no-hooks',
    ])

    const call = kernel.changes.transition.execute.mock.calls[0]![0]
    expect(call.skipHooks).toBe(true)
    expect(stdout()).toContain('transitioned')
  })

  it('passes skipHooks: false by default (no --no-hooks flag)', async () => {
    const { kernel } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      postHookFailures: [],
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])

    const call = kernel.changes.transition.execute.mock.calls[0]![0]
    expect(call.skipHooks).toBe(false)
  })
})

describe('Post-hook failure warning', () => {
  it('exits with code 2 when post-hooks fail', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      postHookFailures: ['git push', 'notify'],
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'my-change', 'designing'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(2)
    const err = stderr()
    expect(err).toContain('post-hook')
    expect(err).toContain('git push')
  })

  it('JSON output includes postHookFailures on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'designing' }),
      postHookFailures: [],
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
    expect(parsed.postHookFailures).toEqual([])
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
