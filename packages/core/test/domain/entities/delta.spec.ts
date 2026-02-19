import { describe, it, expect } from 'vitest'
import { Delta } from '../../../src/domain/entities/delta.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

const specPath = SpecPath.parse('auth/oauth')

describe('Delta', () => {
  describe('isEmpty', () => {
    it('returns true when all arrays are empty', () => {
      const d = new Delta({ specPath, added: [], modified: [], removed: [] })
      expect(d.isEmpty()).toBe(true)
    })

    it('returns false when added has entries', () => {
      const d = new Delta({ specPath, added: ['New requirement'], modified: [], removed: [] })
      expect(d.isEmpty()).toBe(false)
    })

    it('returns false when modified has entries', () => {
      const d = new Delta({ specPath, added: [], modified: ['Changed requirement'], removed: [] })
      expect(d.isEmpty()).toBe(false)
    })

    it('returns false when removed has entries', () => {
      const d = new Delta({ specPath, added: [], modified: [], removed: ['Old requirement'] })
      expect(d.isEmpty()).toBe(false)
    })
  })

  describe('isStructural', () => {
    it('returns false when only added', () => {
      const d = new Delta({ specPath, added: ['New requirement'], modified: [], removed: [] })
      expect(d.isStructural()).toBe(false)
    })

    it('returns false when empty', () => {
      const d = new Delta({ specPath, added: [], modified: [], removed: [] })
      expect(d.isStructural()).toBe(false)
    })

    it('returns true when modified has entries', () => {
      const d = new Delta({ specPath, added: [], modified: ['Changed requirement'], removed: [] })
      expect(d.isStructural()).toBe(true)
    })

    it('returns true when removed has entries', () => {
      const d = new Delta({ specPath, added: [], modified: [], removed: ['Old requirement'] })
      expect(d.isStructural()).toBe(true)
    })

    it('returns true when both modified and removed have entries', () => {
      const d = new Delta({ specPath, added: [], modified: ['Changed'], removed: ['Removed'] })
      expect(d.isStructural()).toBe(true)
    })

    it('returns true when added and modified both have entries', () => {
      const d = new Delta({ specPath, added: ['New'], modified: ['Changed'], removed: [] })
      expect(d.isStructural()).toBe(true)
    })
  })

  describe('props', () => {
    it('stores specPath', () => {
      const d = new Delta({ specPath, added: [], modified: [], removed: [] })
      expect(d.specPath.equals(specPath)).toBe(true)
    })

    it('stores added, modified, removed', () => {
      const d = new Delta({ specPath, added: ['a'], modified: ['b'], removed: ['c'] })
      expect(d.added).toEqual(['a'])
      expect(d.modified).toEqual(['b'])
      expect(d.removed).toEqual(['c'])
    })
  })
})
