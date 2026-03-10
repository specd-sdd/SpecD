import { describe, it, expect } from 'vitest'
import { createVcsActorResolver } from '../../src/composition/actor-resolver.js'
import { GitActorResolver } from '../../src/infrastructure/git/actor-resolver.js'

describe('createVcsActorResolver', () => {
  it('returns a GitActorResolver when run inside a git repository', async () => {
    const resolver = await createVcsActorResolver()
    expect(resolver).toBeInstanceOf(GitActorResolver)
  })
})
