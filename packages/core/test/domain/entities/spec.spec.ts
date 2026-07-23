import { describe, it, expect } from 'vitest'
import { Spec, ABSENT_SPEC_SIDECAR } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

const workspace = 'billing'
const name = SpecPath.parse('payments/checkout')

describe('Spec', () => {
  describe('workspace', () => {
    it('returns the workspace name', () => {
      const s = new Spec(
        workspace,
        name,
        [{ filename: 'spec.md', lastModified: '2020-01-01T00:00:00.000Z' }],
        ABSENT_SPEC_SIDECAR,
        ABSENT_SPEC_SIDECAR,
      )
      expect(s.workspace).toBe('billing')
    })
  })

  describe('name', () => {
    it('returns the spec path', () => {
      const s = new Spec(
        workspace,
        name,
        [{ filename: 'spec.md', lastModified: '2020-01-01T00:00:00.000Z' }],
        ABSENT_SPEC_SIDECAR,
        ABSENT_SPEC_SIDECAR,
      )
      expect(s.name.equals(name)).toBe(true)
    })
  })

  describe('artifacts', () => {
    it('returns all artifact entries', () => {
      const s = new Spec(
        workspace,
        name,
        [
          { filename: 'spec.md', lastModified: '2020-01-01T00:00:00.000Z' },
          { filename: 'proposal.md', lastModified: '2020-01-02T00:00:00.000Z' },
        ],
        ABSENT_SPEC_SIDECAR,
        ABSENT_SPEC_SIDECAR,
      )
      expect(s.artifacts.map((a) => a.filename)).toEqual(['spec.md', 'proposal.md'])
    })

    it('returns empty array when no artifacts', () => {
      const s = new Spec(workspace, name, [], ABSENT_SPEC_SIDECAR, ABSENT_SPEC_SIDECAR)
      expect(s.artifacts).toHaveLength(0)
    })
  })

  describe('filenames', () => {
    it('returns artifact filenames derived from entries', () => {
      const s = new Spec(
        workspace,
        name,
        [
          { filename: 'spec.md', lastModified: '2020-01-01T00:00:00.000Z' },
          { filename: 'proposal.md', lastModified: '2020-01-02T00:00:00.000Z' },
        ],
        ABSENT_SPEC_SIDECAR,
        ABSENT_SPEC_SIDECAR,
      )
      expect(s.filenames).toEqual(['spec.md', 'proposal.md'])
    })

    it('returns empty array when no artifacts', () => {
      const s = new Spec(workspace, name, [], ABSENT_SPEC_SIDECAR, ABSENT_SPEC_SIDECAR)
      expect(s.filenames).toEqual([])
    })
  })

  describe('hasArtifact', () => {
    it('returns true when the filename is present', () => {
      const s = new Spec(
        workspace,
        name,
        [{ filename: 'spec.md', lastModified: '2020-01-01T00:00:00.000Z' }],
        ABSENT_SPEC_SIDECAR,
        ABSENT_SPEC_SIDECAR,
      )
      expect(s.hasArtifact('spec.md')).toBe(true)
    })

    it('returns false when the filename is absent', () => {
      const s = new Spec(
        workspace,
        name,
        [{ filename: 'spec.md', lastModified: '2020-01-01T00:00:00.000Z' }],
        ABSENT_SPEC_SIDECAR,
        ABSENT_SPEC_SIDECAR,
      )
      expect(s.hasArtifact('verify.md')).toBe(false)
    })
  })

  describe('sidecar stamps', () => {
    it('exposes persisted state and generated metadata stamps', () => {
      const s = new Spec(
        workspace,
        name,
        [],
        { present: true, lastModified: '2020-01-01T00:00:00.000Z' },
        { present: false, lastModified: null },
      )
      expect(s.persistedStateStamp.present).toBe(true)
      expect(s.generatedMetadataStamp.present).toBe(false)
    })
  })
})
