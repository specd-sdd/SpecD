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
})
