import { describe, expect, it } from 'vitest'
import { deriveGraphHealthWarnings } from '../src/graph-health-warnings.js'

describe('deriveGraphHealthWarnings', () => {
  it('returns graph-stale warning with refs', () => {
    const warnings = deriveGraphHealthWarnings({
      stale: true,
      fingerprintMismatch: false,
      lastIndexedRef: '9bbfb3e2abc',
      currentRef: '63bf9049def',
    })
    expect(warnings).toEqual([
      {
        type: 'graph-stale',
        message: 'Graph is stale (indexed at 9bbfb3e, current: 63bf904)',
      },
    ])
  })

  it('returns fingerprint mismatch warning', () => {
    const warnings = deriveGraphHealthWarnings({
      stale: false,
      fingerprintMismatch: true,
      lastIndexedRef: 'abc',
      currentRef: 'abc',
    })
    expect(warnings).toEqual([
      {
        type: 'graph-fingerprint-mismatch',
        message:
          'Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index',
      },
    ])
  })

  it('returns empty array when healthy', () => {
    expect(
      deriveGraphHealthWarnings({
        stale: false,
        fingerprintMismatch: false,
        lastIndexedRef: 'abc',
        currentRef: 'abc',
      }),
    ).toEqual([])
  })
})
