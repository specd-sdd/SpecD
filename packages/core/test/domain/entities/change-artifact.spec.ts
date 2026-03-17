import { describe, it, expect } from 'vitest'
import { ChangeArtifact, SKIPPED_SENTINEL } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { ArtifactNotOptionalError } from '../../../src/domain/errors/artifact-not-optional-error.js'
import type { ArtifactStatus } from '../../../src/domain/value-objects/artifact-status.js'

function makeArtifactWithFile(
  type: string,
  filename: string,
  opts?: {
    optional?: boolean
    requires?: string[]
    status?: ArtifactStatus
    validatedHash?: string
  },
) {
  const fileProps: {
    key: string
    filename: string
    status?: ArtifactStatus
    validatedHash?: string
  } = { key: type, filename }
  if (opts?.status !== undefined) fileProps.status = opts.status
  if (opts?.validatedHash !== undefined) fileProps.validatedHash = opts.validatedHash
  const file = new ArtifactFile(fileProps)
  const artifactProps: {
    type: string
    optional?: boolean
    requires?: string[]
    files: Map<string, ArtifactFile>
  } = {
    type,
    files: new Map([[type, file]]),
  }
  if (opts?.optional !== undefined) artifactProps.optional = opts.optional
  if (opts?.requires !== undefined) artifactProps.requires = opts.requires
  return new ChangeArtifact(artifactProps)
}

describe('ChangeArtifact', () => {
  describe('constructor defaults', () => {
    it('defaults optional to false', () => {
      const a = new ChangeArtifact({ type: 'proposal' })
      expect(a.optional).toBe(false)
    })

    it('defaults requires to empty array', () => {
      const a = new ChangeArtifact({ type: 'proposal' })
      expect(a.requires).toEqual([])
    })

    it('defaults status to missing when no files', () => {
      const a = new ChangeArtifact({ type: 'proposal' })
      expect(a.status).toBe('missing')
    })

    it('defaults files to empty map', () => {
      const a = new ChangeArtifact({ type: 'proposal' })
      expect(a.files.size).toBe(0)
    })
  })

  describe('constructor props', () => {
    it('stores type', () => {
      const a = new ChangeArtifact({ type: 'design' })
      expect(a.type).toBe('design')
    })

    it('stores optional', () => {
      const a = new ChangeArtifact({ type: 'adr', optional: true })
      expect(a.optional).toBe(true)
    })

    it('stores requires', () => {
      const a = new ChangeArtifact({ type: 'design', requires: ['proposal'] })
      expect(a.requires).toEqual(['proposal'])
    })

    it('stores pre-populated files', () => {
      const file = new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })
      const a = new ChangeArtifact({ type: 'proposal', files: new Map([['proposal', file]]) })
      expect(a.files.size).toBe(1)
      expect(a.getFile('proposal')?.filename).toBe('proposal.md')
    })
  })

  describe('status aggregation', () => {
    it('returns missing when no files', () => {
      const a = new ChangeArtifact({ type: 'proposal' })
      expect(a.status).toBe('missing')
    })

    it('returns missing when all files are missing', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', { status: 'missing' })
      expect(a.status).toBe('missing')
    })

    it('returns complete when all files are complete', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', {
        status: 'complete',
        validatedHash: 'sha256:abc',
      })
      expect(a.status).toBe('complete')
    })

    it('returns skipped when all files are skipped', () => {
      const a = makeArtifactWithFile('adr', 'adr.md', { optional: true, status: 'skipped' })
      expect(a.status).toBe('skipped')
    })

    it('returns complete when files are a mix of complete and skipped', () => {
      const f1 = new ArtifactFile({
        key: 'a',
        filename: 'a.md',
        status: 'complete',
        validatedHash: 'sha256:x',
      })
      const f2 = new ArtifactFile({ key: 'b', filename: 'b.md', status: 'skipped' })
      const a = new ChangeArtifact({
        type: 'multi',
        files: new Map([
          ['a', f1],
          ['b', f2],
        ]),
      })
      expect(a.status).toBe('complete')
    })

    it('returns in-progress when some files complete and some missing', () => {
      const f1 = new ArtifactFile({
        key: 'a',
        filename: 'a.md',
        status: 'complete',
        validatedHash: 'sha256:x',
      })
      const f2 = new ArtifactFile({ key: 'b', filename: 'b.md', status: 'missing' })
      const a = new ChangeArtifact({
        type: 'multi',
        files: new Map([
          ['a', f1],
          ['b', f2],
        ]),
      })
      expect(a.status).toBe('in-progress')
    })

    it('returns in-progress when some files are in-progress', () => {
      const f1 = new ArtifactFile({ key: 'a', filename: 'a.md', status: 'in-progress' })
      const f2 = new ArtifactFile({
        key: 'b',
        filename: 'b.md',
        status: 'complete',
        validatedHash: 'sha256:x',
      })
      const a = new ChangeArtifact({
        type: 'multi',
        files: new Map([
          ['a', f1],
          ['b', f2],
        ]),
      })
      expect(a.status).toBe('in-progress')
    })
  })

  describe('isComplete', () => {
    it('returns false when missing', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', { status: 'missing' })
      expect(a.isComplete).toBe(false)
    })

    it('returns false when in-progress', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', { status: 'in-progress' })
      expect(a.isComplete).toBe(false)
    })

    it('returns true when complete', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', {
        status: 'complete',
        validatedHash: 'sha256:abc',
      })
      expect(a.isComplete).toBe(true)
    })

    it('returns true when skipped', () => {
      const a = makeArtifactWithFile('adr', 'adr.md', { optional: true, status: 'skipped' })
      expect(a.isComplete).toBe(true)
    })
  })

  describe('getFile / setFile / removeFile', () => {
    it('getFile returns undefined for unknown key', () => {
      const a = new ChangeArtifact({ type: 'proposal' })
      expect(a.getFile('unknown')).toBeUndefined()
    })

    it('setFile adds a new file', () => {
      const a = new ChangeArtifact({ type: 'proposal' })
      const file = new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })
      a.setFile(file)
      expect(a.getFile('proposal')).toBe(file)
      expect(a.files.size).toBe(1)
    })

    it('setFile replaces an existing file with the same key', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md')
      const newFile = new ArtifactFile({ key: 'proposal', filename: 'proposal-v2.md' })
      a.setFile(newFile)
      expect(a.getFile('proposal')?.filename).toBe('proposal-v2.md')
      expect(a.files.size).toBe(1)
    })

    it('removeFile removes an existing file', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md')
      a.removeFile('proposal')
      expect(a.getFile('proposal')).toBeUndefined()
      expect(a.files.size).toBe(0)
    })

    it('removeFile does nothing for unknown key', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md')
      a.removeFile('nonexistent')
      expect(a.files.size).toBe(1)
    })
  })

  describe('markComplete', () => {
    it('marks a specific file as complete with hash', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', { status: 'in-progress' })
      a.markComplete('proposal', 'sha256:abc123')
      expect(a.getFile('proposal')?.status).toBe('complete')
      expect(a.getFile('proposal')?.validatedHash).toBe('sha256:abc123')
    })

    it('updates the aggregated status to complete', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', { status: 'in-progress' })
      a.markComplete('proposal', 'sha256:abc123')
      expect(a.status).toBe('complete')
    })

    it('updates hash on re-validation', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', {
        status: 'complete',
        validatedHash: 'sha256:old',
      })
      a.markComplete('proposal', 'sha256:new')
      expect(a.getFile('proposal')?.validatedHash).toBe('sha256:new')
    })

    it('does nothing when key does not exist', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', { status: 'in-progress' })
      a.markComplete('nonexistent', 'sha256:abc')
      expect(a.getFile('proposal')?.status).toBe('in-progress')
    })

    it('marks one file complete in a multi-file artifact without completing the other', () => {
      const f1 = new ArtifactFile({ key: 'a', filename: 'a.md', status: 'in-progress' })
      const f2 = new ArtifactFile({ key: 'b', filename: 'b.md', status: 'in-progress' })
      const a = new ChangeArtifact({
        type: 'multi',
        files: new Map([
          ['a', f1],
          ['b', f2],
        ]),
      })
      a.markComplete('a', 'sha256:aaa')
      expect(a.getFile('a')?.status).toBe('complete')
      expect(a.getFile('b')?.status).toBe('in-progress')
      expect(a.status).toBe('in-progress')
    })
  })

  describe('markSkipped', () => {
    it('marks all files as skipped on optional artifact', () => {
      const f1 = new ArtifactFile({ key: 'a', filename: 'a.md' })
      const f2 = new ArtifactFile({ key: 'b', filename: 'b.md' })
      const a = new ChangeArtifact({
        type: 'adr',
        optional: true,
        files: new Map([
          ['a', f1],
          ['b', f2],
        ]),
      })
      a.markSkipped()
      expect(a.getFile('a')?.status).toBe('skipped')
      expect(a.getFile('b')?.status).toBe('skipped')
      expect(a.status).toBe('skipped')
    })

    it('stores the skipped sentinel hash on each file', () => {
      const a = makeArtifactWithFile('adr', 'adr.md', { optional: true })
      a.markSkipped()
      expect(a.getFile('adr')?.validatedHash).toBe(SKIPPED_SENTINEL)
    })

    it('throws ArtifactNotOptionalError on required artifact', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md')
      expect(() => a.markSkipped()).toThrow(ArtifactNotOptionalError)
    })

    it('throws with the correct artifact type in the message', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md')
      expect(() => a.markSkipped()).toThrow('"proposal"')
    })
  })

  describe('resetValidation', () => {
    it('resets complete files to in-progress and clears hashes', () => {
      const a = makeArtifactWithFile('proposal', 'proposal.md', {
        status: 'complete',
        validatedHash: 'sha256:abc',
      })
      a.resetValidation()
      expect(a.getFile('proposal')?.status).toBe('in-progress')
      expect(a.getFile('proposal')?.validatedHash).toBeUndefined()
    })

    it('resets skipped files to missing and clears hashes', () => {
      const a = makeArtifactWithFile('adr', 'adr.md', { optional: true, status: 'skipped' })
      a.resetValidation()
      expect(a.getFile('adr')?.status).toBe('missing')
      expect(a.getFile('adr')?.validatedHash).toBeUndefined()
    })

    it('does not change missing or in-progress files', () => {
      const f1 = new ArtifactFile({ key: 'a', filename: 'a.md', status: 'missing' })
      const f2 = new ArtifactFile({ key: 'b', filename: 'b.md', status: 'in-progress' })
      const a = new ChangeArtifact({
        type: 'multi',
        files: new Map([
          ['a', f1],
          ['b', f2],
        ]),
      })
      a.resetValidation()
      expect(a.getFile('a')?.status).toBe('missing')
      expect(a.getFile('b')?.status).toBe('in-progress')
    })

    it('resets all files in a multi-file artifact', () => {
      const f1 = new ArtifactFile({
        key: 'a',
        filename: 'a.md',
        status: 'complete',
        validatedHash: 'sha256:aaa',
      })
      const f2 = new ArtifactFile({
        key: 'b',
        filename: 'b.md',
        status: 'complete',
        validatedHash: 'sha256:bbb',
      })
      const a = new ChangeArtifact({
        type: 'multi',
        files: new Map([
          ['a', f1],
          ['b', f2],
        ]),
      })
      a.resetValidation()
      expect(a.getFile('a')?.validatedHash).toBeUndefined()
      expect(a.getFile('b')?.validatedHash).toBeUndefined()
      expect(a.status).toBe('in-progress')
    })
  })

  describe('SKIPPED_SENTINEL', () => {
    it('equals the expected sentinel string', () => {
      expect(SKIPPED_SENTINEL).toBe('__skipped__')
    })
  })
})
