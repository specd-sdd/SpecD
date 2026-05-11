import { describe, it, expect } from 'vitest'
import { NullActorResolver } from '../../../src/infrastructure/null/actor-resolver.js'
import { NullAutoDetectActorProvider } from '../../../src/composition/null-actor-provider.js'

describe('NullActorResolver', () => {
  it('identity throws "no VCS detected"', async () => {
    const resolver = new NullActorResolver()
    await expect(resolver.identity()).rejects.toThrow('no VCS detected')
  })
})

describe('NullAutoDetectActorProvider', () => {
  it('has name "null"', () => {
    expect(NullAutoDetectActorProvider.name).toBe('null')
  })

  it('implements AutoDetectActorProvider', () => {
    expect(typeof NullAutoDetectActorProvider.create).toBe('function')
    expect(typeof NullAutoDetectActorProvider.detect).toBe('function')
  })

  it('create() returns a NullActorResolver', async () => {
    const resolver = await NullAutoDetectActorProvider.create({})
    expect(resolver).toBeInstanceOf(NullActorResolver)
  })

  it('detect() always returns null regardless of cwd', async () => {
    expect(await NullAutoDetectActorProvider.detect('/some/path')).toBeNull()
    expect(await NullAutoDetectActorProvider.detect('/another/path')).toBeNull()
  })
})
