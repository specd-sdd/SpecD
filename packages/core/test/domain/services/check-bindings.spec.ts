import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_BINDING_SPECS,
  DOMAIN_CHECKS,
  TRANSITION_BINDING_SPECS,
} from '../../../src/domain/services/check-bindings.js'
import type { Check } from '../../../src/domain/services/transition-checks.js'
import { applyBindingSpecs } from '../../../src/domain/services/transition-checks.js'

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

describe('check-bindings governance', () => {
  const categoryC = new Set([
    'deps.consistent',
    'workspace.readOnly',
    'impl.filesResolved',
    'impl.linksInScope',
    'spec.overlap',
  ])

  it('declares allowBindingOverride and allowDisable explicitly on every built-in spec', () => {
    for (const spec of [...TRANSITION_BINDING_SPECS, ...ARCHIVE_BINDING_SPECS]) {
      expect(typeof spec.allowBindingOverride, spec.id).toBe('boolean')
      expect(typeof spec.allowDisable, spec.id).toBe('boolean')
    }
  })

  it('locks Category A/B and unlocks Category C', () => {
    for (const spec of [...TRANSITION_BINDING_SPECS, ...ARCHIVE_BINDING_SPECS]) {
      const expected = categoryC.has(spec.id)
      expect(spec.allowBindingOverride, spec.id).toBe(expected)
      expect(spec.allowDisable, spec.id).toBe(expected)
    }
  })

  it('inherits check-level governance when a spec omits locks, defaulting to false', () => {
    const check = DOMAIN_CHECKS['protocol.edge']!
    const [inherited, bare, explicit] = applyBindingSpecs(
      [
        { id: 'protocol.edge', applicability: [{ scope: 'archive' }] },
        { id: 'protocol.edge', applicability: [{ scope: 'archive' }] },
        {
          id: 'protocol.edge',
          applicability: [{ scope: 'archive' }],
          allowBindingOverride: false,
          allowDisable: false,
        },
      ],
      { 'protocol.edge': check },
    ).map((binding) => binding)
    expect(bare?.allowBindingOverride).toBe(false)
    expect(bare?.allowDisable).toBe(false)
    expect(inherited?.allowBindingOverride).toBe(false)
    expect(explicit?.allowBindingOverride).toBe(false)

    const [fromGovernance] = applyBindingSpecs(
      [{ id: 'protocol.edge', applicability: [{ scope: 'archive' }] }],
      { 'protocol.edge': check },
      () => ({
        canonicalId: 'protocol.edge',
        allowSchemaEmbedding: true,
        allowBindingOverride: true,
        allowConfigOverride: true,
        allowDisable: true,
      }),
    )
    expect(fromGovernance?.allowBindingOverride).toBe(true)
    expect(fromGovernance?.allowDisable).toBe(true)
    expect(fromGovernance?.allowConfigOverride).toBe(true)
  })

  it('inherits allowConfigOverride from governance, defaulting to false', () => {
    const check = { id: 'protocol.edge' } as Check
    const [bare] = applyBindingSpecs(
      [{ id: 'protocol.edge', applicability: [{ scope: 'archive' }] }],
      { 'protocol.edge': check },
    )
    expect(bare?.allowConfigOverride).toBe(false)
  })
})
