import { describe, it, expect, vi } from 'vitest'
import { LazySchemaProvider } from '../../src/composition/lazy-schema-provider.js'
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

  it('caches null when ResolveSchema throws', async () => {
    const resolve = {
      execute: vi.fn().mockRejectedValue(new Error('schema not found')),
    }
    const provider = new LazySchemaProvider(resolve as never)

    const result = await provider.get()

    expect(result).toBeNull()
    expect(resolve.execute).toHaveBeenCalledOnce()
  })

  it('returns null on subsequent calls after error without retrying', async () => {
    const resolve = {
      execute: vi.fn().mockRejectedValue(new Error('schema not found')),
    }
    const provider = new LazySchemaProvider(resolve as never)

    await provider.get()
    const result = await provider.get()

    expect(result).toBeNull()
    expect(resolve.execute).toHaveBeenCalledOnce()
  })
})
