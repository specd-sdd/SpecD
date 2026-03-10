import { describe, it, expect } from 'vitest'
import { GetActiveSchema } from '../../../src/application/use-cases/get-active-schema.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { makeSchemaRegistry, makeSchema } from './helpers.js'

describe('GetActiveSchema', () => {
  it('returns schema when resolved', async () => {
    const schema = makeSchema({ name: 'my-schema' })
    const registry = makeSchemaRegistry(schema)
    const uc = new GetActiveSchema(registry, '@specd/schema-std', new Map())

    const result = await uc.execute()

    expect(result).toBe(schema)
  })

  it('throws SchemaNotFoundError when schema not found', async () => {
    const registry = makeSchemaRegistry(null)
    const uc = new GetActiveSchema(registry, '@specd/schema-missing', new Map())

    await expect(uc.execute()).rejects.toThrow(SchemaNotFoundError)
  })
})
