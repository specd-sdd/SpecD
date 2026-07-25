import { describe, expect, it } from 'vitest'
import { PersistSpecMetadata } from '../../../src/application/use-cases/persist-spec-metadata.js'
import { METADATA_PROJECTION_VERSION } from '../../../src/domain/services/metadata-projection.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { makeSpecRepository } from './helpers.js'

describe('PersistSpecMetadata', () => {
  it('writes a valid metadata snapshot', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new PersistSpecMetadata(repo)

    const snapshot = await useCase.execute({
      spec,
      metadata: {
        title: 'Auth',
        description: 'Authentication spec',
        contentHashes: { 'spec.md': 'sha256:' + 'a'.repeat(64) },
        provenance: {
          artifacts: {},
          persistedStateHash: null,
          schema: { name: 'std', version: 1 },
          projectionVersion: METADATA_PROJECTION_VERSION,
          projectionFingerprint: 'fp',
        },
      },
      expectedRevision: null,
    })

    expect(snapshot.kind).toBe('present')
  })
})
