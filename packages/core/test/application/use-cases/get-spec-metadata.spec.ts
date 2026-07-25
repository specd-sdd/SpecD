import { describe, expect, it, vi } from 'vitest'
import { GetSpecMetadata } from '../../../src/application/use-cases/get-spec-metadata.js'
import { MaterializeSpecMetadata } from '../../../src/application/use-cases/materialize-spec-metadata.js'

describe('GetSpecMetadata', () => {
  it('delegates to MaterializeSpecMetadata with if-needed policy', async () => {
    const materialize = {
      execute: vi.fn(async () => ({
        metadata: { provenance: {} },
        metadataFingerprint: 'fp',
        source: 'persisted' as const,
        regenerated: false,
        warnings: [],
      })),
    }
    const useCase = new GetSpecMetadata(materialize as unknown as MaterializeSpecMetadata)
    const result = await useCase.execute({ specId: 'default:auth/login' })

    expect(materialize.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      policy: 'if-needed',
    })
    expect(result.metadataFingerprint).toBe('fp')
  })
})
