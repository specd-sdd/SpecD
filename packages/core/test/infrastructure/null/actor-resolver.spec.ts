import { describe, it, expect } from 'vitest'
import { NullActorResolver } from '../../../src/infrastructure/null/actor-resolver.js'

describe('NullActorResolver', () => {
  it('identity throws "no VCS detected"', async () => {
    const resolver = new NullActorResolver()
    await expect(resolver.identity()).rejects.toThrow('no VCS detected')
  })
})
