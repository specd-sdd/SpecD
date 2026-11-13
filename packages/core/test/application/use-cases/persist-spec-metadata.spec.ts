import { describe, expect, it, vi } from 'vitest'
import { PersistSpecMetadata } from '../../../src/application/use-cases/persist-spec-metadata.js'
import { METADATA_PROJECTION_VERSION } from '../../../src/domain/services/metadata-projection.js'
import { MetadataValidationError } from '../../../src/domain/errors/metadata-validation-error.js'
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

  it('rejects bare dependsOn without writing metadata', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const writeSpy = vi.spyOn(repo, 'writeMetadataSnapshot')
    const useCase = new PersistSpecMetadata(repo)

    await expect(
      useCase.execute({
        spec,
        metadata: {
          title: 'Auth',
          description: 'Authentication spec',
          dependsOn: ['_global/architecture'],
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
      }),
    ).rejects.toThrow(MetadataValidationError)

    expect(writeSpy).not.toHaveBeenCalled()
  })

  it.each([[''], ['not a valid id!'], ['core:'], ['auth/a,b']])(
    'rejects malformed dependsOn entry %j without writing metadata',
    async (entry) => {
      const spec = makeSpec({ name: 'auth/login' })
      const repo = makeSpecRepository({ specs: [spec] })
      const writeSpy = vi.spyOn(repo, 'writeMetadataSnapshot')
      const useCase = new PersistSpecMetadata(repo)

      await expect(
        useCase.execute({
          spec,
          metadata: {
            title: 'Auth',
            description: 'Authentication spec',
            dependsOn: [entry],
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
        }),
      ).rejects.toThrow(MetadataValidationError)

      expect(writeSpy).not.toHaveBeenCalled()
    },
  )
})
