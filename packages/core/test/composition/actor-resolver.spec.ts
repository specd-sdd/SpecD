import { describe, it, expect, vi } from 'vitest'
import {
  createVcsActorResolver,
  BUILTIN_ACTOR_PROVIDERS,
} from '../../src/composition/actor-resolver.js'
import { NullAutoDetectActorProvider } from '../../src/composition/null-actor-provider.js'
import { GitActorResolver } from '../../src/infrastructure/git/actor-resolver.js'
import { NullActorResolver } from '../../src/infrastructure/null/actor-resolver.js'
import { type ActorResolver } from '../../src/application/ports/actor-resolver.js'
import { type AutoDetectActorProvider } from '../../src/composition/composition-registries.js'

describe('createVcsActorResolver', () => {
  describe('VCS detection priority', () => {
    it('returns a GitActorResolver when given a git repository path', async () => {
      const resolver = await createVcsActorResolver(process.cwd())
      expect(resolver).toBeInstanceOf(GitActorResolver)
    })

    it('git takes priority over hg and svn', async () => {
      const resolver = await createVcsActorResolver(process.cwd(), BUILTIN_ACTOR_PROVIDERS)
      expect(resolver).toBeInstanceOf(GitActorResolver)
    })

    it('returns NullActorResolver when all providers return null', async () => {
      const alwaysNullProvider: AutoDetectActorProvider = {
        name: 'always-null',
        create: async () => new NullActorResolver(),
        async detect(): Promise<null> {
          return null
        },
      }
      const resolver = await createVcsActorResolver('/tmp', [alwaysNullProvider])
      expect(resolver).toBeInstanceOf(NullActorResolver)
    })
  })

  describe('external providers', () => {
    it('tries external providers before built-ins', async () => {
      const customResolver = new NullActorResolver()
      const provider: AutoDetectActorProvider = {
        name: 'custom',
        create: vi.fn(async () => customResolver),
        async detect(): Promise<NullActorResolver> {
          return customResolver
        },
      }
      const resolver = await createVcsActorResolver(process.cwd(), [provider])

      expect(resolver).toBe(customResolver)
    })

    it('unmatched external providers fall through to built-ins', async () => {
      const neverMatchProvider: AutoDetectActorProvider = {
        name: 'never-match',
        create: vi.fn(async () => new NullActorResolver()),
        async detect(): Promise<null> {
          return null
        },
      }
      const resolver = await createVcsActorResolver(process.cwd(), [
        neverMatchProvider,
        ...BUILTIN_ACTOR_PROVIDERS,
      ])

      expect(resolver).toBeInstanceOf(GitActorResolver)
    })
  })

  describe('cwd parameter', () => {
    it('uses explicit cwd for probing', async () => {
      const probeProvider: AutoDetectActorProvider = {
        name: 'probe',
        create: vi.fn(async () => new NullActorResolver()),
        async detect(cwd: string): Promise<ActorResolver | null> {
          void cwd
          return null
        },
      }
      await createVcsActorResolver('/some/explicit/path', [probeProvider])
    })

    it('lazy resolver uses process.cwd() when cwd is omitted', () => {
      const resolver = createVcsActorResolver()
      expect(resolver).not.toBeInstanceOf(Promise)
    })

    it('with cwd argument, returns a Promise<ActorResolver>', async () => {
      const result = createVcsActorResolver('/tmp')
      expect(result).toBeInstanceOf(Promise)
      const resolver = await result
      expect(resolver).toBeDefined()
    })
  })

  describe('NullAutoDetectActorProvider', () => {
    it('is registered in BUILTIN_ACTOR_PROVIDERS with name "null"', () => {
      const nullProvider = BUILTIN_ACTOR_PROVIDERS.find((p) => p.name === 'null')
      expect(nullProvider).toBeDefined()
    })

    it('create() returns a NullActorResolver', async () => {
      const nullProvider = BUILTIN_ACTOR_PROVIDERS.find((p) => p.name === 'null')!
      const resolver = await nullProvider.create({})
      expect(resolver).toBeInstanceOf(NullActorResolver)
    })

    it('detect() always returns null regardless of cwd', async () => {
      const nullProvider = BUILTIN_ACTOR_PROVIDERS.find((p) => p.name === 'null')!
      expect(await nullProvider.detect('/some/path')).toBeNull()
      expect(await nullProvider.detect('/another/path')).toBeNull()
    })
  })
})
