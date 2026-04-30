import { describe, it, expect } from 'vitest'
import { GetArtifactInstruction } from '../../../src/application/use-cases/get-artifact-instruction.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { ArtifactNotFoundError } from '../../../src/application/errors/artifact-not-found-error.js'
import { TemplateExpander } from '../../../src/application/template-expander.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import {
  makeChangeRepository,
  makeSpecRepository,
  makeSchemaProvider,
  makeParsers,
  makeArtifactType,
  makeSchema,
} from './helpers.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testActor = { name: 'Test User', email: 'test@example.com' }

function makeChange(name: string, opts: { schemaName?: string; specIds?: string[] } = {}): Change {
  const createdAt = new Date('2024-01-01T00:00:00Z')
  const specIds = opts.specIds ?? ['auth/login']
  const events: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds,
      schemaName: opts.schemaName ?? 'test-schema',
      schemaVersion: 1,
    },
    {
      type: 'transitioned',
      from: 'drafting',
      to: 'designing',
      at: createdAt,
      by: testActor,
    },
  ]
  return new Change({ name, createdAt, specIds, history: events })
}

function makeTemplateExpander(
  builtins: Record<string, Record<string, string>> = {},
): TemplateExpander {
  return new TemplateExpander(builtins)
}

function makeSut(
  opts: {
    change?: Change
    schema?: ReturnType<typeof makeSchema>
    schemaName?: string
  } = {},
) {
  const schemaName = opts.schemaName ?? 'test-schema'
  const change = opts.change ?? makeChange('my-change', { schemaName })
  const schema = opts.schema ?? makeSchema({ name: schemaName })

  const changeRepo = makeChangeRepository([change])
  const specRepo = makeSpecRepository()
  const schemaProvider = makeSchemaProvider(schema)
  const parsers = makeParsers()
  const templates = makeTemplateExpander()

  const sut = new GetArtifactInstruction(
    changeRepo,
    new Map([['default', specRepo]]),
    schemaProvider,
    parsers,
    templates,
  )

  return { sut, changeRepo, schemaProvider }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetArtifactInstruction', () => {
  describe('template field', () => {
    it('returns expanded template when artifact type has a template', async () => {
      const artifactType = makeArtifactType('spec', {
        template: 'Hello {{change.name}}',
        instruction: 'Write the spec',
      })
      const schema = makeSchema({ name: 'test-schema', artifacts: [artifactType] })
      const change = makeChange('my-change', { schemaName: 'test-schema' })
      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({ name: 'my-change', artifactId: 'spec' })

      expect(result.template).toBe('Hello my-change')
    })

    it('returns null for template when artifact type has no template', async () => {
      const artifactType = makeArtifactType('spec', {
        instruction: 'Write the spec',
      })
      const schema = makeSchema({ name: 'test-schema', artifacts: [artifactType] })
      const change = makeChange('my-change', { schemaName: 'test-schema' })
      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({ name: 'my-change', artifactId: 'spec' })

      expect(result.template).toBeNull()
    })

    it('expands change.workspace in template', async () => {
      const artifactType = makeArtifactType('spec', {
        template: 'workspace={{change.workspace}}',
      })
      const schema = makeSchema({ name: 'test-schema', artifacts: [artifactType] })
      const change = makeChange('my-change', { schemaName: 'test-schema' })
      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({ name: 'my-change', artifactId: 'spec' })

      expect(result.template).toBe('workspace=default')
    })
  })

  describe('error cases', () => {
    it('throws ChangeNotFoundError when change does not exist', async () => {
      const { sut } = makeSut()

      await expect(sut.execute({ name: 'nonexistent', artifactId: 'spec' })).rejects.toThrow(
        ChangeNotFoundError,
      )
    })

    it('throws SchemaNotFoundError when schema cannot be resolved', async () => {
      const change = makeChange('my-change', { schemaName: 'test-schema' })
      const changeRepo = makeChangeRepository([change])
      const schemaProvider = makeSchemaProvider(null)
      const templates = makeTemplateExpander()

      const sut = new GetArtifactInstruction(
        changeRepo,
        new Map([['default', makeSpecRepository()]]),
        schemaProvider,
        makeParsers(),
        templates,
      )

      await expect(sut.execute({ name: 'my-change', artifactId: 'spec' })).rejects.toThrow(
        SchemaNotFoundError,
      )
    })

    it('throws SchemaMismatchError when change schema differs from active schema', async () => {
      const change = makeChange('my-change', { schemaName: 'old-schema' })
      const schema = makeSchema({ name: 'new-schema', artifacts: [makeArtifactType('spec')] })
      const changeRepo = makeChangeRepository([change])
      const schemaProvider = makeSchemaProvider(schema)
      const templates = makeTemplateExpander()

      const sut = new GetArtifactInstruction(
        changeRepo,
        new Map([['default', makeSpecRepository()]]),
        schemaProvider,
        makeParsers(),
        templates,
      )

      await expect(sut.execute({ name: 'my-change', artifactId: 'spec' })).rejects.toThrow(
        SchemaMismatchError,
      )
    })

    it('throws ArtifactNotFoundError when artifact ID does not exist in schema', async () => {
      const schema = makeSchema({ name: 'test-schema', artifacts: [makeArtifactType('spec')] })
      const change = makeChange('my-change', { schemaName: 'test-schema' })
      const { sut } = makeSut({ change, schema })

      await expect(sut.execute({ name: 'my-change', artifactId: 'nonexistent' })).rejects.toThrow(
        ArtifactNotFoundError,
      )
    })
  })

  describe('instruction field', () => {
    it('returns expanded instruction when artifact has instruction text', async () => {
      const artifactType = makeArtifactType('spec', {
        instruction: 'Generate for {{change.name}}',
      })
      const schema = makeSchema({ name: 'test-schema', artifacts: [artifactType] })
      const change = makeChange('my-change', { schemaName: 'test-schema' })
      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({ name: 'my-change', artifactId: 'spec' })

      expect(result.instruction).toBe('Generate for my-change')
    })

    it('returns null for instruction when artifact has no instruction', async () => {
      const artifactType = makeArtifactType('spec')
      const schema = makeSchema({ name: 'test-schema', artifacts: [artifactType] })
      const change = makeChange('my-change', { schemaName: 'test-schema' })
      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({ name: 'my-change', artifactId: 'spec' })

      expect(result.instruction).toBeNull()
    })

    it('expands pre and post rule instructions', async () => {
      const artifactType = makeArtifactType('spec', {
        rules: {
          pre: [{ id: 'pre', instruction: 'Before {{change.name}}' }],
          post: [{ id: 'post', instruction: 'After {{change.name}}' }],
        },
      })
      const schema = makeSchema({ name: 'test-schema', artifacts: [artifactType] })
      const change = makeChange('my-change', { schemaName: 'test-schema' })
      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({ name: 'my-change', artifactId: 'spec' })

      expect(result.rulesPre).toEqual(['Before my-change'])
      expect(result.rulesPost).toEqual(['After my-change'])
    })
  })

  describe('delta payload', () => {
    it('returns availableOutlines spec IDs only for existing artifacts', async () => {
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        output: 'spec.md',
      })
      const schema = makeSchema({ name: 'test-schema', artifacts: [artifactType] })
      const change = makeChange('my-change', {
        schemaName: 'test-schema',
        specIds: ['default:auth/login', 'default:auth/missing'],
      })
      const { changeRepo, schemaProvider } = makeSut({ change, schema })
      const specRepo = makeSpecRepository({
        artifacts: {
          'auth/login/spec.md': '# Login',
        },
      })

      const sut = new GetArtifactInstruction(
        changeRepo,
        new Map([['default', specRepo]]),
        schemaProvider,
        makeParsers(),
        makeTemplateExpander(),
      )

      const result = await sut.execute({ name: 'my-change', artifactId: 'spec' })
      expect(result.delta).not.toBeNull()
      expect(result.delta?.availableOutlines).toEqual(['default:auth/login'])
      expect(result.delta).not.toHaveProperty('outlines')
    })
  })
})
