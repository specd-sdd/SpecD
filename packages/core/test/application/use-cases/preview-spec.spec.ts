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
  type DeltaEntry,
} from '../../../src/application/ports/artifact-parser.js'
import {
  DiffGenerationError,
  type DiffGenerator,
  type DiffGeneratorInput,
} from '../../../src/application/ports/diff-generator.js'
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
  const change = makeChange(CHANGE_NAME, { specIds }, schemaName)
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

/** Creates a stub diff generator for `PreviewSpec` tests. */
function makeDiffGenerator(
  generate: (input: DiffGeneratorInput) => string = () => 'diff',
): DiffGenerator {
  return {
    generate: vi.fn(generate),
  }
}

/** Sets up the SUT (PreviewSpec) with full control over each port. */
function makeSut(opts: {
  change?: Change
  specRepos?: Map<string, ReturnType<typeof makeSpecRepository>>
  schemaName?: string
  artifactContent?: string | null
  baseArtifact?: string | null
  parsers?: ArtifactParserRegistry
  diffGenerator?: DiffGenerator
}) {
  const schemaName = opts.schemaName ?? SCHEMA_NAME
  const artifactType = makeArtifactType('specs', { scope: 'spec', delta: true })
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
  const diffGenerator = opts.diffGenerator ?? makeDiffGenerator()

  const useCase = new PreviewSpec(changes, specRepos, schemaProvider, parsers, diffGenerator)
  return { useCase, changes, specRepos, schema, artifactFn, diffGenerator }
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
    it('returns an entry with status: merged and base: null for a non-delta artifact', async () => {
      const artifactFilename = `changes/${CHANGE_NAME}/core/core/config/spec.md`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, artifactFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const content = '# New Spec\n\nThis is a new spec.'
      const { useCase } = makeSut({ change, artifactContent: content })

      const input: PreviewSpecInput = { name: CHANGE_NAME, specId: SPEC_ID }
      const result = await useCase.execute(input)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.status).toBe('merged')
      expect(result.files[0]?.base).toBeNull()
      expect(result.files[0]?.merged).toBe(content)
      expect(result.files[0]?.filename).toBe('spec.md')
    })
  })

  describe('delta files discovered from change artifacts', () => {
    it('loads delta and base, returns status: merged', async () => {
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const baseContent = '# Config\n\nBase content.'
      const deltaContent = '- op: modified\n'
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
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async (_c: Change, filename: string) => {
          if (filename === deltaFilename) return new SpecArtifact(filename, deltaContent)
          return null
        },
      )

      const artifactType = makeArtifactType('specs', { scope: 'spec', delta: true })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(
        changes,
        specRepos,
        schemaProvider,
        parsers,
        makeDiffGenerator(),
      )
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.status).toBe('merged')
      expect(result.files[0]?.filename).toBe('spec.md')
      expect(result.files[0]?.base).toBe(baseContent)
      expect(result.files[0]?.merged).toBe(mergedContent)
    })
  })

  describe('no-op delta records status', () => {
    it('returns status no-op and original content when delta contains only no-op entries', async () => {
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const baseContent = '# Base\n'
      const noOpEntry: DeltaEntry = { op: 'no-op' }
      const yamlParser = makeParser({ parseDelta: () => [noOpEntry] })
      const parsers: ArtifactParserRegistry = new Map([
        ['yaml', yamlParser],
        ['markdown', makeParser()],
      ])

      const spec = makeSpec('core', 'core/config')
      const specRepo = makeSpecRepository({
        specs: [spec],
        artifacts: { 'core/config/spec.md': baseContent },
      })
      const specRepos = new Map([['core', specRepo]])

      const changes = makeChangeRepository([change])
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(
        async () => new SpecArtifact(deltaFilename, 'delta'),
      )

      const artifactType = makeArtifactType('specs', { scope: 'spec', delta: true })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(
        changes,
        specRepos,
        schemaProvider,
        parsers,
        makeDiffGenerator(),
      )
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.status).toBe('no-op')
      expect(result.files[0]?.merged).toBe(baseContent)
    })
  })

  describe('missing delta file records status', () => {
    it('returns status missing when artifact is expected by schema but not in change', async () => {
      const change = makeChangeWithArtifacts([SPEC_ID], []) // No artifacts

      const artifactType = makeArtifactType('specs', { scope: 'spec', delta: true })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(
        makeChangeRepository([change]),
        new Map(),
        schemaProvider,
        makeParsers(),
        makeDiffGenerator(),
      )
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.filename).toBe('spec.md')
      expect(result.files[0]?.status).toBe('missing')
    })
  })

  describe('all schema artifacts returned', () => {
    it('returns entries for all scope:spec artifacts in the schema', async () => {
      const change = makeChangeWithArtifacts([SPEC_ID], [])

      const specsType = makeArtifactType('specs', { scope: 'spec', delta: true })
      const verifyType = makeArtifactType('verify', { scope: 'spec', delta: true })
      const schema = makeSchema({ artifacts: [specsType, verifyType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(
        makeChangeRepository([change]),
        new Map(),
        schemaProvider,
        makeParsers(),
        makeDiffGenerator(),
      )
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(2)
      expect(result.files.map((f) => f.filename)).toContain('spec.md')
      expect(result.files.map((f) => f.filename)).toContain('verify.md')
    })
  })

  describe('delta application failure produces warning and missing status', () => {
    it('adds warning and returns status missing when parser throws', async () => {
      const deltaFilename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, deltaFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])

      const baseContent = '# Base\n'
      const yamlParser = makeParser({ parseDelta: () => [{ op: 'modified' }] })
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
        async () => new SpecArtifact(deltaFilename, 'delta'),
      )

      const artifactType = makeArtifactType('specs', { scope: 'spec', delta: true })
      const schema = makeSchema({ artifacts: [artifactType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(
        changes,
        specRepos,
        schemaProvider,
        parsers,
        makeDiffGenerator(),
      )
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(1)
      expect(result.files[0]?.status).toBe('missing')
      expect(result.warnings.some((w) => w.includes('apply failed'))).toBe(true)
    })

    it('returns other files normally when one file fails partial application', async () => {
      const delta1Filename = `deltas/${CHANGE_NAME}/core/core/config/spec.md.delta.yaml`
      const delta2Filename = `deltas/${CHANGE_NAME}/core/core/config/verify.md.delta.yaml`

      const file1 = new ArtifactFile({
        key: SPEC_ID,
        filename: delta1Filename,
        status: 'in-progress',
      })
      const file2 = new ArtifactFile({
        key: SPEC_ID,
        filename: delta2Filename,
        status: 'in-progress',
      })

      const changeArtifact1 = new ChangeArtifact({
        type: 'specs',
        files: new Map([[SPEC_ID, file1]]),
      })
      const changeArtifact2 = new ChangeArtifact({
        type: 'verify',
        files: new Map([[SPEC_ID, file2]]),
      })

      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact1, changeArtifact2])

      const baseContent1 = '# Base Spec\n'
      const baseContent2 = '# Base Verify\n'

      const yamlParser = makeParser({ parseDelta: () => [{ op: 'modified' }] })

      let calls = 0
      const mdParser = makeParser({
        parse: (c) => ({ root: { type: 'doc', value: c } }),
        apply: (_ast, _delta) => {
          calls++
          if (calls === 1) {
            // First call (spec.md) succeeds
            return { ast: { root: { type: 'doc', value: '# Merged Spec' } }, warnings: [] }
          }
          // Second call (verify.md) fails
          throw new Error('apply failed')
        },
        serialize: () => '# Merged Spec',
      })
      const parsers: ArtifactParserRegistry = new Map([
        ['yaml', yamlParser],
        ['markdown', mdParser],
      ])

      const spec = makeSpec('core', 'core/config')
      const specRepo = makeSpecRepository({
        specs: [spec],
        artifacts: {
          'core/config/spec.md': baseContent1,
          'core/config/verify.md': baseContent2,
        },
      })
      const specRepos = new Map([['core', specRepo]])

      const changes = makeChangeRepository([change])
      ;(changes as unknown as Record<string, unknown>).artifact = vi.fn(async (_c, filename) => {
        if (filename === delta1Filename) return new SpecArtifact(delta1Filename, 'delta1')
        if (filename === delta2Filename) return new SpecArtifact(delta2Filename, 'delta2')
        return null
      })

      const specsType = makeArtifactType('specs', { scope: 'spec', delta: true })
      const verifyType = makeArtifactType('verify', { scope: 'spec', delta: true })
      const schema = makeSchema({ artifacts: [specsType, verifyType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(
        changes,
        specRepos,
        schemaProvider,
        parsers,
        makeDiffGenerator(),
      )
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(2)

      const specFile = result.files.find((f) => f.filename === 'spec.md')
      expect(specFile?.status).toBe('merged')
      expect(specFile?.merged).toBe('# Merged Spec')

      const verifyFile = result.files.find((f) => f.filename === 'verify.md')
      expect(verifyFile?.status).toBe('missing')
      expect(verifyFile?.merged).toBe('# Base Verify\n')

      expect(result.warnings.some((w) => w.includes('apply failed'))).toBe(true)
    })
  })

  describe('artifact file ordering', () => {
    it('orders spec.md before other files and sorts the rest alphabetically', async () => {
      const change = makeChangeWithArtifacts([SPEC_ID], [])
      const specsType = makeArtifactType('specs', { scope: 'spec', delta: true })
      const verifyType = makeArtifactType('verify', { scope: 'spec', delta: true })
      const otherType = makeArtifactType('a-other', { scope: 'spec', delta: true })
      const schema = makeSchema({
        artifacts: [verifyType, otherType, specsType],
        name: SCHEMA_NAME,
      })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(
        makeChangeRepository([change]),
        new Map(),
        schemaProvider,
        makeParsers(),
        makeDiffGenerator(),
      )
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(3)
      expect(result.files[0]?.filename).toBe('spec.md')
      expect(result.files[1]?.filename).toBe('a-other.md')
      expect(result.files[2]?.filename).toBe('verify.md')
    })
  })

  describe('delta: false artifacts included', () => {
    it('includes artifacts that do not support deltas', async () => {
      const change = makeChangeWithArtifacts([SPEC_ID], [])
      const specsType = makeArtifactType('specs', { scope: 'spec', delta: true })
      const otherType = makeArtifactType('other', { scope: 'spec', delta: false })
      const schema = makeSchema({ artifacts: [specsType, otherType], name: SCHEMA_NAME })
      const schemaProvider = makeSchemaProvider(schema)

      const useCase = new PreviewSpec(
        makeChangeRepository([change]),
        new Map(),
        schemaProvider,
        makeParsers(),
        makeDiffGenerator(),
      )
      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files).toHaveLength(2)
      expect(result.files[0]?.filename).toBe('spec.md')
      expect(result.files.find((f) => f.filename === 'other.md')).toBeDefined()
    })
  })

  describe('diff generation', () => {
    it('does not invoke DiffGenerator when includeDiff is omitted', async () => {
      const artifactFilename = `changes/${CHANGE_NAME}/core/core/config/spec.md`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, artifactFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])
      const diffGenerator = makeDiffGenerator()
      const { useCase } = makeSut({
        change,
        artifactContent: '# New Spec\n',
        diffGenerator,
      })

      const result = await useCase.execute({ name: CHANGE_NAME, specId: SPEC_ID })

      expect(result.files[0]?.diff).toBeUndefined()
      expect(diffGenerator.generate).not.toHaveBeenCalled()
    })

    it('includes diff for merged entries when includeDiff is true', async () => {
      const artifactFilename = `changes/${CHANGE_NAME}/core/core/config/spec.md`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, artifactFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])
      const diffGenerator = makeDiffGenerator((input) => `diff:${input.filename}`)
      const { useCase } = makeSut({
        change,
        artifactContent: '# New Spec\n',
        diffGenerator,
      })

      const result = await useCase.execute({
        name: CHANGE_NAME,
        specId: SPEC_ID,
        includeDiff: true,
      })

      expect(result.files[0]?.diff).toBe('diff:spec.md')
      expect(diffGenerator.generate).toHaveBeenCalledWith({
        filename: 'spec.md',
        base: '',
        merged: '# New Spec\n',
      })
    })

    it('retains merged preview and warning when diff generation raises DiffGenerationError', async () => {
      const artifactFilename = `changes/${CHANGE_NAME}/core/core/config/spec.md`
      const changeArtifact = makeSpecArtifact('specs', SPEC_ID, artifactFilename)
      const change = makeChangeWithArtifacts([SPEC_ID], [changeArtifact])
      const diffGenerator = makeDiffGenerator(() => {
        throw new DiffGenerationError('diff failed')
      })
      const { useCase } = makeSut({
        change,
        artifactContent: '# New Spec\n',
        diffGenerator,
      })

      const result = await useCase.execute({
        name: CHANGE_NAME,
        specId: SPEC_ID,
        includeDiff: true,
      })

      expect(result.files[0]?.status).toBe('merged')
      expect(result.files[0]?.merged).toBe('# New Spec\n')
      expect(result.files[0]?.diff).toBeUndefined()
      expect(result.warnings.some((warning) => warning.includes('diff failed'))).toBe(true)
    })
  })
})
