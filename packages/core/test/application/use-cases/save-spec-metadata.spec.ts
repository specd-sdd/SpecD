import { describe, it, expect } from 'vitest'
import { SaveSpecMetadata } from '../../../src/application/use-cases/save-spec-metadata.js'
import { MetadataValidationError } from '../../../src/domain/errors/metadata-validation-error.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository } from './helpers.js'
import { Spec } from '../../../src/domain/entities/spec.js'

const VALID_HASH = 'sha256:' + 'a'.repeat(64)
const VALID_BASE = `title: 'Auth Login'\ndescription: 'Handles login'\ncontentHashes:\n  spec.md: '${VALID_HASH}'\n`

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
    const content = VALID_BASE + "keywords:\n  - 'auth'\n"
    const result = await uc.execute({ workspace: 'default', specPath, content, force: true })
    expect(result).not.toBeNull()
    expect(result!.spec).toBe('default:auth/login')
  })

  it('rejects empty content', async () => {
    const { uc } = makeUseCase([spec])
    await expect(
      uc.execute({ workspace: 'default', specPath, content: '', force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects content missing title', async () => {
    const { uc } = makeUseCase([spec])
    const content = "description: 'Some description'\n"
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects content missing description', async () => {
    const { uc } = makeUseCase([spec])
    const content = "title: 'Test'\n"
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('accepts unknown top-level keys', async () => {
    const { uc } = makeUseCase([spec])
    const content = VALID_BASE + "customField: 'value'\n"
    const result = await uc.execute({ workspace: 'default', specPath, content, force: true })
    expect(result).not.toBeNull()
  })

  it('rejects non-lowercase keywords', async () => {
    const { uc } = makeUseCase([spec])
    const content = VALID_BASE + "keywords:\n  - 'Valid'\n"
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects invalid spec ID in dependsOn', async () => {
    const { uc } = makeUseCase([spec])
    const content = VALID_BASE + "dependsOn:\n  - 'not a valid id!'\n"
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects invalid contentHashes format', async () => {
    const { uc } = makeUseCase([spec])
    const content =
      "title: 'Auth Login'\ndescription: 'Handles login'\ncontentHashes:\n  spec.md: 'md5:abc'\n"
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects rules with empty rules array', async () => {
    const { uc } = makeUseCase([spec])
    const content = VALID_BASE + "rules:\n  - requirement: 'Name'\n    rules: []\n"
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('rejects scenarios missing when and then', async () => {
    const { uc } = makeUseCase([spec])
    const content = VALID_BASE + "scenarios:\n  - requirement: 'X'\n    name: 'Y'\n"
    await expect(
      uc.execute({ workspace: 'default', specPath, content, force: true }),
    ).rejects.toThrow(MetadataValidationError)
  })

  it('includes validation issues in error message', async () => {
    const { uc } = makeUseCase([spec])
    const content = 'keywords:\n  - 123\n'
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
    const result = await uc.execute({
      workspace: 'unknown',
      specPath,
      content: VALID_BASE,
      force: true,
    })
    expect(result).toBeNull()
  })
})
