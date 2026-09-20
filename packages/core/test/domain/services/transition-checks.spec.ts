import { describe, expect, it } from 'vitest'
import { runDepsConsistent } from '../../../src/domain/checks/deps-consistent.js'
import { runImplFilesResolved } from '../../../src/domain/checks/impl-files-resolved.js'
import { protocolEdge } from '../../../src/domain/checks/protocol-edge.js'
import { schemaNameMatch } from '../../../src/domain/checks/schema-name-match.js'
import { runSpecOverlap } from '../../../src/domain/checks/spec-overlap.js'
import { runWorkspaceReadOnly } from '../../../src/domain/checks/workspace-read-only.js'
import {
  ARCHIVE_BINDINGS,
  TRANSITION_BINDINGS,
  boundFromStates,
  boundToStates,
} from '../../../src/domain/services/check-bindings.js'
import { bindingMatches } from '../../../src/domain/services/evaluate-transition-predicates.js'
import {
  CHECK_LABELS,
  checkMatches,
  classifyAlong,
  applyBindingSpecs,
} from '../../../src/domain/services/transition-checks.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import { VALID_TRANSITIONS } from '../../../src/domain/value-objects/change-state.js'

const SCHEMA_STD_STEPS = [
  'drafting',
  'designing',
  'ready',
  'implementing',
  'verifying',
  'done',
  'archivable',
  'archiving',
] as const

describe('classifyAlong', () => {
  it('given ready to designing, when classified, then redesign', () => {
    expect(classifyAlong('ready', 'designing', SCHEMA_STD_STEPS)).toBe('redesign')
  })

  it('given verifying to implementing, when classified, then backward', () => {
    expect(classifyAlong('verifying', 'implementing', SCHEMA_STD_STEPS)).toBe('backward')
  })

  it('given archiving to archivable, when classified, then recovery not backward', () => {
    expect(classifyAlong('archiving', 'archivable', SCHEMA_STD_STEPS)).toBe('recovery')
  })

  it('given ready to implementing, when classified, then forward', () => {
    expect(classifyAlong('ready', 'implementing', SCHEMA_STD_STEPS)).toBe('forward')
  })

  it('given done to implementing, when classified, then backward', () => {
    expect(classifyAlong('done', 'implementing', SCHEMA_STD_STEPS)).toBe('backward')
  })

  it('given designing to designing, when classified, then any', () => {
    expect(classifyAlong('designing', 'designing', SCHEMA_STD_STEPS)).toBe('any')
  })

  it('given pending-spec-approval to spec-approved, when classified, then forward', () => {
    expect(classifyAlong('pending-spec-approval', 'spec-approved', SCHEMA_STD_STEPS)).toBe(
      'forward',
    )
  })

  it('given implementing to verifying, when classified, then forward', () => {
    expect(classifyAlong('implementing', 'verifying', SCHEMA_STD_STEPS)).toBe('forward')
  })

  it('given implementing omitted from workflow, when ready to verifying, then forward and implementing remains protocol', () => {
    const steps = SCHEMA_STD_STEPS.filter((step) => step !== 'implementing')
    expect(classifyAlong('ready', 'verifying', steps)).toBe('forward')
    expect(VALID_TRANSITIONS.implementing).toBeDefined()
    expect(VALID_TRANSITIONS.ready).toContain('implementing')
  })

  it('given implementing omitted from workflow, when verifying to implementing, then backward', () => {
    const steps = SCHEMA_STD_STEPS.filter((step) => step !== 'implementing')
    expect(classifyAlong('verifying', 'implementing', steps)).toBe('backward')
  })

  it('given ready omitted from workflow, when ready to implementing, then forward', () => {
    const steps = ['designing', 'implementing', 'verifying']
    expect(classifyAlong('ready', 'implementing', steps)).toBe('forward')
  })

  it('given unknown workflow step, when classifying ready to implementing, then still forward', () => {
    const steps = [...SCHEMA_STD_STEPS.slice(0, 3), 'reviewing', ...SCHEMA_STD_STEPS.slice(3)]
    expect(classifyAlong('ready', 'implementing', steps)).toBe('forward')
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
          along: classifyAlong('ready', 'verifying', SCHEMA_STD_STEPS),
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
          along: classifyAlong('implementing', 'verifying', SCHEMA_STD_STEPS),
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
          along: classifyAlong('implementing', 'designing', SCHEMA_STD_STEPS),
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
          along: classifyAlong('designing', 'ready', SCHEMA_STD_STEPS),
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
          along: classifyAlong('ready', 'designing', SCHEMA_STD_STEPS),
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
          along: classifyAlong('ready', 'designing', SCHEMA_STD_STEPS),
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
          along: classifyAlong('implementing', 'verifying', SCHEMA_STD_STEPS),
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
      expect(binding.check.label).toBe(CHECK_LABELS[binding.check.id])
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
    const along = classifyAlong('ready', 'verifying', SCHEMA_STD_STEPS)
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
    const along = classifyAlong('ready', 'designing', SCHEMA_STD_STEPS)
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
      allowOverlap: false,
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
