import { describe, it, expect } from 'vitest'
import { createVcsActorResolver } from '../../src/composition/actor-resolver.js'
import { NullAutoDetectActorProvider } from '../../src/composition/null-actor-provider.js'
import { NullActorResolver } from '../../src/infrastructure/null/actor-resolver.js'
import { GitVcsAdapter } from '../../src/infrastructure/git/vcs-adapter.js'
import { NullVcsAdapter } from '../../src/infrastructure/null/vcs-adapter.js'
import { VcsActorResolver } from '../../src/infrastructure/vcs-actor-resolver.js'

describe('createVcsActorResolver', () => {
  it('given a concrete VCS adapter, when composed, then it returns VcsActorResolver', () => {
    const resolver = createVcsActorResolver(new GitVcsAdapter('/tmp', '/tmp'))
    expect(resolver).toBeInstanceOf(VcsActorResolver)
  })

  it('given a NullVcsAdapter, when composed, then it returns NullActorResolver', () => {
    const resolver = createVcsActorResolver(new NullVcsAdapter())
    expect(resolver).toBeInstanceOf(NullActorResolver)
  })

  describe('NullAutoDetectActorProvider', () => {
    it('is registered with name "null"', () => {
      expect(NullAutoDetectActorProvider.name).toBe('null')
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
})
