import { createHash } from 'crypto'
import { describe, it, expect, vi } from 'vitest'
import { ValidateArtifacts } from '../../../src/application/use-cases/validate-artifacts.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import {
  type ArtifactAST,
  type ArtifactNode,
} from '../../../src/application/ports/artifact-parser.js'
import { DeltaApplicationError } from '../../../src/domain/errors/delta-application-error.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeSchemaProvider,
  makeSpecRepository,
  makeArtifactType,
  makeSchema,
  makeParser,
  makeParsers,
  testActor,
  makeContentHasher,
} from './helpers.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function makeChangeWithArtifacts(
  name: string,
  artifacts: ChangeArtifact[],
  opts: {
    specIds?: string[]
    history?: import('../../../src/domain/entities/change.js').ChangeEvent[]
    schemaName?: string
  } = {},
): Change {
  const specIds = opts.specIds ?? ['default:auth']
  const createdAt = new Date('2024-01-01T00:00:00Z')
  const createdEvent: import('../../../src/domain/entities/change.js').ChangeEvent = {
    type: 'created',
    at: createdAt,
    by: testActor,
    specIds,
    schemaName: opts.schemaName ?? 'test-schema',
    schemaVersion: 1,
  }
  const history = opts.history ? [createdEvent, ...opts.history] : [createdEvent]
  const artifactMap = new Map(artifacts.map((a) => [a.type, a]))
  return new Change({
    name,
    createdAt,
    specIds,
    history,
    artifacts: artifactMap,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ValidateArtifacts', () => {
  describe('change not found', () => {
    it('throws ChangeNotFoundError when change does not exist', async () => {
      const uc = new ValidateArtifacts(
        makeChangeRepository(),
        new Map(),
        makeSchemaProvider(makeSchema([])),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )
      await expect(
        uc.execute({
          name: 'missing',
          specPath: 'default:auth',
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('specPath not in change', () => {
    it('throws SpecNotInChangeError when specPath is not in change.specIds', async () => {
      const change = makeChangeWithArtifacts('c', [], { specIds: ['default:auth/login'] })
      const uc = new ValidateArtifacts(
        makeChangeRepository([change]),
        new Map(),
        makeSchemaProvider(makeSchema([])),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )
      await expect(
        uc.execute({
          name: 'c',
          specPath: 'default:billing/invoices',
        }),
      ).rejects.toThrow(SpecNotInChangeError)
    })
  })

  describe('schema not found', () => {
    it('throws SchemaNotFoundError when schema cannot be resolved', async () => {
      const change = makeChangeWithArtifacts('c', [])
      const uc = new ValidateArtifacts(
        makeChangeRepository([change]),
        new Map(),
        makeSchemaProvider(null),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )
      await expect(
        uc.execute({
          name: 'c',
          specPath: 'default:auth',
        }),
      ).rejects.toThrow(SchemaNotFoundError)
    })
  })

  describe('schema name mismatch', () => {
    it('throws SchemaMismatchError when active schema name differs from change schema name', async () => {
      const change = makeChangeWithArtifacts('c', [], { schemaName: 'schema-a' })
      const uc = new ValidateArtifacts(
        makeChangeRepository([change]),
        new Map(),
        makeSchemaProvider(makeSchema({ name: 'schema-b' })),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )
      await expect(
        uc.execute({
          name: 'c',
          specPath: 'default:auth',
        }),
      ).rejects.toThrow(SchemaMismatchError)
    })
  })

  describe('Required artifacts check', () => {
    it('reports missing non-optional artifact as failure', async () => {
      const specsType = makeArtifactType('specs')
      const schema = makeSchema([specsType])
      const change = makeChangeWithArtifacts('c', [])
      const repo = makeChangeRepository([change])
      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(result.passed).toBe(false)
      expect(result.failures.some((f) => f.artifactId === 'specs')).toBe(true)
    })

    it('does not report skipped optional artifact as failure', async () => {
      const designType = makeArtifactType('design', { optional: true })
      const schema = makeSchema([designType])
      const designArtifact = new ChangeArtifact({
        type: 'design',
        optional: true,
        files: new Map([
          [
            'design',
            new ArtifactFile({
              key: 'design',
              filename: 'design.md',
              status: 'skipped',
              validatedHash: '__skipped__',
            }),
          ],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [designArtifact])
      const repo = makeChangeRepository([change])
      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(result.failures.some((f) => f.artifactId === 'design')).toBe(false)
    })

    it('does not report missing optional artifact as failure', async () => {
      const designType = makeArtifactType('design', { optional: true })
      const schema = makeSchema([designType])
      const change = makeChangeWithArtifacts('c', [])
      const repo = makeChangeRepository([change])
      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(result.failures.some((f) => f.artifactId === 'design')).toBe(false)
    })
  })

  describe('Dependency order check', () => {
    it('reports dependency-blocked failure when required dependency is incomplete', async () => {
      const proposalType = makeArtifactType('proposal')
      const specsType = makeArtifactType('specs', { requires: ['proposal'] })
      const schema = makeSchema([proposalType, specsType])

      const proposalArtifact = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
          ],
        ]),
      })
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [proposalArtifact, specsArtifact])

      // No file for proposal.md — so proposal stays in-progress (markComplete not called),
      // which means specs remains dependency-blocked when it is processed.
      const files = new Map([['spec.md', 'specs content']])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const content = files.get(filename)
          return content !== undefined ? new SpecArtifact(filename, content) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(
        result.failures.some((f) => f.artifactId === 'specs' && f.description.includes('blocked')),
      ).toBe(true)
    })

    it('proceeds when dependency is complete', async () => {
      const proposalType = makeArtifactType('proposal')
      const specsType = makeArtifactType('specs', { requires: ['proposal'] })
      const schema = makeSchema([proposalType, specsType])

      const content = 'content'
      const proposalArtifact = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({
              key: 'proposal',
              filename: 'proposal.md',
              status: 'complete',
              validatedHash: sha256(content),
            }),
          ],
        ]),
      })
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [proposalArtifact, specsArtifact])

      const files = new Map([
        ['proposal.md', content],
        ['spec.md', content],
      ])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(
        result.failures.some((f) => f.artifactId === 'specs' && f.description.includes('blocked')),
      ).toBe(false)
    })

    it('proceeds when dependency is skipped', async () => {
      const designType = makeArtifactType('design', { optional: true })
      const tasksType = makeArtifactType('tasks', { requires: ['design'] })
      const schema = makeSchema([designType, tasksType])

      const designArtifact = new ChangeArtifact({
        type: 'design',
        optional: true,
        files: new Map([
          [
            'design',
            new ArtifactFile({
              key: 'design',
              filename: 'design.md',
              status: 'skipped',
              validatedHash: '__skipped__',
            }),
          ],
        ]),
      })
      const tasksContent = 'tasks content'
      const tasksArtifact = new ChangeArtifact({
        type: 'tasks',
        files: new Map([
          [
            'tasks',
            new ArtifactFile({ key: 'tasks', filename: 'tasks.md', status: 'in-progress' }),
          ],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [designArtifact, tasksArtifact])

      const files = new Map([['tasks.md', tasksContent]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(
        result.failures.some((f) => f.artifactId === 'tasks' && f.description.includes('blocked')),
      ).toBe(false)
    })
  })

  describe('Approval invalidation on content change', () => {
    it('calls change.invalidate when cleaned hash differs from approval', async () => {
      const specsType = makeArtifactType('specs')
      const schema = makeSchema([specsType])

      const content = 'current content'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const history: import('../../../src/domain/entities/change.js').ChangeEvent[] = [
        {
          type: 'spec-approved',
          at: new Date(),
          by: testActor,
          reason: 'approved',
          artifactHashes: { 'specs:specs': 'sha256:oldHash' },
        },
      ]
      const change = makeChangeWithArtifacts('c', [specsArtifact], { history })

      const files = new Map([['spec.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      // After invalidation, change should be back in designing state
      const saved = repo.store.get('c')
      expect(saved?.history.some((e) => e.type === 'invalidated')).toBe(true)
    })

    it('calls invalidate at most once even when multiple artifacts changed', async () => {
      const type1 = makeArtifactType('proposal')
      const type2 = makeArtifactType('specs')
      const schema = makeSchema([type1, type2])

      const art1 = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
          ],
        ]),
      })
      const art2 = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const history: import('../../../src/domain/entities/change.js').ChangeEvent[] = [
        {
          type: 'spec-approved',
          at: new Date(),
          by: testActor,
          reason: 'approved',
          artifactHashes: { 'proposal:proposal': 'sha256:old1', 'specs:specs': 'sha256:old2' },
        },
      ]
      const change = makeChangeWithArtifacts('c', [art1, art2], { history })

      const files = new Map([
        ['proposal.md', 'new1'],
        ['spec.md', 'new2'],
      ])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      const saved = repo.store.get('c')
      const invalidatedCount = saved?.history.filter((e) => e.type === 'invalidated').length ?? 0
      expect(invalidatedCount).toBe(1)
    })

    it('passes drifted artifact IDs to invalidate when single artifact changed', async () => {
      const proposalType = makeArtifactType('proposal')
      const designType = makeArtifactType('design', { requires: ['proposal'] })
      const schema = makeSchema([proposalType, designType])

      const proposalContent = 'proposal content'
      const designContent = 'design content'
      const proposalHash = sha256(proposalContent)

      const proposalArt = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
          ],
        ]),
      })
      const designArt = new ChangeArtifact({
        type: 'design',
        requires: ['proposal'],
        files: new Map([
          [
            'design',
            new ArtifactFile({ key: 'design', filename: 'design.md', status: 'in-progress' }),
          ],
        ]),
      })

      const history: import('../../../src/domain/entities/change.js').ChangeEvent[] = [
        {
          type: 'spec-approved',
          at: new Date(),
          by: testActor,
          reason: 'approved',
          artifactHashes: {
            'proposal:proposal': proposalHash,
            'design:design': 'sha256:oldDesignHash',
          },
        },
      ]
      const change = makeChangeWithArtifacts('c', [proposalArt, designArt], { history })
      const invalidateSpy = vi.spyOn(change, 'invalidate')

      const files = new Map([
        ['proposal.md', proposalContent],
        ['design.md', designContent],
      ])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(invalidateSpy).toHaveBeenCalledOnce()
      const [cause, , driftedIds] = invalidateSpy.mock.calls[0]!
      expect(cause).toBe('artifact-change')
      expect(driftedIds).toBeInstanceOf(Set)
      expect(driftedIds).toEqual(new Set(['design']))
    })

    it('does not call invalidate when hashes match', async () => {
      const specsType = makeArtifactType('specs')
      const schema = makeSchema([specsType])

      const content = 'content'
      const currentHash = sha256(content)
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const history: import('../../../src/domain/entities/change.js').ChangeEvent[] = [
        {
          type: 'spec-approved',
          at: new Date(),
          by: testActor,
          reason: 'approved',
          artifactHashes: { 'specs:specs': currentHash },
        },
      ]
      const change = makeChangeWithArtifacts('c', [specsArtifact], { history })

      const files = new Map([['spec.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      const saved = repo.store.get('c')
      expect(saved?.history.some((e) => e.type === 'invalidated')).toBe(false)
    })
  })

  describe('Hash computation and markComplete', () => {
    it('calls markComplete with sha256 of artifact content when validation passes', async () => {
      const specsType = makeArtifactType('specs', { format: 'markdown' })
      const schema = makeSchema([specsType])

      const content = 'spec content'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const files = new Map([['spec.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      const saved = repo.store.get('c')
      const artifact = saved?.getArtifact('specs')
      expect(artifact?.status).toBe('complete')
      expect(artifact?.getFile('specs')?.validatedHash).toBe(sha256(content))
    })

    it('applies preHashCleanup before computing hash', async () => {
      const specsType = makeArtifactType('specs', {
        format: 'markdown',
        preHashCleanup: [{ pattern: '- \\[x\\]', replacement: '- [ ]' }],
      })
      const schema = makeSchema([specsType])

      const rawContent = '- [x] done task'
      const cleanedContent = '- [ ] done task'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const files = new Map([['spec.md', rawContent]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      const saved = repo.store.get('c')
      const artifact = saved?.getArtifact('specs')
      expect(artifact?.getFile('specs')?.validatedHash).toBe(sha256(cleanedContent))
    })

    it('does not call markComplete when a required validation fails', async () => {
      const trivialNode: ArtifactNode = { type: 'root' }
      const trivialAST: ArtifactAST = { root: trivialNode }
      const parser = makeParser({
        parse: () => trivialAST,
        renderSubtree: () => 'no match here',
      })
      const specsType = makeArtifactType('specs', {
        format: 'markdown',
        validations: [{ selector: { type: 'section', matches: '^Purpose$' }, required: true }],
      })
      const schema = makeSchema([specsType])

      const content = 'spec content'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const files = new Map([['spec.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(parser),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      const saved = repo.store.get('c')
      const artifact = saved?.getArtifact('specs')
      expect(result.passed).toBe(false)
      expect(artifact?.status).not.toBe('complete')
    })
  })

  describe('Structural validation', () => {
    it('collects all failures before returning — does not stop at first', async () => {
      const sectionNode: ArtifactNode = { type: 'section', label: 'Other' }
      const ast: ArtifactAST = { root: { type: 'root', children: [sectionNode] } }
      const parser = makeParser({ parse: () => ast })
      const specsType = makeArtifactType('specs', {
        format: 'markdown',
        validations: [
          { selector: { type: 'section', matches: '^Purpose$' }, required: true },
          { selector: { type: 'section', matches: '^Scope$' }, required: true },
        ],
      })
      const schema = makeSchema([specsType])

      const content = 'spec content'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const files = new Map([['spec.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(parser),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      const specFailures = result.failures.filter((f) => f.artifactId === 'specs')
      expect(specFailures.length).toBeGreaterThanOrEqual(2)
    })

    it('adds warning for required: false rule with no matches', async () => {
      const sectionNode: ArtifactNode = { type: 'section', label: 'Other' }
      const ast: ArtifactAST = { root: { type: 'root', children: [sectionNode] } }
      const parser = makeParser({ parse: () => ast })
      const specsType = makeArtifactType('specs', {
        format: 'markdown',
        validations: [{ selector: { type: 'section', matches: '^Optional$' }, required: false }],
      })
      const schema = makeSchema([specsType])

      const content = 'spec content'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const files = new Map([['spec.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(parser),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(result.passed).toBe(true)
      expect(result.warnings.some((w) => w.artifactId === 'specs')).toBe(true)
    })
  })

  describe('Delta application preview', () => {
    it('reports DeltaApplicationError as failure', async () => {
      const parser = makeParser({
        apply: () => {
          throw new DeltaApplicationError('conflict')
        },
      })
      const yamlParser = makeParser({
        parseDelta: () => [{ op: 'added' as const }],
      })

      const specsType = makeArtifactType('specs', { format: 'markdown', delta: true })
      const schema = makeSchema([specsType])

      const content = 'content'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const capPath = 'auth'
      const deltaFilename = `deltas/default/${capPath}/spec.md.delta.yaml`
      const files = new Map([
        ['spec.md', content],
        [deltaFilename, 'delta content'],
      ])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const specsRepo = makeSpecRepository({
        specs: [new Spec('default', SpecPath.parse('auth'), [])],
        artifacts: { 'auth/spec.md': 'base content' },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map([['default', specsRepo]]),
        makeSchemaProvider(schema),
        makeParsers(parser, yamlParser),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(result.passed).toBe(false)
      expect(
        result.failures.some(
          (f) => f.artifactId === 'specs' && f.description.includes('Delta application failed'),
        ),
      ).toBe(true)
    })

    it('validates directly when no delta file exists', async () => {
      const specsType = makeArtifactType('specs', { format: 'markdown', delta: true })
      const schema = makeSchema([specsType])

      const content = 'content'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const files = new Map([['spec.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(result.passed).toBe(true)
      const artifact = repo.store.get('c')?.getArtifact('specs')
      expect(artifact?.status).toBe('complete')
    })
  })

  describe('no-op delta bypass', () => {
    const noopParseDelta = (content: string) => {
      // Minimal parseDelta that recognizes no-op
      const lines = content.trim().split('\n')
      const entries: import('../../../src/application/ports/artifact-parser.js').DeltaEntry[] = []
      for (const line of lines) {
        const m = line.match(/^\s*-\s*op:\s*(.+)/)
        if (m) entries.push({ op: m[1]!.trim() as 'no-op' })
      }
      return entries
    }

    function makeNoopParsers() {
      const yamlParser = makeParser({ parseDelta: noopParseDelta })
      return makeParsers(makeParser(), yamlParser)
    }

    it('bypasses deltaValidations and marks complete for no-op delta', async () => {
      const specsType = makeArtifactType('specs', {
        scope: 'spec',
        format: 'markdown',
        delta: true,
        deltaValidations: [
          {
            selector: { type: 'sequence-item', where: { op: 'added' } },
            required: true,
          },
        ],
      })
      const schema = makeSchema([specsType])

      const noopContent = '- op: no-op\n'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          [
            'default:auth',
            new ArtifactFile({
              key: 'default:auth',
              filename: 'deltas/default/auth/spec.md.delta.yaml',
              status: 'in-progress',
            }),
          ],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          if (filename === 'deltas/default/auth/spec.md.delta.yaml') {
            return new SpecArtifact(filename, noopContent)
          }
          return null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeNoopParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({ name: 'c', specPath: 'default:auth' })

      expect(result.passed).toBe(true)
      expect(result.failures).toHaveLength(0)
      const artifact = repo.store.get('c')?.getArtifact('specs')
      expect(artifact?.status).toBe('complete')
    })

    it('skips application preview for no-op delta', async () => {
      const specsType = makeArtifactType('specs', {
        scope: 'spec',
        format: 'markdown',
        delta: true,
      })
      const schema = makeSchema([specsType])

      const noopContent = '- op: no-op\n'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          [
            'default:auth',
            new ArtifactFile({
              key: 'default:auth',
              filename: 'deltas/default/auth/spec.md.delta.yaml',
              status: 'in-progress',
            }),
          ],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          if (filename === 'deltas/default/auth/spec.md.delta.yaml') {
            return new SpecArtifact(filename, noopContent)
          }
          return null
        },
      })

      // Create a spec repo that would fail if accessed (proving no base spec is loaded)
      const specRepo = makeSpecRepository()
      const specRepoSpy = vi.spyOn(specRepo, 'get')

      const uc = new ValidateArtifacts(
        repo,
        new Map([['default', specRepo]]),
        makeSchemaProvider(schema),
        makeNoopParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({ name: 'c', specPath: 'default:auth' })

      expect(result.passed).toBe(true)
      expect(specRepoSpy).not.toHaveBeenCalled()
    })

    it('skips structural validations for no-op delta', async () => {
      const specsType = makeArtifactType('specs', {
        scope: 'spec',
        format: 'markdown',
        delta: true,
        validations: [
          {
            selector: { type: 'section', matches: '^Purpose$' },
            required: true,
          },
        ],
      })
      const schema = makeSchema([specsType])

      const noopContent = '- op: no-op\n'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          [
            'default:auth',
            new ArtifactFile({
              key: 'default:auth',
              filename: 'deltas/default/auth/spec.md.delta.yaml',
              status: 'in-progress',
            }),
          ],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          if (filename === 'deltas/default/auth/spec.md.delta.yaml') {
            return new SpecArtifact(filename, noopContent)
          }
          return null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeNoopParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({ name: 'c', specPath: 'default:auth' })

      // Would fail if validations ran (no Purpose section in no-op delta content)
      expect(result.passed).toBe(true)
      const artifact = repo.store.get('c')?.getArtifact('specs')
      expect(artifact?.status).toBe('complete')
    })

    it('calls markComplete with hash of raw delta file content', async () => {
      const specsType = makeArtifactType('specs', {
        scope: 'spec',
        format: 'markdown',
        delta: true,
      })
      const schema = makeSchema([specsType])

      const noopContent = '- op: no-op\n'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          [
            'default:auth',
            new ArtifactFile({
              key: 'default:auth',
              filename: 'deltas/default/auth/spec.md.delta.yaml',
              status: 'in-progress',
            }),
          ],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          if (filename === 'deltas/default/auth/spec.md.delta.yaml') {
            return new SpecArtifact(filename, noopContent)
          }
          return null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeNoopParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      await uc.execute({ name: 'c', specPath: 'default:auth' })

      const artifact = repo.store.get('c')?.getArtifact('specs')
      const file = artifact?.getFile('default:auth')
      expect(file?.validatedHash).toBe(sha256(noopContent))
    })
  })

  describe('Save after validation', () => {
    it('calls save even when some artifacts fail', async () => {
      const type1 = makeArtifactType('proposal')
      const type2 = makeArtifactType('specs', { format: 'markdown' })
      const schema = makeSchema([type1, type2])

      const content = 'content'
      const art1 = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
          ],
        ]),
      })
      const art2 = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [art1, art2])

      // proposal has file, specs does not → specs fails (missing effect from no file)
      const files = new Map([['proposal.md', content]])
      const repo = makeChangeRepository([change])
      const saveSpy = vi.fn(async (c: Change) => {
        repo.store.set(c.name, c)
      })
      Object.assign(repo, {
        save: saveSpy,
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(saveSpy).toHaveBeenCalled()
    })
  })

  describe('Result shape', () => {
    it('returns passed:true when all non-optional artifacts pass', async () => {
      const specsType = makeArtifactType('specs', { format: 'markdown' })
      const schema = makeSchema([specsType])

      const content = 'content'
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const files = new Map([['spec.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(result.passed).toBe(true)
      expect(result.failures).toEqual([])
    })

    it('returns passed:false when a required artifact is missing', async () => {
      const specsType = makeArtifactType('specs')
      const schema = makeSchema([specsType])
      const change = makeChangeWithArtifacts('c', [])
      const uc = new ValidateArtifacts(
        makeChangeRepository([change]),
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
      })

      expect(result.passed).toBe(false)
    })
  })

  describe('artifactId filter', () => {
    it('returns failure for unknown artifact ID without throwing', async () => {
      const proposalType = makeArtifactType('proposal')
      const schema = makeSchema([proposalType])
      const change = makeChangeWithArtifacts('c', [])
      const uc = new ValidateArtifacts(
        makeChangeRepository([change]),
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
        artifactId: 'nonexistent',
      })

      expect(result.passed).toBe(false)
      expect(result.failures).toHaveLength(1)
      expect(result.failures[0]!.artifactId).toBe('nonexistent')
      expect(result.failures[0]!.description).toContain('nonexistent')
    })

    it('validates only the specified artifact, ignoring others', async () => {
      const proposalType = makeArtifactType('proposal', { format: 'markdown' })
      const specsType = makeArtifactType('specs', { format: 'markdown' })
      const schema = makeSchema([proposalType, specsType])

      const content = 'proposal content'
      const proposalArtifact = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
          ],
        ]),
      })
      // specs has no file — would fail required-artifacts if not filtered
      const change = makeChangeWithArtifacts('c', [proposalArtifact])

      const files = new Map([['proposal.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
        artifactId: 'proposal',
      })

      expect(result.passed).toBe(true)
      expect(result.failures).toHaveLength(0)
      // specs is missing but not reported
      expect(result.failures.some((f) => f.artifactId === 'specs')).toBe(false)
    })

    it('reports dependency-blocked for specified artifact with unsatisfied deps', async () => {
      const proposalType = makeArtifactType('proposal')
      const specsType = makeArtifactType('specs', { requires: ['proposal'] })
      const schema = makeSchema([proposalType, specsType])

      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      // proposal has no artifact — so it's missing, not complete
      const change = makeChangeWithArtifacts('c', [specsArtifact])

      const files = new Map([['spec.md', 'specs content']])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
        artifactId: 'specs',
      })

      expect(
        result.failures.some((f) => f.artifactId === 'specs' && f.description.includes('blocked')),
      ).toBe(true)
    })

    it('validates specified artifact normally when deps are satisfied', async () => {
      const proposalType = makeArtifactType('proposal', { format: 'markdown' })
      const specsType = makeArtifactType('specs', { requires: ['proposal'], format: 'markdown' })
      const schema = makeSchema([proposalType, specsType])

      const proposalContent = 'proposal content'
      const specsContent = 'specs content'

      const proposalArtifact = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({
              key: 'proposal',
              filename: 'proposal.md',
              status: 'complete',
              validatedHash: sha256(proposalContent),
            }),
          ],
        ]),
      })
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        files: new Map([
          ['specs', new ArtifactFile({ key: 'specs', filename: 'spec.md', status: 'in-progress' })],
        ]),
      })
      const change = makeChangeWithArtifacts('c', [proposalArtifact, specsArtifact])

      const files = new Map([
        ['proposal.md', proposalContent],
        ['spec.md', specsContent],
      ])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
        artifactId: 'specs',
      })

      expect(result.passed).toBe(true)
      const saved = repo.store.get('c')
      const artifact = saved?.getArtifact('specs')
      expect(artifact?.status).toBe('complete')
    })

    it('skips required-artifacts check when artifactId is provided', async () => {
      const proposalType = makeArtifactType('proposal', { format: 'markdown' })
      const specsType = makeArtifactType('specs')
      const schema = makeSchema([proposalType, specsType])

      const content = 'proposal content'
      const proposalArtifact = new ChangeArtifact({
        type: 'proposal',
        files: new Map([
          [
            'proposal',
            new ArtifactFile({ key: 'proposal', filename: 'proposal.md', status: 'in-progress' }),
          ],
        ]),
      })
      // specs is missing — normally would fail required-artifacts check
      const change = makeChangeWithArtifacts('c', [proposalArtifact])

      const files = new Map([['proposal.md', content]])
      const repo = makeChangeRepository([change])
      Object.assign(repo, {
        async artifact(_change: Change, filename: string): Promise<SpecArtifact | null> {
          const c = files.get(filename)
          return c !== undefined ? new SpecArtifact(filename, c) : null
        },
      })

      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaProvider(schema),
        makeParsers(),
        makeActorResolver(),
        makeContentHasher(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default:auth',
        artifactId: 'proposal',
      })

      // proposal passes, and missing specs is NOT reported
      expect(result.passed).toBe(true)
      expect(result.failures.some((f) => f.artifactId === 'specs')).toBe(false)
    })
  })
})
