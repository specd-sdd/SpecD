import { describe, expect, it } from 'vitest'
import { ArtifactFile, SKIPPED_SENTINEL } from '../../../src/domain/value-objects/artifact-file.js'

describe('ArtifactFile', () => {
  it('marks a file complete with its validated hash', () => {
    const file = new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })
    file.markComplete('sha256:abc')

    expect(file.status).toBe('complete')
    expect(file.validatedHash).toBe('sha256:abc')
  })

  it('marks a file pending review without clearing the validated hash', () => {
    const file = new ArtifactFile({
      key: 'proposal',
      filename: 'proposal.md',
      status: 'complete',
      validatedHash: 'sha256:abc',
    })

    file.markPendingReview()

    expect(file.status).toBe('pending-review')
    expect(file.validatedHash).toBe('sha256:abc')
  })

  it('preserves drift when pending review is requested afterwards', () => {
    const file = new ArtifactFile({
      key: 'proposal',
      filename: 'proposal.md',
      status: 'complete',
      validatedHash: 'sha256:abc',
    })

    file.markDriftedPendingReview()
    file.markPendingReview()

    expect(file.status).toBe('drifted-pending-review')
    expect(file.validatedHash).toBe('sha256:abc')
  })

  it('marks optional skipped files with the skipped sentinel hash', () => {
    const file = new ArtifactFile({ key: 'adr', filename: 'adr.md' })
    file.markSkipped()

    expect(file.status).toBe('skipped')
    expect(file.validatedHash).toBe(SKIPPED_SENTINEL)
  })

  describe('hasDrift', () => {
    it('defaults to false', () => {
      const file = new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })
      expect(file.hasDrift).toBe(false)
    })

    it('can be set from the constructor', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'complete',
        validatedHash: 'sha256:abc',
        hasDrift: true,
      })
      expect(file.hasDrift).toBe(true)
    })

    it('markDrifted sets hasDrift to true without changing status', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'complete',
        validatedHash: 'sha256:abc',
      })
      file.markDrifted()
      expect(file.hasDrift).toBe(true)
      expect(file.status).toBe('complete')
    })

    it('clearDrift sets hasDrift to false without changing status', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'pending-review',
        validatedHash: 'sha256:abc',
        hasDrift: true,
      })
      file.clearDrift()
      expect(file.hasDrift).toBe(false)
      expect(file.status).toBe('pending-review')
    })

    it('markComplete clears hasDrift', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'drifted-pending-review',
        validatedHash: 'sha256:abc',
        hasDrift: true,
      })
      file.markComplete('sha256:def')
      expect(file.hasDrift).toBe(false)
      expect(file.status).toBe('complete')
    })
  })

  describe('displayStatus', () => {
    it('returns canonical status when hasDrift is false', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'complete',
        validatedHash: 'sha256:abc',
      })
      expect(file.displayStatus()).toBe('complete')
    })

    it('returns complete-with-drift when status is complete and hasDrift is true', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'complete',
        validatedHash: 'sha256:abc',
        hasDrift: true,
      })
      expect(file.displayStatus()).toBe('complete-with-drift')
    })

    it('ignores hasDrift for non-complete statuses', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'in-progress',
        hasDrift: true,
      })
      expect(file.displayStatus()).toBe('in-progress')
    })

    it('never returns complete-with-drift for missing files', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'missing',
        hasDrift: true,
      })
      expect(file.displayStatus()).toBe('missing')
    })
  })

  describe('status guards', () => {
    it('markPendingReview is no-op on drifted-pending-review', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'drifted-pending-review',
        validatedHash: 'sha256:abc',
      })
      file.markPendingReview()
      expect(file.status).toBe('drifted-pending-review')
    })

    it('markInProgress is no-op on drifted-pending-review', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'drifted-pending-review',
        validatedHash: 'sha256:abc',
      })
      file.markInProgress()
      expect(file.status).toBe('drifted-pending-review')
    })

    it('markMissing is no-op on drifted-pending-review', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'drifted-pending-review',
        validatedHash: 'sha256:abc',
      })
      file.markMissing()
      expect(file.status).toBe('drifted-pending-review')
    })

    it('markPendingReview is no-op on missing', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'missing',
      })
      file.markPendingReview()
      expect(file.status).toBe('missing')
    })

    it('markDriftedPendingReview is no-op on missing', () => {
      const file = new ArtifactFile({
        key: 'proposal',
        filename: 'proposal.md',
        status: 'missing',
      })
      file.markDriftedPendingReview()
      expect(file.status).toBe('missing')
    })
  })
})
