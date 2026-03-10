import { describe, it, expect } from 'vitest'
import { ValidateSpecs } from '../../../src/application/use-cases/validate-specs.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import {
  makeSpecRepository,
  makeSchemaRegistry,
  makeArtifactType,
  makeSchema,
  makeParsers,
} from './helpers.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ValidateSpecs', () => {
  it('validates all specs across workspaces', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    const spec1 = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const spec2 = new Spec('billing', SpecPath.parse('payments'), ['spec.md'])

    const repo1 = makeSpecRepository({
      specs: [spec1],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const repo2 = makeSpecRepository({
      specs: [spec2],
      artifacts: { 'payments/spec.md': '# Payments' },
    })

    const specRepos = new Map([
      ['default', repo1],
      ['billing', repo2],
    ])

    const uc = new ValidateSpecs(
      specRepos,
      makeSchemaRegistry(schema),
      makeParsers(),
      'test',
      new Map(),
    )
    const result = await uc.execute({})

    expect(result.totalSpecs).toBe(2)
    expect(result.entries).toHaveLength(2)
    expect(result.passed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('throws SchemaNotFoundError when schema not resolved', async () => {
    const specRepos = new Map([['default', makeSpecRepository()]])

    const uc = new ValidateSpecs(
      specRepos,
      makeSchemaRegistry(null),
      makeParsers(),
      'missing-schema',
      new Map(),
    )

    await expect(uc.execute({})).rejects.toThrow(SchemaNotFoundError)
  })

  it('reports passed for specs with valid artifacts', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login Spec' },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(
      specRepos,
      makeSchemaRegistry(schema),
      makeParsers(),
      'test',
      new Map(),
    )
    const result = await uc.execute({})

    expect(result.entries[0]!.passed).toBe(true)
    expect(result.entries[0]!.failures).toEqual([])
    expect(result.passed).toBe(1)
  })

  it('reports failed for specs with missing required artifacts', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    // Spec directory exists but does NOT contain spec.md
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['readme.md'])
    const repo = makeSpecRepository({ specs: [spec] })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(
      specRepos,
      makeSchemaRegistry(schema),
      makeParsers(),
      'test',
      new Map(),
    )
    const result = await uc.execute({})

    expect(result.entries[0]!.passed).toBe(false)
    expect(result.entries[0]!.failures).toHaveLength(1)
    expect(result.entries[0]!.failures[0]!.artifactId).toBe('specs')
    expect(result.failed).toBe(1)
  })

  it('returns empty entries when workspace not found', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])
    const specRepos = new Map([['default', makeSpecRepository()]])

    const uc = new ValidateSpecs(
      specRepos,
      makeSchemaRegistry(schema),
      makeParsers(),
      'test',
      new Map(),
    )
    const result = await uc.execute({
      workspace: 'nonexistent',
    })

    expect(result.entries).toEqual([])
    expect(result.totalSpecs).toBe(0)
    expect(result.passed).toBe(0)
    expect(result.failed).toBe(0)
  })
})
