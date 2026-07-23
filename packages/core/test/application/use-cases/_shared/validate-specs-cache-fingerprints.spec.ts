import { describe, expect, it } from 'vitest'
import {
  computeCacheFingerprint,
  computeSchemaFingerprint,
} from '../../../../src/application/use-cases/_shared/validate-specs-cache-fingerprints.js'

const hash = (content: string): string => `sha256:${content.length}:${content}`

describe('validate-specs cache fingerprints', () => {
  describe('computeSchemaFingerprint', () => {
    it('returns identical digests for identical schema inputs', () => {
      const input = {
        schemaName: 'test',
        schemaVersion: 1,
        specScopedArtifactValidations: [{ id: 'specs', validations: [] }],
        specScopedCrossRules: [],
        declaresDependsOnExtraction: true,
      }
      expect(computeSchemaFingerprint(input, hash)).toBe(computeSchemaFingerprint(input, hash))
    })
  })

  describe('computeCacheFingerprint', () => {
    it('returns identical digests for identical cache inputs', () => {
      const input = {
        specFingerprint: 'sha256:spec',
        metadataContentHash: 'sha256:meta',
      }
      expect(computeCacheFingerprint(input, hash)).toBe(computeCacheFingerprint(input, hash))
    })

    it('uses absent sentinel when metadata hash is null', () => {
      const withAbsent = computeCacheFingerprint(
        { specFingerprint: 'sha256:spec', metadataContentHash: null },
        hash,
      )
      const withExplicitAbsent = computeCacheFingerprint(
        { specFingerprint: 'sha256:spec', metadataContentHash: '__absent__' },
        hash,
      )
      expect(withAbsent).not.toBe(
        computeCacheFingerprint(
          { specFingerprint: 'sha256:spec', metadataContentHash: 'sha256:meta' },
          hash,
        ),
      )
      expect(withAbsent).toBe(withExplicitAbsent)
    })

    it('changes digest when metadata content hash changes', () => {
      const base = computeCacheFingerprint(
        { specFingerprint: 'sha256:spec', metadataContentHash: 'sha256:meta-a' },
        hash,
      )
      const changed = computeCacheFingerprint(
        { specFingerprint: 'sha256:spec', metadataContentHash: 'sha256:meta-b' },
        hash,
      )
      expect(base).not.toBe(changed)
    })
  })
})
