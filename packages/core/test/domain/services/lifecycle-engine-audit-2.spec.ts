import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as core from '../../../src/index.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { evaluateLifecycleVerdict } from '../../../src/domain/services/lifecycle-verdict.js'
import { evaluateLifecycle } from '../../../src/application/services/lifecycle-evaluation.js'
import {
  makeArtifactType,
  makeSchema,
  makeWorkflowStep,
  testActor,
} from '../../application/use-cases/helpers.js'

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src')

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listSources(full))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

const SPEC_A = 'default:auth/login'
const SPEC_B = 'default:auth/logout'

function makeChange(events: ChangeEvent[] = []): Change {
  const createdAt = new Date('2024-01-01T00:00:00Z')
  return new Change({
    name: 'my-change',
    createdAt,
    specIds: [SPEC_A, SPEC_B],
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
    history: [
      {
        type: 'created',
        at: createdAt,
        by: testActor,
        specIds: [SPEC_A, SPEC_B],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
      ...events,
    ],
  })
}

function toDesigning(change: Change): Change {
  change.transition('designing', testActor)
  return change
}

function specsArtifact(): ChangeArtifact {
  const artifact = new ChangeArtifact({
    type: 'specs',
    files: new Map([
      [
        SPEC_A,
        new ArtifactFile({
          key: SPEC_A,
          filename: 'specs/auth/login/spec.md',
          status: 'complete',
          validatedHash: 'sha256:a',
        }),
      ],
      [
        SPEC_B,
        new ArtifactFile({
          key: SPEC_B,
          filename: 'specs/auth/logout/spec.md',
          status: 'complete',
          validatedHash: 'sha256:b',
        }),
      ],
    ]),
  })
  return artifact
}

function completeArtifact(type: string): ChangeArtifact {
  return new ChangeArtifact({
    type,
    files: new Map([
      [
        type,
        new ArtifactFile({
          key: type,
          filename: `${type}.md`,
          status: 'complete',
          validatedHash: `sha256:${type}`,
        }),
      ],
    ]),
  })
}

describe('LifecycleEngine public surface', () => {
  it('does not export a LifecycleEngine class from the package entry point', () => {
    expect('LifecycleEngine' in core).toBe(false)
    expect('LifecycleEngineOptions' in core).toBe(false)
  })

  it('does not declare a LifecycleEngine class or LifecycleEngineOptions anywhere in src', () => {
    const offenders: string[] = []
    for (const file of listSources(SRC_ROOT)) {
      const text = fs.readFileSync(file, 'utf8')
      if (/\bclass\s+LifecycleEngine\b/.test(text) || /\bLifecycleEngineOptions\b/.test(text)) {
        offenders.push(path.relative(SRC_ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('exposes the verdict functions through the evaluation entry points instead', () => {
    expect(typeof core.evaluateLifecycleVerdict).toBe('function')
  })
})

describe('affectedArtifacts of a drifted spec-scoped file', () => {
  it('names the exact file (key = spec ID, filename) and omits untouched spec files', () => {
    const change = toDesigning(makeChange())
    const specs = specsArtifact()
    specs.markDriftedPendingReview([SPEC_A])
    change.setArtifact(specs)
    const schema = makeSchema({
      artifacts: [makeArtifactType('specs')],
      workflow: [makeWorkflowStep('ready', { requires: ['specs'] })],
    })

    const verdict = evaluateLifecycleVerdict(change, schema, {
      approvals: { spec: false, signoff: false },
      requestedTarget: 'ready',
      checksByTarget: {},
    })

    const drift = verdict.blockers.find((blocker) => blocker.code === 'ARTIFACT_DRIFT')
    expect(drift).toBeDefined()
    expect(drift?.affectedArtifacts).toEqual([
      {
        type: 'specs',
        files: [
          {
            key: SPEC_A,
            filename: 'specs/auth/login/spec.md',
            state: 'drifted-pending-review',
          },
        ],
      },
    ])
    expect(verdict.review.reason).toBe('artifact-drift')
    expect(verdict.review.affectedArtifacts).toEqual([
      {
        type: 'specs',
        files: [
          {
            key: SPEC_A,
            filename: 'specs/auth/login/spec.md',
            state: 'drifted-pending-review',
          },
        ],
      },
    ])
  })
})

describe('recursive parent-review block', () => {
  it('names the drifted upstream artifact (Spec A) as the cause for a transitive dependent', () => {
    const change = toDesigning(makeChange())
    const specs = specsArtifact()
    specs.markDriftedPendingReview([SPEC_A])
    change.setArtifact(specs)
    change.setArtifact(completeArtifact('design'))
    change.setArtifact(completeArtifact('tasks'))
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('specs'),
        makeArtifactType('design', { requires: ['specs'] }),
        makeArtifactType('tasks', { requires: ['design'] }),
      ],
      workflow: [makeWorkflowStep('ready', { requires: ['tasks'] })],
    })

    const verdict = evaluateLifecycleVerdict(change, schema, {
      approvals: { spec: false, signoff: false },
      requestedTarget: 'ready',
      checksByTarget: {},
    })

    const tasks = verdict.artifacts.find((artifact) => artifact.type === 'tasks')
    expect(tasks?.effectiveStatus).toBe('pending-parent-artifact-review')
    const blocker = verdict.blockers.find((entry) => entry.code === 'PENDING_PARENT_REVIEW')
    expect(blocker).toBeDefined()
    expect(blocker?.message).toBe(
      "Required artifact 'tasks' is blocked by upstream artifact 'specs'",
    )
    expect(blocker?.affectedArtifacts).toEqual([
      {
        type: 'specs',
        files: [
          { key: SPEC_A, filename: 'specs/auth/login/spec.md', state: 'drifted-pending-review' },
        ],
      },
    ])
  })
})

describe('CompileContext independence from the lifecycle verdict', () => {
  const USE_CASES = path.join(SRC_ROOT, 'application/use-cases')

  /** Collects compile-context.ts plus every relative module it imports inside use-cases/. */
  function compileContextClosure(): string[] {
    const entry = path.join(USE_CASES, 'compile-context.ts')
    const seen = new Set<string>()
    const queue = [entry]
    while (queue.length > 0) {
      const file = queue.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(/from\s+'(\.[^']+)\.js'/g)) {
        const resolved = path.resolve(path.dirname(file), `${match[1]!}.ts`)
        // Follow only the use-case layer (compile-context + its _shared helpers).
        if (resolved.startsWith(USE_CASES) && fs.existsSync(resolved)) queue.push(resolved)
      }
    }
    return [...seen]
  }

  it('never references evaluateLifecycleVerdict or evaluateLifecycle', () => {
    for (const file of compileContextClosure()) {
      const text = fs.readFileSync(file, 'utf8')
      expect(text, path.relative(SRC_ROOT, file)).not.toMatch(/evaluateLifecycle/)
    }
  })

  it('does not import the lifecycle verdict or evaluation modules', () => {
    for (const file of compileContextClosure()) {
      const text = fs.readFileSync(file, 'utf8')
      expect(text, path.relative(SRC_ROOT, file)).not.toMatch(
        /lifecycle-(verdict|evaluation|engine)/,
      )
    }
  })
})

describe('historical spec-overlap-conflict guidance', () => {
  function overlapEvent(): ChangeEvent {
    return {
      type: 'invalidated',
      at: new Date('2024-01-02T00:00:00Z'),
      by: testActor,
      cause: 'spec-overlap-conflict',
      message: `Overlaps with archived change 'alpha' on specs: ${SPEC_A}`,
      affectedArtifacts: [],
    }
  }

  function pendingProposal(): ChangeArtifact {
    const artifact = new ChangeArtifact({
      type: 'proposal',
      files: new Map([
        [
          'proposal',
          new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'pending-review' }),
        ],
      ]),
    })
    artifact.markPendingReview()
    return artifact
  }

  it('routes to the design intent when the overlap invalidation precedes re-entering designing', () => {
    const change = makeChange([
      overlapEvent(),
      {
        type: 'transitioned',
        from: 'drafting',
        to: 'designing',
        at: new Date('2024-01-03T00:00:00Z'),
        by: testActor,
      },
    ])
    change.setArtifact(pendingProposal())

    const verdict = evaluateLifecycle(change, makeSchema(), {
      approvals: { spec: false, signoff: false },
      checksByTarget: {},
    })

    expect(verdict.review.reason).toBe('spec-overlap-conflict')
    expect(verdict.review.overlapDetail).toEqual([
      { archivedChangeName: 'alpha', overlappingSpecIds: [SPEC_A] },
    ])
    expect(verdict.nextAction.intent).toBe('design')
    expect(verdict.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(false)
  })

  it('stops treating the overlap as live once the change moved past designing', () => {
    const change = makeChange([
      overlapEvent(),
      {
        type: 'transitioned',
        from: 'drafting',
        to: 'designing',
        at: new Date('2024-01-03T00:00:00Z'),
        by: testActor,
      },
      {
        type: 'transitioned',
        from: 'designing',
        to: 'ready',
        at: new Date('2024-01-04T00:00:00Z'),
        by: testActor,
      },
    ])
    change.setArtifact(pendingProposal())

    const verdict = evaluateLifecycle(change, makeSchema(), {
      approvals: { spec: false, signoff: false },
      checksByTarget: {},
    })

    expect(verdict.review.reason).toBe('artifact-review-required')
    expect(verdict.review.overlapDetail).toEqual([])
    expect(verdict.nextAction.intent).toBe('design')
  })
})
