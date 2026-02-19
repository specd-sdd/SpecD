import { describe, it, expect } from 'vitest'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

const path = SpecPath.parse('auth/oauth')

describe('Spec', () => {
  describe('sections', () => {
    it('returns empty map for content with no ## headings', () => {
      const s = new Spec(path, 'just some prose\nno headings here')
      expect(s.sections().size).toBe(0)
    })

    it('parses a single section', () => {
      const s = new Spec(path, '## Requirements\nline one\nline two')
      const sections = s.sections()
      expect(sections.size).toBe(1)
      expect(sections.get('Requirements')).toBe('line one\nline two')
    })

    it('parses multiple sections', () => {
      const s = new Spec(path, '## Requirements\nreq one\n## Constraints\nconstraint one')
      const sections = s.sections()
      expect(sections.size).toBe(2)
      expect(sections.get('Requirements')).toBe('req one')
      expect(sections.get('Constraints')).toBe('constraint one')
    })

    it('trims section content', () => {
      const s = new Spec(path, '## Requirements\n\nsome content\n\n')
      expect(s.sections().get('Requirements')).toBe('some content')
    })

    it('does not treat ### as a section boundary', () => {
      const content = '## Requirements\n### Sub-requirement\ndetail\n## Constraints\nconstraint'
      const s = new Spec(path, content)
      const sections = s.sections()
      expect(sections.size).toBe(2)
      expect(sections.get('Requirements')).toBe('### Sub-requirement\ndetail')
    })

    it('ignores content before the first ## heading', () => {
      const s = new Spec(path, '# Title\nsome intro\n## Requirements\nreq one')
      const sections = s.sections()
      expect(sections.size).toBe(1)
      expect(sections.get('Requirements')).toBe('req one')
    })

    it('handles empty section content', () => {
      const s = new Spec(path, '## Requirements\n## Constraints\nsome content')
      const sections = s.sections()
      expect(sections.get('Requirements')).toBe('')
    })
  })

  describe('section', () => {
    it('returns section content when found', () => {
      const s = new Spec(path, '## Requirements\nreq one')
      expect(s.section('Requirements')).toBe('req one')
    })

    it('returns null when section not found', () => {
      const s = new Spec(path, '## Requirements\nreq one')
      expect(s.section('Constraints')).toBeNull()
    })
  })
})
