import { describe, it, expect } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { VALID_TRANSITIONS } from '../../../src/domain/value-objects/change-state.js'
import {
  makeChangeRepository,
  makeChange,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  testActor,
} from './helpers.js'

const defaultApprovals = { spec: false, signoff: false }

function makeGetStatus(
  changes: ReturnType<typeof makeChangeRepository>,
  opts: {
    schema?: ReturnType<typeof makeSchema> | null
    approvals?: { spec: boolean; signoff: boolean }
    failSchema?: boolean
  } = {},
) {
  const schema = opts.schema === undefined ? makeStdSchema() : opts.schema
  const schemaProvider = opts.failSchema
    ? {
        async get() {
          throw new Error('schema resolution failed')
        },
      }
    : makeSchemaProvider(schema)
  return new GetStatus(changes, schemaProvider, opts.approvals ?? defaultApprovals)
}

function makeStdSchema() {
  return makeSchema({
    artifacts: [
      makeArtifactType('proposal', { requires: [] }),
      makeArtifactType('specs', { scope: 'spec', requires: ['proposal'], delta: true }),
      makeArtifactType('verify', { scope: 'spec', requires: ['specs'], delta: true }),
      makeArtifactType('design', { requires: ['proposal', 'specs', 'verify'] }),
      makeArtifactType('tasks', { requires: ['specs', 'design'] }),
    ],
    workflow: [
      { step: 'designing', requires: [], requiresTaskCompletion: [], hooks: { pre: [], post: [] } },
      {
        step: 'ready',
        requires: ['proposal', 'specs', 'verify', 'design', 'tasks'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      },
      {
        step: 'implementing',
        requires: ['proposal', 'specs', 'verify', 'design', 'tasks'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      },
      {
        step: 'verifying',
        requires: ['verify'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      },
    ],
  })
}

function addCompleteArtifact(
  change: ReturnType<typeof makeChange>,
  type: string,
  requires: string[] = [],
) {
  change.setArtifact(
    new ChangeArtifact({
      type,
      requires,
      files: new Map([
        [
          type,
          new ArtifactFile({
            key: type,
            filename: `${type}.md`,
            status: 'complete',
            validatedHash: `hash-${type}`,
          }),
        ],
      ]),
    }),
  )
}

describe('GetStatus', () => {
  describe('given a change exists', () => {
    it('returns the change', async () => {
      const change = makeChange('add-oauth')
      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'add-oauth' })

      expect(result.change).toStrictEqual(change)
    })

    it('returns empty artifact statuses when change has no artifacts', async () => {
      const change = makeChange('add-oauth')
      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'add-oauth' })

      expect(result.artifactStatuses).toHaveLength(0)
    })

    it('returns effective status for each artifact', async () => {
      const change = makeChange('add-oauth')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
                validatedHash: 'abc',
              }),
            ],
          ]),
        }),
      )
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          requires: ['proposal'],
          files: new Map([
            [
              'spec',
              new ArtifactFile({
                key: 'spec',
                filename: 'spec.md',
                status: 'complete',
                validatedHash: 'def',
              }),
            ],
          ]),
        }),
      )
      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'add-oauth' })

      expect(result.artifactStatuses).toHaveLength(2)
      const proposalEntry = result.artifactStatuses.find((e) => e.type === 'proposal')
      const specEntry = result.artifactStatuses.find((e) => e.type === 'spec')
      expect(proposalEntry?.effectiveStatus).toBe('complete')
      expect(specEntry?.effectiveStatus).toBe('complete')
    })

    it('cascades dependency blocking into effective status', async () => {
      const change = makeChange('add-oauth')
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
            ],
          ]),
        }),
      )
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          requires: ['proposal'],
          files: new Map([
            [
              'spec',
              new ArtifactFile({
                key: 'spec',
                filename: 'spec.md',
                status: 'complete',
                validatedHash: 'def',
              }),
            ],
          ]),
        }),
      )
      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'add-oauth' })

      const specEntry = result.artifactStatuses.find((e) => e.type === 'spec')
      expect(specEntry?.effectiveStatus).toBe('in-progress')
    })

    it('projects review entries using filename and absolute path', async () => {
      const change = makeChange('review-paths')
      change.transition('designing', testActor)
      change.setArtifact(
        new ChangeArtifact({
          type: 'tasks',
          requires: [],
          files: new Map([
            [
              'tasks',
              new ArtifactFile({
                key: 'tasks',
                filename: 'tasks.md',
                status: 'complete',
                validatedHash: 'hash-tasks',
              }),
            ],
          ]),
        }),
      )
      change.invalidate(
        'artifact-drift',
        testActor,
        'Invalidated because validated artifacts drifted: tasks (tasks)',
        [{ type: 'tasks', files: ['tasks'] }],
      )

      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'review-paths' })

      expect(result.review).toEqual({
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
                path: '/test/changes/review-paths/tasks.md',
              },
            ],
          },
        ],
        overlapDetail: [],
      })
    })

    it('derives spec-overlap-conflict reason from unhandled invalidation', async () => {
      const change = makeChange('overlap-change')
      change.transition('designing', testActor)
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
                validatedHash: 'hash-p',
              }),
            ],
          ]),
        }),
      )
      change.invalidate(
        'spec-overlap-conflict',
        testActor,
        "Invalidated because change 'alpha' was archived with overlapping specs: auth/login",
        [{ type: 'proposal', files: ['proposal'] }],
      )

      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'overlap-change' })

      expect(result.review.required).toBe(true)
      expect(result.review.reason).toBe('spec-overlap-conflict')
      expect(result.review.overlapDetail).toHaveLength(1)
      expect(result.review.overlapDetail[0]!.archivedChangeName).toBe('alpha')
      expect(result.review.overlapDetail[0]!.overlappingSpecIds).toEqual(['auth/login'])
    })

    it('merges multiple unhandled overlap invalidations newest-first', async () => {
      const change = makeChange('multi-overlap')
      change.transition('designing', testActor)
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
                validatedHash: 'hash-p',
              }),
            ],
          ]),
        }),
      )
      change.invalidate(
        'spec-overlap-conflict',
        testActor,
        "Invalidated because change 'alpha' was archived with overlapping specs: auth/login",
        [{ type: 'proposal', files: ['proposal'] }],
      )
      change.invalidate(
        'spec-overlap-conflict',
        testActor,
        "Invalidated because change 'beta' was archived with overlapping specs: core/config",
        [{ type: 'proposal', files: ['proposal'] }],
      )

      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'multi-overlap' })

      expect(result.review.reason).toBe('spec-overlap-conflict')
      expect(result.review.overlapDetail).toHaveLength(2)
      expect(result.review.overlapDetail[0]!.archivedChangeName).toBe('beta')
      expect(result.review.overlapDetail[1]!.archivedChangeName).toBe('alpha')
    })

    it('stops overlap scan at forward transition boundary', async () => {
      const change = makeChange('boundary-overlap')
      change.transition('designing', testActor)
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'complete',
                validatedHash: 'hash-p',
              }),
            ],
          ]),
        }),
      )
      change.invalidate(
        'spec-overlap-conflict',
        testActor,
        "Invalidated because change 'old' was archived with overlapping specs: auth/login",
        [{ type: 'proposal', files: ['proposal'] }],
      )
      change.transition('ready', testActor)
      change.invalidate(
        'spec-overlap-conflict',
        testActor,
        "Invalidated because change 'new' was archived with overlapping specs: auth/login",
        [{ type: 'proposal', files: ['proposal'] }],
      )

      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'boundary-overlap' })

      expect(result.review.overlapDetail).toHaveLength(1)
      expect(result.review.overlapDetail[0]!.archivedChangeName).toBe('new')
    })

    it('drift takes priority over overlap conflict', async () => {
      const change = makeChange('drift-overlap')
      change.transition('designing', testActor)
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'drifted-pending-review',
                validatedHash: 'hash-p',
              }),
            ],
          ]),
        }),
      )
      change.invalidate(
        'spec-overlap-conflict',
        testActor,
        "Invalidated because change 'alpha' was archived with overlapping specs: auth/login",
        [{ type: 'proposal', files: ['proposal'] }],
      )

      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'drift-overlap' })

      expect(result.review.reason).toBe('artifact-drift')
      expect(result.review.overlapDetail).toEqual([])
    })

    it('returns empty overlapDetail when no invalidation exists', async () => {
      const change = makeChange('no-invalidation')
      change.transition('designing', testActor)
      change.setArtifact(
        new ChangeArtifact({
          type: 'proposal',
          requires: [],
          files: new Map([
            [
              'proposal',
              new ArtifactFile({
                key: 'proposal',
                filename: 'proposal.md',
                status: 'pending-review',
                validatedHash: 'hash-p',
              }),
            ],
          ]),
        }),
      )

      const repo = makeChangeRepository([change])
      const uc = makeGetStatus(repo)

      const result = await uc.execute({ name: 'no-invalidation' })

      expect(result.review.overlapDetail).toEqual([])
    })
  })

  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = makeGetStatus(repo)

      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })

    it('ChangeNotFoundError has correct code', async () => {
      const repo = makeChangeRepository()
      const uc = makeGetStatus(repo)

      await expect(uc.execute({ name: 'missing' })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      })
    })
  })

  describe('lifecycle', () => {
    describe('validTransitions', () => {
      it('returns valid transitions for the current state', async () => {
        const change = makeChange('test')
        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo)

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.validTransitions).toEqual(VALID_TRANSITIONS['drafting'])
      })
    })

    describe('availableTransitions and blockers', () => {
      it('includes transition when all workflow requires are satisfied', async () => {
        const change = makeChange('test')
        // Transition to designing first
        change.transition('designing', { name: 'Test', email: 'test@test.com' })
        // Add all required artifacts as complete
        addCompleteArtifact(change, 'proposal')
        addCompleteArtifact(change, 'specs', ['proposal'])
        addCompleteArtifact(change, 'verify', ['specs'])
        addCompleteArtifact(change, 'design', ['proposal', 'specs', 'verify'])
        addCompleteArtifact(change, 'tasks', ['specs', 'design'])

        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo)

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.availableTransitions).toContain('ready')
      })

      it('excludes transition when requires are not satisfied', async () => {
        const change = makeChange('test')
        change.transition('designing', { name: 'Test', email: 'test@test.com' })
        // Only proposal is complete — specs, verify, design, tasks are missing
        addCompleteArtifact(change, 'proposal')

        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo)

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.availableTransitions).not.toContain('ready')
        const blocker = result.lifecycle.blockers.find((b) => b.transition === 'ready')
        expect(blocker).toBeDefined()
        expect(blocker!.reason).toBe('requires')
        expect(blocker!.blocking).toContain('specs')
      })

      it('skipped artifacts count as satisfied requires', async () => {
        const change = makeChange('test')
        change.transition('designing', { name: 'Test', email: 'test@test.com' })
        addCompleteArtifact(change, 'proposal')
        addCompleteArtifact(change, 'specs', ['proposal'])
        // verify is skipped
        change.setArtifact(
          new ChangeArtifact({
            type: 'verify',
            requires: ['specs'],
            files: new Map([
              [
                'verify',
                new ArtifactFile({
                  key: 'verify',
                  filename: 'verify.md',
                  status: 'skipped',
                }),
              ],
            ]),
          }),
        )
        addCompleteArtifact(change, 'design', ['proposal', 'specs', 'verify'])
        addCompleteArtifact(change, 'tasks', ['specs', 'design'])

        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo)

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.availableTransitions).toContain('ready')
      })

      it('treats transition as available when no workflow step exists', async () => {
        const change = makeChange('test')
        change.transition('designing', { name: 'Test', email: 'test@test.com' })

        // Schema with no workflow step for 'designing' (the self-transition)
        const schema = makeSchema({
          artifacts: [makeArtifactType('proposal')],
          workflow: [
            {
              step: 'ready',
              requires: ['proposal'],
              requiresTaskCompletion: [],
              hooks: { pre: [], post: [] },
            },
          ],
        })

        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo, { schema })

        const result = await uc.execute({ name: 'test' })

        // 'designing' is a valid transition from designing state but has no workflow step
        expect(result.lifecycle.availableTransitions).toContain('designing')
      })
    })

    describe('approvals', () => {
      it('reflects injected approvals config', async () => {
        const change = makeChange('test')
        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo, { approvals: { spec: true, signoff: false } })

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.approvals).toEqual({ spec: true, signoff: false })
      })
    })

    describe('nextArtifact', () => {
      it('resolves first unsatisfied artifact with met requires', async () => {
        const change = makeChange('test')
        change.transition('designing', { name: 'Test', email: 'test@test.com' })
        addCompleteArtifact(change, 'proposal')
        // specs requires proposal (satisfied), but specs itself is missing

        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo)

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.nextArtifact).toBe('specs')
      })

      it('returns null when all artifacts are complete', async () => {
        const change = makeChange('test')
        change.transition('designing', { name: 'Test', email: 'test@test.com' })
        addCompleteArtifact(change, 'proposal')
        addCompleteArtifact(change, 'specs', ['proposal'])
        addCompleteArtifact(change, 'verify', ['specs'])
        addCompleteArtifact(change, 'design', ['proposal', 'specs', 'verify'])
        addCompleteArtifact(change, 'tasks', ['specs', 'design'])

        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo)

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.nextArtifact).toBeNull()
      })

      it('skips artifacts whose requires are not met', async () => {
        const change = makeChange('test')
        change.transition('designing', { name: 'Test', email: 'test@test.com' })
        // proposal is missing, so specs (requires proposal) is skipped
        // nextArtifact should be proposal (no requires)

        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo)

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.nextArtifact).toBe('proposal')
      })
    })

    describe('changePath', () => {
      it('returns changePath from repository', async () => {
        const change = makeChange('test')
        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo)

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.changePath).toBe('/test/changes/test')
      })
    })

    describe('schemaInfo', () => {
      it('returns schema name, version and artifacts when resolution succeeds', async () => {
        const change = makeChange('test')
        const repo = makeChangeRepository([change])
        const schema = makeStdSchema()
        const uc = makeGetStatus(repo, { schema })

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.schemaInfo).toEqual({
          name: 'test-schema',
          version: 1,
          artifacts: expect.arrayContaining([
            expect.objectContaining({ id: 'proposal' }),
            expect.objectContaining({ id: 'specs' }),
            expect.objectContaining({ id: 'verify' }),
            expect.objectContaining({ id: 'design' }),
            expect.objectContaining({ id: 'tasks' }),
          ]),
        })
      })

      it('returns null when schema resolution fails', async () => {
        const change = makeChange('test')
        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo, { failSchema: true })

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.schemaInfo).toBeNull()
      })
    })

    describe('graceful degradation', () => {
      it('does not throw when schema resolution fails', async () => {
        const change = makeChange('test')
        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo, { failSchema: true })

        await expect(uc.execute({ name: 'test' })).resolves.toBeDefined()
      })

      it('returns degraded lifecycle fields when schema resolution fails', async () => {
        const change = makeChange('test')
        const repo = makeChangeRepository([change])
        const uc = makeGetStatus(repo, {
          failSchema: true,
          approvals: { spec: true, signoff: false },
        })

        const result = await uc.execute({ name: 'test' })

        expect(result.lifecycle.validTransitions).toEqual(VALID_TRANSITIONS['drafting'])
        expect(result.lifecycle.availableTransitions).toEqual([])
        expect(result.lifecycle.blockers).toEqual([])
        expect(result.lifecycle.approvals).toEqual({ spec: true, signoff: false })
        expect(result.lifecycle.nextArtifact).toBeNull()
        expect(result.lifecycle.schemaInfo).toBeNull()
        expect(result.lifecycle.changePath).toBe('/test/changes/test')
      })
    })
  })
})
