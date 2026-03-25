import { describe, it, expect } from 'vitest'
import { createVcsActorResolver } from '../../src/composition/actor-resolver.js'
import { GitActorResolver } from '../../src/infrastructure/git/actor-resolver.js'

describe('createVcsActorResolver', () => {
  it('returns a GitActorResolver when given a git repository path', async () => {
    const resolver = await createVcsActorResolver(process.cwd())
    expect(resolver).toBeInstanceOf(GitActorResolver)
  })
})
