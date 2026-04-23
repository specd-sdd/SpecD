import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import {
  ChangeNotFoundError,
  InvalidStateTransitionError,
  HistoricalImplementationGuardError,
} from '@specd/core'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

// Module mocks — hoisted by vitest
vi.mock('../../src/load-config.js', () => ({
  loadConfig: vi.fn(),
  resolveConfigPath: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerChangeList } from '../../src/commands/change/list.js'
import { registerChangeCreate } from '../../src/commands/change/create.js'
import { registerChangeStatus } from '../../src/commands/change/status.js'
import { registerChangeTransition } from '../../src/commands/change/transition.js'
import { registerChangeDraft } from '../../src/commands/change/draft.js'
import { registerChangeDiscard } from '../../src/commands/change/discard.js'
import { registerDraftsRestore } from '../../src/commands/drafts/restore.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockResolvedValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// change list
// ---------------------------------------------------------------------------

describe('change list', () => {
  it('prints "no active changes" when empty', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    expect(stdout()).toContain('no changes')
  })

  it('lists changes in text format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([
      makeMockChange({ name: 'feat-a', state: 'designing' }),
      makeMockChange({ name: 'feat-b', state: 'ready' }),
    ])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    const out = stdout()
    expect(out).toContain('feat-a')
    expect(out).toContain('feat-b')
    expect(out).toContain('designing')
    expect(out).toContain('ready')
  })

  it('outputs valid JSON in json format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([
      makeMockChange({ name: 'feat-a', state: 'designing' }),
    ])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].name).toBe('feat-a')
    expect(parsed[0].state).toBe('designing')
  })

  it('returns empty JSON array when no changes', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    expect(JSON.parse(stdout())).toEqual([])
  })

  it('text rows contain specIds and schema', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([
      makeMockChange({
        name: 'add-login',
        state: 'designing',
        specIds: ['auth/login'],
        schemaName: 'std',
        schemaVersion: 1,
      }),
    ])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list'])

    const out = stdout()
    expect(out).toContain('add-login')
    expect(out).toContain('designing')
    expect(out).toContain('auth/login')
    expect(out).toContain('std@1')
  })

  it('JSON output includes specIds and schema object with name and version', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.list.execute.mockResolvedValue([
      makeMockChange({
        name: 'add-login',
        state: 'designing',
        specIds: ['auth/login'],
        schemaName: 'std',
        schemaVersion: 1,
      }),
    ])

    const program = makeProgram()
    registerChangeList(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'list', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed[0].specIds).toContain('auth/login')
    expect(parsed[0].schema).toEqual({ name: 'std', version: 1 })
  })
})

// ---------------------------------------------------------------------------
// change create
// ---------------------------------------------------------------------------

describe('change create', () => {
  it('exits with error when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'create'])).rejects.toThrow()
  })

  it('creates a change and prints confirmation', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'new-feat', state: 'designing' }),
      changePath: '/tmp/test-changes/new-feat',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'new-feat',
      '--spec',
      'auth/login',
    ])

    expect(stdout()).toContain('created change new-feat')
  })

  it('includes spec ids and name in json output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'new-feat', state: 'designing' }),
      changePath: '/tmp/test-changes/new-feat',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'new-feat',
      '--spec',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('new-feat')
  })

  it('passes spec ids to the use case', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      changePath: '/tmp/test-changes/feat',
    })

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'create',
      'feat',
      '--spec',
      'auth/login',
      '--spec',
      'auth/logout',
    ])

    const call = kernel.changes.create.execute.mock.calls[0]![0]
    expect(call.specIds).toContain('default:auth/login')
    expect(call.specIds).toContain('default:auth/logout')
    expect(call.name).toBe('feat')
  })

  it('handles ChangeAlreadyExistsError → exit 1 on stderr', async () => {
    const { kernel, stderr } = setup()
    const { ChangeAlreadyExistsError } = await import('@specd/core')
    kernel.changes.create.execute.mockRejectedValue(new ChangeAlreadyExistsError('new-feat'))

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'new-feat']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('allows creating a change without --spec flag', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })
    captureStdout()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'create', 'my-change'])

    const call = kernel.changes.create.execute.mock.calls[0]![0]
    expect(call.specIds).toEqual([])
  })

  it('defaults to "default" workspace when prefix is omitted', async () => {
    const { kernel } = setup()
    kernel.changes.create.execute.mockResolvedValue({
      change: makeMockChange({ name: 'my-change', state: 'drafting' }),
      changePath: '/tmp/test-changes/my-change',
    })
    captureStdout()

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

    const call = kernel.changes.create.execute.mock.calls[0]![0]
    expect(call.specIds).toContain('default:auth/login')
  })

  it('exits 1 with error when workspace prefix is unknown', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeCreate(program.command('change'))

    try {
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'create',
        'my-change',
        '--spec',
        'nonexistent-ws:some/path',
      ])
    } catch {
      // may throw
    }

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/i)
  })

  it('JSON output includes state="drafting"', async () => {
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
    expect(parsed.name).toBe('add-login')
    expect(parsed.state).toBe('drafting')
  })
})

// ---------------------------------------------------------------------------
// change status
// ---------------------------------------------------------------------------

describe('change status', () => {
  it('exits with error when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'status'])).rejects.toThrow()
  })

  it('displays change info in text format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing', specIds: ['auth/login'] }),
      artifactStatuses: [
        { type: 'spec', state: 'in-progress', effectiveStatus: 'in-progress', files: [] },
      ],
      lifecycle: {
        validTransitions: [],
        availableTransitions: [],
        blockers: [],
        approvals: { spec: false, signoff: false },
        nextArtifact: null,
        changePath: '.specd/changes/feat',
        schemaInfo: { name: '@specd/schema-std', version: 1, artifacts: [] },
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'feat'])

    const out = stdout()
    expect(out).toContain('feat')
    expect(out).toContain('designing')
    expect(out).toContain('auth/login')
    expect(out).toContain('spec')
  })

  it('outputs valid JSON in json format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      artifactStatuses: [
        { type: 'spec', state: 'in-progress', effectiveStatus: 'in-progress', files: [] },
      ],
      lifecycle: {
        validTransitions: [],
        availableTransitions: [],
        blockers: [],
        approvals: { spec: false, signoff: false },
        nextArtifact: null,
        changePath: '.specd/changes/feat',
        schemaInfo: { name: '@specd/schema-std', version: 1, artifacts: [] },
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'feat', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('feat')
    expect(parsed.state).toBe('designing')
    expect(Array.isArray(parsed.artifacts)).toBe(true)
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'missing']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('JSON output contains schema object with name and version', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'add-login',
        state: 'designing',
        specIds: ['auth/login'],
        schemaName: 'std',
        schemaVersion: 1,
      }),
      artifactStatuses: [
        { type: 'proposal', state: 'complete', effectiveStatus: 'complete', files: [] },
      ],
      lifecycle: {
        validTransitions: [],
        availableTransitions: [],
        blockers: [],
        approvals: { spec: false, signoff: false },
        nextArtifact: null,
        changePath: '.specd/changes/add-login',
        schemaInfo: { name: 'std', version: 1, artifacts: [] },
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.schema).toEqual({ name: 'std', version: 1, artifactDag: [] })
    expect(parsed.approvalGates).toEqual({ specEnabled: false, signoffEnabled: false })
  })

  it('renders review output with absolute file paths in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'add-login', state: 'designing' }),
      artifactStatuses: [
        {
          type: 'tasks',
          state: 'drifted-pending-review',
          effectiveStatus: 'drifted-pending-review',
          files: [{ key: 'tasks', filename: 'tasks.md', state: 'drifted-pending-review' }],
        },
      ],
      review: {
        required: true,
        route: 'designing',
        reason: 'artifact-drift',
        affectedArtifacts: [
          {
            type: 'tasks',
            files: [
              {
                key: 'tasks',
                filename: 'tasks.md',
                path: '/project/.specd/changes/add-login/tasks.md',
              },
            ],
          },
        ],
      },
      lifecycle: {
        validTransitions: [],
        availableTransitions: [],
        blockers: [],
        approvals: { spec: false, signoff: false },
        nextArtifact: null,
        changePath: '/project/.specd/changes/add-login',
        schemaInfo: { name: '@specd/schema-std', version: 1, artifacts: [] },
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login'])

    const out = stdout()
    expect(out).toContain('review:')
    expect(out).toContain('/project/.specd/changes/add-login/tasks.md')
    expect(out).not.toContain('tasks: tasks')
  })

  it('JSON output includes review files with filename and absolute path', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'add-login', state: 'designing' }),
      artifactStatuses: [
        {
          type: 'tasks',
          state: 'drifted-pending-review',
          effectiveStatus: 'drifted-pending-review',
          files: [{ key: 'tasks', filename: 'tasks.md', state: 'drifted-pending-review' }],
        },
      ],
      review: {
        required: true,
        route: 'designing',
        reason: 'artifact-drift',
        affectedArtifacts: [
          {
            type: 'tasks',
            files: [
              {
                key: 'tasks',
                filename: 'tasks.md',
                path: '/project/.specd/changes/add-login/tasks.md',
              },
            ],
          },
        ],
      },
      lifecycle: {
        validTransitions: [],
        availableTransitions: [],
        blockers: [],
        approvals: { spec: false, signoff: false },
        nextArtifact: null,
        changePath: '/project/.specd/changes/add-login',
        schemaInfo: { name: '@specd/schema-std', version: 1, artifacts: [] },
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.review).toEqual({
      required: true,
      route: 'designing',
      reason: 'artifact-drift',
      overlapDetail: [],
      affectedArtifacts: [
        {
          type: 'tasks',
          files: [
            {
              key: 'tasks',
              filename: 'tasks.md',
              path: '/project/.specd/changes/add-login/tasks.md',
            },
          ],
        },
      ],
    })
  })
})

// ---------------------------------------------------------------------------
// change transition
// ---------------------------------------------------------------------------

describe('change transition', () => {
  it('exits with error when target state argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'transition', 'my-change']),
    ).rejects.toThrow()
  })

  it('exits 1 when transition is invalid', async () => {
    const { kernel, stderr } = setup()
    const { InvalidStateTransitionError } = await import('@specd/core')
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'drafting' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new InvalidStateTransitionError('drafting', 'done'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'feat', 'done'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 2 when hook fails', async () => {
    const { kernel, stderr } = setup()
    const { HookFailedError } = await import('@specd/core')
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockRejectedValue(
      new HookFailedError('pre-transition', 1, 'hook output'),
    )

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'transition', 'feat', 'implementing'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(2)
    expect(stderr()).toContain('pre-transition')
  })

  it('prints transition confirmation with from → to format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'implementing' }),
      postHookFailures: [],
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'feat', 'implementing'])

    const out = stdout()
    expect(out).toContain('transitioned')
    expect(out).toContain('feat')
    expect(out).toMatch(/→|->/)
    expect(out).toContain('implementing')
  })

  it('outputs json with new state', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'implementing' }),
      postHookFailures: [],
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'transition',
      'feat',
      'implementing',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.to).toBe('implementing')
  })

  it('JSON output includes from and to fields', async () => {
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

  it('passes approvals flags from config', async () => {
    const config = makeMockConfig({ approvals: { spec: true, signoff: false } })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const kernel = makeMockKernel()
    vi.mocked(createCliKernel).mockResolvedValue(kernel)
    captureStdout()
    captureStderr()
    mockProcessExit()

    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      artifactStatuses: [],
    })
    kernel.changes.transition.execute.mockResolvedValue({
      change: makeMockChange(),
      postHookFailures: [],
    })

    const program = makeProgram()
    registerChangeTransition(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'transition', 'feat', 'implementing'])

    const call = kernel.changes.transition.execute.mock.calls[0]![0]
    expect(call.approvalsSpec).toBe(true)
    expect(call.approvalsSignoff).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// change draft
// ---------------------------------------------------------------------------

describe('change draft', () => {
  it('exits with error when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'draft'])).rejects.toThrow()
  })

  it('confirms draft in text format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change'])

    expect(stdout()).toContain('drafted change my-change')
  })

  it('passes reason to use case when provided', async () => {
    const { kernel } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'draft',
      'my-change',
      '--reason',
      'pausing work',
    ])

    const call = kernel.changes.draft.execute.mock.calls[0]![0]
    expect(call.reason).toBe('pausing work')
  })

  it('does not include reason key when not provided', async () => {
    const { kernel } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change'])

    const call = kernel.changes.draft.execute.mock.calls[0]![0]
    expect('reason' in call).toBe(false)
  })

  it('outputs JSON on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('my-change')
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.draft.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'missing']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 with error when change is already drafted', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.draft.execute.mockRejectedValue(
      new InvalidStateTransitionError('drafting', 'drafted'),
    )

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/i)
  })

  it('passes --force to the use case', async () => {
    const { kernel } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'draft',
      'my-change',
      '--reason',
      'rollback',
      '--force',
    ])

    const call = kernel.changes.draft.execute.mock.calls[0]![0]
    expect(call.force).toBe(true)
  })

  it('exits 1 when historical implementation guard blocks draft', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.draft.execute.mockRejectedValue(
      new HistoricalImplementationGuardError('draft', 'my-change'),
    )

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/implementing/)
  })
})

// ---------------------------------------------------------------------------
// change discard
// ---------------------------------------------------------------------------

describe('change discard', () => {
  it('exits with error when --reason is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'discard', 'my-change']),
    ).rejects.toThrow()
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.discard.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'discard', 'missing', '--reason', 'done'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 with usage error when --reason is empty string', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))

    try {
      await program.parseAsync(['node', 'specd', 'change', 'discard', 'my-change', '--reason', ''])
    } catch {
      // Commander exitOverride may throw
    }

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/i)
  })

  it('confirms discard in text format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'my-change',
      '--reason',
      'no longer needed',
    ])

    expect(stdout()).toContain('discarded change my-change')
  })

  it('passes reason to use case', async () => {
    const { kernel } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'my-change',
      '--reason',
      'duplicate work',
    ])

    const call = kernel.changes.discard.execute.mock.calls[0]![0]
    expect(call.reason).toBe('duplicate work')
  })

  it('outputs json on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'my-change',
      '--reason',
      'done',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('my-change')
  })

  it('passes --force to the use case', async () => {
    const { kernel } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'my-change',
      '--reason',
      'superseded',
      '--force',
    ])

    const call = kernel.changes.discard.execute.mock.calls[0]![0]
    expect(call.force).toBe(true)
  })

  it('exits 1 when historical implementation guard blocks discard', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.discard.execute.mockRejectedValue(
      new HistoricalImplementationGuardError('discard', 'my-change'),
    )

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'discard', 'my-change', '--reason', 'done'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/implementing/)
  })
})

// ---------------------------------------------------------------------------
// drafts restore
// ---------------------------------------------------------------------------

describe('drafts restore', () => {
  it('exits with error when name argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await expect(program.parseAsync(['node', 'specd', 'drafts', 'restore'])).rejects.toThrow()
  })

  it('confirms restore in text format', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.restore.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'restore', 'my-change'])

    expect(stdout()).toContain('restored change my-change')
  })

  it('outputs json on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.restore.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync([
      'node',
      'specd',
      'drafts',
      'restore',
      'my-change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('my-change')
  })

  it('passes name to use case', async () => {
    const { kernel } = setup()
    kernel.changes.restore.execute.mockResolvedValue(undefined)
    captureStdout()

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'restore', 'feat-xyz'])

    expect(kernel.changes.restore.execute.mock.calls[0]![0].name).toBe('feat-xyz')
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.restore.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'restore', 'missing']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})
