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
} from '../helpers.js'

vi.mock('../../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../../src/commands/change/_implementation-tracking.js', () => ({
  enrichImplementationTracking: vi.fn(),
}))

import { resolveCliContext } from '../../../src/helpers/cli-context.js'
import { enrichImplementationTracking } from '../../../src/commands/change/_implementation-tracking.js'
import { registerChangeStatus } from '../../../src/commands/change/status.js'
import { ChangeNotFoundError } from '@specd/sdk'

const defaultLifecycle = {
  validTransitions: ['ready', 'designing'],
  availableTransitions: [],
  availableSteps: [],
  blockers: [],
  approvals: { spec: false, signoff: false },
  nextArtifact: null,
  changePath: '.specd/changes/20260115-100000-my-change',
  schemaInfo: { name: '@specd/schema-std', version: 1, artifacts: [] },
}

const defaultNextAction = {
  targetStep: 'designing',
  actionType: 'cognitive',
  reason: '...',
  command: '/specd-design',
}

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  vi.mocked(enrichImplementationTracking).mockResolvedValue({
    trackedFiles: [],
    links: [],
    graphHint: {
      status: 'fresh',
      message: 'Code graph is fresh; stale symbol diagnostics are authoritative.',
    },
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

it('help documents nested schema.artifactDag and overlapDetail', async () => {
  const { stdout } = setup()
  const program = makeProgram()
  registerChangeStatus(program.command('change'))
  await program.parseAsync(['node', 'specd', 'change', 'status', '--help']).catch(() => {})
  expect(stdout()).toContain('overlapDetail')
  expect(stdout()).toContain('schema: { name: string, version: number, artifactDag:')
})

it('JSON drafted status includes isDrafted and empty transitions', async () => {
  const { kernel, stdout } = setup()
  kernel.changes.status.execute.mockResolvedValue({
    draftView: {
      name: 'my-change',
      state: 'designing',
      specIds: [],
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    },
    specDependsOn: {},
    artifactStatuses: [],
    lifecycle: {
      ...defaultLifecycle,
      availableTransitions: ['ready'],
      availableSteps: [{ step: 'ready', available: true, isReady: true, isPermitted: true }],
      changePath: '.specd/drafts/my-change',
    },
    blockers: [],
    nextAction: { ...defaultNextAction, command: '/specd-design' },
  })

  const program = makeProgram()
  registerChangeStatus(program.command('change'))
  await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change', '--format', 'json'])

  const parsed = JSON.parse(stdout())
  expect(parsed.isDrafted).toBe(true)
  expect(parsed.availableTransitions).toEqual([])
  expect(parsed.availableSteps).toEqual([])
  expect(parsed.nextAction.command).toBeNull()
})

it('text drafted status marks drafted and omits transition commands', async () => {
  const { kernel, stdout } = setup()
  kernel.changes.status.execute.mockResolvedValue({
    draftView: {
      name: 'my-change',
      state: 'designing',
      specIds: ['core:core/change'],
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    },
    specDependsOn: { 'core:core/change': [] },
    artifactStatuses: [],
    lifecycle: {
      ...defaultLifecycle,
      availableTransitions: [],
      changePath: '.specd/drafts/my-change',
    },
    blockers: [],
    nextAction: { ...defaultNextAction, command: null, reason: 'Change is drafted' },
  })

  const program = makeProgram()
  registerChangeStatus(program.command('change'))
  await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

  const text = stdout()
  expect(text).toContain('state:       designing (drafted)')
  expect(text).toContain('transitions:  (none — change is drafted)')
  expect(text).toContain('command: (none)')
  expect(text).not.toContain('change transition')
})

describe('Command signature', () => {
  it('Missing name argument', async () => {
    setup()

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'status'])).rejects.toThrow(
      CommanderError,
    )
  })
})

describe('Output format', () => {
  it('Normal status output', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'designing',
      specIds: ['auth/login'],
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        { type: 'proposal', state: 'complete', effectiveStatus: 'complete', files: [] },
      ],
      lifecycle: { ...defaultLifecycle, nextArtifact: 'specs' },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login'])

    expect(kernel.changes.refreshImplementationTracking.execute).not.toHaveBeenCalled()
    expect(kernel.changes.status.execute).toHaveBeenCalledWith({ name: 'add-login' })

    const out = stdout()
    expect(out).toContain('change:')
    expect(out).toContain('add-login')
    expect(out).toContain('state:')
    expect(out).toContain('designing')
    expect(out).not.toContain('specs:')
    expect(out).toContain('specs and dependencies:')
    expect(out).toContain('auth/login')
    expect(out).toContain('proposal')
    expect(out).toContain('lifecycle:')
    expect(out).toContain('approvals:')
    expect(out).toContain('path:')
  })

  it('Effective status reflects dependency cascading', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        { type: 'proposal', state: 'in-progress', effectiveStatus: 'in-progress', files: [] },
        { type: 'spec', state: 'in-progress', effectiveStatus: 'in-progress', files: [] },
      ],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    const lines = out.split('\n')
    // Look for the artifact detail line, not the next action command
    const artifactLine = lines.find((l: string) => l.startsWith('  spec  '))
    expect(artifactLine).toContain('in-progress')
  })

  it('Text output shows available transitions', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: { ...defaultLifecycle, availableTransitions: ['ready', 'designing'] },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('transitions:')
    expect(out).toContain('ready, designing')
  })

  it('Text output omits transitions line when none available', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: { ...defaultLifecycle, availableTransitions: [] },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).not.toContain('transitions:')
  })

  it('Text output shows blockers', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        blockers: [{ transition: 'ready', reason: 'requires', blocking: ['specs', 'verify'] }],
      },
      blockers: [{ code: 'INCOMPLETE_ARTIFACT', message: "Required artifact 'specs' is missing" }],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('blockers:')
    expect(out).toContain('! INCOMPLETE_ARTIFACT')
    expect(out).toContain("Required artifact 'specs' is missing")
  })

  it('Text blockers include gerund label', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [
        {
          code: 'DEPS_INCONSISTENT',
          label: 'Checking spec dependencies',
          checkId: 'deps.consistent',
          message: 'Extracted dependsOn disagrees',
        },
      ],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    expect(stdout()).toContain(
      '! DEPS_INCONSISTENT — Checking spec dependencies: Extracted dependsOn disagrees',
    )
  })

  it('Text output shows next artifact', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: { ...defaultLifecycle, nextArtifact: 'specs' },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('next artifact: specs')
  })

  it('Text output omits next artifact when all done', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: { ...defaultLifecycle, nextArtifact: null },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).not.toContain('next artifact:')
  })

  it('JSON output contains lifecycle object', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'designing',
      specIds: ['auth/login'],
      schemaName: 'std',
      schemaVersion: 1,
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        { type: 'proposal', state: 'complete', effectiveStatus: 'complete', files: [] },
      ],
      lifecycle: {
        ...defaultLifecycle,
        nextArtifact: 'specs',
        blockers: [{ transition: 'ready', reason: 'requires', blocking: ['specs'] }],
      },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.name).toBe('add-login')
    expect(parsed.state).toBe('designing')
    expect(parsed.lifecycle).toBeDefined()
    expect(parsed.lifecycle.validTransitions).toEqual(['ready', 'designing'])
    expect(parsed.lifecycle.availableTransitions).toEqual([])
    expect(parsed.lifecycle.blockers).toHaveLength(1)
    expect(parsed.lifecycle.blockers[0].transition).toBe('ready')
    expect(parsed.lifecycle.approvals).toEqual({ spec: false, signoff: false })
    expect(parsed.lifecycle.nextArtifact).toBe('specs')
    expect(parsed.lifecycle.changePath).toBeDefined()
    expect(parsed.lifecycle.schemaInfo).toEqual({ name: '@specd/schema-std', version: 1 })
  })

  it('JSON artifactDag children match schema DAG childrenOf', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'dag-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        {
          type: 'proposal',
          state: 'complete',
          effectiveStatus: 'complete',
          displayStatus: 'complete',
          files: [],
        },
        {
          type: 'specs',
          state: 'missing',
          effectiveStatus: 'missing',
          displayStatus: 'missing',
          files: [],
        },
        {
          type: 'verify',
          state: 'missing',
          effectiveStatus: 'missing',
          displayStatus: 'missing',
          files: [],
        },
      ],
      lifecycle: {
        ...defaultLifecycle,
        schemaInfo: {
          name: '@specd/schema-std',
          version: 1,
          artifacts: [
            { id: 'proposal', scope: 'change', requires: [] },
            { id: 'specs', scope: 'spec', requires: ['proposal'] },
            { id: 'verify', scope: 'spec', requires: ['specs'] },
          ],
        },
      },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'dag-change',
      '--format',
      'json',
    ])

    const result = JSON.parse(stdout())
    const proposal = result.artifactDag.find((entry: { id: string }) => entry.id === 'proposal')
    const specs = result.artifactDag.find((entry: { id: string }) => entry.id === 'specs')
    expect(proposal.children).toEqual(['specs'])
    expect(specs.children).toEqual(['verify'])
    expect(result.artifactDag.map((entry: { id: string }) => entry.id)).toEqual([
      'proposal',
      'specs',
      'verify',
    ])
  })

  it('JSON output includes hasTasks and drift-aware state in artifactDag', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'add-login',
      state: 'implementing',
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        {
          type: 'proposal',
          state: 'complete',
          effectiveStatus: 'complete',
          displayStatus: 'complete-with-drift',
          taskCompletion: { complete: 3, incomplete: 7, total: 10 },
          files: [{ key: 'proposal', filename: 'proposal.md', state: 'complete', hasDrift: true }],
        },
      ],
      lifecycle: {
        ...defaultLifecycle,
        schemaInfo: {
          name: '@specd/schema-std',
          version: 1,
          artifacts: [{ id: 'proposal', scope: 'change', hasTasks: true, requires: [] }],
        },
      },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login', '--format', 'json'])

    const result = JSON.parse(stdout())
    const proposal = result.artifactDag.find((a: any) => a.id === 'proposal')
    expect(proposal.hasTasks).toBe(true)
    expect(proposal.state).toBe('complete-with-drift')
    expect(result.artifacts[0].taskCompletion).toEqual({ complete: 3, incomplete: 7, total: 10 })
  })

  it('renders implementation tracking in text output', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'impl-change',
      state: 'implementing',
      specIds: ['core:change'],
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: defaultNextAction,
      implementationTracking: {
        trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'open' }],
        links: [
          {
            specId: 'core:change',
            file: 'packages/core/src/change.ts',
            fileLinkExplicit: true,
            symbols: ['Change.transition'],
          },
        ],
      },
    })
    vi.mocked(enrichImplementationTracking).mockResolvedValue({
      trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'open' }],
      links: [
        {
          specId: 'core:change',
          file: 'packages/core/src/change.ts',
          fileLinkExplicit: true,
          symbols: ['Change.transition'],
          symbolResolutions: [],
        },
      ],
      graphHint: {
        status: 'fresh',
        message: 'Code graph is fresh; stale symbol diagnostics are authoritative.',
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'impl-change',
      '--implementation',
    ])

    const out = stdout()
    expect(out).toContain('implementation:')
    expect(out).toContain('Change.transition')
    expect(out).toContain('Code graph is fresh')
  })

  it('omits implementation tracking by default', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'impl-change',
      state: 'implementing',
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: defaultNextAction,
      implementationTracking: {
        trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'open' }],
        links: [],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'impl-change'])

    const out = stdout()
    expect(out).not.toContain('implementation:')
  })

  it('omits implementation tracking in JSON output by default', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'impl-change',
      state: 'implementing',
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: defaultNextAction,
      implementationTracking: {
        trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'open' }],
        links: [],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'impl-change',
      '--format',
      'json',
    ])

    const result = JSON.parse(stdout())
    expect(result.implementationTracking).toBeUndefined()
  })
})

describe('Schema version warning', () => {
  it('Schema mismatch', async () => {
    const { kernel, stderr } = setup()
    const change = makeMockChange({
      name: 'my-change',
      state: 'designing',
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        schemaInfo: { name: '@specd/schema-std', version: 2, artifacts: [] },
      },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const err = stderr()
    expect(err).toContain('warning:')
    expect(err).toContain('@specd/schema-std@1')
    expect(err).toContain('@specd/schema-std@2')
  })
})

describe('Change not found', () => {
  it('Unknown change name', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.status.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

describe('Overlap conflict display', () => {
  it('given spec-overlap-conflict, when text status renders, then prints review header and overlap peers without file lists', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'overlap-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: defaultNextAction,
      review: {
        required: true,
        route: 'designing',
        reason: 'spec-overlap-conflict',
        message: 'Conflict detected with archived overlapping specs',
        affectedArtifacts: [
          {
            type: 'proposal',
            files: [
              {
                key: 'proposal',
                filename: 'proposal.md',
                path: '/project/.specd/changes/overlap-change/proposal.md',
              },
            ],
          },
        ],
        overlapDetail: [
          { archivedChangeName: 'beta', overlappingSpecIds: ['core:core/config'] },
          { archivedChangeName: 'alpha', overlappingSpecIds: ['core:core/kernel'] },
        ],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'overlap-change'])

    const out = stdout()
    expect(out).toContain('review:')
    expect(out).toContain('required: yes')
    expect(out).toContain('reason:   spec-overlap-conflict')
    expect(out).toContain('message:  Conflict detected with archived overlapping specs')
    expect(out).not.toContain('OVERLAP_CONFLICT')
    expect(out).not.toContain('/project/.specd/changes/overlap-change/proposal.md')
    expect(out).toContain('overlap:')
    expect(out).toContain('archived: beta, specs: core:core/config')
    expect(out).toContain('archived: alpha, specs: core:core/kernel')
  })

  it('hides OVERLAP_CONFLICT in text when review reason is spec-overlap-conflict', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'overlap-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [
        {
          code: 'OVERLAP_CONFLICT',
          message: 'live overlap',
          label: 'Checking spec overlap',
        },
      ],
      nextAction: defaultNextAction,
      review: {
        required: true,
        route: 'designing',
        reason: 'spec-overlap-conflict',
        message: 'Conflict detected with archived overlapping specs',
        affectedArtifacts: [],
        overlapDetail: [],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'overlap-change'])

    expect(stdout()).not.toContain('OVERLAP_CONFLICT')
  })

  it('prints live OVERLAP_CONFLICT when review is not spec-overlap-conflict', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'archivable-change', state: 'archivable' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [
        {
          code: 'OVERLAP_CONFLICT',
          message: 'live overlap',
          label: 'Checking spec overlap',
        },
      ],
      nextAction: defaultNextAction,
      review: {
        required: false,
        route: null,
        reason: null,
        message: '',
        affectedArtifacts: [],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'archivable-change'])

    expect(stdout()).toContain('OVERLAP_CONFLICT')
  })

  it('JSON output includes overlapDetail array', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({
      name: 'overlap-change',
      state: 'designing',
      specIds: ['core:core/config'],
    })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: defaultNextAction,
      review: {
        required: true,
        route: 'designing',
        reason: 'spec-overlap-conflict',
        message: 'Conflict detected with archived overlapping specs',
        affectedArtifacts: [],
        overlapDetail: [{ archivedChangeName: 'beta', overlappingSpecIds: ['core:core/config'] }],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'overlap-change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.review.overlapDetail).toHaveLength(1)
    expect(parsed.review.overlapDetail[0].archivedChangeName).toBe('beta')
    expect(parsed.review.overlapDetail[0].overlappingSpecIds).toEqual(['core:core/config'])
    expect(parsed.review.message).toBe('Conflict detected with archived overlapping specs')
  })

  it('JSON output includes empty overlapDetail for non-overlap reasons', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'no-overlap', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: defaultNextAction,
      review: {
        required: false,
        route: null,
        reason: null,
        affectedArtifacts: [],
        overlapDetail: [],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'no-overlap',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.review.overlapDetail).toEqual([])
  })
})

describe('Artifact DAG rendering', () => {
  it('renders a simple tree with correct indentation and connectors', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })

    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        { type: 'proposal', state: 'complete', effectiveStatus: 'complete', files: [] },
        { type: 'design', state: 'complete', effectiveStatus: 'complete', files: [] },
        {
          type: 'tasks',
          state: 'missing',
          effectiveStatus: 'missing',
          taskCompletion: { complete: 3, incomplete: 7, total: 10 },
          files: [],
        },
      ],
      blockers: [],
      nextAction: defaultNextAction,
      lifecycle: {
        ...defaultLifecycle,
        schemaInfo: {
          name: 'test-schema',
          version: 1,
          artifacts: [
            { id: 'proposal', scope: 'change', hasTasks: false, requires: [] },
            { id: 'design', scope: 'spec', hasTasks: false, requires: ['proposal'] },
            { id: 'tasks', scope: 'spec', hasTasks: true, requires: ['design'] },
          ],
        },
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('artifacts (DAG):')

    // Check tree structure
    const lines = out.split('\n')
    const dagStart = lines.findIndex((l: string) => l.includes('artifacts (DAG):'))
    const dagLines = lines.slice(dagStart + 3, dagStart + 6)

    expect(dagLines[0]).toMatch(/\[✓\] proposal \[scope: change\]/)
    expect(dagLines[1]).toMatch(/└── \[✓\] design \[scope: spec\]/)
    expect(dagLines[2]).toMatch(/    └── \[ \] tasks \[scope: spec\] \[hasTasks - 3\/10 done\]/)
  })

  it('shows task counts in the details section when taskCompletion is present', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'implementing' })

    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        {
          type: 'tasks',
          state: 'complete',
          displayStatus: 'complete',
          effectiveStatus: 'complete',
          taskCompletion: { complete: 5, incomplete: 5, total: 10 },
          files: [],
        },
      ],
      blockers: [],
      nextAction: defaultNextAction,
      lifecycle: defaultLifecycle,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    expect(stdout()).toContain('tasks  complete  (effective: complete)  tasks: 5/10')
  })

  it('renders multiple roots and branches correctly', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })

    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        { type: 'A', state: 'complete', effectiveStatus: 'complete', files: [] },
        { type: 'B', state: 'complete', effectiveStatus: 'complete', files: [] },
        { type: 'C', state: 'complete', effectiveStatus: 'complete', files: [] },
      ],
      blockers: [],
      nextAction: defaultNextAction,
      lifecycle: {
        ...defaultLifecycle,
        schemaInfo: {
          name: 'test-schema',
          version: 1,
          artifacts: [
            { id: 'A', scope: 'change', requires: [] },
            { id: 'B', scope: 'change', requires: [] },
            { id: 'C', scope: 'spec', requires: ['A'] },
          ],
        },
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toMatch(/\[✓\] A \[scope: change\]/)
    expect(out).toMatch(/└── \[✓\] C \[scope: spec\]/)
    expect(out).toMatch(/\[✓\] B \[scope: change\]/)
  })
})

describe('Lifecycle projections from GetStatus', () => {
  it('given GetStatus omits verifying, when text status renders, then displayed transitions omit verifying', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'implementing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        availableTransitions: ['implementing'],
      },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('transitions:')
    expect(out).toContain('implementing')
    expect(out).not.toMatch(/transitions:.*verifying/)
  })

  it('given GetStatus recommends verify, when text status renders, then command is /specd-verify', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'implementing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Tasks are complete',
        command: '/specd-verify',
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    const out = stdout()
    expect(out).toContain('command: /specd-verify')
    expect(out).not.toContain('/specd-implement')
  })

  it('JSON output includes blockers label and checkId', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [
        {
          code: 'DEPS_INCONSISTENT',
          label: 'Checking spec dependencies',
          checkId: 'deps.consistent',
          message: 'Extracted dependsOn disagrees',
        },
      ],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.blockers[0]).toMatchObject({
      code: 'DEPS_INCONSISTENT',
      label: 'Checking spec dependencies',
      checkId: 'deps.consistent',
    })
  })
})

describe('artifact-drift review rendering', () => {
  it('given artifact drift, when text status renders, then omits duplicated review file paths', async () => {
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
        ...defaultLifecycle,
        validTransitions: [],
        availableTransitions: [],
        changePath: '/project/.specd/changes/add-login',
      },
      blockers: [],
      nextAction: {
        ...defaultNextAction,
        targetStep: 'designing',
        actionType: 'cognitive',
        command: '/specd-design',
      },
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login'])

    const out = stdout()
    expect(out).toContain('review:')
    expect(out).toContain('required: yes')
    expect(out).toContain('reason:   artifact-drift')
    expect(out).not.toContain('/project/.specd/changes/add-login/tasks.md')
    expect(out).toContain('artifacts (details):')
    expect(out).toContain('tasks.md')
  })

  it('given artifact-review-required, when text status renders, then omits duplicated review file paths', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      change: makeMockChange({ name: 'add-login', state: 'designing' }),
      artifactStatuses: [
        {
          type: 'specs',
          state: 'pending-review',
          effectiveStatus: 'pending-review',
          files: [{ key: 'specs', filename: 'spec.md', state: 'pending-review' }],
        },
      ],
      review: {
        required: true,
        route: 'designing',
        reason: 'artifact-review-required',
        message: 'Review pending spec artifacts',
        affectedArtifacts: [
          {
            type: 'specs',
            files: [
              {
                key: 'specs',
                filename: 'spec.md',
                path: '/project/.specd/changes/add-login/specs/core/foo/spec.md',
              },
            ],
          },
        ],
      },
      lifecycle: {
        ...defaultLifecycle,
        validTransitions: [],
        availableTransitions: [],
        changePath: '/project/.specd/changes/add-login',
      },
      blockers: [],
      nextAction: defaultNextAction,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login'])

    const out = stdout()
    expect(out).toContain('review:')
    expect(out).toContain('reason:   artifact-review-required')
    expect(out).toContain('message:  Review pending spec artifacts')
    expect(out).not.toContain('/project/.specd/changes/add-login/specs/core/foo/spec.md')
    expect(out).toContain('artifacts (details):')
    expect(out).toContain('spec.md')
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
        ...defaultLifecycle,
        validTransitions: [],
        availableTransitions: [],
        changePath: '/project/.specd/changes/add-login',
      },
      blockers: [],
      nextAction: {
        ...defaultNextAction,
        targetStep: 'designing',
        actionType: 'cognitive',
        command: '/specd-design',
      },
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'add-login', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.review.affectedArtifacts[0].files[0]).toEqual({
      key: 'tasks',
      filename: 'tasks.md',
      path: '/project/.specd/changes/add-login/tasks.md',
    })
  })
})
