import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaProviderIdentityMismatchError } from '../../../src/application/errors/schema-provider-identity-mismatch-error.js'
import { Logger } from '../../../src/application/logger.js'
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
import { ResolveChangeSchema } from '../../../src/application/services/resolve-change-schema.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { makeSchema } from '../use-cases/helpers.js'

function makeKeyedProvider(schemas: Record<string, Schema>): SchemaProvider {
  return {
    async get(ref?: string): Promise<Schema> {
      if (ref === undefined) {
        throw new Error('Unnamed get() is forbidden in sovereign change resolution')
      }
      const found = schemas[ref]
      if (!found) {
        throw new SchemaNotFoundError(ref)
      }
      return found
    },
  } as unknown as SchemaProvider
}

describe('ResolveChangeSchema', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves the sovereign schema when name and version match exactly', async () => {
    const schema = makeSchema([], [], { name: 'custom-schema', version: 1 })
    const provider = makeKeyedProvider({ 'custom-schema': schema })
    const getSpy = vi.spyOn(provider, 'get')
    const resolver = new ResolveChangeSchema(provider)

    const resolved = await resolver.execute({
      changeName: 'feat-test',
      schemaName: 'custom-schema',
      schemaVersion: 1,
    })

    expect(resolved.schema).toBe(schema)
    expect(resolved.warnings).toEqual([])
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('custom-schema')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('isolates resolution from the workspace default schema', async () => {
    const changeSchema = makeSchema([], [], { name: 'change-schema', version: 2 })
    const defaultSchema = makeSchema([], [], { name: 'default-schema', version: 1 })
    const provider = makeKeyedProvider({
      'change-schema': changeSchema,
      'default-schema': defaultSchema,
    })
    const getSpy = vi.spyOn(provider, 'get')
    const resolver = new ResolveChangeSchema(provider)

    const resolved = await resolver.execute({
      changeName: 'feat-test',
      schemaName: 'change-schema',
      schemaVersion: 2,
    })

    expect(resolved.schema).toBe(changeSchema)
    expect(resolved.warnings).toEqual([])
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith('change-schema')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('propagates provider lookup errors when the schema does not exist', async () => {
    const provider = makeKeyedProvider({})
    const resolver = new ResolveChangeSchema(provider)

    await expect(
      resolver.execute({
        changeName: 'feat-test',
        schemaName: 'missing-schema',
        schemaVersion: 1,
      }),
    ).rejects.toThrow(SchemaNotFoundError)
  })

  it('throws SchemaProviderIdentityMismatchError if the provider returns a different schema name', async () => {
    const wrongSchema = makeSchema([], [], { name: 'actual-wrong-name', version: 1 })
    const provider = {
      async get(ref?: string): Promise<Schema> {
        if (ref === undefined) throw new Error('Unnamed get() is forbidden')
        return wrongSchema
      },
    } as unknown as SchemaProvider

    const resolver = new ResolveChangeSchema(provider)

    await expect(
      resolver.execute({
        changeName: 'feat-test',
        schemaName: 'expected-name',
        schemaVersion: 1,
      }),
    ).rejects.toThrow(SchemaProviderIdentityMismatchError)

    try {
      await resolver.execute({
        changeName: 'feat-test',
        schemaName: 'expected-name',
        schemaVersion: 1,
      })
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaProviderIdentityMismatchError)
      const error = err as SchemaProviderIdentityMismatchError
      expect(error.code).toBe('SCHEMA_PROVIDER_IDENTITY_MISMATCH')
      expect(error.changeName).toBe('feat-test')
      expect(error.expectedSchemaName).toBe('expected-name')
      expect(error.actualSchemaName).toBe('actual-wrong-name')
      expect(error.message).toContain("Schema provider returned 'actual-wrong-name'")
    }
  })

  it('returns schema with a drift advisory instead of logging for same-name version drift', async () => {
    const schemaV2 = makeSchema([], [], { name: 'custom-schema', version: 2 })
    const provider = makeKeyedProvider({ 'custom-schema': schemaV2 })
    const resolver = new ResolveChangeSchema(provider)

    const resolved = await resolver.execute({
      changeName: 'feat-test',
      schemaName: 'custom-schema',
      schemaVersion: 1,
    })

    expect(resolved.schema).toBe(schemaV2)
    expect(resolved.warnings).toEqual([
      {
        code: 'SCHEMA_VERSION_DRIFT',
        changeName: 'feat-test',
        schemaName: 'custom-schema',
        recordedVersion: 1,
        resolvedVersion: 2,
        message:
          "Change 'feat-test' was created with schema 'custom-schema' version 1 but resolved version 2.",
      },
    ])
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
