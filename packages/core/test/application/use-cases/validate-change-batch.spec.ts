import { describe, it, expect, vi } from 'vitest'
import { ValidateChangeBatch } from '../../../src/application/use-cases/validate-change-batch.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { type ValidateArtifacts } from '../../../src/application/use-cases/validate-artifacts.js'
import {
  makeChange,
  StubChangeRepository,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
} from './helpers.js'

describe('ValidateChangeBatch', () => {
  it('instantiates correctly with dependencies', () => {
    const repo = new StubChangeRepository()
    const schemaProvider = makeSchemaProvider(makeSchema([]))
    const validateArtifacts = { execute: vi.fn() } as unknown as ValidateArtifacts

    const useCase = new ValidateChangeBatch(repo, schemaProvider, validateArtifacts)
    expect(useCase).toBeInstanceOf(ValidateChangeBatch)
  })

  it('throws ChangeNotFoundError when change does not exist', async () => {
    const repo = new StubChangeRepository()
    const schemaProvider = makeSchemaProvider(makeSchema([]))
    const validateArtifacts = { execute: vi.fn() } as unknown as ValidateArtifacts

    const useCase = new ValidateChangeBatch(repo, schemaProvider, validateArtifacts)
    await expect(useCase.execute({ name: 'missing-change' })).rejects.toThrow(ChangeNotFoundError)
    expect(validateArtifacts.execute).not.toHaveBeenCalled()
  })

  it('throws SchemaMismatchError when change schema does not match active schema', async () => {
    const change = makeChange('test-change', { specIds: ['default:auth/login'] }, 'schema-a')
    const repo = new StubChangeRepository([change])
    const schema = makeSchema([], [], { name: 'schema-b' })
    const schemaProvider = makeSchemaProvider(schema)
    const validateArtifacts = { execute: vi.fn() } as unknown as ValidateArtifacts

    const useCase = new ValidateChangeBatch(repo, schemaProvider, validateArtifacts)
    await expect(useCase.execute({ name: 'test-change' })).rejects.toThrow(SchemaMismatchError)
    expect(validateArtifacts.execute).not.toHaveBeenCalled()
  })

  it('returns empty result immediately when change has no specIds', async () => {
    const change = makeChange('test-change', { specIds: [] }, 'test-schema')
    const repo = new StubChangeRepository([change])
    const schema = makeSchema([makeArtifactType('proposal', { scope: 'change' })], [], {
      name: 'test-schema',
    })
    const schemaProvider = makeSchemaProvider(schema)
    const validateArtifacts = { execute: vi.fn() } as unknown as ValidateArtifacts

    const useCase = new ValidateChangeBatch(repo, schemaProvider, validateArtifacts)
    const result = await useCase.execute({ name: 'test-change' })

    expect(result).toEqual({ passed: true, total: 0, results: [] })
    expect(validateArtifacts.execute).not.toHaveBeenCalled()
  })

  it('walks DAG in topological order: change-scoped once, spec-scoped once per specId', async () => {
    const change = makeChange(
      'test-change',
      { specIds: ['default:auth/login', 'default:auth/logout'] },
      'test-schema',
    )
    const repo = new StubChangeRepository([change])
    const proposal = makeArtifactType('proposal', { scope: 'change', requires: [] })
    const specs = makeArtifactType('specs', { scope: 'spec', requires: ['proposal'] })
    const schema = makeSchema([proposal, specs], [], { name: 'test-schema' })
    const schemaProvider = makeSchemaProvider(schema)

    const executeMock = vi
      .fn()
      .mockImplementation(async (input: { artifactId: string; specPath?: string }) => ({
        failures: [],
        warnings: [],
        files: [
          {
            artifactId: input.artifactId,
            key: input.specPath ?? input.artifactId,
            filename: `${input.artifactId}.md`,
            status: 'validated' as const,
          },
        ],
      }))
    const validateArtifacts = { execute: executeMock } as unknown as ValidateArtifacts

    const useCase = new ValidateChangeBatch(repo, schemaProvider, validateArtifacts)
    const result = await useCase.execute({ name: 'test-change' })

    expect(result.passed).toBe(true)
    expect(result.total).toBe(3)
    expect(result.results).toHaveLength(3)

    // Call 1: proposal (change-scoped, no specPath)
    expect(executeMock).toHaveBeenNthCalledWith(1, {
      name: 'test-change',
      artifactId: 'proposal',
    })
    expect(result.results[0]).toMatchObject({
      spec: null,
      artifact: 'proposal',
      passed: true,
      failures: [],
      warnings: [],
    })

    // Call 2: specs for default:auth/login
    expect(executeMock).toHaveBeenNthCalledWith(2, {
      name: 'test-change',
      specPath: 'default:auth/login',
      artifactId: 'specs',
    })
    expect(result.results[1]).toMatchObject({
      spec: 'default:auth/login',
      artifact: 'specs',
      passed: true,
      failures: [],
      warnings: [],
    })

    // Call 3: specs for default:auth/logout
    expect(executeMock).toHaveBeenNthCalledWith(3, {
      name: 'test-change',
      specPath: 'default:auth/logout',
      artifactId: 'specs',
    })
    expect(result.results[2]).toMatchObject({
      spec: 'default:auth/logout',
      artifact: 'specs',
      passed: true,
      failures: [],
      warnings: [],
    })
  })

  it('filters by artifactId when specified', async () => {
    const change = makeChange(
      'test-change',
      { specIds: ['default:auth/login', 'default:auth/logout'] },
      'test-schema',
    )
    const repo = new StubChangeRepository([change])
    const proposal = makeArtifactType('proposal', { scope: 'change', requires: [] })
    const specs = makeArtifactType('specs', { scope: 'spec', requires: ['proposal'] })
    const schema = makeSchema([proposal, specs], [], { name: 'test-schema' })
    const schemaProvider = makeSchemaProvider(schema)

    const executeMock = vi.fn().mockResolvedValue({ failures: [], warnings: [], files: [] })
    const validateArtifacts = { execute: executeMock } as unknown as ValidateArtifacts

    const useCase = new ValidateChangeBatch(repo, schemaProvider, validateArtifacts)
    const result = await useCase.execute({ name: 'test-change', artifactId: 'proposal' })

    expect(result.passed).toBe(true)
    expect(result.total).toBe(1)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.artifact).toBe('proposal')
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledWith({
      name: 'test-change',
      artifactId: 'proposal',
    })
  })

  it('runs all steps without early abort on failure and aggregates outcomes', async () => {
    const change = makeChange(
      'test-change',
      { specIds: ['default:auth/login', 'default:auth/logout'] },
      'test-schema',
    )
    const repo = new StubChangeRepository([change])
    const proposal = makeArtifactType('proposal', { scope: 'change', requires: [] })
    const specs = makeArtifactType('specs', { scope: 'spec', requires: ['proposal'] })
    const schema = makeSchema([proposal, specs], [], { name: 'test-schema' })
    const schemaProvider = makeSchemaProvider(schema)

    const executeMock = vi
      .fn()
      .mockResolvedValueOnce({
        failures: [{ artifactId: 'proposal', description: 'proposal invalid' }],
        warnings: [{ artifactId: 'proposal', description: 'check syntax' }],
        files: [],
      })
      .mockResolvedValueOnce({
        failures: [],
        warnings: [],
        files: [],
      })
      .mockResolvedValueOnce({
        failures: [{ artifactId: 'specs', description: 'delta conflict' }],
        warnings: [],
        files: [],
      })
    const validateArtifacts = { execute: executeMock } as unknown as ValidateArtifacts

    const useCase = new ValidateChangeBatch(repo, schemaProvider, validateArtifacts)
    const result = await useCase.execute({ name: 'test-change' })

    expect(result.passed).toBe(false)
    expect(result.total).toBe(3)
    expect(executeMock).toHaveBeenCalledTimes(3)
    expect(result.results[0]?.passed).toBe(false)
    expect(result.results[0]?.failures).toEqual([
      { artifactId: 'proposal', description: 'proposal invalid' },
    ])
    expect(result.results[0]?.warnings).toEqual([
      { artifactId: 'proposal', description: 'check syntax' },
    ])
    expect(result.results[1]?.passed).toBe(true)
    expect(result.results[2]?.passed).toBe(false)
    expect(result.results[2]?.failures).toEqual([
      { artifactId: 'specs', description: 'delta conflict' },
    ])
  })
})
