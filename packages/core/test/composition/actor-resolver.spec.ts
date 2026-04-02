import { describe, it, expect } from 'vitest'
import { createVcsActorResolver } from '../../src/composition/actor-resolver.js'
import { GitActorResolver } from '../../src/infrastructure/git/actor-resolver.js'
import { NullActorResolver } from '../../src/infrastructure/null/actor-resolver.js'

describe('createVcsActorResolver', () => {
  it('returns a GitActorResolver when given a git repository path', async () => {
    const resolver = await createVcsActorResolver(process.cwd())
    expect(resolver).toBeInstanceOf(GitActorResolver)
  })

  it('tries external providers before built-ins', async () => {
    const customResolver = new NullActorResolver()
    const resolver = await createVcsActorResolver(process.cwd(), [
      {
        name: 'custom',
        async detect(): Promise<NullActorResolver> {
          return customResolver
        },
      },
    ])

    expect(resolver).toBe(customResolver)
  })
})
