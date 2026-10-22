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
import { decode as decodeToon } from '@toon-format/toon'

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
    schemaWarnings: [],
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
    schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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

  it('Text output falls back to canonical status when displayStatus is absent', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      schemaWarnings: [],
      change,
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [
        {
          type: 'proposal',
          state: 'in-progress',
          effectiveStatus: 'in-progress',
          files: [{ key: 'proposal', filename: 'proposal.md', state: 'in-progress' }],
        },
      ],
      lifecycle: defaultLifecycle,
      blockers: [],
      nextAction: defaultNextAction,
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    expect(stdout()).toContain('proposal  in-progress  (effective: in-progress)')
    expect(stdout()).not.toContain('undefined')
  })

  it('Text output omits transitions line when none available', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'my-change', state: 'designing' })
    kernel.changes.status.execute.mockResolvedValue({
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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

describe('Schema advisories', () => {
  const advisory = {
    code: 'SCHEMA_VERSION_DRIFT',
    changeName: 'my-change',
    schemaName: '@specd/schema-std',
    recordedVersion: 1,
    resolvedVersion: 2,
    message:
      "Change 'my-change' was created with schema '@specd/schema-std' version 1 but resolved version 2.",
  }

  function statusWith(warnings: unknown[]) {
    return {
      schemaWarnings: warnings,
      change: makeMockChange({
        name: 'my-change',
        state: 'designing',
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      }),
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        schemaInfo: { name: '@specd/schema-std', version: 2, artifacts: [] },
      },
      blockers: [],
      nextAction: defaultNextAction,
    }
  }

  it('prints resolver advisories under warnings in text output', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.status.execute.mockResolvedValue(statusWith([advisory]))

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    expect(stdout()).toContain('warnings:')
    expect(stdout()).toContain('SCHEMA_VERSION_DRIFT')
    expect(stdout()).toContain('version 1 but resolved version 2')
    // No separate workspace-default comparison on stderr (single advisory source).
    expect(stderr()).not.toContain('active schema')
  })

  it('omits the warnings section when there are no advisories', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(statusWith([]))

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    expect(stdout()).not.toContain('warnings:')
  })

  it('includes schemaWarnings in json output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(statusWith([advisory]))

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change', '--format', 'json'])

    expect(JSON.parse(stdout()).schemaWarnings).toEqual([advisory])
  })

  it('renders the DAG from the change schema instead of the workspace default', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(statusWith([]))
    const getActive = kernel.specs.getActiveSchema.execute

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change'])

    expect(kernel.changes.resolveSchema.execute).toHaveBeenCalledWith({
      changeName: 'my-change',
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    })
    expect(stdout()).toContain('artifacts (DAG):')
    expect(getActive).toHaveBeenCalledTimes(1) // only via the resolveSchema test default
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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
      schemaWarnings: [],
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

describe('reconciled validity and next action', () => {
  it.each(['json', 'toon'] as const)(
    'preserves reconciled state, blockers, validity, and next action in %s',
    async (format) => {
      const { kernel, stdout } = setup()
      kernel.changes.status.execute.mockResolvedValue({
        schemaWarnings: [],
        change: makeMockChange({ name: 'my-change', state: 'designing' }),
        specDependsOn: {},
        implementationTracking: { trackedFiles: [], links: [] },
        artifactStatuses: [],
        lifecycle: defaultLifecycle,
        blockers: [{ code: 'APPROVAL_STALE', message: 'Spec approval is stale' }],
        nextAction: {
          targetStep: 'designing',
          actionType: 'cognitive',
          reason: 'Renew design consent',
          command: '/specd-design',
        },
        validity: {
          specApproval: 'stale',
          signoff: 'not-required',
          verification: 'not-required',
          recovery: { cause: 'spec-approval', from: 'implementing', to: 'designing' },
          blockers: [{ code: 'APPROVAL_STALE', message: 'Spec approval is stale' }],
          projectionChanges: [],
        },
      })
      const program = makeProgram()
      registerChangeStatus(program.command('change'))

      await program.parseAsync([
        'node',
        'specd',
        'change',
        'status',
        'my-change',
        '--format',
        format,
      ])

      const parsed = format === 'json' ? JSON.parse(stdout()) : decodeToon(stdout())
      expect(parsed).toMatchObject({
        state: 'designing',
        blockers: [{ code: 'APPROVAL_STALE' }],
        validity: {
          specApproval: 'stale',
          recovery: { cause: 'spec-approval', to: 'designing' },
        },
        nextAction: { targetStep: 'designing', command: '/specd-design' },
      })
    },
  )

  it('prints validity, attempt, completed evidence, and the core next command', async () => {
    const hash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue({
      schemaWarnings: [],
      change: makeMockChange({
        name: 'my-change',
        state: 'verifying',
        invalidationPolicy: { artifacts: 'downstream', workflow: 'preserve' },
        verification: {
          activeAttempt: {
            id: 'verification-attempt-2',
            startedIn: 'verifying',
            baseline: {
              artifacts: { algorithm: 'artifact-pre-hash-v1', files: { 'spec:login': hash } },
              implementation: {
                hashAlgorithm: 'sha256',
                textNormalization: 'text-v1',
                binaryNormalization: 'bytes-v1',
                files: { 'src/login.ts': { hash, content: 'text', normalization: 'text-v1' } },
              },
            },
          },
          completed: {
            id: 'verification-1',
            attemptId: 'verification-attempt-1',
            status: 'stale',
            fingerprint: {
              artifacts: { algorithm: 'artifact-pre-hash-v1', files: {} },
              implementation: null,
            },
          },
        },
      }),
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers: [{ code: 'VERIFICATION_STALE', message: 'Completed verification is stale' }],
      nextAction: {
        targetStep: 'verifying',
        actionType: 'cognitive',
        reason: 'Renew verification in place',
        command: 'specd changes verification start my-change',
      },
      validity: {
        specApproval: 'valid',
        signoff: 'absent',
        verification: 'stale',
        recovery: null,
        blockers: [{ code: 'VERIFICATION_STALE', message: 'Completed verification is stale' }],
        projectionChanges: [
          {
            projection: 'verification',
            from: 'valid',
            to: 'stale',
            cause: 'implementation-drift',
            differences: [
              {
                scope: 'implementation',
                key: 'src/login.ts',
                kind: 'changed',
                expected: hash,
                actual: hash,
              },
            ],
          },
        ],
      },
    })

    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as {
      state: string
      validity: { verification: string; recovery: null }
      verification: { activeAttempt: { id: string }; completed: { id: string; status: string } }
      nextAction: { command: string }
    }
    expect(parsed.state).toBe('verifying')
    expect(parsed.validity.verification).toBe('stale')
    expect(parsed.validity.recovery).toBeNull()
    expect(parsed.verification.activeAttempt.id).toBe('verification-attempt-2')
    expect(parsed.verification.completed.status).toBe('stale')
    expect(parsed.nextAction.command).toBe('specd changes verification start my-change')
    expect(stdout()).not.toContain(hash)
  })

  it('renders the pipeline in the order Core reports and omits disabled steps', async () => {
    const step = (name: string, optional = false) => ({
      step: name,
      optional,
      available: true,
      isReady: true,
      isPermitted: true,
      blockingArtifacts: [],
    })
    const statusFor = () => ({
      schemaWarnings: [],
      change: makeMockChange({ name: 'skippy', state: 'designing' }),
      specDependsOn: {},
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        availableTransitions: ['ready'],
        // Core omits the disabled `verifying` step and orders by the active pipeline.
        availableSteps: [step('ready'), step('implementing', true), step('done')],
      },
      blockers: [],
      nextAction: defaultNextAction,
    })

    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(statusFor())
    const text = makeProgram()
    registerChangeStatus(text.command('change'))
    await text.parseAsync(['node', 'specd', 'change', 'status', 'skippy'])

    expect(stdout()).toContain('extras:      ready, implementing [optional], done')
    expect(stdout()).not.toMatch(/extras:.*verifying/)

    const { kernel: jsonKernel, stdout: jsonOut } = setup()
    jsonKernel.changes.status.execute.mockResolvedValue(statusFor())
    const json = makeProgram()
    registerChangeStatus(json.command('change'))
    await json.parseAsync(['node', 'specd', 'change', 'status', 'skippy', '--format', 'json'])

    const steps = (
      JSON.parse(jsonOut()) as { lifecycle: { availableSteps: Array<{ step: string }> } }
    ).lifecycle.availableSteps.map((entry) => entry.step)
    expect(steps).toEqual(['ready', 'implementing', 'done'])
  })

  it('displays [optional] annotations in text extras and in structured JSON availableSteps', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'optional-change', state: 'ready' })
    kernel.changes.status.execute.mockResolvedValue({
      schemaWarnings: [],
      change,
      specDependsOn: {},
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        availableTransitions: ['implementing', 'verifying'],
        availableSteps: [
          {
            step: 'implementing',
            optional: true,
            available: true,
            isReady: true,
            isPermitted: true,
            blockingArtifacts: [],
          },
          {
            step: 'verifying',
            optional: false,
            available: true,
            isReady: true,
            isPermitted: true,
            blockingArtifacts: [],
          },
        ],
      },
      blockers: [],
      nextAction: { ...defaultNextAction, targetStep: 'verifying', command: '/specd-verify' },
    })

    const programText = makeProgram()
    registerChangeStatus(programText.command('change'))
    await programText.parseAsync(['node', 'specd', 'change', 'status', 'optional-change'])

    expect(stdout()).toContain('implementing [optional]')
    expect(stdout()).toContain('verifying')
    expect(stdout()).toContain('transitions:  implementing, verifying')

    const { kernel: kernelJson, stdout: stdoutJson } = setup()
    kernelJson.changes.status.execute.mockResolvedValue({
      schemaWarnings: [],
      change,
      specDependsOn: {},
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        availableTransitions: ['implementing', 'verifying'],
        availableSteps: [
          {
            step: 'implementing',
            optional: true,
            available: true,
            isReady: true,
            isPermitted: true,
            blockingArtifacts: [],
          },
        ],
      },
      blockers: [],
      nextAction: { ...defaultNextAction, targetStep: 'verifying', command: '/specd-verify' },
    })

    const programJson = makeProgram()
    registerChangeStatus(programJson.command('change'))
    await programJson.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'optional-change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdoutJson())
    expect(parsed.lifecycle.availableTransitions).toEqual(['implementing', 'verifying'])
    expect(parsed.lifecycle.availableSteps[0]).toMatchObject({
      step: 'implementing',
      optional: true,
    })
  })

  it('renders custom check blockers with check label, message, and checkId', async () => {
    const { kernel, stdout } = setup()
    const change = makeMockChange({ name: 'blocked-change', state: 'implementing' })
    kernel.changes.status.execute.mockResolvedValue({
      schemaWarnings: [],
      change,
      specDependsOn: {},
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        availableTransitions: [],
        availableSteps: [],
      },
      blockers: [
        {
          code: 'CUSTOM_AUDIT_FAILED',
          message: 'Found high severity vulnerability',
          label: 'Code Audit',
          checkId: '@security.code-audit',
        },
      ],
      nextAction: { ...defaultNextAction, targetStep: 'verifying', command: null },
    })

    const programText = makeProgram()
    registerChangeStatus(programText.command('change'))
    await programText.parseAsync(['node', 'specd', 'change', 'status', 'blocked-change'])

    expect(stdout()).toContain(
      '! CUSTOM_AUDIT_FAILED — Code Audit: Found high severity vulnerability',
    )

    const { kernel: kernelJson, stdout: stdoutJson } = setup()
    kernelJson.changes.status.execute.mockResolvedValue({
      schemaWarnings: [],
      change,
      specDependsOn: {},
      artifactStatuses: [],
      lifecycle: {
        ...defaultLifecycle,
        availableTransitions: [],
        availableSteps: [],
      },
      blockers: [
        {
          code: 'CUSTOM_AUDIT_FAILED',
          message: 'Found high severity vulnerability',
          label: 'Code Audit',
          checkId: '@security.code-audit',
        },
      ],
      nextAction: { ...defaultNextAction, targetStep: 'verifying', command: null },
    })

    const programJson = makeProgram()
    registerChangeStatus(programJson.command('change'))
    await programJson.parseAsync([
      'node',
      'specd',
      'change',
      'status',
      'blocked-change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdoutJson())
    expect(parsed.blockers).toEqual([
      {
        code: 'CUSTOM_AUDIT_FAILED',
        message: 'Found high severity vulnerability',
        label: 'Code Audit',
        checkId: '@security.code-audit',
      },
    ])
  })
})

describe('archive bypass hints come from resolved bindings', () => {
  function archivable(
    blockers: ReadonlyArray<Record<string, unknown>>,
    reason = 'Ready to archive',
  ): Record<string, unknown> {
    return {
      schemaWarnings: [],
      change: makeMockChange({ name: 'my-change', state: 'archivable' }),
      specDependsOn: {},
      implementationTracking: { trackedFiles: [], links: [] },
      artifactStatuses: [],
      lifecycle: defaultLifecycle,
      blockers,
      nextAction: {
        targetStep: 'archivable',
        actionType: 'mechanical',
        reason,
        command: '/specd-archive',
      },
    }
  }

  async function run(
    result: Record<string, unknown>,
    format: 'text' | 'json' | 'toon',
  ): Promise<string> {
    const { kernel, stdout } = setup()
    kernel.changes.status.execute.mockResolvedValue(result)
    const program = makeProgram()
    registerChangeStatus(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'status', 'my-change', '--format', format])
    return stdout()
  }

  const overlap = {
    code: 'OVERLAP_CONFLICT',
    message: 'Specs overlap with other active changes',
    label: 'Checking spec overlap',
    checkId: 'spec.overlap',
    bypassFlag: '--skip-checks spec.overlap',
  }
  const scope = {
    code: 'IMPLEMENTATION_STATE',
    message: 'Links resolve outside scope',
    label: 'Checking implementation links',
    checkId: 'impl.linksInScope',
    bypassFlag: '--skip-checks impl.linksInScope',
  }
  const readOnly = {
    code: 'READ_ONLY_WORKSPACE',
    message: 'Contains readOnly specs',
    label: 'Checking workspace ownership',
    checkId: 'workspace.readOnly',
  }

  it('renders the projected bypass flag under a skippable blocker in text', async () => {
    const output = await run(archivable([overlap]), 'text')
    expect(output).toContain('! OVERLAP_CONFLICT — Checking spec overlap: Specs overlap')
    expect(output).toContain('    bypass: --skip-checks spec.overlap')
  })

  it('gives every skippable blocker its own flag and none to a locked one', async () => {
    const output = await run(archivable([overlap, scope, readOnly]), 'text')
    expect(output).toContain('    bypass: --skip-checks spec.overlap')
    expect(output).toContain('    bypass: --skip-checks impl.linksInScope')
    expect(output.match(/bypass:/g)).toHaveLength(2)
    expect(output).toContain('READ_ONLY_WORKSPACE')
  })

  it('never builds a bypass when GetStatus supplies none', async () => {
    const hardened = { ...overlap }
    delete (hardened as { bypassFlag?: string }).bypassFlag
    const output = await run(
      archivable([hardened], 'Specs overlap with other active changes'),
      'text',
    )
    expect(output).toContain('OVERLAP_CONFLICT')
    expect(output).not.toContain('bypass:')
    expect(output).not.toContain('--skip-checks')
  })

  it.each(['json', 'toon'] as const)('serializes the same hints in %s', async (format) => {
    const hardened = { ...overlap, code: 'HARDENED_OVERLAP' }
    delete (hardened as { bypassFlag?: string }).bypassFlag
    const output = await run(archivable([overlap, readOnly, hardened]), format)
    const parsed = format === 'json' ? JSON.parse(output) : decodeToon(output)
    const blockersList = parsed.blockers as Array<{ code: string; bypassFlag?: string }>
    const byCode = Object.fromEntries(blockersList.map((b) => [b.code, b.bypassFlag]))
    expect(byCode.OVERLAP_CONFLICT).toBe('--skip-checks spec.overlap')
    expect(byCode.READ_ONLY_WORKSPACE).toBeUndefined()
    expect(byCode.HARDENED_OVERLAP).toBeUndefined()
    if (format === 'json') {
      const readOnlyRow = blockersList.find((b) => b.code === 'READ_ONLY_WORKSPACE')!
      expect('bypassFlag' in readOnlyRow).toBe(false)
    }
  })

  it('shows no overlap blocker when the schema disabled spec.overlap (none projected)', async () => {
    const output = await run(archivable([]), 'text')
    expect(output).not.toContain('OVERLAP_CONFLICT')
    expect(output).not.toContain('bypass:')
  })
})
