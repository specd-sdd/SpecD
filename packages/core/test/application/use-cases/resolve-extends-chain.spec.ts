import { describe, it, expect } from 'vitest'
import { resolveExtendsChain } from '../../../src/application/use-cases/resolve-extends-chain.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import {
  type SchemaRegistry,
  type SchemaRawResult,
} from '../../../src/application/ports/schema-registry.js'
import { type SchemaYamlData } from '../../../src/domain/services/build-schema.js'

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

describe('resolveExtendsChain', () => {
  it('no extends returns base data unchanged', async () => {
    const data = minimalData()
    const base = rawResult(data)
    const registry = makeRegistry({})

    const result = await resolveExtendsChain(registry, base)

    expect(result.cascadedData).toBe(data)
    expect(result.templates.size).toBe(0)
    expect(result.resolvedPaths).toEqual([])
  })

  it('single extends level cascades data', async () => {
    const parentData = minimalData({ name: 'parent', description: 'parent desc' })
    const childData = minimalData({ name: 'child', extends: 'parent-ref' })

    const registry = makeRegistry({
      'parent-ref': rawResult(parentData, '/schemas/parent/schema.yaml'),
    })
    const base = rawResult(childData, '/schemas/child/schema.yaml')

    const result = await resolveExtendsChain(registry, base)

    expect(result.cascadedData.name).toBe('child')
    expect(result.cascadedData.description).toBe('parent desc')
    expect(result.resolvedPaths).toEqual(['/schemas/parent/schema.yaml'])
  })

  it('multi-level extends chain cascades in order', async () => {
    const rootData = minimalData({ name: 'root', description: 'root desc' })
    const parentData = minimalData({ name: 'parent', extends: 'root-ref' })
    const childData = minimalData({ name: 'child', extends: 'parent-ref' })

    const registry = makeRegistry({
      'root-ref': rawResult(rootData, '/schemas/root/schema.yaml'),
      'parent-ref': rawResult(parentData, '/schemas/parent/schema.yaml'),
    })
    const base = rawResult(childData, '/schemas/child/schema.yaml')

    const result = await resolveExtendsChain(registry, base)

    expect(result.cascadedData.name).toBe('child')
    expect(result.cascadedData.description).toBe('root desc')
    expect(result.resolvedPaths).toEqual([
      '/schemas/root/schema.yaml',
      '/schemas/parent/schema.yaml',
    ])
  })

  it('cycle detected throws SchemaValidationError', async () => {
    const parentData = minimalData({ name: 'parent', extends: 'child-ref' })
    const childData = minimalData({ name: 'child', extends: 'parent-ref' })

    const registry = makeRegistry({
      'parent-ref': rawResult(parentData, '/schemas/parent/schema.yaml'),
      'child-ref': rawResult(childData, '/schemas/child/schema.yaml'),
    })
    const base = rawResult(childData, '/schemas/child/schema.yaml')

    await expect(resolveExtendsChain(registry, base)).rejects.toThrow(SchemaValidationError)
  })

  it('parent not found throws SchemaNotFoundError', async () => {
    const childData = minimalData({ name: 'child', extends: 'missing-ref' })

    const registry = makeRegistry({})
    const base = rawResult(childData, '/schemas/child/schema.yaml')

    await expect(resolveExtendsChain(registry, base)).rejects.toThrow(SchemaNotFoundError)
  })
})
