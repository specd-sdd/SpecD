import { describe, it, expect, vi } from 'vitest'
import { LazySchemaProvider } from '../../src/composition/lazy-schema-provider.js'
import { SchemaNotFoundError } from '../../src/application/errors/schema-not-found-error.js'
import { makeSchema } from '../application/use-cases/helpers.js'

function makeResolveSchema(schema = makeSchema()) {
  return {
    execute: vi.fn().mockResolvedValue(schema),
  }
}

describe('LazySchemaProvider', () => {
  it('resolves schema on first get() call', async () => {
    const schema = makeSchema()
    const resolve = makeResolveSchema(schema)
    const provider = new LazySchemaProvider(resolve as never)

    const result = await provider.get()

    expect(result).toBe(schema)
    expect(resolve.execute).toHaveBeenCalledOnce()
  })

  it('returns cached schema on subsequent calls without re-resolving', async () => {
    const schema = makeSchema()
    const resolve = makeResolveSchema(schema)
    const provider = new LazySchemaProvider(resolve as never)

    await provider.get()
    await provider.get()
    await provider.get()

    expect(resolve.execute).toHaveBeenCalledOnce()
  })

  it('propagates errors from ResolveSchema', async () => {
    const error = new Error('schema not found')
    const resolve = {
      execute: vi.fn().mockRejectedValue(error),
    }
    const provider = new LazySchemaProvider(resolve as never)

    await expect(provider.get()).rejects.toThrow(error)
    expect(resolve.execute).toHaveBeenCalledOnce()
  })

  it('retries resolution after a previous error', async () => {
    const schema = makeSchema()
    const resolve = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(new Error('schema not found'))
        .mockResolvedValue(schema),
    }
    const provider = new LazySchemaProvider(resolve as never)

    await expect(provider.get()).rejects.toThrow()
    const result = await provider.get()

    expect(result).toBe(schema)
    expect(resolve.execute).toHaveBeenCalledTimes(2)
  })
  it('resolves a named lookup without touching a broken default', async () => {
    const named = makeSchema({ name: 'custom' })
    const resolve = {
      schemaRef: '@specd/schema-std',
      execute: vi.fn(async (ref?: string) => {
        if (ref === undefined) throw new Error('broken default')
        return named
      }),
    }
    const provider = new LazySchemaProvider(resolve as never)

    await expect(provider.get('custom')).resolves.toBe(named)
    expect(resolve.execute).toHaveBeenCalledOnce()
    expect(resolve.execute).toHaveBeenCalledWith('custom')
    await expect(provider.get()).rejects.toThrow('broken default')
  })

  it('serves the default from a named lookup of the configured schema ref', async () => {
    const schema = makeSchema()
    const resolve = {
      schemaRef: '@specd/schema-std',
      execute: vi.fn().mockResolvedValue(schema),
    }
    const provider = new LazySchemaProvider(resolve as never)

    await provider.get('@specd/schema-std')
    await provider.get()

    expect(resolve.execute).toHaveBeenCalledOnce()
  })

  it('caches named lookups by ref and by resolved name', async () => {
    const named = makeSchema({ name: 'custom' })
    const resolve = { execute: vi.fn().mockResolvedValue(named) }
    const provider = new LazySchemaProvider(resolve as never)

    await provider.get('custom-ref')
    await provider.get('custom-ref')
    await provider.get('custom')

    expect(resolve.execute).toHaveBeenCalledOnce()
  })
  it('falls back to the default only when it carries the requested bare name', async () => {
    const schema = makeSchema({ name: 'schema-std' })
    const resolve = {
      schemaRef: '@specd/schema-std',
      execute: vi.fn(async (ref?: string) => {
        if (ref === undefined || ref === '@specd/schema-std') return schema
        throw new SchemaNotFoundError(ref)
      }),
    }
    const provider = new LazySchemaProvider(resolve as never)

    await expect(provider.get('schema-std')).resolves.toBe(schema)
    await expect(provider.get('other')).rejects.toBeInstanceOf(SchemaNotFoundError)
  })
})
