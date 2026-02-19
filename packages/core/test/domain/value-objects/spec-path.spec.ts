import { describe, it, expect } from 'vitest'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { InvalidSpecPathError } from '../../../src/domain/errors/invalid-spec-path-error.js'

describe('SpecPath', () => {
  describe('parse', () => {
    it('parses a single segment', () => {
      const p = SpecPath.parse('auth')
      expect(p.segments).toEqual(['auth'])
      expect(p.toString()).toBe('auth')
    })

    it('parses multiple segments', () => {
      const p = SpecPath.parse('auth/oauth/tokens')
      expect(p.segments).toEqual(['auth', 'oauth', 'tokens'])
      expect(p.toString()).toBe('auth/oauth/tokens')
    })

    it('trims whitespace', () => {
      const p = SpecPath.parse('  auth/oauth  ')
      expect(p.toString()).toBe('auth/oauth')
    })

    it('ignores leading and trailing slashes', () => {
      const p = SpecPath.parse('/auth/oauth/')
      expect(p.toString()).toBe('auth/oauth')
    })

    it('throws on empty string', () => {
      expect(() => SpecPath.parse('')).toThrow(InvalidSpecPathError)
    })

    it('throws on whitespace-only string', () => {
      expect(() => SpecPath.parse('   ')).toThrow(InvalidSpecPathError)
    })

    it('throws on dot segment', () => {
      expect(() => SpecPath.parse('auth/./oauth')).toThrow(InvalidSpecPathError)
    })

    it('throws on dotdot segment', () => {
      expect(() => SpecPath.parse('auth/../oauth')).toThrow(InvalidSpecPathError)
    })

    it.each(['\\', ':', '*', '?', '"', '<', '>', '|'])(
      'throws on invalid character %s',
      (char) => {
        expect(() => SpecPath.parse(`auth${char}oauth`)).toThrow(InvalidSpecPathError)
      },
    )
  })

  describe('fromSegments', () => {
    it('creates from segments array', () => {
      const p = SpecPath.fromSegments(['auth', 'oauth'])
      expect(p.toString()).toBe('auth/oauth')
    })

    it('throws on empty segments array', () => {
      expect(() => SpecPath.fromSegments([])).toThrow(InvalidSpecPathError)
    })
  })

  describe('parent', () => {
    it('returns null for single segment', () => {
      expect(SpecPath.parse('auth').parent).toBeNull()
    })

    it('returns parent for two segments', () => {
      const p = SpecPath.parse('auth/oauth')
      expect(p.parent?.toString()).toBe('auth')
    })

    it('returns parent for three segments', () => {
      const p = SpecPath.parse('auth/oauth/tokens')
      expect(p.parent?.toString()).toBe('auth/oauth')
    })
  })

  describe('leaf', () => {
    it('returns the last segment', () => {
      expect(SpecPath.parse('auth').leaf).toBe('auth')
      expect(SpecPath.parse('auth/oauth/tokens').leaf).toBe('tokens')
    })
  })

  describe('child', () => {
    it('creates a child path', () => {
      const p = SpecPath.parse('auth').child('oauth')
      expect(p.toString()).toBe('auth/oauth')
    })

    it('throws on invalid child segment', () => {
      expect(() => SpecPath.parse('auth').child('..')).toThrow(InvalidSpecPathError)
    })
  })

  describe('isAncestorOf', () => {
    it('returns true for a direct child', () => {
      expect(SpecPath.parse('auth').isAncestorOf(SpecPath.parse('auth/oauth'))).toBe(true)
    })

    it('returns true for a deep descendant', () => {
      expect(SpecPath.parse('auth').isAncestorOf(SpecPath.parse('auth/oauth/tokens'))).toBe(true)
    })

    it('returns false for the same path', () => {
      expect(SpecPath.parse('auth').isAncestorOf(SpecPath.parse('auth'))).toBe(false)
    })

    it('returns false for a sibling', () => {
      expect(SpecPath.parse('auth').isAncestorOf(SpecPath.parse('billing'))).toBe(false)
    })

    it('returns false when other is shorter', () => {
      expect(SpecPath.parse('auth/oauth').isAncestorOf(SpecPath.parse('auth'))).toBe(false)
    })

    it('returns false for a partial segment match', () => {
      expect(SpecPath.parse('auth').isAncestorOf(SpecPath.parse('authentication/oauth'))).toBe(false)
    })
  })

  describe('equals', () => {
    it('returns true for the same path', () => {
      expect(SpecPath.parse('auth/oauth').equals(SpecPath.parse('auth/oauth'))).toBe(true)
    })

    it('returns false for different paths', () => {
      expect(SpecPath.parse('auth/oauth').equals(SpecPath.parse('auth/oidc'))).toBe(false)
    })
  })
})
