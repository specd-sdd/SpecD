import { describe, expect, it, vi } from 'vitest'
import { VcsActorResolver } from '../../src/infrastructure/vcs-actor-resolver.js'
import { VcsAdapter } from '../../src/application/ports/vcs-adapter.js'

/**
 * Creates a typed `VcsAdapter` test double.
 *
 * @returns A mock adapter and its identity spy
 */
function createVcsAdapterDouble(): {
  readonly adapter: VcsAdapter
  readonly identity: ReturnType<typeof vi.fn>
} {
  const identity = vi.fn(async () => ({
    name: 'Developer',
    email: 'dev@example.com',
    provider: 'git',
  }))

  class TestVcsAdapter extends VcsAdapter {
    constructor() {
      super('/tmp/project')
    }

    rootDir(): string {
      return '/tmp/project'
    }

    branch(): Promise<string> {
      return Promise.resolve('main')
    }

    isClean(): Promise<boolean> {
      return Promise.resolve(true)
    }

    ref(): Promise<string | null> {
      return Promise.resolve('abc1234')
    }

    refAt(): Promise<string | null> {
      return Promise.resolve('abc1234')
    }

    modifiedFiles(): Promise<readonly string[]> {
      return Promise.resolve([])
    }

    show(): Promise<string | null> {
      return Promise.resolve(null)
    }

    identity = identity
  }

  return {
    adapter: new TestVcsAdapter(),
    identity,
  }
}

describe('VcsActorResolver', () => {
  it('given a VcsAdapter, when constructed, then it satisfies ActorResolver', () => {
    const { adapter } = createVcsAdapterDouble()
    const resolver = new VcsActorResolver(adapter)
    expect(resolver).toBeDefined()
  })

  it('given a VcsAdapter identity, when identity is requested, then it delegates fields', async () => {
    const { adapter, identity } = createVcsAdapterDouble()
    const resolver = new VcsActorResolver(adapter)

    await expect(resolver.identity()).resolves.toEqual({
      name: 'Developer',
      email: 'dev@example.com',
      provider: 'git',
    })
    expect(identity).toHaveBeenCalledTimes(1)
  })
})
