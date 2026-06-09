import { describe, it, expect, vi } from 'vitest'
import { UpdateSpecMetadata } from '../../../src/application/use-cases/update-spec-metadata.js'
import { type GenerateSpecMetadata } from '../../../src/application/use-cases/generate-spec-metadata.js'
import { type SaveSpecMetadata } from '../../../src/application/use-cases/save-spec-metadata.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'

describe('UpdateSpecMetadata', () => {
  it('merges optimized fields with fresh deterministic extraction', async () => {
    const generateMetadata = {
      execute: vi.fn().mockResolvedValue({
        metadata: {
          title: 'Original Title',
          description: 'Original Description',
          contentHashes: { 'spec.md': 'hash1' },
        },
      }),
    } as unknown as GenerateSpecMetadata

    const saveMetadata = {
      execute: vi.fn().mockResolvedValue({ spec: 'default:test' }),
    } as unknown as SaveSpecMetadata

    const useCase = new UpdateSpecMetadata(generateMetadata, saveMetadata)

    const result = await useCase.execute({
      workspace: 'default',
      capabilityPath: 'test',
      payload: {
        optimizedDescription: 'AI Description',
        optimizedContext: 'AI Context',
      },
    })

    expect(generateMetadata.execute).toHaveBeenCalledWith({ specId: 'default:test' })
    expect(saveMetadata.execute).toHaveBeenCalledWith({
      workspace: 'default',
      specPath: expect.any(SpecPath),
      content: expect.stringContaining('"optimizedDescription":"AI Description"'),
      force: true,
    })

    const savedPayloadRaw = vi.mocked(saveMetadata.execute).mock.calls[0]?.[0].content
    expect(savedPayloadRaw).toBeDefined()
    const savedPayload = JSON.parse(savedPayloadRaw as string)
    expect(savedPayload).toMatchObject({
      title: 'Original Title',
      description: 'Original Description',
      optimizedDescription: 'AI Description',
      optimizedContext: 'AI Context',
      generatedBy: 'agent',
    })

    expect(result.spec).toBe('default:test')
  })
})
