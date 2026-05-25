import { describe, it, expect, vi } from 'vitest'
import { ValidateChangeBatch } from '../../../src/application/use-cases/validate-change-batch.js'
import { ValidateArtifacts } from '../../../src/application/use-cases/validate-artifacts.js'
import { ArtifactType } from '../../../src/domain/value-objects/artifact-type.js'
import {
  makeChange,
  makeChangeRepository,
  makeSchema,
  makeSchemaProvider,
} from './helpers.js'

function emptyValidateResult() {
  return { passed: true, failures: [], warnings: [], files: [] }
}

describe('ValidateChangeBatch', () => {
  it('returns empty result when change has no specIds', async () => {
    const change = makeChange('feat', { specIds: [] })
    const repo = makeChangeRepository([change])
    const validateArtifacts = { execute: vi.fn() } as unknown as ValidateArtifacts
    const uc = new ValidateChangeBatch(repo, makeSchemaProvider(makeSchema([])), validateArtifacts)

    const result = await uc.execute({ name: 'feat' })

    expect(result).toEqual({ passed: true, total: 0, results: [] })
    expect(validateArtifacts.execute).not.toHaveBeenCalled()
  })

  it('validates change-scoped artifact once without specPath', async () => {
    const change = makeChange('feat', { specIds: ['default:a', 'default:b'] })
    const schema = makeSchema([
      new ArtifactType({
        id: 'proposal',
        scope: 'change',
        output: 'proposal.md',
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      }),
      new ArtifactType({
        id: 'specs',
        scope: 'spec',
        output: 'spec.md',
        requires: ['proposal'],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      }),
    ])
    const execute = vi.fn().mockResolvedValue(emptyValidateResult())
    const validateArtifacts = { execute } as unknown as ValidateArtifacts
    const uc = new ValidateChangeBatch(
      makeChangeRepository([change]),
      makeSchemaProvider(schema),
      validateArtifacts,
    )

    await uc.execute({ name: 'feat' })

    expect(execute).toHaveBeenCalledWith({ name: 'feat', artifactId: 'proposal' })
    const proposalCall = execute.mock.calls.find((call) => call[0]?.artifactId === 'proposal')
    expect(proposalCall?.[0]).not.toHaveProperty('specPath')
  })

  it('validates spec-scoped artifact once per specId', async () => {
    const change = makeChange('feat', { specIds: ['default:a', 'default:b'] })
    const schema = makeSchema([
      new ArtifactType({
        id: 'specs',
        scope: 'spec',
        output: 'spec.md',
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      }),
    ])
    const execute = vi.fn().mockResolvedValue(emptyValidateResult())
    const validateArtifacts = { execute } as unknown as ValidateArtifacts
    const uc = new ValidateChangeBatch(
      makeChangeRepository([change]),
      makeSchemaProvider(schema),
      validateArtifacts,
    )

    const result = await uc.execute({ name: 'feat', artifactId: 'specs' })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledWith({
      name: 'feat',
      specPath: 'default:a',
      artifactId: 'specs',
    })
    expect(execute).toHaveBeenCalledWith({
      name: 'feat',
      specPath: 'default:b',
      artifactId: 'specs',
    })
    expect(result.total).toBe(2)
    expect(result.passed).toBe(true)
  })

  it('aggregates failures without aborting early', async () => {
    const change = makeChange('feat', { specIds: ['default:a', 'default:b'] })
    const schema = makeSchema([
      new ArtifactType({
        id: 'specs',
        scope: 'spec',
        output: 'spec.md',
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      }),
    ])
    const execute = vi
      .fn()
      .mockResolvedValueOnce(emptyValidateResult())
      .mockResolvedValueOnce({
        passed: false,
        failures: [{ artifactId: 'specs', description: 'missing delta' }],
        warnings: [],
        files: [],
      })
    const validateArtifacts = { execute } as unknown as ValidateArtifacts
    const uc = new ValidateChangeBatch(
      makeChangeRepository([change]),
      makeSchemaProvider(schema),
      validateArtifacts,
    )

    const result = await uc.execute({ name: 'feat', artifactId: 'specs' })

    expect(result.passed).toBe(false)
    expect(result.total).toBe(2)
    expect(result.results[0]?.passed).toBe(true)
    expect(result.results[1]?.passed).toBe(false)
  })
})
