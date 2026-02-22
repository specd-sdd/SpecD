import { describe, it, expect } from 'vitest'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

const workspace = 'billing'
const name = SpecPath.parse('payments/checkout')

describe('Spec', () => {
  describe('workspace', () => {
    it('returns the workspace name', () => {
      const s = new Spec(workspace, name, ['spec.md'])
      expect(s.workspace).toBe('billing')
    })
  })

  describe('name', () => {
    it('returns the spec path', () => {
      const s = new Spec(workspace, name, ['spec.md'])
      expect(s.name.equals(name)).toBe(true)
    })
  })

  describe('filenames', () => {
    it('returns all artifact filenames', () => {
      const s = new Spec(workspace, name, ['spec.md', 'proposal.md'])
      expect(s.filenames).toEqual(['spec.md', 'proposal.md'])
    })

    it('returns empty array when no artifacts', () => {
      const s = new Spec(workspace, name, [])
      expect(s.filenames).toHaveLength(0)
    })
  })

  describe('hasArtifact', () => {
    it('returns true when filename is present', () => {
      const s = new Spec(workspace, name, ['spec.md', 'proposal.md'])
      expect(s.hasArtifact('spec.md')).toBe(true)
      expect(s.hasArtifact('proposal.md')).toBe(true)
    })

    it('returns false when filename is not present', () => {
      const s = new Spec(workspace, name, ['spec.md'])
      expect(s.hasArtifact('design.md')).toBe(false)
    })
  })
})
