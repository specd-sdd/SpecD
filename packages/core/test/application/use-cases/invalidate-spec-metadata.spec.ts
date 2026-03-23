import { describe, it, expect } from 'vitest'
import { InvalidateSpecMetadata } from '../../../src/application/use-cases/invalidate-spec-metadata.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository } from './helpers.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { WorkspaceNotFoundError } from '../../../src/application/errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'

const specPath = SpecPath.parse('auth/login')
const spec = new Spec('default', specPath, ['spec.md'])

const METADATA_WITH_HASHES = JSON.stringify({
  title: 'Auth Login',
  description: 'Handles login',
  contentHashes: { 'spec.md': 'sha256:' + 'a'.repeat(64) },
  keywords: ['auth'],
})

const METADATA_WITHOUT_HASHES = JSON.stringify({
  title: 'Auth Login',
  description: 'Handles login',
})

function makeUseCase(opts: { specs?: Spec[]; artifacts?: Record<string, string | null> } = {}) {
  const repo = makeSpecRepository(opts)
  const uc = new InvalidateSpecMetadata(new Map([['default', repo]]))
  return { uc, repo }
}

describe('InvalidateSpecMetadata', () => {
  it('removes contentHashes from existing metadata', async () => {
    const { uc, repo } = makeUseCase({
      specs: [spec],
      artifacts: { 'auth/login/.specd-metadata.yaml': METADATA_WITH_HASHES },
    })

    const result = await uc.execute({ workspace: 'default', specPath })

    expect(result).not.toBeNull()
    expect(result!.spec).toBe('default:auth/login')

    const written = repo.saved.get('.specd-metadata.yaml')
    expect(written).toBeDefined()
    expect(written).not.toContain('contentHashes')
    expect(written).toContain('title')
    expect(written).toContain('keywords')
  })

  it('preserves other fields when removing contentHashes', async () => {
    const { uc, repo } = makeUseCase({
      specs: [spec],
      artifacts: { 'auth/login/.specd-metadata.yaml': METADATA_WITH_HASHES },
    })

    await uc.execute({ workspace: 'default', specPath })

    const written = repo.saved.get('.specd-metadata.yaml')!
    expect(written).toContain('Auth Login')
    expect(written).toContain('auth')
  })

  it('returns result even when metadata has no contentHashes', async () => {
    const { uc } = makeUseCase({
      specs: [spec],
      artifacts: { 'auth/login/.specd-metadata.yaml': METADATA_WITHOUT_HASHES },
    })

    const result = await uc.execute({ workspace: 'default', specPath })
    expect(result).not.toBeNull()
    expect(result!.spec).toBe('default:auth/login')
  })

  it('throws WorkspaceNotFoundError for unknown workspace', async () => {
    const { uc } = makeUseCase({ specs: [spec] })

    await expect(uc.execute({ workspace: 'unknown', specPath })).rejects.toThrow(
      WorkspaceNotFoundError,
    )
  })

  it('throws SpecNotFoundError for unknown spec', async () => {
    const { uc } = makeUseCase({ specs: [] })

    await expect(uc.execute({ workspace: 'default', specPath })).rejects.toThrow(SpecNotFoundError)
  })

  it('returns null when no metadata file exists', async () => {
    const { uc } = makeUseCase({ specs: [spec], artifacts: {} })

    const result = await uc.execute({ workspace: 'default', specPath })
    expect(result).toBeNull()
  })

  it('returns null for non-mapping content', async () => {
    const { uc } = makeUseCase({
      specs: [spec],
      artifacts: { 'auth/login/.specd-metadata.yaml': '"just a string"' },
    })

    const result = await uc.execute({ workspace: 'default', specPath })
    expect(result).toBeNull()
  })
})
