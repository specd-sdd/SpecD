import { describe, expect, it, vi } from 'vitest'
import { MaterializeSpecMetadata } from '../../../src/application/use-cases/materialize-spec-metadata.js'
import { PersistSpecMetadata } from '../../../src/application/use-cases/persist-spec-metadata.js'
import { METADATA_PROJECTION_VERSION } from '../../../src/domain/services/metadata-projection.js'
import { type SpecMetadata } from '../../../src/domain/services/parse-metadata.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { makeContentHasher, makeSpecRepository } from './helpers.js'

function sampleMetadata(overrides: Partial<SpecMetadata> = {}): SpecMetadata {
  return {
    title: 'Auth',
    description: 'Authentication spec',
    contentHashes: { 'spec.md': 'sha256:' + 'a'.repeat(64) },
    provenance: {
      artifacts: { 'spec.md': { hash: 'abc', lastModified: '2020-01-01T00:00:00.000Z' } },
      persistedStateHash: null,
      schema: { name: 'std', version: 1 },
      projectionVersion: METADATA_PROJECTION_VERSION,
      projectionFingerprint: 'fp-test',
    },
    ...overrides,
  }
}

describe('MaterializeSpecMetadata', () => {
  it('reuses fresh persisted metadata on if-needed policy', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const metadata = sampleMetadata()
    await repo.writeMetadataSnapshot(spec, metadata, { expectedRevision: null })

    const generate = {
      execute: vi.fn(async () => ({ metadata, sourceState: metadata.provenance })),
    }
    const useCase = new MaterializeSpecMetadata(
      new Map([['default', repo]]),
      generate as never,
      makeContentHasher(),
    )

    const result = await useCase.execute({ specId: 'default:auth/login', policy: 'if-needed' })
    expect(result.source).toBe('persisted')
    expect(result.regenerated).toBe(false)
    expect(generate.execute).toHaveBeenCalledTimes(1)
  })

  it('regenerates when cache is missing', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const metadata = sampleMetadata({ title: 'Regenerated' })
    const generate = {
      execute: vi.fn(async () => ({
        metadata,
        sourceState: metadata.provenance,
      })),
    }
    const useCase = new MaterializeSpecMetadata(
      new Map([['default', repo]]),
      generate as never,
      makeContentHasher(),
    )

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.source).toBe('generated')
    expect(result.regenerated).toBe(true)
    expect(result.metadata.title).toBe('Regenerated')
  })

  it('swallows cache-write failures on if-needed policy', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const metadata = sampleMetadata()
    const generate = {
      execute: vi.fn(async () => ({
        metadata,
        sourceState: metadata.provenance,
      })),
    }
    vi.spyOn(repo, 'writeMetadataSnapshot').mockRejectedValue(new Error('disk full'))
    const useCase = new MaterializeSpecMetadata(
      new Map([['default', repo]]),
      generate as never,
      makeContentHasher(),
    )

    const result = await useCase.execute({ specId: 'default:auth/login', policy: 'if-needed' })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.kind).toBe('metadata-cache-write-failed')
  })

  it('fails on force policy when cache write fails', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const metadata = sampleMetadata()
    const generate = {
      execute: vi.fn(async () => ({
        metadata,
        sourceState: metadata.provenance,
      })),
    }
    vi.spyOn(repo, 'writeMetadataSnapshot').mockRejectedValue(new Error('disk full'))
    const useCase = new MaterializeSpecMetadata(
      new Map([['default', repo]]),
      generate as never,
      makeContentHasher(),
    )

    await expect(
      useCase.execute({ specId: 'default:auth/login', policy: 'force' }),
    ).rejects.toThrow('disk full')
  })
})

describe('PersistSpecMetadata', () => {
  it('rejects invalid metadata before writing', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new PersistSpecMetadata(repo)

    await expect(
      useCase.execute({
        spec,
        metadata: { provenance: {} } as never,
        expectedRevision: null,
      }),
    ).rejects.toThrow(/metadata/i)
  })
})
