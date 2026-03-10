import { describe, it, expect } from 'vitest'
import { GitActorResolver } from '../../../src/infrastructure/git/actor-resolver.js'

describe('GitActorResolver', () => {
  it('returns actor identity from git config', async () => {
    const resolver = new GitActorResolver()
    const identity = await resolver.identity()
    expect(identity.name).toBeDefined()
    expect(identity.email).toBeDefined()
  })
})
