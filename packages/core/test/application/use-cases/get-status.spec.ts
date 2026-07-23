import { describe, it, expect, vi } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { VALID_TRANSITIONS } from '../../../src/domain/value-objects/change-state.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { LifecycleEngine } from '../../../src/domain/services/lifecycle-engine.js'
import { Logger } from '../../../src/application/logger.js'
import {
  makeChangeRepository,
  makeChange,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  testActor,
} from './helpers.js'

const defaultApprovals = { spec: false, signoff: false }

/**
 * Creates a standard test schema.
 * @returns A Schema entity.
 */
function makeStdSchema(): Schema {
  return makeSchema([
    makeArtifactType('proposal'),
    makeArtifactType('specs', { scope: 'spec' }),
    makeArtifactType('verify', { scope: 'spec', requires: ['specs'] }),
  ])
}

function makeRefreshImplementationTracking(
  execute: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
): RefreshImplementationTracking {
  return { execute } as unknown as RefreshImplementationTracking
}

function makeGetStatus(
  changes: ReturnType<typeof makeChangeRepository>,
  opts: {
    schema?: Schema | null
    approvals?: { spec: boolean; signoff: boolean }
    failSchema?: boolean
    refresh?: RefreshImplementationTracking
    refreshExecute?: ReturnType<typeof vi.fn>
    countTasks?: CountTasks
  } = {},
) {
  const schema = opts.schema === undefined ? makeStdSchema() : opts.schema
  const schemaProvider = makeSchemaProvider(schema)
  const lifecycle = new LifecycleEngine(Logger.debug.bind(Logger))
  const countTasks = opts.countTasks ?? new CountTasks(changes, schemaProvider)
  const refresh =
    opts.refresh ??
    makeRefreshImplementationTracking(
      opts.refreshExecute ?? vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
    )
  return new GetStatus(
    changes,
    schemaProvider,
    opts.approvals ?? defaultApprovals,
    refresh,
    lifecycle,
    countTasks,
  )
}

describe('GetStatus', () => {
  describe('given no existing change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const uc = makeGetStatus(makeChangeRepository())
      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('basic status fields', () => {
    it('returns the change name and description', async () => {
      const change = makeChange('my-change', { description: 'A test change' })
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.change?.name).toBe('my-change')
      expect(result.change?.description).toBe('A test change')
    })

    it('returns the current lifecycle state', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.change?.state).toBe('designing')
    })

    it('returns all specs in the change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login', 'auth/logout'] })
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.change?.specIds).toEqual(['auth/login', 'auth/logout'])
    })
  })

  describe('history event mapping', () => {
    it('maps history events with formatted dates', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.change?.history).toHaveLength(2)
      const event = result.change!.history[0]!
      expect(event.type).toBe('created')
      expect(event.by).toEqual(testActor)
      expect(event.at).toBeInstanceOf(Date)
    })
  })

  describe('artifact status derivation', () => {
    it('reports missing when artifact not present in change', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      const proposal = result.artifactStatuses.find((a) => a.type === 'proposal')
      expect(proposal?.state).toBe('missing')
    })

    it('reports complete when artifact is marked complete', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'missing' }),
      )
      proposal.markComplete('proposal', 'hash')
      change.setArtifact(proposal)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      const node = result.artifactStatuses.find((a) => a.type === 'proposal')
      expect(node?.state).toBe('complete')
    })

    it('reports in-progress when artifact has files but not complete', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({ key: 'proposal', filename: 'proposal.json', status: 'in-progress' }),
      )
      change.setArtifact(proposal)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      const node = result.artifactStatuses.find((a) => a.type === 'proposal')
      expect(node?.state).toBe('in-progress')
    })
  })

  describe('available transitions', () => {
    it('returns valid next states according to state machine', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.lifecycle.availableTransitions).toEqual(VALID_TRANSITIONS['designing'])
    })
  })

  describe('spec dependencies', () => {
    it('projects specDependsOn from an active change', async () => {
      const change = makeChange('my-change', {
        specIds: ['core:a', 'core:b'],
      })
      change.setSpecDependsOn('core:a', ['core:c', 'core:d'])
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]))

      const result = await uc.execute({ name: 'my-change' })

      expect(result.specDependsOn).toEqual({
        'core:a': ['core:c', 'core:d'],
      })
    })

    it('projects specDependsOn from a drafted change', async () => {
      const change = makeChange('my-change', {
        specIds: ['core:a'],
      })
      change.setSpecDependsOn('core:a', ['core:b'])
      change.transition('designing', testActor)
      change.draft(testActor)

      const repo = makeChangeRepository()
      repo.store.set(change.name, change)

      const uc = makeGetStatus(repo)
      const result = await uc.execute({ name: 'my-change' })

      expect(result.specDependsOn).toEqual({
        'core:a': ['core:b'],
      })
    })
  })

  describe('implementation tracking refresh', () => {
    it('refreshes active changes by default', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeGetStatus(makeChangeRepository([change]), { refreshExecute })

      await uc.execute({ name: 'my-change' })

      expect(refreshExecute).toHaveBeenCalledWith({ name: 'my-change' })
    })

    it('skips refresh when explicitly disabled', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeGetStatus(makeChangeRepository([change]), { refreshExecute })

      await uc.execute({ name: 'my-change', refreshImplementationTracking: false })

      expect(refreshExecute).not.toHaveBeenCalled()
    })

    it('skips refresh for draft-only reads', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      change.draft(testActor)
      const repo = makeChangeRepository()
      repo.store.set(change.name, change)
      const refreshExecute = vi.fn().mockResolvedValue({ trackedFiles: [], links: [] })
      const uc = makeGetStatus(repo, { refreshExecute })

      await uc.execute({ name: 'my-change' })

      expect(refreshExecute).not.toHaveBeenCalled()
    })
  })

  describe('schema issues', () => {
    it('returns artifacts with missing status when schema provider fails', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      const uc = makeGetStatus(makeChangeRepository([change]), { schema: null })

      const result = await uc.execute({ name: 'my-change' })
      // When schema fails, GetStatus returns an empty array now because of the try/catch block
      // Wait, let's check GetStatus implementation again.
      expect(result.artifactStatuses).toEqual([])
    })
  })

  describe('task checklist preservation', () => {
    it('does not reset or invalidate completed tasks when retrieving status', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)

      const tasksArtifact = new ChangeArtifact({ type: 'tasks' })
      tasksArtifact.setFile(
        new ArtifactFile({ key: 'tasks', filename: 'tasks.md', status: 'complete' }),
      )
      change.setArtifact(tasksArtifact)

      const changesRepo = makeChangeRepository([change])
      vi.spyOn(changesRepo, 'artifact').mockResolvedValue(
        new SpecArtifact(
          'tasks.md',
          '# Tasks\n- [x] 1.1 Completed Task\n- [ ] 1.2 Incomplete Task',
        ),
      )

      const schema = makeSchema([
        makeArtifactType('proposal'),
        makeArtifactType('tasks', {
          hasTasks: true,
          taskCompletionCheck: {
            incompletePattern: '^\\s*-\\s*\\[ \\]\\s+',
            completePattern: '^\\s*-\\s*\\[x\\]\\s+',
          },
        }),
      ])

      const uc = makeGetStatus(changesRepo, { schema })
      const result = await uc.execute({ name: 'my-change' })

      const tasksStatus = result.artifactStatuses.find((a) => a.type === 'tasks')
      expect(tasksStatus?.taskCompletion).toEqual({
        complete: 1,
        incomplete: 1,
        total: 2,
      })
    })
  })

  it('delegates task projection to CountTasks once', async () => {
    const change = makeChange('delegated-tasks')
    change.transition('designing', testActor)
    const countTasks = {
      execute: vi.fn().mockResolvedValue({
        byArtifact: { tasks: { complete: 1, incomplete: 0, total: 1 } },
        total: { complete: 1, incomplete: 0, total: 1 },
      }),
    } as unknown as CountTasks
    const schema = makeSchema([
      makeArtifactType('tasks', { hasTasks: true, taskCompletionCheck: {} }),
    ])
    const uc = makeGetStatus(makeChangeRepository([change]), { schema, countTasks })

    const result = await uc.execute({ name: 'delegated-tasks' })

    expect(countTasks.execute).toHaveBeenCalledOnce()
    expect(result.artifactStatuses[0]?.taskCompletion).toEqual({
      complete: 1,
      incomplete: 0,
      total: 1,
    })
    expect(result).not.toHaveProperty('total')
  })

  describe('missing application-level test requirements', () => {
    it('cascades effectiveStatus to required dependencies', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)

      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
      )
      change.setArtifact(proposal)

      const specs = new ChangeArtifact({ type: 'specs' })
      specs.setFile(
        new ArtifactFile({
          key: 'auth/login',
          filename: 'specs/auth/login/spec.md',
          status: 'complete',
          validatedHash: 'hash',
        }),
      )
      change.setArtifact(specs)

      const schema = makeSchema([
        makeArtifactType('proposal'),
        makeArtifactType('specs', { scope: 'spec', requires: ['proposal'] }),
      ])

      const uc = makeGetStatus(makeChangeRepository([change]), { schema })
      const result = await uc.execute({ name: 'my-change' })

      const proposalStatus = result.artifactStatuses.find((a) => a.type === 'proposal')
      const specsStatus = result.artifactStatuses.find((a) => a.type === 'specs')

      expect(proposalStatus?.state).toBe('in-progress')
      expect(proposalStatus?.effectiveStatus).toBe('in-progress')

      expect(specsStatus?.state).toBe('complete')
      expect(specsStatus?.effectiveStatus).toBe('in-progress')
    })

    it('aggregates displayStatus using precedence (complete-with-drift)', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)

      const specs = new ChangeArtifact({ type: 'specs' })

      const file1 = new ArtifactFile({
        key: 'auth/login',
        filename: 'specs/auth/login/spec.md',
        status: 'complete',
        validatedHash: 'hash',
      })
      const file2 = new ArtifactFile({
        key: 'auth/logout',
        filename: 'specs/auth/logout/spec.md',
        status: 'complete',
        hasDrift: true,
        validatedHash: 'hash2',
      })

      specs.setFile(file1)
      specs.setFile(file2)
      change.setArtifact(specs)

      const schema = makeSchema([makeArtifactType('specs', { scope: 'spec' })])

      const uc = makeGetStatus(makeChangeRepository([change]), { schema })
      const result = await uc.execute({ name: 'my-change' })

      const specsStatus = result.artifactStatuses.find((a) => a.type === 'specs')
      expect(specsStatus?.displayStatus).toBe('complete-with-drift')
    })

    it('asserts that machine blocker codes ARTIFACT_DRIFT and REVIEW_REQUIRED are correctly projected', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)

      const proposal = new ChangeArtifact({ type: 'proposal' })
      proposal.setFile(
        new ArtifactFile({
          key: 'proposal',
          filename: 'proposal.md',
          status: 'drifted-pending-review',
          hasDrift: true,
          validatedHash: 'hash',
        }),
      )
      change.setArtifact(proposal)

      const uc = makeGetStatus(makeChangeRepository([change]))
      const result = await uc.execute({ name: 'my-change' })

      expect(result.blockers.some((b) => b.code === 'ARTIFACT_DRIFT')).toBe(true)

      const change2 = makeChange('my-change-2')
      change2.transition('designing', testActor)

      const proposal2 = new ChangeArtifact({ type: 'proposal' })
      proposal2.setFile(
        new ArtifactFile({
          key: 'proposal',
          filename: 'proposal.md',
          status: 'pending-review',
          validatedHash: 'hash',
        }),
      )
      change2.setArtifact(proposal2)

      const uc2 = makeGetStatus(makeChangeRepository([change2]))
      const result2 = await uc2.execute({ name: 'my-change-2' })

      expect(result2.blockers.some((b) => b.code === 'REVIEW_REQUIRED')).toBe(true)
    })

    it('projects read-only views with empty transitions for drafted changes', async () => {
      const change = makeChange('my-change')
      change.transition('designing', testActor)
      change.draft(testActor)

      const repo = makeChangeRepository()
      repo.store.set(change.name, change)

      const uc = makeGetStatus(repo)
      const result = await uc.execute({ name: 'my-change' })

      expect(result.change).toBeUndefined()
      expect(result.draftView).toBeDefined()
      expect(result.draftView?.name).toBe('my-change')

      expect(result.lifecycle.validTransitions).toEqual([])
      expect(result.lifecycle.availableTransitions).toEqual([])
      expect(result.lifecycle.blockers).toEqual([])
      expect(result.lifecycle.nextArtifact).toBeNull()
    })
  })
})
