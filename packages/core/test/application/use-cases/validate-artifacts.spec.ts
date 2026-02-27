import { createHash } from 'crypto'
import { describe, it, expect, vi } from 'vitest'
import { ValidateArtifacts } from '../../../src/application/use-cases/validate-artifacts.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactType } from '../../../src/domain/value-objects/artifact-type.js'
import { Schema } from '../../../src/domain/value-objects/schema.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import {
  DeltaApplicationError,
  type ArtifactParser,
  type ArtifactParserRegistry,
  type ArtifactAST,
  type ArtifactNode,
} from '../../../src/application/ports/artifact-parser.js'
import { makeChangeRepository, makeGitAdapter, testActor } from './helpers.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function makeArtifactType(
  id: string,
  opts: {
    optional?: boolean
    requires?: string[]
    delta?: boolean
    validations?: readonly import('../../../src/domain/value-objects/validation-rule.js').ValidationRule[]
    deltaValidations?: readonly import('../../../src/domain/value-objects/validation-rule.js').ValidationRule[]
    preHashCleanup?: readonly import('../../../src/domain/value-objects/validation-rule.js').PreHashCleanup[]
    format?: 'markdown' | 'json' | 'yaml' | 'plaintext'
  } = {},
): ArtifactType {
  return new ArtifactType({
    id,
    scope: 'change',
    output: `${id}.md`,
    requires: opts.requires ?? [],
    validations: opts.validations ?? [],
    deltaValidations: opts.deltaValidations ?? [],
    contextSections: [],
    preHashCleanup: opts.preHashCleanup ?? [],
    ...(opts.optional !== undefined && { optional: opts.optional }),
    ...(opts.delta !== undefined && { delta: opts.delta }),
    ...(opts.format !== undefined && { format: opts.format }),
  })
}

function makeSchema(artifactTypes: ArtifactType[]): Schema {
  return new Schema('test-schema', 1, artifactTypes, [])
}

function makeSchemaRegistry(schema: Schema | null = null) {
  return {
    async resolve(_ref: string, _paths: ReadonlyMap<string, string>): Promise<Schema | null> {
      return schema
    },
    async list(_paths: ReadonlyMap<string, string>) {
      return []
    },
  }
}

function makeSpecRepository(artifacts: Map<string, string> = new Map()) {
  return {
    workspace() {
      return 'default'
    },
    ownership() {
      return 'owned' as const
    },
    isExternal() {
      return false
    },
    async get(name: SpecPath): Promise<Spec | null> {
      return new Spec('default', name, [])
    },
    async list() {
      return []
    },
    async artifact(_spec: Spec, filename: string): Promise<SpecArtifact | null> {
      const content = artifacts.get(filename)
      if (content === undefined) return null
      return new SpecArtifact(filename, content)
    },
    async save() {},
    async delete() {},
  }
}

function makeParser(
  opts: {
    parse?: (content: string) => ArtifactAST
    apply?: (
      ast: ArtifactAST,
      delta: readonly import('../../../src/application/ports/artifact-parser.js').DeltaEntry[],
    ) => ArtifactAST
    serialize?: (ast: ArtifactAST) => string
    renderSubtree?: (node: ArtifactNode) => string
    parseDelta?: (
      content: string,
    ) => readonly import('../../../src/application/ports/artifact-parser.js').DeltaEntry[]
  } = {},
): ArtifactParser {
  const trivialNode: ArtifactNode = { type: 'root' }
  const trivialAST: ArtifactAST = { root: trivialNode }
  return {
    fileExtensions: ['.md'],
    parse: opts.parse ?? ((_content) => trivialAST),
    apply: opts.apply ?? ((ast, _delta) => ast),
    serialize: opts.serialize ?? ((_ast) => 'serialized'),
    renderSubtree: opts.renderSubtree ?? ((_node) => 'rendered'),
    nodeTypes: () => [],
    outline: () => [],
    deltaInstructions: () => '',
    parseDelta: opts.parseDelta ?? ((_content) => []),
  }
}

function makeParsers(
  markdown: ArtifactParser = makeParser(),
  yaml: ArtifactParser = makeParser(),
): ArtifactParserRegistry {
  return new Map([
    ['markdown', markdown],
    ['yaml', yaml],
  ])
}

function makeChangeWithArtifacts(
  name: string,
  artifacts: ChangeArtifact[],
  opts: {
    specIds?: string[]
    history?: import('../../../src/domain/entities/change.js').ChangeEvent[]
  } = {},
): Change {
  const artifactMap = new Map(artifacts.map((a) => [a.type, a]))
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    workspaces: ['default'],
    specIds: opts.specIds ?? ['default/auth/login'],
    history: opts.history ?? [],
    artifacts: artifactMap,
  })
}

const defaultSchemasPaths: ReadonlyMap<string, string> = new Map()

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ValidateArtifacts', () => {
  describe('change not found', () => {
    it('throws ChangeNotFoundError when change does not exist', async () => {
      const uc = new ValidateArtifacts(
        makeChangeRepository(),
        new Map(),
        makeSchemaRegistry(makeSchema([])),
        makeParsers(),
        makeGitAdapter(),
      )
      await expect(
        uc.execute({
          name: 'missing',
          specPath: 'default/auth',
          schemaRef: 'test',
          workspaceSchemasPaths: defaultSchemasPaths,
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('schema not found', () => {
    it('throws SchemaNotFoundError when schema cannot be resolved', async () => {
      const change = makeChangeWithArtifacts('c', [])
      const uc = new ValidateArtifacts(
        makeChangeRepository([change]),
        new Map(),
        makeSchemaRegistry(null),
        makeParsers(),
        makeGitAdapter(),
      )
      await expect(
        uc.execute({
          name: 'c',
          specPath: 'default/auth',
          schemaRef: 'bad-ref',
          workspaceSchemasPaths: defaultSchemasPaths,
        }),
      ).rejects.toThrow(SchemaNotFoundError)
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
      })

      expect(result.passed).toBe(false)
      expect(result.failures.some((f) => f.artifactId === 'specs')).toBe(true)
    })

    it('does not report skipped optional artifact as failure', async () => {
      const designType = makeArtifactType('design', { optional: true })
      const schema = makeSchema([designType])
      const designArtifact = new ChangeArtifact({
        type: 'design',
        filename: 'design.md',
        optional: true,
        status: 'skipped',
        validatedHash: '__skipped__',
      })
      const change = makeChangeWithArtifacts('c', [designArtifact])
      const repo = makeChangeRepository([change])
      const uc = new ValidateArtifacts(
        repo,
        new Map(),
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'proposal.md',
        status: 'in-progress',
      })
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'proposal.md',
        status: 'complete',
        validatedHash: sha256(content),
      })
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'design.md',
        optional: true,
        status: 'skipped',
        validatedHash: '__skipped__',
      })
      const tasksContent = 'tasks content'
      const tasksArtifact = new ChangeArtifact({
        type: 'tasks',
        filename: 'tasks.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'spec.md',
        status: 'in-progress',
      })
      const history: import('../../../src/domain/entities/change.js').ChangeEvent[] = [
        {
          type: 'spec-approved',
          at: new Date(),
          by: testActor,
          reason: 'approved',
          artifactHashes: { specs: 'sha256:oldHash' },
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'proposal.md',
        status: 'in-progress',
      })
      const art2 = new ChangeArtifact({ type: 'specs', filename: 'spec.md', status: 'in-progress' })
      const history: import('../../../src/domain/entities/change.js').ChangeEvent[] = [
        {
          type: 'spec-approved',
          at: new Date(),
          by: testActor,
          reason: 'approved',
          artifactHashes: { proposal: 'sha256:old1', specs: 'sha256:old2' },
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
      })

      const saved = repo.store.get('c')
      const invalidatedCount = saved?.history.filter((e) => e.type === 'invalidated').length ?? 0
      expect(invalidatedCount).toBe(1)
    })

    it('does not call invalidate when hashes match', async () => {
      const specsType = makeArtifactType('specs')
      const schema = makeSchema([specsType])

      const content = 'content'
      const currentHash = sha256(content)
      const specsArtifact = new ChangeArtifact({
        type: 'specs',
        filename: 'spec.md',
        status: 'in-progress',
      })
      const history: import('../../../src/domain/entities/change.js').ChangeEvent[] = [
        {
          type: 'spec-approved',
          at: new Date(),
          by: testActor,
          reason: 'approved',
          artifactHashes: { specs: currentHash },
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
      })

      const saved = repo.store.get('c')
      const artifact = saved?.getArtifact('specs')
      expect(artifact?.status).toBe('complete')
      expect(artifact?.validatedHash).toBe(sha256(content))
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
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
      })

      const saved = repo.store.get('c')
      const artifact = saved?.getArtifact('specs')
      expect(artifact?.validatedHash).toBe(sha256(cleanedContent))
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
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(parser),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(parser),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(parser),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'spec.md',
        status: 'in-progress',
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

      const specArtifacts = new Map([['spec.md', 'base content']])
      const specsRepo = makeSpecRepository(specArtifacts)

      const uc = new ValidateArtifacts(
        repo,
        new Map([['default', specsRepo as never]]),
        makeSchemaRegistry(schema),
        makeParsers(parser, yamlParser),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
      })

      expect(result.passed).toBe(true)
      const artifact = repo.store.get('c')?.getArtifact('specs')
      expect(artifact?.status).toBe('complete')
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
        filename: 'proposal.md',
        status: 'in-progress',
      })
      const art2 = new ChangeArtifact({ type: 'specs', filename: 'spec.md', status: 'in-progress' })
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        filename: 'spec.md',
        status: 'in-progress',
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
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
        makeSchemaRegistry(schema),
        makeParsers(),
        makeGitAdapter(),
      )

      const result = await uc.execute({
        name: 'c',
        specPath: 'default/auth',
        schemaRef: 'test',
        workspaceSchemasPaths: defaultSchemasPaths,
      })

      expect(result.passed).toBe(false)
    })
  })
})
