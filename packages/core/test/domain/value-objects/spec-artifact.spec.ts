import { describe, it, expect } from 'vitest'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'

describe('SpecArtifact', () => {
  describe('sections', () => {
    it('returns empty map for content with no ## headings', () => {
      const a = new SpecArtifact('spec.md', 'just some prose\nno headings here')
      expect(a.sections().size).toBe(0)
    })

    it('parses a single section', () => {
      const a = new SpecArtifact('spec.md', '## Requirements\nline one\nline two')
      const sections = a.sections()
      expect(sections.size).toBe(1)
      expect(sections.get('Requirements')).toBe('line one\nline two')
    })

    it('parses multiple sections', () => {
      const a = new SpecArtifact(
        'spec.md',
        '## Requirements\nreq one\n## Constraints\nconstraint one',
      )
      const sections = a.sections()
      expect(sections.size).toBe(2)
      expect(sections.get('Requirements')).toBe('req one')
      expect(sections.get('Constraints')).toBe('constraint one')
    })

    it('trims section content', () => {
      const a = new SpecArtifact('spec.md', '## Requirements\n\nsome content\n\n')
      expect(a.sections().get('Requirements')).toBe('some content')
    })

    it('does not treat ### as a section boundary', () => {
      const content = '## Requirements\n### Sub-requirement\ndetail\n## Constraints\nconstraint'
      const a = new SpecArtifact('spec.md', content)
      const sections = a.sections()
      expect(sections.size).toBe(2)
      expect(sections.get('Requirements')).toBe('### Sub-requirement\ndetail')
    })

    it('ignores content before the first ## heading', () => {
      const a = new SpecArtifact('spec.md', '# Title\nsome intro\n## Requirements\nreq one')
      const sections = a.sections()
      expect(sections.size).toBe(1)
      expect(sections.get('Requirements')).toBe('req one')
    })

    it('handles empty section content', () => {
      const a = new SpecArtifact('spec.md', '## Requirements\n## Constraints\nsome content')
      const sections = a.sections()
      expect(sections.get('Requirements')).toBe('')
    })
  })

  describe('section', () => {
    it('returns section content when found', () => {
      const a = new SpecArtifact('spec.md', '## Requirements\nreq one')
      expect(a.section('Requirements')).toBe('req one')
    })

    it('returns null when section not found', () => {
      const a = new SpecArtifact('spec.md', '## Requirements\nreq one')
      expect(a.section('Constraints')).toBeNull()
    })
  })

  describe('filename', () => {
    it('preserves the filename exactly', () => {
      const a = new SpecArtifact('proposal.md', '')
      expect(a.filename).toBe('proposal.md')
    })
  })

  describe('content', () => {
    it('preserves the raw content', () => {
      const content = '## Requirements\nsome req'
      const a = new SpecArtifact('spec.md', content)
      expect(a.content).toBe(content)
    })
  })

  describe('originalHash', () => {
    it('is undefined when not provided', () => {
      const a = new SpecArtifact('spec.md', 'content')
      expect(a.originalHash).toBeUndefined()
    })

    it('stores the original hash when provided', () => {
      const hash = 'sha256:abc123'
      const a = new SpecArtifact('spec.md', 'content', hash)
      expect(a.originalHash).toBe(hash)
    })

    it('preserves originalHash independently of content', () => {
      const a = new SpecArtifact('spec.md', 'new content', 'sha256:oldhash')
      expect(a.content).toBe('new content')
      expect(a.originalHash).toBe('sha256:oldhash')
    })
  })
})
