import { describe, it, expect } from 'vitest'
import { SaveSpecMetadata } from '../../../src/application/use-cases/save-spec-metadata.js'
import { MetadataValidationError } from '../../../src/domain/errors/metadata-validation-error.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository } from './helpers.js'
import { Spec } from '../../../src/domain/entities/spec.js'

function makeUseCase(specs: Spec[] = []) {
  const repo = makeSpecRepository({ specs })
  const uc = new SaveSpecMetadata(new Map([['default', repo]]))
  return { uc, repo }
}

const specPath = SpecPath.parse('auth/login')
const spec = new Spec('default', specPath, ['spec.md'])

describe('SaveSpecMetadata — write-time validation', () => {
  it('accepts valid metadata', async () => {
    const { uc } = makeUseCase([spec])
    const content = `title: 'Auth Login'\nkeywords:\n  - 'auth'\n`
    const result = await uc.execute({ workspace: 'default', specPath, content, force: true })
    expect(result).not.toBeNull()
    expect(result!.spec).toBe('default:auth/login')
  })

  it('accepts empty metadata', async () => {
    const { uc } = makeUseCase([spec])
    const result = await uc.execute({ workspace: 'default', specPath, content: '', force: true })
    expect(result).not.toBeNull()
  })

  it('accepts unknown top-level keys', async () => {
    const { uc } = makeUseCase([spec])
    const content = `customField: 'value'\ntitle: 'Test'\n`
    const result = await uc.execute({ workspace: 'default', specPath, content, force: true })
    expect(result).not.toBeNull()
  })

  it('rejects non-lowercase keywords', async () => {
    const { uc } = makeUseCase([spec])
    const content = `keywords:\n  - 'Valid'\n`
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects invalid spec ID in dependsOn', async () => {
    const { uc } = makeUseCase([spec])
    const content = `dependsOn:\n  - 'not a valid id!'\n`
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects invalid contentHashes format', async () => {
    const { uc } = makeUseCase([spec])
    const content = `contentHashes:\n  spec.md: 'md5:abc'\n`
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects rules with empty rules array', async () => {
    const { uc } = makeUseCase([spec])
    const content = `rules:\n  - requirement: 'Name'\n    rules: []\n`
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects scenarios missing when and then', async () => {
    const { uc } = makeUseCase([spec])
    const content = `scenarios:\n  - requirement: 'X'\n    name: 'Y'\n`
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('includes validation issues in error message', async () => {
    const { uc } = makeUseCase([spec])
    const content = `keywords:\n  - 123\n`
    try {
      await uc.execute({ workspace: 'default', specPath, content, force: true })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(MetadataValidationError)
      expect((err as MetadataValidationError).message).toContain('Metadata validation failed')
    }
  })

  it('returns null for unknown workspace (validation passes first)', async () => {
    const { uc } = makeUseCase([spec])
    const content = `title: 'Test'\n`
    const result = await uc.execute({ workspace: 'unknown', specPath, content, force: true })
    expect(result).toBeNull()
  })
})
