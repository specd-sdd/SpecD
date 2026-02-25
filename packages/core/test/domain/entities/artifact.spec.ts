import { describe, it, expect } from 'vitest'
import { ChangeArtifact, SKIPPED_SENTINEL } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactNotOptionalError } from '../../../src/domain/errors/artifact-not-optional-error.js'

describe('ChangeArtifact', () => {
  describe('constructor defaults', () => {
    it('defaults optional to false', () => {
      const a = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      expect(a.optional).toBe(false)
    })

    it('defaults requires to empty array', () => {
      const a = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      expect(a.requires).toEqual([])
    })

    it('defaults status to missing', () => {
      const a = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      expect(a.status).toBe('missing')
    })

    it('defaults validatedHash to undefined', () => {
      const a = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      expect(a.validatedHash).toBeUndefined()
    })
  })

  describe('constructor props', () => {
    it('stores type and filename', () => {
      const a = new ChangeArtifact({ type: 'design', filename: 'design.md' })
      expect(a.type).toBe('design')
      expect(a.filename).toBe('design.md')
    })

    it('stores optional', () => {
      const a = new ChangeArtifact({ type: 'adr', filename: 'adr.md', optional: true })
      expect(a.optional).toBe(true)
    })

    it('stores requires', () => {
      const a = new ChangeArtifact({
        type: 'design',
        filename: 'design.md',
        requires: ['proposal'],
      })
      expect(a.requires).toEqual(['proposal'])
    })

    it('stores initial status', () => {
      const a = new ChangeArtifact({
        type: 'proposal',
        filename: 'proposal.md',
        status: 'in-progress',
      })
      expect(a.status).toBe('in-progress')
    })

    it('stores validatedHash', () => {
      const a = new ChangeArtifact({
        type: 'proposal',
        filename: 'proposal.md',
        validatedHash: 'sha256:abc',
      })
      expect(a.validatedHash).toBe('sha256:abc')
    })
  })

  describe('isComplete', () => {
    it('returns false when missing', () => {
      const a = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md', status: 'missing' })
      expect(a.isComplete).toBe(false)
    })

    it('returns false when in-progress', () => {
      const a = new ChangeArtifact({
        type: 'proposal',
        filename: 'proposal.md',
        status: 'in-progress',
      })
      expect(a.isComplete).toBe(false)
    })

    it('returns true when complete', () => {
      const a = new ChangeArtifact({
        type: 'proposal',
        filename: 'proposal.md',
        status: 'complete',
      })
      expect(a.isComplete).toBe(true)
    })
  })

  describe('markComplete', () => {
    it('sets status to complete', () => {
      const a = new ChangeArtifact({
        type: 'proposal',
        filename: 'proposal.md',
        status: 'in-progress',
      })
      a.markComplete('sha256:abc123')
      expect(a.status).toBe('complete')
    })

    it('stores the validated hash', () => {
      const a = new ChangeArtifact({
        type: 'proposal',
        filename: 'proposal.md',
        status: 'in-progress',
      })
      a.markComplete('sha256:abc123')
      expect(a.validatedHash).toBe('sha256:abc123')
    })

    it('updates hash on re-validation', () => {
      const a = new ChangeArtifact({
        type: 'proposal',
        filename: 'proposal.md',
        validatedHash: 'sha256:old',
      })
      a.markComplete('sha256:new')
      expect(a.validatedHash).toBe('sha256:new')
    })
  })

  describe('markSkipped', () => {
    it('sets status to skipped on optional artifact', () => {
      const a = new ChangeArtifact({ type: 'adr', filename: 'adr.md', optional: true })
      a.markSkipped()
      expect(a.status).toBe('skipped')
    })

    it('stores the skipped sentinel hash', () => {
      const a = new ChangeArtifact({ type: 'adr', filename: 'adr.md', optional: true })
      a.markSkipped()
      expect(a.validatedHash).toBe(SKIPPED_SENTINEL)
    })

    it('throws ArtifactNotOptionalError on required artifact', () => {
      const a = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      expect(() => a.markSkipped()).toThrow(ArtifactNotOptionalError)
    })

    it('throws with the correct artifact type in the message', () => {
      const a = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      expect(() => a.markSkipped()).toThrow('"proposal"')
    })
  })

  describe('SKIPPED_SENTINEL', () => {
    it('equals the expected sentinel string', () => {
      expect(SKIPPED_SENTINEL).toBe('__skipped__')
    })
  })
})
