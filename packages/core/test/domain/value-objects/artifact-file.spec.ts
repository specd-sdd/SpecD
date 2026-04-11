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
})
