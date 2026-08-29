import { describe, it, expect } from 'vitest'
import { TransitiveReductionEngine } from '../../../src/domain/services/transitive-reduction-engine.js'

describe('TransitiveReductionEngine', () => {
  it('prunes direct transitive edge in linear chain (A -> B -> C and A -> C)', () => {
    const raw = new Map<string, ReadonlySet<string>>([
      ['spec:a', new Set(['spec:b', 'spec:c'])],
      ['spec:b', new Set(['spec:c'])],
      ['spec:c', new Set()],
    ])

    const reduced = TransitiveReductionEngine.reduce(raw)

    expect(reduced.get('spec:a')).toEqual(['spec:b'])
    expect(reduced.get('spec:b')).toEqual(['spec:c'])
    expect(reduced.get('spec:c')).toEqual([])
  })

  it('preserves branching diamond graph dependencies', () => {
    const raw = new Map<string, ReadonlySet<string>>([
      ['spec:a', new Set(['spec:b', 'spec:c', 'spec:d'])],
      ['spec:b', new Set(['spec:d'])],
      ['spec:c', new Set(['spec:d'])],
      ['spec:d', new Set()],
    ])

    const reduced = TransitiveReductionEngine.reduce(raw)

    expect(reduced.get('spec:a')).toEqual(['spec:b', 'spec:c'])
    expect(reduced.get('spec:b')).toEqual(['spec:d'])
    expect(reduced.get('spec:c')).toEqual(['spec:d'])
    expect(reduced.get('spec:d')).toEqual([])
  })

  it('handles cyclic dependencies gracefully without infinite loop', () => {
    const raw = new Map<string, ReadonlySet<string>>([
      ['spec:a', new Set(['spec:b'])],
      ['spec:b', new Set(['spec:a'])],
    ])

    const reduced = TransitiveReductionEngine.reduce(raw)

    expect(reduced.get('spec:a')).toEqual(['spec:b'])
    expect(reduced.get('spec:b')).toEqual(['spec:a'])
  })

  it('handles isolated nodes and single dependencies without alteration', () => {
    const raw = new Map<string, ReadonlySet<string>>([
      ['spec:x', new Set()],
      ['spec:y', new Set(['spec:z'])],
      ['spec:z', new Set()],
    ])

    const reduced = TransitiveReductionEngine.reduce(raw)

    expect(reduced.get('spec:x')).toEqual([])
    expect(reduced.get('spec:y')).toEqual(['spec:z'])
    expect(reduced.get('spec:z')).toEqual([])
  })
})
