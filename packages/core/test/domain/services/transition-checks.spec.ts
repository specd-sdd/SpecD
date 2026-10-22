import { describe, expect, it } from 'vitest'
import { runDepsConsistent } from '../../../src/domain/checks/deps-consistent.js'
import { runImplFilesResolved } from '../../../src/domain/checks/impl-files-resolved.js'
import { protocolEdge } from '../../../src/domain/checks/protocol-edge.js'
import { schemaNameMatch } from '../../../src/domain/checks/schema-name-match.js'
import { runSpecOverlap } from '../../../src/domain/checks/spec-overlap.js'
import { runWorkspaceReadOnly } from '../../../src/domain/checks/workspace-read-only.js'
import { runTasksEmpty } from '../../../src/domain/checks/workflow-tasks-empty.js'
import {
  ARCHIVE_BINDINGS,
  TRANSITION_BINDINGS,
  TRANSITION_BINDING_SPECS,
  boundFromStates,
  boundToStates,
} from '../../../src/domain/services/check-bindings.js'
import { makeSchema, makeWorkflowStep } from '../../application/use-cases/helpers.js'
import { bindingMatches } from '../../../src/domain/services/evaluate-transition-predicates.js'
import {
  CHECK_LABELS,
  checkMatches,
  classifyAlong,
  applyBindingSpecs,
  resolveEffectiveBindings,
  type BuiltinCheckId,
} from '../../../src/domain/services/transition-checks.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import { VALID_TRANSITIONS } from '../../../src/domain/value-objects/change-state.js'

const APPROVALS = { spec: false, signoff: false } as const
const SCHEMA_STD = makeSchema()

describe('classifyAlong', () => {
  it('given ready to designing, when classified, then redesign', () => {
    expect(classifyAlong('ready', 'designing', SCHEMA_STD, APPROVALS)).toBe('redesign')
  })

  it('given verifying to implementing, when classified, then backward', () => {
    expect(classifyAlong('verifying', 'implementing', SCHEMA_STD, APPROVALS)).toBe('backward')
  })

  it('given archiving to archivable, when classified, then recovery not backward', () => {
    expect(classifyAlong('archiving', 'archivable', SCHEMA_STD, APPROVALS)).toBe('recovery')
  })

  it('given ready to implementing, when classified, then forward', () => {
    expect(classifyAlong('ready', 'implementing', SCHEMA_STD, APPROVALS)).toBe('forward')
  })

  it('given done to implementing, when classified, then backward', () => {
    expect(classifyAlong('done', 'implementing', SCHEMA_STD, APPROVALS)).toBe('backward')
  })

  it('given designing to designing, when classified, then any', () => {
    expect(classifyAlong('designing', 'designing', SCHEMA_STD, APPROVALS)).toBe('any')
  })

  it('given pending-spec-approval to spec-approved, when classified, then forward', () => {
    expect(classifyAlong('pending-spec-approval', 'spec-approved', SCHEMA_STD, APPROVALS)).toBe(
      'forward',
    )
  })

  it('given implementing to verifying, when classified, then forward', () => {
    expect(classifyAlong('implementing', 'verifying', SCHEMA_STD, APPROVALS)).toBe('forward')
  })

  it('given implementing disabled, when ready to verifying, then forward and implementing remains protocol', () => {
    const schema = makeSchema([], [makeWorkflowStep('implementing', { disabled: true })])
    expect(classifyAlong('ready', 'verifying', schema, APPROVALS)).toBe('forward')
    expect(VALID_TRANSITIONS.implementing).toBeDefined()
    expect(VALID_TRANSITIONS.ready).toContain('implementing')
  })

  it('given implementing disabled, when verifying to implementing, then off-pipeline any', () => {
    const schema = makeSchema([], [makeWorkflowStep('implementing', { disabled: true })])
    expect(classifyAlong('verifying', 'implementing', schema, APPROVALS)).toBe('any')
  })

  it('given ready omitted from workflow, when ready to implementing, then forward', () => {
    expect(classifyAlong('ready', 'implementing', SCHEMA_STD, APPROVALS)).toBe('forward')
  })

  it('given unknown workflow step, when classifying ready to implementing, then still forward', () => {
    expect(classifyAlong('ready', 'implementing', SCHEMA_STD, APPROVALS)).toBe('forward')
  })
})

describe('checkMatches', () => {
  it('given impl exit applicability, when ready to verifying, then does not match', () => {
    expect(
      checkMatches(
        { scope: 'transition', from: 'implementing', to: '*', along: 'forward' },
        {
          scope: 'transition',
          from: 'ready',
          to: 'verifying',
          along: classifyAlong('ready', 'verifying', SCHEMA_STD, APPROVALS),
        },
      ),
    ).toBe(false)
  })

  it('given impl exit applicability, when implementing to verifying, then matches', () => {
    expect(
      checkMatches(
        { scope: 'transition', from: 'implementing', to: '*', along: 'forward' },
        {
          scope: 'transition',
          from: 'implementing',
          to: 'verifying',
          along: classifyAlong('implementing', 'verifying', SCHEMA_STD, APPROVALS),
        },
      ),
    ).toBe(true)
  })

  it('given impl exit forward applicability, when implementing to designing, then does not match', () => {
    expect(
      checkMatches(
        { scope: 'transition', from: 'implementing', to: '*', along: 'forward' },
        {
          scope: 'transition',
          from: 'implementing',
          to: 'designing',
          along: classifyAlong('implementing', 'designing', SCHEMA_STD, APPROVALS),
        },
      ),
    ).toBe(false)
  })

  it('given enter-ready applicability, when designing to ready, then matches', () => {
    expect(
      checkMatches(
        { scope: 'transition', from: '*', to: 'ready', along: 'any' },
        {
          scope: 'transition',
          from: 'designing',
          to: 'ready',
          along: classifyAlong('designing', 'ready', SCHEMA_STD, APPROVALS),
        },
      ),
    ).toBe(true)
  })

  it('given approval.spec forward implementing, when ready to designing, then does not match', () => {
    expect(
      checkMatches(
        { scope: 'transition', from: 'ready', to: 'implementing', along: 'forward' },
        {
          scope: 'transition',
          from: 'ready',
          to: 'designing',
          along: classifyAlong('ready', 'designing', SCHEMA_STD, APPROVALS),
        },
      ),
    ).toBe(false)
  })

  it('given hook.post, when ready to designing, then does not match', () => {
    expect(
      checkMatches(
        { scope: 'transition', from: '*', to: '*', along: 'forward' },
        {
          scope: 'transition',
          from: 'ready',
          to: 'designing',
          along: classifyAlong('ready', 'designing', SCHEMA_STD, APPROVALS),
        },
      ),
    ).toBe(false)
  })

  it('given hook.post, when implementing to verifying, then matches', () => {
    expect(
      checkMatches(
        { scope: 'transition', from: '*', to: '*', along: 'forward' },
        {
          scope: 'transition',
          from: 'implementing',
          to: 'verifying',
          along: classifyAlong('implementing', 'verifying', SCHEMA_STD, APPROVALS),
        },
      ),
    ).toBe(true)
  })
})

describe('check registry bindings', () => {
  it('given a check object, when inspected, then it has no applicability', () => {
    expect('applicability' in protocolEdge).toBe(false)
    expect('applicability' in schemaNameMatch).toBe(false)
  })

  it('given every registered check, when inspected, then kind is declared', () => {
    for (const binding of [...TRANSITION_BINDINGS, ...ARCHIVE_BINDINGS]) {
      expect(binding.check.kind === 'predicate' || binding.check.kind === 'effect').toBe(true)
    }
    expect(protocolEdge.kind).toBe('predicate')
    expect(schemaNameMatch.kind).toBe('predicate')
  })

  it('given every registered check, when inspected, then label is the canonical gerund', () => {
    for (const binding of [...TRANSITION_BINDINGS, ...ARCHIVE_BINDINGS]) {
      expect(binding.check.label).toBe(CHECK_LABELS[binding.check.id as BuiltinCheckId])
      expect(binding.check.label.startsWith('Executing:')).toBe(false)
    }
  })

  it('given archive-only checks, when the registry binds them, then each row has archive applicability', () => {
    for (const binding of ARCHIVE_BINDINGS) {
      expect(binding.applicability.some((row) => row.scope === 'archive')).toBe(true)
    }
    expect(ARCHIVE_BINDINGS.some((row) => row.check.id === 'approval.signoff')).toBe(false)
  })

  it('given shared runners, when bound for transition and archive, then the check object is reused', () => {
    const transitionDeps = TRANSITION_BINDINGS.find((row) => row.check.id === 'deps.consistent')
    const archiveDeps = ARCHIVE_BINDINGS.find((row) => row.check.id === 'deps.consistent')
    expect(transitionDeps?.check).toBe(archiveDeps?.check)
    expect(transitionDeps?.check).toBeDefined()
  })

  it('given approval checks, when boundFromStates is called, then it returns registry from states', () => {
    expect(boundFromStates('approval.spec')).toEqual(['ready'])
    expect(boundFromStates('approval.signoff')).toEqual(['done'])
  })

  it('given approval.spec wildcard, when ready to verifying, then matches', () => {
    const binding = TRANSITION_BINDINGS.find((row) => row.check.id === 'approval.spec')
    expect(binding).toBeDefined()
    const along = classifyAlong('ready', 'verifying', SCHEMA_STD, APPROVALS)
    expect(
      bindingMatches(
        binding!,
        { scope: 'transition', from: 'ready', to: 'verifying', along },
        along,
      ),
    ).toBe(true)
  })

  it('given approval.spec wildcard, when ready to designing, then does not match', () => {
    const binding = TRANSITION_BINDINGS.find((row) => row.check.id === 'approval.spec')
    expect(binding).toBeDefined()
    const along = classifyAlong('ready', 'designing', SCHEMA_STD, APPROVALS)
    expect(
      bindingMatches(
        binding!,
        { scope: 'transition', from: 'ready', to: 'designing', along },
        along,
      ),
    ).toBe(false)
  })

  it('given approval checks, when boundToStates is called, then wildcards are omitted', () => {
    expect(boundToStates('approval.spec')).toEqual([])
    expect(boundToStates('approval.signoff')).toEqual(['archivable'])
  })

  it('given effect bindings, when inspected, then phase and onFailure are set', () => {
    const transitionPost = TRANSITION_BINDINGS.find((row) => row.check.id === 'hook.post')
    const transitionPre = TRANSITION_BINDINGS.find((row) => row.check.id === 'hook.pre')
    expect(transitionPost).toMatchObject({
      phase: 'before-persist',
      onFailure: 'abort',
    })
    expect(transitionPre).toMatchObject({
      phase: 'before-persist',
      onFailure: 'abort',
    })
    const archivePre = ARCHIVE_BINDINGS.find((row) => row.check.id === 'hook.pre')
    const archivePost = ARCHIVE_BINDINGS.find((row) => row.check.id === 'hook.post')
    expect(archivePre).toMatchObject({ phase: 'before-persist', onFailure: 'abort' })
    expect(archivePost).toMatchObject({ phase: 'after-persist', onFailure: 'collect' })
  })

  it('given predicate bindings, when inspected, then phase and onFailure are omitted', () => {
    const protocol = TRANSITION_BINDINGS.find((row) => row.check.id === 'protocol.edge')
    expect(protocol?.phase).toBeUndefined()
    expect(protocol?.onFailure).toBeUndefined()
  })
})

describe('runImplFilesResolved', () => {
  it('given more than three open tracked files, when the check fails, then message is compact with examples', () => {
    const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'] as const
    const result = runImplFilesResolved({
      openTrackedImplementationFiles: files,
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.code).toBe('IMPLEMENTATION_STATE')
    expect(result.details).toEqual({ files: [...files] })
    expect(result.message).toContain('5 open tracked files')
    expect(result.message).toContain('examples: a.ts, b.ts, c.ts')
    expect(result.message).not.toContain('d.ts')
    expect(result.message).not.toContain('e.ts')
  })

  it('given three or fewer open tracked files, when the check fails, then message lists them without examples', () => {
    const files = ['a.ts', 'b.ts'] as const
    const result = runImplFilesResolved({
      openTrackedImplementationFiles: files,
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.message).toBe('2 open tracked files remain open: a.ts, b.ts')
    expect(result.message).not.toContain('examples:')
  })
})

describe('runDepsConsistent', () => {
  it('given empty vs non-empty dependsOn, when the check fails, then message and details show both lists', () => {
    const result = runDepsConsistent({
      extractedDependsOnBySpecId: new Map([['core:foo', []]]),
      persistedDependsOnBySpecId: new Map([['core:foo', ['core:bar']]]),
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.code).toBe('DEPS_INCONSISTENT')
    expect(result.label).toBe('Checking spec dependencies')
    expect(result.message).toContain('core:foo (extracted: [], persisted: [core:bar])')
    expect(result.details).toEqual({
      mismatches: [{ specId: 'core:foo', extracted: [], persisted: ['core:bar'] }],
      specIds: ['core:foo'],
    })
  })

  it('given non-empty vs empty dependsOn, when the check fails, then empty persisted renders as []', () => {
    const result = runDepsConsistent({
      extractedDependsOnBySpecId: new Map([['core:foo', ['core:a', 'core:b']]]),
      persistedDependsOnBySpecId: new Map([['core:foo', []]]),
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.message).toContain('core:foo (extracted: [core:a, core:b], persisted: [])')
  })
})

describe('runWorkspaceReadOnly', () => {
  it('given readOnly specs, when the check fails, then message names workspace', () => {
    const result = runWorkspaceReadOnly({
      ownershipBySpecId: new Map([['platform:auth/tokens', 'readOnly']]),
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.message).toContain("platform:auth/tokens (workspace 'platform')")
    expect(result.details).toMatchObject({
      specIds: ['platform:auth/tokens'],
      specs: [{ specId: 'platform:auth/tokens', workspace: 'platform' }],
    })
  })
})

describe('runSpecOverlap', () => {
  it('given named peers, when the check fails, then message lists peers and spec ids', () => {
    const result = runSpecOverlap({
      specOverlapBlocked: true,
      specOverlapPeers: [
        { changeName: 'beta', overlappingSpecIds: ['core:config'] },
        { changeName: 'alpha', overlappingSpecIds: [] },
      ],
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.message).toContain('beta (core:config)')
    expect(result.message).toContain('alpha ([])')
    expect(result.details).toEqual({
      peers: [
        { changeName: 'beta', overlappingSpecIds: ['core:config'] },
        { changeName: 'alpha', overlappingSpecIds: [] },
      ],
    })
  })
})

describe('snapshot bag absence', () => {
  it('given domain transition-checks module, when imported, then PredicateSnapshots is not exported', async () => {
    const mod = await import('../../../src/domain/services/transition-checks.js')
    expect('PredicateSnapshots' in mod).toBe(false)
    expect('emptyPredicateSnapshots' in mod).toBe(false)
    expect('gatherPredicateSnapshots' in mod).toBe(false)
  })

  it('given archive bindings, when inspected, then archive.publication is absent', () => {
    expect(ARCHIVE_BINDINGS.map((row) => row.check.id).join(',')).not.toContain(
      'archive.publication',
    )
  })

  it('binds live task completion and verification freshness on archive without widening the transition edge', () => {
    expect(ARCHIVE_BINDINGS.some((row) => row.check.id === 'workflow.taskCompletion')).toBe(true)
    expect(ARCHIVE_BINDINGS.some((row) => row.check.id === 'verification.current')).toBe(true)
    const transitionRows = TRANSITION_BINDINGS.filter(
      (row) => row.check.id === 'verification.current',
    )
    expect(transitionRows).toHaveLength(1)
    expect(transitionRows[0]?.applicability).toEqual([
      { scope: 'transition', from: 'verifying', to: 'done', along: 'forward' },
    ])
  })

  it('given missing check instance, when applyBindingSpecs runs, then throws InvalidInputError', () => {
    expect(() =>
      applyBindingSpecs(
        [
          {
            id: 'protocol.edge',
            applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
          },
        ],
        {},
      ),
    ).toThrow(InvalidInputError)
  })
})

describe('step-skip checks and applicability', () => {
  it('matches step-skip applicability when attempt targets the same step', () => {
    expect(
      checkMatches(
        { scope: 'step-skip', step: 'implementing' },
        { scope: 'step-skip', step: 'implementing', from: 'ready', to: 'verifying' },
      ),
    ).toBe(true)

    expect(
      checkMatches(
        { scope: 'step-skip', step: '*' },
        { scope: 'step-skip', step: 'implementing', from: 'ready', to: 'verifying' },
      ),
    ).toBe(true)
  })

  it('does not match step-skip applicability when steps differ or scopes differ', () => {
    expect(
      checkMatches(
        { scope: 'step-skip', step: 'implementing' },
        { scope: 'step-skip', step: 'verifying', from: 'ready', to: 'done' },
      ),
    ).toBe(false)

    expect(
      checkMatches(
        { scope: 'step-skip', step: 'implementing' },
        { scope: 'transition', from: 'ready', to: 'verifying', along: 'forward' },
      ),
    ).toBe(false)

    expect(
      checkMatches(
        { scope: 'transition', from: '*', to: '*', along: '*' },
        { scope: 'step-skip', step: 'implementing', from: 'ready', to: 'verifying' },
      ),
    ).toBe(false)
  })

  it('validates runTasksEmpty pass when tasks are empty or all complete', () => {
    const schema = makeSchema([], [])

    // 0 tasks total -> pass
    const passEmpty = runTasksEmpty({
      schema,
      taskCounts: {
        byArtifact: {},
        total: { complete: 0, incomplete: 0, total: 0 },
      },
    })
    expect(passEmpty.outcome).toBe('pass')

    // all tasks complete -> pass
    const passCompleted = runTasksEmpty({
      schema,
      taskCounts: {
        byArtifact: {},
        total: { complete: 5, incomplete: 0, total: 5 },
      },
    })
    expect(passCompleted.outcome).toBe('pass')

    // incomplete tasks exist -> fail
    const failIncomplete = runTasksEmpty({
      schema,
      taskCounts: {
        byArtifact: {},
        total: { complete: 3, incomplete: 2, total: 5 },
      },
    })
    expect(failIncomplete.outcome).toBe('fail')
    if (failIncomplete.outcome === 'fail') {
      expect(failIncomplete.code).toBe('INCOMPLETE_TASKS')
      expect(failIncomplete.message).toContain('2 incomplete tasks remain')
    }
  })

  it('registers expected step-skip bindings in TRANSITION_BINDING_SPECS', () => {
    const tasksEmptyRow = TRANSITION_BINDING_SPECS.find((row) => row.id === 'workflow.tasksEmpty')
    expect(tasksEmptyRow).toBeDefined()
    expect(tasksEmptyRow?.skippable).toBe(false)
    expect(
      tasksEmptyRow?.applicability.some(
        (app) => app.scope === 'step-skip' && app.step === 'implementing',
      ),
    ).toBe(true)

    const filesResolvedRow = TRANSITION_BINDING_SPECS.find((row) => row.id === 'impl.filesResolved')
    expect(
      filesResolvedRow?.applicability.some(
        (app) => app.scope === 'step-skip' && app.step === 'implementing',
      ),
    ).toBe(true)

    const linksInScopeRow = TRANSITION_BINDING_SPECS.find((row) => row.id === 'impl.linksInScope')
    expect(
      linksInScopeRow?.applicability.some(
        (app) => app.scope === 'step-skip' && app.step === 'implementing',
      ),
    ).toBe(true)
  })
})

describe('resolveEffectiveBindings', () => {
  it('modifies targetStep transition checks, overriding skippable and merging config', () => {
    const registry = new CheckRegistry()
    registry.register(
      'custom',
      {
        id: 'lint',
        label: 'Lint Check',
        execute: async () => ({
          id: 'test',
          label: 'Test',
          kind: 'predicate',
          outcome: 'pass',
          details: {},
        }),
      },
      [
        {
          scope: 'transition',
          to: 'verifying',
          along: 'forward',
          skippable: false,
          config: { baseParam: 1, sharedParam: 'base' },
        },
      ],
      {
        allowBindingOverride: true,
        allowConfigOverride: true,
        defaultConfig: { govParam: true, sharedParam: 'gov' },
      },
    )

    const baseBindings = registry.bindings()
    const schema = makeSchema(
      [],
      [
        {
          step: 'verifying',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
          checks: [
            {
              id: '@custom.lint',
              along: 'forward',
              skippable: true,
              onFailure: 'collect',
              config: { stepParam: 'custom', sharedParam: 'step' },
            },
          ],
        },
      ],
    )

    const effective = resolveEffectiveBindings({
      baseBindings,
      schema,
      targetStep: 'verifying',
      from: 'implementing',
      along: 'forward',
      registry,
    })

    const lintBinding = effective.find((b) => b.check.id === '@custom.lint')
    expect(lintBinding).toBeDefined()
    expect(lintBinding?.skippable).toBe(true)
    expect(lintBinding?.onFailure).toBe('collect')
    expect(lintBinding?.effectiveConfig).toEqual({
      govParam: true,
      baseParam: 1,
      stepParam: 'custom',
      sharedParam: 'step',
    })
  })

  it('filters out checks marked disabled: true on targetStep', () => {
    const registry = new CheckRegistry()
    const baseBindings = registry.bindings()
    const schema = makeSchema(
      [],
      [
        {
          step: 'verifying',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
          checks: [
            {
              id: 'impl.linksInScope',
              disabled: true,
            },
          ],
        },
      ],
    )

    const effective = resolveEffectiveBindings({
      baseBindings,
      schema,
      targetStep: 'verifying',
      from: 'implementing',
      along: 'forward',
      registry,
    })

    // Only the verifying coordinate is disabled; other scopes keep their rows.
    const transitionRows = effective
      .filter((b) => b.check.id === 'impl.linksInScope')
      .flatMap((b) => b.applicability)
      .filter((a) => a.scope === 'transition')
    expect(transitionRows).toEqual([])
  })

  it('synthesizes new transition binding when check is declared on step but absent from base bindings', () => {
    const registry = new CheckRegistry()
    registry.register(
      'sec',
      {
        id: 'audit',
        label: 'Security Audit',
        execute: async () => ({
          id: 'test',
          label: 'Test',
          kind: 'predicate',
          outcome: 'pass',
          details: {},
        }),
      },
      [],
    )

    const baseBindings = registry.bindings()
    const schema = makeSchema(
      [],
      [
        {
          step: 'ready',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
          checks: [
            {
              id: '@sec.audit',
              onFailure: 'collect',
              skippable: true,
            },
          ],
        },
      ],
    )

    const effective = resolveEffectiveBindings({
      baseBindings,
      schema,
      targetStep: 'ready',
      from: 'designing',
      along: 'forward',
      registry,
    })

    const auditBinding = effective.find((b) => b.check.id === '@sec.audit')
    expect(auditBinding).toBeDefined()
    expect(auditBinding?.onFailure).toBe('collect')
    expect(auditBinding?.skippable).toBe(true)
    expect(auditBinding?.applicability).toEqual([
      {
        scope: 'transition',
        from: 'designing',
        to: 'ready',
        along: 'forward',
      },
    ])
  })

  it('preserves restrictive governance on synthesized transition and step-skip bindings', () => {
    const registry = new CheckRegistry()
    for (const id of ['transition-lock', 'skip-lock']) {
      registry.register(
        'locked',
        {
          id,
          label: id,
          execute: async () => ({ id, label: id, kind: 'predicate', outcome: 'pass' }),
        },
        [],
        {
          allowBindingOverride: false,
          allowConfigOverride: false,
          allowDisable: false,
        },
      )
    }
    const schema = makeSchema(
      [],
      [
        {
          step: 'implementing',
          optional: true,
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
          checks: [{ id: '@locked.transition-lock' }],
          skipChecks: [{ id: '@locked.skip-lock' }],
        },
      ],
    )

    const effective = resolveEffectiveBindings({
      baseBindings: registry.bindings(),
      schema,
      targetStep: 'implementing',
      bypassedSteps: ['implementing'],
      from: 'ready',
      along: 'forward',
      registry,
    })

    for (const id of ['@locked.transition-lock', '@locked.skip-lock']) {
      const binding = effective.find((candidate) => candidate.check.id === id)
      expect(binding).toMatchObject({
        allowBindingOverride: false,
        allowConfigOverride: false,
        allowDisable: false,
      })
    }
  })

  it('overlays bypassedSteps skipChecks with cascaded config and disabled filtering', () => {
    const registry = new CheckRegistry()
    registry.register(
      'plugin',
      {
        id: 'code-freeze',
        label: 'Code Freeze',
        execute: async () => ({
          id: 'test',
          label: 'Test',
          kind: 'predicate',
          outcome: 'pass',
          details: {},
        }),
      },
      [
        {
          scope: 'step-skip',
          step: 'implementing',
          skippable: false,
          config: { env: 'staging' },
        },
      ],
      {
        allowBindingOverride: true,
        allowConfigOverride: true,
        allowDisable: true,
      },
    )

    registry.register(
      'plugin',
      {
        id: 'synthesized-skip',
        label: 'Synthesized Skip Check',
        execute: async () => ({
          id: 'test',
          label: 'Test',
          kind: 'predicate',
          outcome: 'pass',
          details: {},
        }),
      },
      [],
    )

    const baseBindings = registry.bindings()
    const schema = makeSchema(
      [],
      [
        {
          step: 'implementing',
          optional: true,
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
          skipChecks: [
            {
              id: '@plugin.code-freeze',
              skippable: true,
              onFailure: 'collect',
              config: { env: 'prod', extra: 123 },
            },
            {
              id: '@plugin.synthesized-skip',
              config: { foo: 'bar' },
            },
            {
              id: 'workflow.tasksEmpty',
              disabled: true,
            },
          ],
        },
      ],
    )

    const effective = resolveEffectiveBindings({
      baseBindings,
      schema,
      targetStep: 'verifying',
      bypassedSteps: ['implementing'],
      from: 'ready',
      along: 'forward',
      registry,
    })

    const freezeBinding = effective.find((b) => b.check.id === '@plugin.code-freeze')
    expect(freezeBinding).toBeDefined()
    expect(freezeBinding?.skippable).toBe(true)
    expect(freezeBinding?.onFailure).toBe('collect')
    expect(freezeBinding?.effectiveConfig).toEqual({ env: 'prod', extra: 123 })

    const synthBinding = effective.find((b) => b.check.id === '@plugin.synthesized-skip')
    expect(synthBinding).toBeDefined()
    expect(synthBinding?.applicability).toEqual([
      {
        scope: 'step-skip',
        step: 'implementing',
      },
    ])
    expect(synthBinding?.effectiveConfig).toEqual({ foo: 'bar' })

    const tasksEmptyBinding = effective.find(
      (b) =>
        b.check.id === 'workflow.tasksEmpty' &&
        b.applicability.some((a) => a.scope === 'step-skip' && a.step === 'implementing'),
    )
    expect(tasksEmptyBinding).toBeUndefined()
  })

  describe('coordinate isolation', () => {
    it('a transition-scope disable leaves the step-skip rows of the same check intact', () => {
      const registry = new CheckRegistry()
      const schema = makeSchema(
        [],
        [
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
            checks: [{ id: 'impl.filesResolved', disabled: true }],
          },
        ],
      )

      const effective = resolveEffectiveBindings({
        baseBindings: registry.bindings(),
        schema,
        targetStep: 'verifying',
        bypassedSteps: ['implementing'],
        from: 'ready',
        along: 'forward',
        registry,
      })

      const rows = effective
        .filter((b) => b.check.id === 'impl.filesResolved')
        .flatMap((b) => b.applicability)
      expect(rows.some((a) => a.scope === 'step-skip' && a.step === 'implementing')).toBe(true)
      expect(
        rows.some(
          (a) =>
            a.scope === 'transition' &&
            checkMatches(a, {
              scope: 'transition',
              from: 'ready',
              to: 'verifying',
              along: 'forward',
            }),
        ),
      ).toBe(false)
    })

    it('a step-skip disable leaves the transition rows of the same check intact', () => {
      const registry = new CheckRegistry()
      const schema = makeSchema(
        [],
        [
          {
            step: 'implementing',
            optional: true,
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
            skipChecks: [{ id: 'impl.filesResolved', disabled: true }],
          },
        ],
      )

      const effective = resolveEffectiveBindings({
        baseBindings: registry.bindings(),
        schema,
        targetStep: 'verifying',
        bypassedSteps: ['implementing'],
        from: 'ready',
        along: 'forward',
        registry,
      })

      const rows = effective
        .filter((b) => b.check.id === 'impl.filesResolved')
        .flatMap((b) => b.applicability)
      expect(rows.some((a) => a.scope === 'step-skip' && a.step === 'implementing')).toBe(false)
      expect(rows.some((a) => a.scope === 'transition' && a.to === 'verifying')).toBe(true)
    })
  })

  describe('effective config', () => {
    it('stores the single-pass cascade on effectiveConfig and leaves binding config untouched', () => {
      const registry = new CheckRegistry()
      registry.register(
        'cfg',
        {
          id: 'arrays',
          label: 'Arrays',
          execute: async () => ({ id: 'x', label: 'x', kind: 'predicate', outcome: 'pass' }),
        },
        [{ scope: 'transition', to: 'verifying', along: 'forward', config: { tags: ['b'] } }],
        { defaultConfig: { tags: ['a'] } },
      )
      const schema = makeSchema(
        [],
        [
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
            checks: [{ id: '@cfg.arrays', config: { tags: ['c'] } }],
          },
        ],
      )

      const effective = resolveEffectiveBindings({
        baseBindings: registry.bindings(),
        schema,
        targetStep: 'verifying',
        from: 'implementing',
        along: 'forward',
        registry,
      })

      const binding = effective.find((b) => b.check.id === '@cfg.arrays')
      expect(binding?.effectiveConfig).toEqual({ tags: ['a', 'b', 'c'] })
      expect(binding?.config).toEqual({ tags: ['b'] })
    })
  })
  describe('single cascade per attempt', () => {
    const verifyingSchema = (check: Record<string, unknown>) =>
      makeSchema(
        [],
        [
          {
            step: 'verifying',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: [] },
            checks: [check as never],
          },
        ],
      )

    const rowsFor = (
      from: 'ready' | 'implementing' | 'done',
      along: 'forward' | 'backward',
      check: Record<string, unknown>,
    ) => {
      const registry = new CheckRegistry()
      return resolveEffectiveBindings({
        baseBindings: registry.bindings(),
        schema: verifyingSchema(check),
        targetStep: 'verifying',
        from,
        along,
        registry,
      })
    }

    it('applies a default-bound declaration only to attempts it matches', () => {
      const decl = { id: 'impl.linksInScope', along: 'forward', config: { strict: true } }
      const matching = rowsFor('implementing', 'forward', decl).filter(
        (b) => b.check.id === 'impl.linksInScope',
      )
      expect(matching[0]?.applicability).toEqual([
        { scope: 'transition', from: 'implementing', to: 'verifying', along: 'forward' },
      ])
      expect(matching[0]?.effectiveConfig).toEqual({ strict: true })

      const other = rowsFor('done', 'backward', decl).filter(
        (b) => b.check.id === 'impl.linksInScope',
      )
      expect(other.every((b) => b.effectiveConfig === undefined)).toBe(true)
      expect(other.flatMap((b) => b.applicability)).toContainEqual({
        scope: 'transition',
        from: '*',
        to: 'verifying',
        along: '*',
      })
    })

    it('honors a declaration from coordinate', () => {
      const decl = { id: 'impl.linksInScope', from: 'implementing', disabled: true }
      const fromImpl = rowsFor('implementing', 'forward', decl)
      expect(
        fromImpl
          .filter((b) => b.check.id === 'impl.linksInScope')
          .flatMap((b) => b.applicability)
          .some((a) => a.scope === 'transition' && a.to === 'verifying'),
      ).toBe(false)
      const fromReady = rowsFor('ready', 'forward', decl)
      expect(
        fromReady
          .filter((b) => b.check.id === 'impl.linksInScope')
          .flatMap((b) => b.applicability)
          .some((a) => a.scope === 'transition' && a.to === 'verifying'),
      ).toBe(true)
    })

    it('rejects a target step without from and along', () => {
      const registry = new CheckRegistry()
      expect(() =>
        resolveEffectiveBindings({
          baseBindings: registry.bindings(),
          schema: SCHEMA_STD,
          targetStep: 'verifying',
          registry,
        }),
      ).toThrow(InvalidInputError)
    })

    it('narrows a wildcard step-skip row to the declared bypassed step only', () => {
      const registry = new CheckRegistry()
      registry.register(
        'qa',
        {
          id: 'wild',
          label: 'Wild',
          execute: async () => ({ id: '@qa.wild', label: 'x', kind: 'predicate', outcome: 'pass' }),
        },
        [{ scope: 'step-skip', step: '*', config: { base: 1 } }],
      )
      const optional = (step: string, skipChecks: unknown[]) => ({
        step,
        optional: true,
        requires: [],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
        skipChecks: skipChecks as never,
      })
      const schema = makeSchema(
        [],
        [
          optional('implementing', [{ id: '@qa.wild', config: { extra: 2 } }]),
          optional('verifying', []),
        ],
      )
      const effective = resolveEffectiveBindings({
        baseBindings: registry.bindings(),
        schema,
        targetStep: 'done',
        bypassedSteps: ['implementing', 'verifying'],
        from: 'ready',
        along: 'forward',
        registry,
      })
      const wild = effective.filter((b) => b.check.id === '@qa.wild')
      const declared = wild.find((b) =>
        b.applicability.some((a) => a.scope === 'step-skip' && a.step === 'implementing'),
      )
      expect(declared?.applicability).toEqual([{ scope: 'step-skip', step: 'implementing' }])
      expect(declared?.effectiveConfig).toEqual({ base: 1, extra: 2 })
      const undeclared = wild.find((b) =>
        b.applicability.some((a) => a.scope === 'step-skip' && a.step === 'verifying'),
      )
      expect(undeclared?.effectiveConfig).toEqual({ base: 1 })
      expect(wild.flatMap((b) => b.applicability)).not.toContainEqual({
        scope: 'step-skip',
        step: '*',
      })
    })
  })
})

describe('resolveEffectiveBindings — archive operation', () => {
  const pass = async (): Promise<never> =>
    ({ id: 'x', label: 'x', kind: 'predicate', outcome: 'pass' }) as never

  function archivingSchema(archiveChecks?: readonly Record<string, unknown>[], extra = {}) {
    return makeSchema(
      [],
      [
        {
          step: 'archiving',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
          ...(archiveChecks !== undefined ? { archiveChecks } : {}),
          ...extra,
        } as never,
      ],
    )
  }

  function resolveArchive(
    schema = archivingSchema(),
    registry: CheckRegistry | undefined = new CheckRegistry(),
  ) {
    return resolveEffectiveBindings({
      baseBindings: ARCHIVE_BINDINGS,
      schema,
      operation: 'archive',
      ...(registry !== undefined ? { registry } : {}),
    })
  }

  it('returns the base archive bindings, in order, when the schema declares no archiveChecks', () => {
    for (const schema of [makeSchema(), archivingSchema(), archivingSchema([])]) {
      const effective = resolveArchive(schema)
      expect(effective.map((b) => b.check.id)).toEqual(ARCHIVE_BINDINGS.map((b) => b.check.id))
      expect(effective.map((b) => b.skippable)).toEqual(ARCHIVE_BINDINGS.map((b) => b.skippable))
    }
  })

  it('removes a disabled check from the archive operation only', () => {
    const effective = resolveArchive(archivingSchema([{ id: 'spec.overlap', disabled: true }]))
    expect(effective.some((b) => b.check.id === 'spec.overlap')).toBe(false)
    expect(effective.some((b) => b.check.id === 'impl.linksInScope')).toBe(true)

    const registry = new CheckRegistry()
    const transition = resolveEffectiveBindings({
      baseBindings: TRANSITION_BINDINGS,
      schema: archivingSchema([{ id: 'deps.consistent', disabled: true }]),
      targetStep: 'ready',
      from: 'designing',
      along: 'forward',
      registry,
    })
    expect(transition.some((b) => b.check.id === 'deps.consistent')).toBe(true)
  })

  it('overlays skippable and configuration on a base archive binding', () => {
    const effective = resolveArchive(
      archivingSchema([{ id: 'spec.overlap', skippable: false, config: { window: 2 } }]),
    )
    const overlap = effective.find((b) => b.check.id === 'spec.overlap')
    expect(overlap?.skippable).toBe(false)
    expect(overlap?.effectiveConfig).toEqual({ window: 2 })
    expect(overlap?.applicability).toEqual([{ scope: 'archive' }])
  })

  it('keeps the base failure policy of effect bindings', () => {
    const effective = resolveArchive(archivingSchema([{ id: 'spec.overlap' }]))
    const hookPre = effective.find((b) => b.check.id === 'hook.pre')
    expect(hookPre?.onFailure).toBe('abort')
    const hookPost = effective.find((b) => b.check.id === 'hook.post')
    expect(hookPost?.onFailure).toBe('collect')
  })

  it('synthesizes a non-skippable binding for an embedded registered check', () => {
    const registry = new CheckRegistry()
    registry.register('qa', { id: 'lint', label: 'Lint', execute: pass }, undefined, {
      defaultConfig: { level: 'warn' },
    })
    const effective = resolveArchive(
      archivingSchema([{ id: '@qa.lint', config: { level: 'error' } }]),
      registry,
    )
    const lint = effective.find((b) => b.check.id === '@qa.lint')
    expect(lint?.skippable).toBe(false)
    expect(lint?.applicability).toEqual([{ scope: 'archive' }])
    expect(lint?.effectiveConfig).toEqual({ level: 'error' })
    expect(effective.at(-1)?.check.id).toBe('@qa.lint')
  })

  it('honours skippable true on an embedded check and orders embeds by declaration', () => {
    const registry = new CheckRegistry()
    registry.register('a', { id: 'lint', label: 'Lint', execute: pass }, undefined)
    registry.register('b', { id: 'scan', label: 'Scan', execute: pass }, undefined)
    const effective = resolveArchive(
      archivingSchema([{ id: '@a.lint', skippable: true }, { id: '@b.scan' }]),
      registry,
    )
    const tail = effective.slice(-2)
    expect(tail.map((b) => b.check.id)).toEqual(['@a.lint', '@b.scan'])
    expect(tail[0]?.skippable).toBe(true)
  })

  it('ignores a disabled declaration for a check with no archive binding', () => {
    const registry = new CheckRegistry()
    registry.register('qa', { id: 'lint', label: 'Lint', execute: pass }, undefined)
    const effective = resolveArchive(
      archivingSchema([{ id: '@qa.lint', disabled: true }]),
      registry,
    )
    expect(effective.map((b) => b.check.id)).toEqual(ARCHIVE_BINDINGS.map((b) => b.check.id))
  })

  it('applies plugin default config under the declaration config exactly once', () => {
    const registry = new CheckRegistry()
    registry.register(
      'sec',
      { id: 'scan', label: 'Scan', execute: pass },
      [{ scope: 'archive', config: { paths: ['a'] } }],
      { defaultConfig: { paths: ['d'] }, allowConfigOverride: true },
    )
    const base = [
      ...ARCHIVE_BINDINGS,
      ...registry.bindings().filter((b) => b.check.id === '@sec.scan'),
    ]
    const effective = resolveEffectiveBindings({
      baseBindings: base,
      schema: archivingSchema([{ id: '@sec.scan', config: { paths: ['s'] } }]),
      operation: 'archive',
      registry,
    })
    expect(effective.find((b) => b.check.id === '@sec.scan')?.effectiveConfig).toEqual({
      paths: ['d', 'a', 's'],
    })
  })

  it('keeps a redundant declaration of a locked check at its code-defined policy', () => {
    const effective = resolveArchive(
      archivingSchema([{ id: 'workspace.readOnly', skippable: false }]),
    )
    const readOnly = effective.find((b) => b.check.id === 'workspace.readOnly')
    expect(readOnly?.skippable).toBe(false)
    expect(readOnly?.allowDisable).toBe(false)
    expect(readOnly?.allowBindingOverride).toBe(false)
  })

  it('keeps checks and archiveChecks of the archiving entry as independent coordinates for the same check id', () => {
    const schema = archivingSchema([{ id: 'impl.linksInScope', disabled: true }], {
      checks: [{ id: 'impl.linksInScope', skippable: false }],
    })
    expect(resolveArchive(schema).some((b) => b.check.id === 'impl.linksInScope')).toBe(false)
    const transition = resolveEffectiveBindings({
      baseBindings: [
        ...TRANSITION_BINDINGS,
        {
          check: {
            id: 'impl.linksInScope',
            label: 'Links in scope',
            kind: 'predicate',
            execute: pass,
          },
          applicability: [{ scope: 'transition', from: '*', to: 'archiving', along: '*' }],
          onFailure: 'abort',
          skippable: true,
          allowBindingOverride: true,
          allowConfigOverride: true,
          allowDisable: true,
        },
      ],
      schema,
      targetStep: 'archiving',
      from: 'archivable',
      along: 'forward',
      registry: new CheckRegistry(),
    })
    const transitionLinks = transition.find(
      (b) =>
        b.check.id === 'impl.linksInScope' &&
        b.applicability.some((a) => a.scope === 'transition' && a.to === 'archiving'),
    )
    expect(transitionLinks).toBeDefined()
    expect(transitionLinks?.skippable).toBe(false)
  })

  it('drops unserved declarations without error and applies base overlays when resolved without a registry', () => {
    const schema = archivingSchema([
      { id: 'spec.overlap', skippable: false },
      { id: '@qa.lint', skippable: true },
    ])
    const effective = resolveArchive(schema, undefined)
    expect(effective.find((b) => b.check.id === 'spec.overlap')?.skippable).toBe(false)
    expect(effective.some((b) => b.check.id === '@qa.lint')).toBe(false)
  })

  it('rejects the archive operation combined with a transition or bypassed steps', () => {
    expect(() =>
      resolveEffectiveBindings({
        baseBindings: ARCHIVE_BINDINGS,
        schema: makeSchema(),
        operation: 'archive',
        targetStep: 'ready',
        from: 'designing',
        along: 'forward',
      }),
    ).toThrow(InvalidInputError)
    expect(() =>
      resolveEffectiveBindings({
        baseBindings: ARCHIVE_BINDINGS,
        schema: makeSchema(),
        operation: 'archive',
        bypassedSteps: ['implementing'],
      }),
    ).toThrow(InvalidInputError)
  })

  it('leaves transition and step-skip resolution untouched when operation is absent', () => {
    const schema = archivingSchema([{ id: 'spec.overlap', disabled: true }])
    const effective = resolveEffectiveBindings({
      baseBindings: ARCHIVE_BINDINGS,
      schema,
      registry: new CheckRegistry(),
    })
    expect(effective.some((b) => b.check.id === 'spec.overlap')).toBe(true)
  })
})
