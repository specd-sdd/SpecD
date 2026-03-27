import { describe, it, expect, vi } from 'vitest'
import { ValidateSchema } from '../../../src/application/use-cases/validate-schema.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import {
  type SchemaRegistry,
  type SchemaRawResult,
} from '../../../src/application/ports/schema-registry.js'
import { type SchemaYamlData } from '../../../src/domain/services/build-schema.js'
import { type ResolveSchema } from '../../../src/application/use-cases/resolve-schema.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'

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

function fakeSchema(name = 'test', version = 1): Schema {
  return {
    name: () => name,
    version: () => version,
    artifacts: () => [],
    workflow: () => [],
  } as unknown as Schema
}

function makeSut(
  overrides: {
    registry?: SchemaRegistry
    schemaRef?: string
    buildSchemaFn?: ReturnType<typeof vi.fn>
    resolveSchema?: Partial<ResolveSchema>
  } = {},
) {
  const registry = overrides.registry ?? makeRegistry({})
  const buildSchemaFn = overrides.buildSchemaFn ?? vi.fn().mockReturnValue(fakeSchema())
  const resolveSchema = {
    execute: vi.fn().mockResolvedValue(fakeSchema()),
    ...overrides.resolveSchema,
  } as unknown as ResolveSchema

  const sut = new ValidateSchema(
    registry,
    overrides.schemaRef ?? '@specd/schema-std',
    buildSchemaFn,
    resolveSchema,
  )
  return { sut, buildSchemaFn, resolveSchema }
}

describe('Project mode — resolved', () => {
  it('valid project schema returns success', async () => {
    const schema = fakeSchema('my-schema', 1)
    const { sut, resolveSchema } = makeSut({
      resolveSchema: { execute: vi.fn().mockResolvedValue(schema) },
    })

    const result = await sut.execute({ mode: 'project' })

    expect(result.valid).toBe(true)
    if (result.valid) expect(result.schema).toBe(schema)
    expect(
      (resolveSchema as unknown as { execute: ReturnType<typeof vi.fn> }).execute,
    ).toHaveBeenCalled()
  })

  it('missing plugin returns failure', async () => {
    const { sut } = makeSut({
      resolveSchema: {
        execute: vi.fn().mockRejectedValue(new SchemaNotFoundError('missing-plugin')),
      },
    })

    const result = await sut.execute({ mode: 'project' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('missing-plugin')
  })

  it('validation error returns failure', async () => {
    const { sut } = makeSut({
      resolveSchema: {
        execute: vi
          .fn()
          .mockRejectedValue(new SchemaValidationError('schema', 'duplicate artifact ID')),
      },
    })

    const result = await sut.execute({ mode: 'project' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('duplicate artifact ID')
  })
})

describe('Project mode — raw', () => {
  it('valid base schema returns success', async () => {
    const data = minimalData()
    const registry = makeRegistry({
      '@specd/schema-std': rawResult(data),
    })
    const buildFn = vi.fn().mockReturnValue(fakeSchema('test', 1))
    const { sut } = makeSut({ registry, schemaRef: '@specd/schema-std', buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'project-raw' })

    expect(result.valid).toBe(true)
    expect(buildFn).toHaveBeenCalled()
  })

  it('base schema with extends chain resolves', async () => {
    const parentData = minimalData({ name: 'parent', description: 'parent desc' })
    const childData = minimalData({ name: 'child', extends: 'parent-ref' })
    const registry = makeRegistry({
      '@specd/schema-std': rawResult(childData, '/child.yaml'),
      'parent-ref': rawResult(parentData, '/parent.yaml'),
    })
    const buildFn = vi.fn().mockReturnValue(fakeSchema())
    const { sut } = makeSut({ registry, schemaRef: '@specd/schema-std', buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'project-raw' })

    expect(result.valid).toBe(true)
    // buildSchema should receive cascaded data
    const calledData = buildFn.mock.calls[0]![1] as SchemaYamlData
    expect(calledData.name).toBe('child')
    expect(calledData.description).toBe('parent desc')
  })

  it('schema not found returns failure', async () => {
    const registry = makeRegistry({})
    const { sut } = makeSut({ registry, schemaRef: 'nonexistent' })

    const result = await sut.execute({ mode: 'project-raw' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('not found')
  })

  it('semantic error in base returns failure', async () => {
    const data = minimalData()
    const registry = makeRegistry({
      '@specd/schema-std': rawResult(data),
    })
    const buildFn = vi.fn().mockImplementation(() => {
      throw new SchemaValidationError('schema', 'invalid artifact ID')
    })
    const { sut } = makeSut({ registry, schemaRef: '@specd/schema-std', buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'project-raw' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('invalid artifact ID')
  })
})

describe('File mode', () => {
  it('valid file returns success', async () => {
    const data = minimalData()
    const registry = makeRegistry({
      '/path/to/schema.yaml': rawResult(data, '/path/to/schema.yaml'),
    })
    const buildFn = vi.fn().mockReturnValue(fakeSchema())
    const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'file', filePath: '/path/to/schema.yaml' })

    expect(result.valid).toBe(true)
  })

  it('file with extends resolves and adds warnings', async () => {
    const parentData = minimalData({ name: 'parent' })
    const fileData = minimalData({ name: 'child', extends: '@specd/schema-std' })
    const registry = makeRegistry({
      '/path/to/schema.yaml': rawResult(fileData, '/path/to/schema.yaml'),
      '@specd/schema-std': rawResult(parentData, '/npm/schema-std/schema.yaml'),
    })
    const buildFn = vi.fn().mockReturnValue(fakeSchema())
    const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'file', filePath: '/path/to/schema.yaml' })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain("extends '@specd/schema-std'")
      expect(result.warnings[0]).toContain('/npm/schema-std/schema.yaml')
    }
  })

  it('file not found returns failure', async () => {
    const registry = makeRegistry({})
    const { sut } = makeSut({ registry })

    const result = await sut.execute({ mode: 'file', filePath: '/nonexistent.yaml' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('file not found')
  })

  it('file with invalid artifact ID returns failure', async () => {
    const data = minimalData()
    const registry = makeRegistry({
      '/path/to/schema.yaml': rawResult(data, '/path/to/schema.yaml'),
    })
    const buildFn = vi.fn().mockImplementation(() => {
      throw new SchemaValidationError('schema', 'invalid artifact ID: Bad_ID')
    })
    const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'file', filePath: '/path/to/schema.yaml' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('Bad_ID')
  })

  it('file with circular extends returns failure', async () => {
    const parentData = minimalData({ name: 'parent', extends: 'child-ref' })
    const childData = minimalData({ name: 'child', extends: 'parent-ref' })
    const registry = makeRegistry({
      '/path/child.yaml': rawResult(childData, '/path/child.yaml'),
      'parent-ref': rawResult(parentData, '/path/parent.yaml'),
      'child-ref': rawResult(childData, '/path/child.yaml'),
    })
    const { sut } = makeSut({ registry })

    const result = await sut.execute({ mode: 'file', filePath: '/path/child.yaml' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('cycle')
  })

  it('file with unresolvable extends returns failure', async () => {
    const fileData = minimalData({ name: 'child', extends: 'missing-parent' })
    const registry = makeRegistry({
      '/path/to/schema.yaml': rawResult(fileData, '/path/to/schema.yaml'),
    })
    const { sut } = makeSut({ registry })

    const result = await sut.execute({ mode: 'file', filePath: '/path/to/schema.yaml' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('missing-parent')
  })
})

describe('Ref mode', () => {
  it('valid ref returns success', async () => {
    const data = minimalData()
    const registry = makeRegistry({
      '@specd/schema-std': rawResult(data, '/npm/schema-std/schema.yaml'),
    })
    const buildFn = vi.fn().mockReturnValue(fakeSchema())
    const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'ref', ref: '@specd/schema-std' })

    expect(result.valid).toBe(true)
  })

  it('ref not found returns failure', async () => {
    const registry = makeRegistry({})
    const { sut } = makeSut({ registry })

    const result = await sut.execute({ mode: 'ref', ref: '@nonexistent/schema' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain("schema '@nonexistent/schema' not found")
  })

  it('ref with extends resolves and adds warnings', async () => {
    const parentData = minimalData({ name: 'parent' })
    const childData = minimalData({ name: 'child', extends: '@specd/schema-std' })
    const registry = makeRegistry({
      '#default:child': rawResult(childData, '/schemas/child/schema.yaml'),
      '@specd/schema-std': rawResult(parentData, '/npm/schema-std/schema.yaml'),
    })
    const buildFn = vi.fn().mockReturnValue(fakeSchema())
    const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'ref', ref: '#default:child' })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain("extends '@specd/schema-std'")
      expect(result.warnings[0]).toContain('/npm/schema-std/schema.yaml')
    }
  })

  it('ref with circular extends returns failure', async () => {
    const parentData = minimalData({ name: 'parent', extends: 'child-ref' })
    const childData = minimalData({ name: 'child', extends: 'parent-ref' })
    const registry = makeRegistry({
      'child-ref': rawResult(childData, '/path/child.yaml'),
      'parent-ref': rawResult(parentData, '/path/parent.yaml'),
    })
    const { sut } = makeSut({ registry })

    const result = await sut.execute({ mode: 'ref', ref: 'child-ref' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('cycle')
  })

  it('ref with invalid content returns failure', async () => {
    const data = minimalData()
    const registry = makeRegistry({
      '@specd/schema-std': rawResult(data, '/npm/schema-std/schema.yaml'),
    })
    const buildFn = vi.fn().mockImplementation(() => {
      throw new SchemaValidationError('schema', 'invalid artifact ID')
    })
    const { sut } = makeSut({ registry, buildSchemaFn: buildFn })

    const result = await sut.execute({ mode: 'ref', ref: '@specd/schema-std' })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toContain('invalid artifact ID')
  })
})

describe('Result type', () => {
  it('success result has valid, schema, and warnings', async () => {
    const { sut } = makeSut()

    const result = await sut.execute({ mode: 'project' })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.schema).toBeDefined()
      expect(result.warnings).toBeDefined()
      expect(Array.isArray(result.warnings)).toBe(true)
    }
  })

  it('failure result has valid, errors, and warnings', async () => {
    const { sut } = makeSut({
      resolveSchema: {
        execute: vi.fn().mockRejectedValue(new SchemaNotFoundError('x')),
      },
    })

    const result = await sut.execute({ mode: 'project' })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.warnings).toBeDefined()
    }
  })
})
