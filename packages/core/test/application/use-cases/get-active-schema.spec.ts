import { describe, it, expect, vi } from 'vitest'
import { GetActiveSchema } from '../../../src/application/use-cases/get-active-schema.js'
import { ResolveSchema } from '../../../src/application/use-cases/resolve-schema.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import {
  type SchemaRegistry,
  type SchemaRawResult,
} from '../../../src/application/ports/schema-registry.js'
import { type SchemaYamlData } from '../../../src/domain/services/build-schema.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { makeSchema } from './helpers.js'

function minimalData(overrides: Partial<SchemaYamlData> = {}): SchemaYamlData {
  return {
    kind: 'schema',
    name: 'test',
    version: 1,
    artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
    ...overrides,
  }
}

function rawResult(
  data: SchemaYamlData,
  resolvedPath = '/schemas/test/schema.yaml',
  templates = new Map<string, string>(),
): SchemaRawResult {
  return { data, templates, resolvedPath }
}

function makeRegistry(results: Record<string, SchemaRawResult | null>): SchemaRegistry {
  return {
    async resolve() {
      return null
    },
    async resolveRaw(_ref: string) {
      return results[_ref] ?? null
    },
    async list() {
      return []
    },
  }
}

function makeResolveSchema(raw: SchemaRawResult | null): ResolveSchema {
  const registry = makeRegistry(raw !== null ? { '@specd/schema-std': raw } : {})
  return new ResolveSchema(registry, '@specd/schema-std', [], undefined)
}

function makeSut(
  overrides: {
    registry?: SchemaRegistry
    resolveSchema?: ResolveSchema
    buildSchemaFn?: ReturnType<typeof vi.fn>
  } = {},
) {
  const registry = overrides.registry ?? makeRegistry({})
  const buildSchemaFn =
    overrides.buildSchemaFn ?? vi.fn().mockReturnValue(makeSchema({ name: 'test' }))
  const rawData = minimalData()
  const resolveSchema = overrides.resolveSchema ?? makeResolveSchema(rawResult(rawData))
  return {
    sut: new GetActiveSchema(resolveSchema, registry, buildSchemaFn, '@specd/schema-std'),
    buildSchemaFn,
  }
}

describe('GetActiveSchema', () => {
  describe('project mode (no input)', () => {
    it('returns schema when resolved', async () => {
      const rawData = minimalData({ name: 'my-schema' })
      const raw = rawResult(rawData)
      const resolveSchema = makeResolveSchema(raw)
      const registry = makeRegistry({})
      const buildFn = vi.fn()
      const uc = new GetActiveSchema(resolveSchema, registry, buildFn, '@specd/schema-std')

      const result = await uc.execute()

      expect(result.raw).toBe(false)
      if (!result.raw) expect(result.schema.name()).toBe('my-schema')
    })

    it('throws SchemaNotFoundError when schema not found', async () => {
      const resolveSchema = makeResolveSchema(null)
      const registry = makeRegistry({})
      const buildFn = vi.fn()
      const uc = new GetActiveSchema(resolveSchema, registry, buildFn, '@specd/schema-std')

      await expect(uc.execute()).rejects.toThrow(SchemaNotFoundError)
    })
  })

  describe('ref mode', () => {
    it('resolves schema by ref with extends chain', async () => {
      const parentData = minimalData({ name: 'parent', description: 'parent desc' })
      const childData = minimalData({ name: 'child', extends: 'parent-ref' })
      const registry = makeRegistry({
        '@specd/schema-std': rawResult(childData, '/child.yaml'),
        'parent-ref': rawResult(parentData, '/parent.yaml'),
      })
      const schema = makeSchema({ name: 'child' })
      const buildFn = vi.fn().mockReturnValue(schema)
      const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

      const result = await sut.execute({ mode: 'ref', ref: '@specd/schema-std' })

      expect(result.raw).toBe(false)
      if (!result.raw) expect(result.schema).toBe(schema)
      const calledData = buildFn.mock.calls[0]![1] as SchemaYamlData
      expect(calledData.name).toBe('child')
      expect(calledData.description).toBe('parent desc')
    })

    it('throws SchemaNotFoundError when ref not found', async () => {
      const registry = makeRegistry({})
      const { sut } = makeSut({ registry })

      await expect(sut.execute({ mode: 'ref', ref: '@nonexistent/schema' })).rejects.toThrow(
        SchemaNotFoundError,
      )
    })

    it('throws SchemaValidationError on circular extends', async () => {
      const parentData = minimalData({ name: 'parent', extends: 'child-ref' })
      const childData = minimalData({ name: 'child', extends: 'parent-ref' })
      const registry = makeRegistry({
        'child-ref': rawResult(childData, '/child.yaml'),
        'parent-ref': rawResult(parentData, '/parent.yaml'),
      })
      const { sut } = makeSut({ registry })

      await expect(sut.execute({ mode: 'ref', ref: 'child-ref' })).rejects.toThrow(
        SchemaValidationError,
      )
    })

    it('does not apply project plugins or overrides', async () => {
      const data = minimalData({ name: 'standalone' })
      const registry = makeRegistry({
        '@specd/schema-std': rawResult(data, '/schema.yaml'),
      })
      const schema = makeSchema({ name: 'standalone' })
      const buildFn = vi.fn().mockReturnValue(schema)
      const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

      const result = await sut.execute({ mode: 'ref', ref: '@specd/schema-std' })

      expect(result.raw).toBe(false)
      if (!result.raw) expect(result.schema.name()).toBe('standalone')
      // buildSchemaFn is called directly, not through ResolveSchema pipeline
      expect(buildFn).toHaveBeenCalledOnce()
    })
  })

  describe('file mode', () => {
    it('resolves schema from file path', async () => {
      const data = minimalData({ name: 'file-schema' })
      const registry = makeRegistry({
        '/tmp/schema.yaml': rawResult(data, '/tmp/schema.yaml'),
      })
      const schema = makeSchema({ name: 'file-schema' })
      const buildFn = vi.fn().mockReturnValue(schema)
      const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

      const result = await sut.execute({ mode: 'file', filePath: '/tmp/schema.yaml' })

      expect(result.raw).toBe(false)
      if (!result.raw) expect(result.schema).toBe(schema)
    })

    it('throws SchemaNotFoundError when file not found', async () => {
      const registry = makeRegistry({})
      const { sut } = makeSut({ registry })

      await expect(sut.execute({ mode: 'file', filePath: '/nonexistent.yaml' })).rejects.toThrow(
        SchemaNotFoundError,
      )
    })
  })
})
