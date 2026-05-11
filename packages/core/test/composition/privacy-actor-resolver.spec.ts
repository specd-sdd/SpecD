import { describe, it, expect, vi } from 'vitest'
import { PrivacyActorResolver } from '../../src/composition/privacy-actor-resolver.js'
import { type ActorResolver } from '../../src/application/ports/actor-resolver.js'
import { type ActorIdentity } from '../../src/domain/entities/change.js'

describe('PrivacyActorResolver', () => {
  const realIdentity: ActorIdentity = {
    name: 'John Doe',
    email: 'john.doe@example.com',
    provider: 'git',
    providerId: '12345',
    metadata: { dept: 'Engineering', role: 'Maintainer' },
  }

  const mockResolver: ActorResolver = {
    identity: vi.fn().mockResolvedValue(realIdentity),
  }

  describe('mode: anonymous', () => {
    it('replaces identity with anonymous placeholders', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, { mode: 'anonymous' })
      const identity = await decorator.identity()

      expect(identity.name).toBe('Anonymous')
      expect(identity.email).toBe('anonymous@getspecd.dev')
      expect(identity.provider).toBeUndefined()
      expect(identity.providerId).toBeUndefined()
      expect(identity.metadata).toBeUndefined()
    })
  })

  describe('mode: mask', () => {
    it('masks name and email parts', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, { mode: 'mask' })
      const identity = await decorator.identity()

      expect(identity.name).toBe('J***e')
      expect(identity.email).toBe('j***e@e***.com')
      expect(identity.provider).toBe('git')
    })

    it('masks short names fully', async () => {
      const shortResolver: ActorResolver = {
        identity: vi.fn().mockResolvedValue({ name: 'A', email: 'a@b.c' }),
      }
      const decorator = new PrivacyActorResolver(shortResolver, { mode: 'mask' })
      const identity = await decorator.identity()

      expect(identity.name).toBe('***')
      expect(identity.email).toBe('a***a@b***.c')
    })

    it('masks short local parts fully', async () => {
      const shortResolver: ActorResolver = {
        identity: vi.fn().mockResolvedValue({ name: 'JD', email: 'jo@example.com' }),
      }
      const decorator = new PrivacyActorResolver(shortResolver, { mode: 'mask' })
      const identity = await decorator.identity()

      expect(identity.email).toBe('***@e***.com')
    })

    it('masks deeply nested subdomains to TLD only', async () => {
      const nestedResolver: ActorResolver = {
        identity: vi
          .fn()
          .mockResolvedValue({ name: 'John', email: 'jhon@subdomain1.subdomain2.example.com' }),
      }
      const decorator = new PrivacyActorResolver(nestedResolver, { mode: 'mask' })
      const identity = await decorator.identity()

      expect(identity.email).toBe('j***n@s***.com')
    })

    it('repeats single-char local part on both sides', async () => {
      const singleCharResolver: ActorResolver = {
        identity: vi.fn().mockResolvedValue({ name: 'John', email: 'j@example.com' }),
      }
      const decorator = new PrivacyActorResolver(singleCharResolver, { mode: 'mask' })
      const identity = await decorator.identity()

      expect(identity.email).toBe('j***j@e***.com')
    })
  })

  describe('mode: hash', () => {
    it('hashes email using HMAC-SHA256', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, {
        mode: 'hash',
        salt: 'my-secret-salt',
      })
      const identity = await decorator.identity()

      expect(identity.name).toBe('J***e')
      // Deterministic hash check (sha256(john.doe@example.com, my-secret-salt))
      expect(identity.email).toMatch(/^[a-f0-9]{64}$/)
      expect(identity.email).toBe(
        '2a082e338f2d0ad6cc1f0772849e354c1b66c1524973c71177fef39adb922fd0',
      )
    })
  })

  describe('metadata privacy', () => {
    it('removes providerId and all metadata by default', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, { mode: 'mask' })
      const identity = await decorator.identity()

      expect(identity.providerId).toBeUndefined()
      expect(identity.metadata).toBeUndefined()
    })

    it('preserves whitelisted metadata keys', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, {
        mode: 'mask',
        allowedMetadataKeys: ['dept'],
      })
      const identity = await decorator.identity()

      expect(identity.metadata).toEqual({ dept: 'Engineering' })
      expect(identity.metadata?.role).toBeUndefined()
      expect(identity.providerId).toBeUndefined()
    })
  })

  describe('excludeActors', () => {
    it('skips obfuscation for excluded actors (by name)', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, {
        mode: 'anonymous',
        excludeActors: ['John Doe'],
      })
      const identity = await decorator.identity()

      expect(identity).toEqual(realIdentity)
    })

    it('skips obfuscation for excluded actors (by email)', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, {
        mode: 'anonymous',
        excludeActors: ['john.doe@example.com'],
      })
      const identity = await decorator.identity()

      expect(identity).toEqual(realIdentity)
    })

    it('is case-insensitive', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, {
        mode: 'anonymous',
        excludeActors: ['JOHN.DOE@EXAMPLE.COM'],
      })
      const identity = await decorator.identity()

      expect(identity).toEqual(realIdentity)
    })

    it('excluded actor returns raw identity verbatim including providerId and metadata', async () => {
      const decorator = new PrivacyActorResolver(mockResolver, {
        mode: 'mask',
        excludeActors: ['John Doe'],
      })
      const identity = await decorator.identity()

      expect(identity).toEqual(realIdentity)
      expect(identity.providerId).toBe('12345')
      expect(identity.metadata).toEqual({ dept: 'Engineering', role: 'Maintainer' })
    })
  })
})
