import { describe, expect, it } from 'vitest'
import {
  normalizeArtifactState,
  normalizePersistedSpecOptimizations,
  persistedSpecOptimizationsZodSchema,
} from '../../../src/domain/services/spec-optimization.js'

const SCHEMA = { name: 'schema-std', version: 1 }
const HASH = 'sha256:' + 'a'.repeat(64)

describe('persistedSpecOptimizationsZodSchema', () => {
  it('rejects an empty optimizations object', () => {
    const result = persistedSpecOptimizationsZodSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts one populated field', () => {
    const result = persistedSpecOptimizationsZodSchema.safeParse({
      optimizedDescription: {
        value: 'desc',
        schema: SCHEMA,
        artifactState: { 'spec.md': { hash: HASH, lastModified: 't' } },
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('normalizeArtifactState', () => {
  it('sorts keys filename-ascending', () => {
    const normalized = normalizeArtifactState({
      'verify.md': { hash: HASH, lastModified: 't2' },
      'spec.md': { hash: HASH, lastModified: 't1' },
    })

    expect(Object.keys(normalized)).toEqual(['spec.md', 'verify.md'])
  })
})

describe('normalizePersistedSpecOptimizations', () => {
  it('returns undefined when both fields are absent after normalization', () => {
    expect(normalizePersistedSpecOptimizations({})).toBeUndefined()
  })
})
