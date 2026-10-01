import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_BINDING_SPECS,
  TRANSITION_BINDING_SPECS,
} from '../../../src/domain/services/check-bindings.js'

describe('check-bindings skippability permissions', () => {
  it('declares skippable: true only for impl.linksInScope in transition bindings', () => {
    const skippable = TRANSITION_BINDING_SPECS.filter((b) => b.skippable === true)
    expect(skippable.map((s) => s.id)).toEqual(['impl.linksInScope'])

    const nonSkippablePredicateSpecs = TRANSITION_BINDING_SPECS.filter(
      (b) => b.id !== 'impl.linksInScope' && !b.phase,
    )
    for (const spec of nonSkippablePredicateSpecs) {
      expect(spec.skippable).toBe(false)
    }
  })

  it('declares skippable: true only for spec.overlap and impl.linksInScope in archive bindings', () => {
    const skippable = ARCHIVE_BINDING_SPECS.filter((b) => b.skippable === true)
    expect(skippable.map((s) => s.id).sort()).toEqual(['impl.linksInScope', 'spec.overlap'].sort())

    const nonSkippablePredicateSpecs = ARCHIVE_BINDING_SPECS.filter(
      (b) => b.id !== 'impl.linksInScope' && b.id !== 'spec.overlap' && !b.phase,
    )
    for (const spec of nonSkippablePredicateSpecs) {
      expect(spec.skippable).toBe(false)
    }
  })
})
