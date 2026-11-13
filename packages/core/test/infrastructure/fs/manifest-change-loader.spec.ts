import { describe, expect, it } from 'vitest'
import { loadChangeFromManifest } from '../../../src/infrastructure/fs/manifest-change-loader.js'
import { type ChangeManifest } from '../../../src/infrastructure/fs/manifest.js'
import { CorruptedManifestError } from '../../../src/domain/errors/corrupted-manifest-error.js'

function baseManifest(overrides: Partial<ChangeManifest> = {}): ChangeManifest {
  return {
    name: 'test-change',
    createdAt: '2024-01-01T00:00:00.000Z',
    schema: { name: 'schema-std', version: 1 },
    specIds: ['default:auth/login'],
    artifacts: [],
    history: [
      {
        type: 'created',
        at: '2024-01-01T00:00:00.000Z',
        by: { name: 'tester', email: 'tester@example.com' },
        specIds: ['default:auth/login'],
        schemaName: 'schema-std',
        schemaVersion: 1,
      },
    ],
    ...overrides,
  }
}

describe('loadChangeFromManifest', () => {
  it('loads a manifest with fully qualified specIds', () => {
    const change = loadChangeFromManifest(baseManifest())
    expect(change.specIds).toEqual(['default:auth/login'])
  })

  it('throws CorruptedManifestError when specIds contains an empty string', () => {
    expect(() => loadChangeFromManifest(baseManifest({ specIds: [''] }))).toThrow(
      CorruptedManifestError,
    )
    try {
      loadChangeFromManifest(baseManifest({ specIds: [''] }))
    } catch (err) {
      expect(err).toBeInstanceOf(CorruptedManifestError)
      expect((err as CorruptedManifestError).message).toContain("''")
      expect((err as CorruptedManifestError).message).toContain('specIds.0')
    }
  })
})
