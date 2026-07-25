import { describe, expect, it } from 'vitest'
import { assessMetadataFreshness } from '../../../src/domain/services/assess-metadata-freshness.js'
import { type SpecMetadata } from '../../../src/domain/services/parse-metadata.js'

const SCHEMA = { name: 'schema-std', version: 1 }
const HASH_A = 'sha256:' + 'a'.repeat(64)
const HASH_B = 'sha256:' + 'b'.repeat(64)

const BASE_PROVENANCE = {
  artifacts: {
    'spec.md': { hash: HASH_A, lastModified: '2026-01-01T00:00:00.000Z' },
  },
  persistedStateHash: HASH_A,
  schema: SCHEMA,
  projectionVersion: 1,
  projectionFingerprint: 'fp-1',
}

function metadata(overrides: Partial<SpecMetadata> = {}): SpecMetadata {
  return {
    title: 'T',
    description: 'D',
    provenance: BASE_PROVENANCE,
    ...overrides,
  }
}

describe('assessMetadataFreshness', () => {
  it('reports missing when provenance is absent', () => {
    const result = assessMetadataFreshness(
      { title: 'T' },
      {
        artifacts: BASE_PROVENANCE.artifacts,
        persistedStateHash: HASH_A,
        schema: SCHEMA,
        projectionVersion: 1,
        projectionFingerprint: 'fp-1',
      },
    )

    expect(result.fresh).toBe(false)
    expect(result.reasons).toContain('missing')
  })

  it('is fresh when all provenance matches', () => {
    const current = {
      artifacts: BASE_PROVENANCE.artifacts,
      persistedStateHash: HASH_A,
      schema: SCHEMA,
      projectionVersion: 1,
      projectionFingerprint: 'fp-1',
    }

    expect(assessMetadataFreshness(metadata(), current)).toEqual({
      fresh: true,
      reasons: [],
    })
  })

  it('detects artifact-changed without comparing lastModified', () => {
    const result = assessMetadataFreshness(metadata(), {
      artifacts: {
        'spec.md': { hash: HASH_B, lastModified: '2026-01-01T00:00:00.000Z' },
      },
      persistedStateHash: HASH_A,
      schema: SCHEMA,
      projectionVersion: 1,
      projectionFingerprint: 'fp-1',
    })

    expect(result.fresh).toBe(false)
    expect(result.reasons).toContain('artifact-changed')
  })

  it('does not treat equal hash with different lastModified as changed', () => {
    const result = assessMetadataFreshness(metadata(), {
      artifacts: {
        'spec.md': { hash: HASH_A, lastModified: '2026-07-01T00:00:00.000Z' },
      },
      persistedStateHash: HASH_A,
      schema: SCHEMA,
      projectionVersion: 1,
      projectionFingerprint: 'fp-1',
    })

    expect(result.fresh).toBe(true)
  })

  it('detects persisted-state-changed including null vs null mismatch paths', () => {
    const result = assessMetadataFreshness(
      metadata({
        provenance: { ...BASE_PROVENANCE, persistedStateHash: null },
      }),
      {
        artifacts: BASE_PROVENANCE.artifacts,
        persistedStateHash: HASH_A,
        schema: SCHEMA,
        projectionVersion: 1,
        projectionFingerprint: 'fp-1',
      },
    )

    expect(result.reasons).toContain('persisted-state-changed')
  })
})
