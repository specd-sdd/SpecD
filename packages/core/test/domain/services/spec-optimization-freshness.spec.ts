import { describe, expect, it } from 'vitest'
import { classifyOptimizationFieldFreshness } from '../../../src/domain/services/spec-optimization-freshness.js'

const SCHEMA = { name: 'schema-std', version: 1 }
const HASH_A = 'sha256:' + 'a'.repeat(64)
const HASH_B = 'sha256:' + 'b'.repeat(64)

const FIELD = {
  value: 'optimized',
  schema: SCHEMA,
  artifactState: {
    'spec.md': { hash: HASH_A, lastModified: '2026-01-01T00:00:00.000Z' },
  },
}

describe('classifyOptimizationFieldFreshness', () => {
  it('reports missing when field is undefined', () => {
    const result = classifyOptimizationFieldFreshness(undefined, {}, SCHEMA)
    expect(result).toEqual({ fresh: false, reasons: ['missing'] })
  })

  it('is fresh when baseline matches current state', () => {
    const result = classifyOptimizationFieldFreshness(FIELD, FIELD.artifactState, SCHEMA)
    expect(result.fresh).toBe(true)
  })

  it('classifies artifact-added', () => {
    const result = classifyOptimizationFieldFreshness(
      FIELD,
      {
        ...FIELD.artifactState,
        'verify.md': { hash: HASH_A, lastModified: 't' },
      },
      SCHEMA,
    )

    expect(result.fresh).toBe(false)
    expect(result.reasons).toContain('artifact-added')
  })

  it('classifies artifact-removed', () => {
    const result = classifyOptimizationFieldFreshness(FIELD, {}, SCHEMA)
    expect(result.reasons).toContain('artifact-removed')
  })

  it('classifies artifact-changed by hash only', () => {
    const result = classifyOptimizationFieldFreshness(
      FIELD,
      { 'spec.md': { hash: HASH_B, lastModified: FIELD.artifactState['spec.md'].lastModified } },
      SCHEMA,
    )

    expect(result.reasons).toContain('artifact-changed')
  })

  it('does not treat equal hash with different lastModified as stale', () => {
    const result = classifyOptimizationFieldFreshness(
      FIELD,
      { 'spec.md': { hash: HASH_A, lastModified: '2026-07-01T00:00:00.000Z' } },
      SCHEMA,
    )

    expect(result.fresh).toBe(true)
  })

  it('classifies schema-changed', () => {
    const result = classifyOptimizationFieldFreshness(FIELD, FIELD.artifactState, {
      name: 'other',
      version: 2,
    })

    expect(result.reasons).toContain('schema-changed')
  })
})
