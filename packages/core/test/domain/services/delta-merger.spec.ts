import { describe, it, expect } from 'vitest'
import { mergeSpecs } from '../../../src/domain/services/delta-merger.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

const path = SpecPath.parse('auth/oauth')

function makeSpec(content: string): Spec {
  return new Spec(path, content)
}

describe('mergeSpecs', () => {
  describe('empty delta', () => {
    it('returns base spec unchanged when delta has no sections', () => {
      const base = makeSpec('## Requirements\nreq one\n\n## Constraints\nconstraint one')
      const delta = makeSpec('')
      const result = mergeSpecs(base, delta)
      expect(result.section('Requirements')).toBe('req one')
      expect(result.section('Constraints')).toBe('constraint one')
    })

    it('preserves the base path', () => {
      const base = makeSpec('## Requirements\ncontent')
      const delta = makeSpec('')
      const result = mergeSpecs(base, delta)
      expect(result.path.equals(path)).toBe(true)
    })
  })

  describe('ADDED', () => {
    it('adds a new section not present in base', () => {
      const base = makeSpec('## Requirements\nreq one')
      const delta = makeSpec('## ADDED\n### Scenarios\nscenario one')
      const result = mergeSpecs(base, delta)
      expect(result.section('Scenarios')).toBe('scenario one')
      expect(result.section('Requirements')).toBe('req one')
    })

    it('adds multiple new sections', () => {
      const base = makeSpec('## Requirements\nreq one')
      const delta = makeSpec('## ADDED\n### Scenarios\nscenario one\n### Examples\nexample one')
      const result = mergeSpecs(base, delta)
      expect(result.section('Scenarios')).toBe('scenario one')
      expect(result.section('Examples')).toBe('example one')
    })

    it('adds a section even if base is empty', () => {
      const base = makeSpec('')
      const delta = makeSpec('## ADDED\n### Requirements\nnew req')
      const result = mergeSpecs(base, delta)
      expect(result.section('Requirements')).toBe('new req')
    })
  })

  describe('MODIFIED', () => {
    it('replaces an existing section', () => {
      const base = makeSpec('## Requirements\nold content')
      const delta = makeSpec('## MODIFIED\n### Requirements\nnew content')
      const result = mergeSpecs(base, delta)
      expect(result.section('Requirements')).toBe('new content')
    })

    it('replaces multiple sections', () => {
      const base = makeSpec('## Requirements\nold req\n\n## Constraints\nold constraint')
      const delta = makeSpec('## MODIFIED\n### Requirements\nnew req\n### Constraints\nnew constraint')
      const result = mergeSpecs(base, delta)
      expect(result.section('Requirements')).toBe('new req')
      expect(result.section('Constraints')).toBe('new constraint')
    })

    it('preserves sections not mentioned in MODIFIED', () => {
      const base = makeSpec('## Requirements\nreq\n\n## Constraints\nconstraint')
      const delta = makeSpec('## MODIFIED\n### Requirements\nnew req')
      const result = mergeSpecs(base, delta)
      expect(result.section('Constraints')).toBe('constraint')
    })

    it('adds section if it does not exist in base (upsert behaviour)', () => {
      const base = makeSpec('## Requirements\nreq')
      const delta = makeSpec('## MODIFIED\n### Constraints\nnew constraint')
      const result = mergeSpecs(base, delta)
      expect(result.section('Constraints')).toBe('new constraint')
    })
  })

  describe('REMOVED', () => {
    it('removes an existing section', () => {
      const base = makeSpec('## Requirements\nreq\n\n## Deprecated\nold stuff')
      const delta = makeSpec('## REMOVED\n### Deprecated')
      const result = mergeSpecs(base, delta)
      expect(result.section('Deprecated')).toBeNull()
      expect(result.section('Requirements')).toBe('req')
    })

    it('removes multiple sections', () => {
      const base = makeSpec('## Requirements\nreq\n\n## Old\nold\n\n## Deprecated\ndep')
      const delta = makeSpec('## REMOVED\n### Old\n### Deprecated')
      const result = mergeSpecs(base, delta)
      expect(result.section('Old')).toBeNull()
      expect(result.section('Deprecated')).toBeNull()
      expect(result.section('Requirements')).toBe('req')
    })

    it('silently ignores removing a section that does not exist', () => {
      const base = makeSpec('## Requirements\nreq')
      const delta = makeSpec('## REMOVED\n### NonExistent')
      expect(() => mergeSpecs(base, delta)).not.toThrow()
      const result = mergeSpecs(base, delta)
      expect(result.section('Requirements')).toBe('req')
    })
  })

  describe('combined operations', () => {
    it('applies ADDED, MODIFIED, and REMOVED together', () => {
      const base = makeSpec(
        '## Requirements\nold req\n\n## Constraints\nconstraint\n\n## Deprecated\nold stuff',
      )
      const delta = makeSpec(
        '## ADDED\n### Scenarios\nscenario one\n\n## MODIFIED\n### Requirements\nnew req\n\n## REMOVED\n### Deprecated',
      )
      const result = mergeSpecs(base, delta)

      expect(result.section('Requirements')).toBe('new req')
      expect(result.section('Constraints')).toBe('constraint')
      expect(result.section('Scenarios')).toBe('scenario one')
      expect(result.section('Deprecated')).toBeNull()
    })
  })
})
