import { describe, it, expect, vi } from 'vitest'
import {
  PreviewSpec,
  type PreviewSpecInput,
} from '../../../src/application/use-cases/preview-spec.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  type ArtifactParserRegistry,
  type ArtifactParser,
  type ArtifactAST,
  type DeltaEntry,
} from '../../../src/application/ports/artifact-parser.js'
import {
  makeChangeRepository,
  makeSpecRepository,
  makeSchemaProvider,
  makeArtifactType,
  makeSchema,
  makeParser,
  makeParsers,
  makeChange,
} from './helpers.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCHEMA_NAME = 'test-schema'
const SPEC_ID = 'core:core/config'
const CHANGE_NAME = 'my-change'

/** Builds a Change that includes the given specIds and pre-populated artifacts. */
function makeChangeWithArtifacts(
  specIds: string[],
  artifacts: ChangeArtifact[] = [],
  schemaName = SCHEMA_NAME,
): Change {
  const change = makeChange(CHANGE_NAME, { specIds, schemaName })
  for (const artifact of artifacts) {
    change.setArtifact(artifact)
  }
  return change
}

/** Builds a ChangeArtifact with a single ArtifactFile for the given specId. */
function makeSpecArtifact(
  artifactTypeId: string,
  specId: string,
  filename: string,
): ChangeArtifact {
  const file = new ArtifactFile({
    key: specId,
    filename,
    status: 'in-progress',
  })
  return new ChangeArtifact({
    type: artifactTypeId,
    files: new Map([[specId, file]]),
  })
}

/** Creates a Spec entity for the given workspace and capPath. */
function makeSpec(workspace: string, capPath: string): Spec {
  return new Spec(workspace, SpecPath.parse(capPath), ['spec.md'])
}

/** Sets up the SUT (PreviewSpec) with full control over each port. */
function makeSut(opts: {
  change?: Change
  specRepos?: Map<string, ReturnType<typeof makeSpecRepository>>
  schemaName?: string
  artifactContent?: string | null
  baseArtifact?: string | null
  parsers?: ArtifactParserRegistry
}) {
  const schemaName = opts.schemaName ?? SCHEMA_NAME
  const artifactType = makeArtifactType('specs', { scope: 'spec' })
  const schema = makeSchema({ artifacts: [artifactType], name: schemaName })
  const schemaProvider = makeSchemaProvider(schema)

  const changes = makeChangeRepository(opts.change !== undefined ? [opts.change] : [])

  // Wire artifact() on the change repo to return opts.artifactContent
  const artifactFn = vi.fn(async (_change: Change, _filename: string) => {
    if (opts.artifactContent === undefined || opts.artifactContent === null) return null
    return new SpecArtifact(_filename, opts.artifactContent)
  })
  ;(changes as unknown as { artifact: typeof artifactFn }).artifact = artifactFn

  const specRepos: Map<string, ReturnType<typeof makeSpecRepository>> = opts.specRepos ?? new Map()

  const parsers: ArtifactParserRegistry = opts.parsers ?? makeParsers()

  const useCase = new PreviewSpec(changes, specRepos, schemaProvider, parsers)
  return { useCase, changes, specRepos, schema, artifactFn }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreviewSpec', () => {
  describe('specId not in change throws error', () => {
    it('throws SpecNotInChangeError when specId is not among the change specIds', async () => {
      const change = makeChangeWithArtifacts(['core:core/config'])
      const { useCase } = makeSut({ change })

      const input: PreviewSpecInput = {
        name: CHANGE_NAME,
        specId: 'core:core/other',
      }

      await expect(useCase.execute(input)).rejects.toThrow(SpecNotInChangeError)
    })
  })

  describe('schema mismatch throws', () => {
    it('throws SchemaMismatchError when change schema differs from active schema', async () => {
      const change = makeChangeWithArtifacts([SPEC_ID], [], 'other-schema')
      const { useCase } = makeSut({ change, schemaName: SCHEMA_NAME })

      const input: PreviewSpecInput = { name: CHANGE_NAME, specId: SPEC_ID }

      await expect(useCase.execute(input)).rejects.toThrow(SchemaMismatchError)
    })
  })

  describe('new spec files discovered', () => {
    it('returns an entry with base: null for a non-delta artifact filename', async () => {
      const artifactFilename = `changes/${CHANGE_NAME}/core/core/config/spec.md`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, artifactFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const content = '# New Spec\n\nThis is a new spec.'
      const { useCase } = makeSut({ change, artifactContent: content })

      const input: PreviewSpecInput = { name: CHANGE_NAME, specId: SPEC_ID }
      const result = await useCase.execute(input)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.base).toBeNull()
      expect(result.files[0]?.merged).toBe(content)
      expect(result.files[0]?.filename).toBe('spec.md')
    })
  })

  describe('base is null for new specs', () => {
    it('sets base to null for a new (non-delta) file entry', async () => {
      const artifactFilename = `changes/${CHANGE_NAME}/core/core/config/verify.md`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, artifactFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const { useCase } = makeSut({ change, artifactContent: '# Verify\n' })

      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files[0]?.base).toBeNull()
    })
  })

  describe('delta files discovered from change artifacts', () => {
    it('loads delta from ChangeRepository for a .delta.yaml filename', async () => {
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const baseContent = '# Config\n\nBase content.'
      const deltaContent = '- op: replace\n  path: /root\n  value: new content'
      const mergedContent = '# Config\n\nMerged content.'

      const deltaEntry: DeltaEntry = { op: 'modified' }

      const yamlParser = makeParser({
        parseDelta: () => [deltaEntry],
      })
      const mdParser = makeParser({
        parse: (c) => ({ root: { type: 'doc', value: c } }),
        apply: (_ast, _delta) => ({
          ast: { root: { type: 'doc', value: mergedContent } },
          warnings: [] as readonly string[],
        }),
        serialize: () => mergedContent,
      })

      const parsers: ArtifactParserRegistry = new Map([
        ['yaml', yamlParser],
        ['markdown', mdParser],
      ])

      const spec = makeSpec('core', 'core/config')
      const specRepo = makeSpecRepository({
        specs: [spec],
        artifacts: { 'core/config/spec.md': baseContent },
      })
      const specRepos = new Map([['core', specRepo]])

      const changes = makeChangeRepository([change])
      // Stub artifact() to return delta content
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async (_c: Change, filename: string) => {
          if (filename === deltaFilename) return new SpecArtifact(filename, deltaContent)
          return null
        },
      )

      const artifactType = makeArtifactType('specs', { scope: 'spec' })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(changes, specRepos, schemaProvider, parsers)
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.filename).toBe('spec.md')
    })
  })

  describe('delta merged into base spec', () => {
    it('applies delta entries to base content and returns merged result', async () => {
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const baseContent = '# Config\n\nOriginal content.'
      const mergedContent = '# Config\n\nUpdated content.'
      const deltaEntry: DeltaEntry = { op: 'modified' }

      const yamlParser = makeParser({ parseDelta: () => [deltaEntry] })
      const mdParser = makeParser({
        apply: () => ({
          ast: { root: { type: 'doc', value: mergedContent } },
          warnings: [] as readonly string[],
        }),
        serialize: () => mergedContent,
      })
      const parsers: ArtifactParserRegistry = new Map([
        ['yaml', yamlParser],
        ['markdown', mdParser],
      ])

      const spec = makeSpec('core', 'core/config')
      const specRepo = makeSpecRepository({
        specs: [spec],
        artifacts: { 'core/config/spec.md': baseContent },
      })
      const specRepos = new Map([['core', specRepo]])

      const changes = makeChangeRepository([change])
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async (_c: Change, filename: string) =>
          filename === deltaFilename ? new SpecArtifact(filename, 'delta-yaml-content') : null,
      )

      const artifactType = makeArtifactType('specs', { scope: 'spec' })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(changes, specRepos, schemaProvider, parsers)
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files[0]?.base).toBe(baseContent)
      expect(result.files[0]?.merged).toBe(mergedContent)
    })
  })

  describe('base content included for delta files', () => {
    it('sets both base and merged fields for a delta entry', async () => {
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const baseContent = '# Base\n'
      const mergedContent = '# Merged\n'
      const deltaEntry: DeltaEntry = { op: 'modified' }

      const yamlParser = makeParser({ parseDelta: () => [deltaEntry] })
      const mdParser = makeParser({
        apply: () => ({
          ast: { root: { type: 'doc', value: mergedContent } },
          warnings: [] as readonly string[],
        }),
        serialize: () => mergedContent,
      })
      const parsers: ArtifactParserRegistry = new Map([
        ['yaml', yamlParser],
        ['markdown', mdParser],
      ])

      const spec = makeSpec('core', 'core/config')
      const specRepo = makeSpecRepository({
        specs: [spec],
        artifacts: { 'core/config/spec.md': baseContent },
      })
      const specRepos = new Map([['core', specRepo]])

      const changes = makeChangeRepository([change])
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async (_c: Change, filename: string) =>
          filename === deltaFilename ? new SpecArtifact(filename, 'delta') : null,
      )

      const artifactType = makeArtifactType('specs', { scope: 'spec' })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(changes, specRepos, schemaProvider, parsers)
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files[0]?.base).toBe(baseContent)
      expect(result.files[0]?.merged).toBe(mergedContent)
    })
  })

  describe('no-op delta skipped', () => {
    it('excludes files whose delta contains only no-op entries', async () => {
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const noOpEntry: DeltaEntry = { op: 'no-op' }
      const yamlParser = makeParser({ parseDelta: () => [noOpEntry] })
      const parsers: ArtifactParserRegistry = new Map([
        ['yaml', yamlParser],
        ['markdown', makeParser()],
      ])

      const changes = makeChangeRepository([change])
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async () => new SpecArtifact(deltaFilename, 'delta'),
      )

      const artifactType = makeArtifactType('specs', { scope: 'spec' })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(changes, new Map(), schemaProvider, parsers)
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(0)
    })
  })

  describe('spec.md appears first', () => {
    it('orders spec.md before other files, then alphabetically', async () => {
      // Two new spec files: verify.md and spec.md — ensure spec.md comes first
      const specFile = makeSpecArtifact(
        'specs',
        SPEC_ID,
        `changes/${CHANGE_NAME}/core/core/config/spec.md`,
      )
      const verifyFile = makeSpecArtifact(
        'specs-verify',
        SPEC_ID,
        `changes/${CHANGE_NAME}/core/core/config/verify.md`,
      )

      const change = makeChangeWithArtifacts([SPEC_ID], [specFile, verifyFile])

      // Two artifact types in the schema: specs and specs-verify
      const specsType = makeArtifactType('specs', { scope: 'spec' })
      const verifyType = makeArtifactType('specs-verify', { scope: 'spec' })
      const schema = makeSchema({ artifacts: [verifyType, specsType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const changes = makeChangeRepository([change])
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async (_c: Change, filename: string) =>
          new SpecArtifact(filename, `content of ${filename}`),
      )

      const useCase = new PreviewSpec(changes, new Map(), schemaProvider, makeParsers())
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files.length).toBeGreaterThanOrEqual(2)
      expect(result.files[0]?.filename).toBe('spec.md')
    })
  })

  describe('delta application failure produces warning', () => {
    it('adds a warning when parser.apply throws and skips the file', async () => {
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const baseContent = '# Base\n'
      const deltaEntry: DeltaEntry = { op: 'modified' }

      const yamlParser = makeParser({ parseDelta: () => [deltaEntry] })
      const mdParser = makeParser({
        apply: () => {
          throw new Error('apply failed')
        },
      })
      const parsers: ArtifactParserRegistry = new Map([
        ['yaml', yamlParser],
        ['markdown', mdParser],
      ])

      const spec = makeSpec('core', 'core/config')
      const specRepo = makeSpecRepository({
        specs: [spec],
        artifacts: { 'core/config/spec.md': baseContent },
      })
      const specRepos = new Map([['core', specRepo]])

      const changes = makeChangeRepository([change])
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async (_c: Change, filename: string) =>
          filename === deltaFilename ? new SpecArtifact(filename, 'delta') : null,
      )

      const artifactType = makeArtifactType('specs', { scope: 'spec' })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(changes, specRepos, schemaProvider, parsers)
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(0)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some((w) => w.includes('apply failed'))).toBe(true)
    })
  })

  describe('other files still returned on partial failure', () => {
    it('returns valid files when one of two files fails', async () => {
      // Delta file (will fail) + new spec file (will succeed)
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const newFilename = `changes/${CHANGE_NAME}/core/core/config/verify.md`

      const deltaArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const verifyArtifact = makeSpecArtifact('verify', SPEC_ID, newFilename)

      const change = makeChangeWithArtifacts([SPEC_ID], [deltaArtifact, verifyArtifact])

      const baseContent = '# Base\n'
      const deltaEntry: DeltaEntry = { op: 'modified' }

      const yamlParser = makeParser({ parseDelta: () => [deltaEntry] })
      const mdParser = makeParser({
        apply: () => {
          throw new Error('apply failed')
        },
      })
      const parsers: ArtifactParserRegistry = new Map([
        ['yaml', yamlParser],
        ['markdown', mdParser],
      ])

      const spec = makeSpec('core', 'core/config')
      const specRepo = makeSpecRepository({
        specs: [spec],
        artifacts: { 'core/config/spec.md': baseContent },
      })
      const specRepos = new Map([['core', specRepo]])

      const changes = makeChangeRepository([change])
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async (_c: Change, filename: string) =>
          new SpecArtifact(filename, `content of ${filename}`),
      )

      const specsType = makeArtifactType('specs', { scope: 'spec' })
      const verifyType = makeArtifactType('verify', { scope: 'spec' })
      const schema = makeSchema({ artifacts: [specsType, verifyType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(changes, specRepos, schemaProvider, parsers)
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      // The verify.md (new file) should still appear
      const verifyEntry = result.files.find((f) => f.filename === 'verify.md')
      expect(verifyEntry).toBeDefined()
      expect(verifyEntry?.base).toBeNull()
      // Warning about the failed delta
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })
})
