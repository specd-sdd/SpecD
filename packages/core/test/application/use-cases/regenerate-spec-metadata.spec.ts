import { describe, expect, it, vi } from 'vitest'
import { RegenerateSpecMetadata } from '../../../src/application/use-cases/regenerate-spec-metadata.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { makeListWorkspaces, makeSpecRepository } from './helpers.js'

describe('RegenerateSpecMetadata', () => {
  it('discovers batch targets via listWorkspaces and raw listing', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({ specs: [spec] })
    const materialize = {
      execute: vi.fn(async () => ({
        metadata: { provenance: {} },
        metadataFingerprint: 'fp',
        source: 'generated' as const,
        regenerated: true,
        warnings: [],
      })),
    }
    const useCase = new RegenerateSpecMetadata(
      materialize as never,
      makeListWorkspaces(new Map([['default', repo]])),
    )

    const result = await useCase.execute({ target: { kind: 'batch' } })
    expect(result.kind).toBe('batch')
    if (result.kind === 'batch') {
      expect(result.specs).toHaveLength(1)
      expect(result.specs[0]?.specId).toBe('default:auth/login')
      expect(result.failed).toBe(false)
    }
    expect(materialize.execute).toHaveBeenCalledWith({
      specId: 'default:auth/login',
      policy: 'force',
      allowDependsOnOverwrite: false,
    })
  })
})
