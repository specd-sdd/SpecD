import { describe, it, expect } from 'vitest'
import { SaveSpecMetadata } from '../../../src/application/use-cases/save-spec-metadata.js'
import { MetadataValidationError } from '../../../src/domain/errors/metadata-validation-error.js'
import { DependsOnOverwriteError } from '../../../src/domain/errors/depends-on-overwrite-error.js'
import { WorkspaceNotFoundError } from '../../../src/application/errors/workspace-not-found-error.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository } from './helpers.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { NodeYamlSerializer } from '../../../src/infrastructure/node/yaml-serializer.js'

const VALID_HASH = 'sha256:' + 'a'.repeat(64)
const VALID_BASE = `title: 'Auth Login'\ndescription: 'Handles login'\ncontentHashes:\n  spec.md: '${VALID_HASH}'\n`

function makeUseCase(specs: Spec[] = [], artifacts: Record<string, string | null> = {}) {
  const repo = makeSpecRepository({ specs, artifacts })
  const uc = new SaveSpecMetadata(new Map([['default', repo]]), new NodeYamlSerializer())
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

  it('throws WorkspaceNotFoundError for unknown workspace', async () => {
    const { uc } = makeUseCase([spec])
    await expect(
      uc.execute({
        workspace: 'unknown',
        specPath,
        content: VALID_BASE,
        force: true,
      }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })
})

describe('SaveSpecMetadata — dependsOn overwrite protection', () => {
  const existingMetadata = [
    VALID_BASE,
    "dependsOn:\n  - 'core:config'\n  - 'core:schema-format'\n",
  ].join('')

  it('throws DependsOnOverwriteError when dependsOn entries are removed', async () => {
    const { uc } = makeUseCase([spec], {
      'auth/login/.specd-metadata.yaml': existingMetadata,
    })
    const incoming = VALID_BASE + "dependsOn:\n  - 'core:config'\n"
    await expect(uc.execute({ workspace: 'default', specPath, content: incoming })).rejects.toThrow(
      DependsOnOverwriteError,
    )
  })

  it('throws DependsOnOverwriteError when dependsOn entries are added', async () => {
    const { uc } = makeUseCase([spec], {
      'auth/login/.specd-metadata.yaml': existingMetadata,
    })
    const incoming =
      VALID_BASE + "dependsOn:\n  - 'core:config'\n  - 'core:schema-format'\n  - 'core:change'\n"
    await expect(uc.execute({ workspace: 'default', specPath, content: incoming })).rejects.toThrow(
      DependsOnOverwriteError,
    )
  })

  it('throws DependsOnOverwriteError when dependsOn entries are replaced', async () => {
    const { uc } = makeUseCase([spec], {
      'auth/login/.specd-metadata.yaml': existingMetadata,
    })
    const incoming = VALID_BASE + "dependsOn:\n  - 'core:change'\n  - 'core:schema-format'\n"
    await expect(uc.execute({ workspace: 'default', specPath, content: incoming })).rejects.toThrow(
      DependsOnOverwriteError,
    )
  })

  it('throws DependsOnOverwriteError when dependsOn is dropped entirely', async () => {
    const { uc } = makeUseCase([spec], {
      'auth/login/.specd-metadata.yaml': existingMetadata,
    })
    await expect(
      uc.execute({ workspace: 'default', specPath, content: VALID_BASE }),
    ).rejects.toThrow(DependsOnOverwriteError)
  })

  it('allows identical dependsOn in different order', async () => {
    const { uc } = makeUseCase([spec], {
      'auth/login/.specd-metadata.yaml': existingMetadata,
    })
    const incoming = VALID_BASE + "dependsOn:\n  - 'core:schema-format'\n  - 'core:config'\n"
    const result = await uc.execute({ workspace: 'default', specPath, content: incoming })
    expect(result).not.toBeNull()
    expect(result!.spec).toBe('default:auth/login')
  })

  it('allows dependsOn change when force is true', async () => {
    const { uc } = makeUseCase([spec], {
      'auth/login/.specd-metadata.yaml': existingMetadata,
    })
    const incoming = VALID_BASE + "dependsOn:\n  - 'core:change'\n"
    const result = await uc.execute({
      workspace: 'default',
      specPath,
      content: incoming,
      force: true,
    })
    expect(result).not.toBeNull()
    expect(result!.spec).toBe('default:auth/login')
  })

  it('allows save when no existing metadata exists', async () => {
    const { uc } = makeUseCase([spec])
    const incoming = VALID_BASE + "dependsOn:\n  - 'core:config'\n"
    const result = await uc.execute({ workspace: 'default', specPath, content: incoming })
    expect(result).not.toBeNull()
  })

  it('allows save when existing metadata has no dependsOn', async () => {
    const { uc } = makeUseCase([spec], {
      'auth/login/.specd-metadata.yaml': VALID_BASE,
    })
    const incoming = VALID_BASE + "dependsOn:\n  - 'core:config'\n"
    const result = await uc.execute({ workspace: 'default', specPath, content: incoming })
    expect(result).not.toBeNull()
  })

  it('includes removed and added entries in error message', async () => {
    const { uc } = makeUseCase([spec], {
      'auth/login/.specd-metadata.yaml': existingMetadata,
    })
    const incoming = VALID_BASE + "dependsOn:\n  - 'core:change'\n"
    try {
      await uc.execute({ workspace: 'default', specPath, content: incoming })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(DependsOnOverwriteError)
      const e = err as DependsOnOverwriteError
      expect(e.message).toContain('removed:')
      expect(e.message).toContain('added:')
      expect(e.message).toContain('--force')
      expect(e.existingDeps).toEqual(['core:config', 'core:schema-format'])
      expect(e.incomingDeps).toEqual(['core:change'])
    }
  })
})
