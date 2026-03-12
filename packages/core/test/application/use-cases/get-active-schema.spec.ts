import { describe, it, expect } from 'vitest'
import { GetActiveSchema } from '../../../src/application/use-cases/get-active-schema.js'
import { ResolveSchema } from '../../../src/application/use-cases/resolve-schema.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { type SchemaRawResult } from '../../../src/application/ports/schema-registry.js'
import { makeSchema } from './helpers.js'

function makeResolveSchema(rawResult: SchemaRawResult | null): ResolveSchema {
  const registry = {
    async resolve() {
      return null
    },
    async resolveRaw() {
      return rawResult
    },
    async list() {
      return []
    },
  }
  return new ResolveSchema(registry, '@specd/schema-std', new Map(), [], undefined)
}

describe('GetActiveSchema', () => {
  it('returns schema when resolved', async () => {
    const schema = makeSchema({ name: 'my-schema' })
    const rawResult: SchemaRawResult = {
      data: {
        kind: 'schema',
        name: 'my-schema',
        version: 1,
        artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
      },
      templates: new Map(),
      resolvedPath: '/fake/schema.yaml',
    }
    const resolveSchema = makeResolveSchema(rawResult)
    const uc = new GetActiveSchema(resolveSchema)

    const result = await uc.execute()

    expect(result.name()).toBe('my-schema')
  })

  it('throws SchemaNotFoundError when schema not found', async () => {
    const resolveSchema = makeResolveSchema(null)
    const uc = new GetActiveSchema(resolveSchema)

    await expect(uc.execute()).rejects.toThrow(SchemaNotFoundError)
  })
})
