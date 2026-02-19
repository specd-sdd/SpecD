import { describe, it, expect } from 'vitest'
import { Artifact } from '../../../src/domain/entities/artifact.js'

describe('Artifact', () => {
  describe('constructor defaults', () => {
    it('defaults optional to false', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md' })
      expect(a.optional).toBe(false)
    })

    it('defaults requires to empty array', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md' })
      expect(a.requires).toEqual([])
    })

    it('defaults status to missing', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md' })
      expect(a.status).toBe('missing')
    })

    it('defaults validatedHash to undefined', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md' })
      expect(a.validatedHash).toBeUndefined()
    })
  })

  describe('constructor props', () => {
    it('stores type and path', () => {
      const a = new Artifact({ type: 'design', path: 'changes/foo/design.md' })
      expect(a.type).toBe('design')
      expect(a.path).toBe('changes/foo/design.md')
    })

    it('stores optional', () => {
      const a = new Artifact({ type: 'adr', path: 'changes/foo/adr.md', optional: true })
      expect(a.optional).toBe(true)
    })

    it('stores requires', () => {
      const a = new Artifact({ type: 'design', path: 'changes/foo/design.md', requires: ['proposal'] })
      expect(a.requires).toEqual(['proposal'])
    })

    it('stores initial status', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md', status: 'in-progress' })
      expect(a.status).toBe('in-progress')
    })

    it('stores validatedHash', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md', validatedHash: 'sha256:abc' })
      expect(a.validatedHash).toBe('sha256:abc')
    })
  })

  describe('isComplete', () => {
    it('returns false when missing', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md', status: 'missing' })
      expect(a.isComplete).toBe(false)
    })

    it('returns false when in-progress', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md', status: 'in-progress' })
      expect(a.isComplete).toBe(false)
    })

    it('returns true when complete', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md', status: 'complete' })
      expect(a.isComplete).toBe(true)
    })
  })

  describe('markComplete', () => {
    it('sets status to complete', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md', status: 'in-progress' })
      a.markComplete('sha256:abc123')
      expect(a.status).toBe('complete')
    })

    it('stores the validated hash', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md', status: 'in-progress' })
      a.markComplete('sha256:abc123')
      expect(a.validatedHash).toBe('sha256:abc123')
    })

    it('updates hash on re-validation', () => {
      const a = new Artifact({ type: 'proposal', path: 'changes/foo/proposal.md', validatedHash: 'sha256:old' })
      a.markComplete('sha256:new')
      expect(a.validatedHash).toBe('sha256:new')
    })
  })
})
