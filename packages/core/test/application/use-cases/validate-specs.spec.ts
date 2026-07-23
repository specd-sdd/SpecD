import { describe, it, expect } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'
import { ValidateSpecs } from '../../../src/application/use-cases/validate-specs.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { WorkspaceNotFoundError } from '../../../src/application/errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import {
  makeSpecRepository,
  makeSchemaProvider,
  makeArtifactType,
  makeSchema,
  makeParsers,
  makeParser,
  makeContentHasher,
} from './helpers.js'
import {
  ValidationResultCache,
  type SpecValidationEntry,
  type ValidationCacheLookupResult,
} from '../../../src/application/ports/validation-result-cache.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import {
  stampsFromSpec,
  type ValidationStoredStamps,
} from '../../../src/infrastructure/fs/fs-validation-result-cache.js'
import {
  computeSchemaFingerprintFromSchema,
  computeCacheFingerprint,
  VALIDATE_SPECS_ENGINE_VERSION,
} from '../../../src/application/use-cases/_shared/validate-specs-cache-fingerprints.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import { resolveValidateSpecsDeps } from '../../../src/composition/use-cases/validate-specs.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'

class InMemoryValidationResultCache extends ValidationResultCache {
  readonly upserts: Array<{
    readonly entry: SpecValidationEntry
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }> = []
  private readonly _rows = new Map<
    string,
    {
      readonly entry: SpecValidationEntry
      readonly stamps: ValidationStoredStamps
      readonly cacheFingerprint: string
    }
  >()
  private readonly _schemaFingerprint: string
  private readonly _engineVersion: number
  private readonly _hasher: (content: string) => string

  constructor(
    specRepository: SpecRepository,
    schemaFingerprint: string,
    engineVersion: number,
    hasher: (content: string) => string,
  ) {
    super(specRepository)
    this._schemaFingerprint = schemaFingerprint
    this._engineVersion = engineVersion
    this._hasher = hasher
  }

  workspace(): string {
    return this.specRepository.workspace()
  }

  seed(
    specId: string,
    entry: SpecValidationEntry,
    stamps: ValidationStoredStamps,
    cacheFingerprint: string,
  ): void {
    this._rows.set(specId, { entry, stamps, cacheFingerprint })
  }

  async lookup(input: {
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<ValidationCacheLookupResult> {
    if (
      input.schemaFingerprint !== this._schemaFingerprint ||
      input.engineVersion !== this._engineVersion
    ) {
      return { kind: 'miss' }
    }
    const specId = `${input.spec.workspace}:${input.spec.name.toFsPath('/')}`
    const row = this._rows.get(specId)
    if (row === undefined) return { kind: 'miss' }

    const currentStamps = stampsFromSpec(input.spec)
    if (JSON.stringify(row.stamps) === JSON.stringify(currentStamps)) {
      return { kind: 'hit', entry: row.entry }
    }

    const cacheFingerprint = await this._computeCacheFingerprint(input.spec)
    if (row.cacheFingerprint === cacheFingerprint) {
      this._rows.set(specId, { ...row, stamps: currentStamps })
      return { kind: 'hit', entry: row.entry }
    }

    return { kind: 'miss' }
  }

  async upsert(input: {
    readonly entry: SpecValidationEntry
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<void> {
    const cacheFingerprint = await this._computeCacheFingerprint(input.spec)
    this._rows.set(input.entry.spec, {
      entry: input.entry,
      stamps: stampsFromSpec(input.spec),
      cacheFingerprint,
    })
    this.upserts.push(input)
  }

  private async _computeCacheFingerprint(spec: Spec): Promise<string> {
    const specFingerprint = await this.specRepository.specFingerprint(spec)
    return computeCacheFingerprint({ specFingerprint, metadataContentHash: null }, this._hasher)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ValidateSpecs', () => {
  it('validates all specs across workspaces', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    const spec1 = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const spec2 = makeSpec({ workspace: 'billing', name: 'payments', filenames: ['spec.md'] })

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

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({})

    expect(result.totalSpecs).toBe(2)
    expect(result.entries).toHaveLength(2)
    expect(result.passed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('throws SchemaNotFoundError when schema not resolved', async () => {
    const specRepos = new Map([['default', makeSpecRepository()]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(null), makeParsers())

    await expect(uc.execute({})).rejects.toThrow(SchemaNotFoundError)
  })

  it('reports passed for specs with valid artifacts', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login Spec' },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({})

    expect(result.entries[0]!.passed).toBe(true)
    expect(result.entries[0]!.failures).toEqual([])
    expect(result.passed).toBe(1)
  })

  it('reports failed for specs with missing required artifacts', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    // Spec directory exists but does NOT contain spec.md
    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['readme.md'] })
    const repo = makeSpecRepository({ specs: [spec] })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({})

    expect(result.entries[0]!.passed).toBe(false)
    expect(result.entries[0]!.failures).toHaveLength(1)
    expect(result.entries[0]!.failures[0]!.artifactId).toBe('specs')
    expect(result.failed).toBe(1)
  })

  it('throws WorkspaceNotFoundError when workspace not found', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])
    const specRepos = new Map([['default', makeSpecRepository()]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    await expect(
      uc.execute({
        workspace: 'nonexistent',
      }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })

  it('records cross-artifact mismatch as failure for a spec entry', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const verifyType = makeArtifactType('verify', { scope: 'spec', output: 'verify.md' })
    const schema = makeSchema({
      artifacts: [specType, verifyType],
      crossArtifactValidations: [
        {
          id: 'mirrored-requirements',
          scope: 'spec',
          participants: [
            {
              artifact: 'specs',
              as: 'specRequirements',
              selector: { type: 'section', matches: '^Requirement:' },
              key: { from: 'label' },
            },
            {
              artifact: 'verify',
              as: 'verifyRequirements',
              selector: { type: 'section', matches: '^Requirement:' },
              key: { from: 'label' },
            },
          ],
          relation: {
            kind: 'all-equal',
            between: ['specRequirements', 'verifyRequirements'],
          },
        },
      ],
    })

    const spec = makeSpec({
      workspace: 'default',
      name: 'auth/login',
      filenames: ['spec.md', 'verify.md'],
    })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': 'Requirement: A',
        'auth/login/verify.md': 'Requirement: B',
      },
    })
    const parser = makeParser({
      parse(content: string) {
        return {
          root: {
            type: 'document',
            children: content
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
              .map((line) => ({ type: 'section', label: line })),
          },
        }
      },
    })
    const uc = new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(parser, makeParser()),
    )

    const result = await uc.execute({})
    expect(result.failed).toBe(1)
    expect(
      result.entries[0]?.failures.some((failure) =>
        failure.description.includes("Cross-artifact rule 'mirrored-requirements' failed"),
      ),
    ).toBe(true)
  })

  it('adds deferred warning when one cross-artifact participant is not locally ready', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      validations: [
        { id: 'must-have-requirements', selector: { type: 'section', matches: '^Requirements$' } },
      ],
    })
    const verifyType = makeArtifactType('verify', { scope: 'spec', output: 'verify.md' })
    const schema = makeSchema({
      artifacts: [specType, verifyType],
      crossArtifactValidations: [
        {
          id: 'mirrored-requirements',
          scope: 'spec',
          participants: [
            {
              artifact: 'specs',
              as: 'specRequirements',
              selector: { type: 'section', matches: '^Requirement:' },
              key: { from: 'label' },
            },
            {
              artifact: 'verify',
              as: 'verifyRequirements',
              selector: { type: 'section', matches: '^Requirement:' },
              key: { from: 'label' },
            },
          ],
          relation: {
            kind: 'all-equal',
            between: ['specRequirements', 'verifyRequirements'],
          },
        },
      ],
    })

    const spec = makeSpec({
      workspace: 'default',
      name: 'auth/login',
      filenames: ['spec.md', 'verify.md'],
    })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': 'Requirement: A',
        'auth/login/verify.md': 'Requirement: A',
      },
    })
    const parser = makeParser({
      parse(content: string) {
        return {
          root: {
            type: 'document',
            children: content
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
              .map((line) => ({ type: 'section', label: line })),
          },
        }
      },
    })
    const uc = new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(parser, makeParser()),
    )

    const result = await uc.execute({})
    expect(
      result.entries[0]?.warnings.some((warning) =>
        warning.description.includes("Deferred cross-artifact rule 'mirrored-requirements'"),
      ),
    ).toBe(true)
  })

  it('validates a single spec by qualified path', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({ specPath: 'default:auth/login' })

    expect(result.totalSpecs).toBe(1)
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('throws WorkspaceNotFoundError for unknown workspace in specPath', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])
    const specRepos = new Map([['default', makeSpecRepository()]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    await expect(uc.execute({ specPath: 'nonexistent:auth/login' })).rejects.toThrow(
      WorkspaceNotFoundError,
    )
  })

  it('throws SpecNotFoundError when spec not found in workspace', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])
    const specRepos = new Map([['default', makeSpecRepository()]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    await expect(uc.execute({ specPath: 'default:nonexistent' })).rejects.toThrow(SpecNotFoundError)
  })

  it('excludes change-scoped artifacts from validation', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const changeType = makeArtifactType('design', { scope: 'change', output: 'design.md' })
    const schema = makeSchema([specType, changeType])

    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({})

    expect(result.passed).toBe(1)
    expect(result.entries[0]!.failures).toEqual([])
  })

  it('skips missing optional artifacts silently', async () => {
    const requiredType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const optionalType = makeArtifactType('verify', {
      scope: 'spec',
      output: 'verify.md',
      optional: true,
    })
    const schema = makeSchema([requiredType, optionalType])

    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({})

    expect(result.passed).toBe(1)
    expect(result.entries[0]!.failures).toEqual([])
  })

  it('validates all specs in a workspace', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    const spec1 = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const spec2 = makeSpec({ workspace: 'default', name: 'auth/logout', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec1, spec2],
      artifacts: {
        'auth/login/spec.md': '# Auth Login',
        'auth/logout/spec.md': '# Auth Logout',
      },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({ workspace: 'default' })

    expect(result.totalSpecs).toBe(2)
    expect(result.passed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('reports mixed pass/fail counts correctly', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])

    const goodSpec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const badSpec = makeSpec({
      workspace: 'default',
      name: 'auth/missing',
      filenames: ['other.md'],
    })
    const repo = makeSpecRepository({
      specs: [goodSpec, badSpec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({})

    expect(result.totalSpecs).toBe(2)
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(1)
  })

  it('skips artifacts when no parser is available for the format', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      format: 'custom-format' as 'markdown',
      validations: [{ id: 'v1', selector: { type: 'section' } }],
    })
    const schema = makeSchema([specType])

    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ValidateSpecs(specRepos, makeSchemaProvider(schema), makeParsers())
    const result = await uc.execute({})

    expect(result.passed).toBe(1)
    expect(result.entries[0]!.failures).toEqual([])
  })

  it('infers format from filename when artifact type has no explicit format', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.yaml',
    })
    const schema = makeSchema([specType])

    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.yaml'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.yaml': 'key: value' },
    })
    const specRepos = new Map([['default', repo]])

    const mdParser = makeParser()
    const yamlParser = makeParser()
    const uc = new ValidateSpecs(
      specRepos,
      makeSchemaProvider(schema),
      makeParsers(mdParser, yamlParser),
    )
    const result = await uc.execute({})

    expect(result.passed).toBe(1)
    expect(result.entries[0]!.failures).toEqual([])
  })

  it('fails when metadata content hashes are stale', async () => {
    const schema = makeSchema([makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })])
    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': '# Auth Login\n',
        'auth/login/metadata.json': JSON.stringify({
          title: 'Login',
          contentHashes: { 'spec.md': 'sha256:stale' },
        }),
      },
    })

    const result = await new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(),
      makeContentHasher(),
    ).execute({})

    expect(result.failed).toBe(1)
    expect(
      result.entries[0]?.failures.some((failure) =>
        failure.description.includes('stale or incomplete contentHashes'),
      ),
    ).toBe(true)
  })

  it('fails when metadata dependsOn drifts from persisted dependencies', async () => {
    const hasher = makeContentHasher()
    const specContent = '# Auth Login\n'
    const schema = makeSchema([makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })])
    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': specContent,
        'auth/login/metadata.json': JSON.stringify({
          title: 'Login',
          dependsOn: ['default:auth/metadata'],
          contentHashes: { 'spec.md': hasher.hash(specContent) },
        }),
        'auth/login/spec-lock.json': JSON.stringify({
          dependsOn: ['default:auth/persisted'],
        }),
      },
    })

    const result = await new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(),
      hasher,
    ).execute({})

    expect(result.failed).toBe(1)
    expect(
      result.entries[0]?.failures.some((failure) =>
        failure.description.includes('does not match persisted dependencies'),
      ),
    ).toBe(true)
  })

  it('fails when extracted dependsOn mismatches persisted dependencies', async () => {
    const hasher = makeContentHasher()
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('specs', {
          scope: 'spec',
          output: 'spec.md',
          format: 'markdown',
        }),
      ],
      metadataExtraction: {
        dependsOn: {
          artifact: 'specs',
          extractor: {
            selector: { type: 'section', matches: '^Spec Dependencies$' },
            extract: 'content',
            capture:
              '(?:^|\\n)\\s*-\\s+(?:\\[`?|`)?([^`\\]\\n]+?)(?:(?:`?\\]\\(([^)]+)\\)|`)|(?=\\s*(?:—|$)))',
            transform: { name: 'resolveSpecPath', args: ['$2'] },
          },
        },
      },
    })
    const specContent =
      '# Auth Login\n\n## Spec Dependencies\n\n- [`default:auth/extracted`](../extracted/spec.md)\n'
    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': specContent,
        'auth/login/metadata.json': JSON.stringify({
          title: 'Login',
          dependsOn: ['default:auth/persisted'],
          contentHashes: { 'spec.md': hasher.hash(specContent) },
        }),
        'auth/login/spec-lock.json': JSON.stringify({
          dependsOn: ['default:auth/persisted'],
        }),
      },
    })
    const markdownParser = makeParser({
      parse: () => ({
        root: {
          type: 'document',
          children: [
            {
              type: 'section',
              label: 'Spec Dependencies',
              children: [
                {
                  type: 'paragraph',
                  value: '- [`default:auth/extracted`](../extracted/spec.md)',
                },
              ],
            },
          ],
        },
      }),
      renderSubtree: (node) =>
        (node.value as string | undefined) ??
        (node.children ?? [])
          .map((child) => ((child as { value?: unknown }).value as string | undefined) ?? '')
          .join('\n'),
    })

    const result = await new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(markdownParser),
      hasher,
      createBuiltinExtractorTransforms(),
    ).execute({})

    expect(result.failed).toBe(1)
    expect(
      result.entries[0]?.failures.some((failure) =>
        failure.description.includes("Extracted dependsOn for 'default:auth/login'"),
      ),
    ).toBe(true)
  })

  it('passes when extraction is omitted and metadata matches persisted dependencies', async () => {
    const hasher = makeContentHasher()
    const specContent = '# Auth Login\n'
    const schema = makeSchema({
      artifacts: [makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })],
      metadataExtraction: {},
    })
    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': specContent,
        'auth/login/metadata.json': JSON.stringify({
          title: 'Login',
          dependsOn: ['default:auth/persisted'],
          contentHashes: { 'spec.md': hasher.hash(specContent) },
        }),
        'auth/login/spec-lock.json': JSON.stringify({
          dependsOn: ['default:auth/persisted'],
        }),
      },
    })

    const result = await new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(),
      hasher,
    ).execute({})

    expect(result.failed).toBe(0)
    expect(result.passed).toBe(1)
  })

  it('skips full validation on cache soft hit without ValidateSpecs upsert', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])
    const hasher = makeContentHasher()
    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login Spec' },
    })
    const parseSpy = makeParsers()
    const originalGet = parseSpy.get.bind(parseSpy)
    let parseCount = 0
    parseSpy.get = (format: string) => {
      const parser = originalGet(format)
      if (parser === undefined) return undefined
      return {
        ...parser,
        parse(content: string) {
          parseCount += 1
          return parser.parse(content)
        },
      }
    }

    const schemaFingerprint = computeSchemaFingerprintFromSchema(schema, hasher)
    const cache = new InMemoryValidationResultCache(
      repo,
      schemaFingerprint,
      VALIDATE_SPECS_ENGINE_VERSION,
      (content) => hasher.hash(content),
    )
    const currentStamps = stampsFromSpec(spec)
    const storedStamps = {
      ...currentStamps,
      artifacts: [{ filename: 'spec.md', lastModified: '2024-01-01T00:00:00.000Z' }],
    }
    const cacheFingerprint = computeCacheFingerprint(
      {
        specFingerprint: await repo.specFingerprint(spec),
        metadataContentHash: null,
      },
      (content) => hasher.hash(content),
    )
    cache.seed(
      'default:auth/login',
      {
        spec: 'default:auth/login',
        passed: true,
        failures: [],
        warnings: [],
      },
      storedStamps,
      cacheFingerprint,
    )

    const uc = new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      parseSpy,
      hasher,
      new Map(),
      [],
      new Map([['default', cache]]),
    )

    const result = await uc.execute({ specPath: 'default:auth/login' })
    expect(result.entries[0]!.passed).toBe(true)
    expect(parseCount).toBe(0)
    expect(cache.upserts).toHaveLength(0)
  })

  it('upserts failures and warnings on cache miss', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])
    const hasher = makeContentHasher()
    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['readme.md'] })
    const repo = makeSpecRepository({ specs: [spec] })
    const parseSpy = makeParsers()
    const originalGet = parseSpy.get.bind(parseSpy)
    let parseCount = 0
    parseSpy.get = (format: string) => {
      const parser = originalGet(format)
      if (parser === undefined) return undefined
      return {
        ...parser,
        parse(content: string) {
          parseCount += 1
          return parser.parse(content)
        },
      }
    }

    const schemaFingerprint = computeSchemaFingerprintFromSchema(schema, hasher)
    const cache = new InMemoryValidationResultCache(
      repo,
      schemaFingerprint,
      VALIDATE_SPECS_ENGINE_VERSION,
      (content) => hasher.hash(content),
    )

    const uc = new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      parseSpy,
      hasher,
      new Map(),
      [],
      new Map([['default', cache]]),
    )

    const result = await uc.execute({ specPath: 'default:auth/login' })
    expect(result.entries[0]!.passed).toBe(false)
    expect(result.entries[0]!.failures).toHaveLength(1)
    expect(result.entries[0]!.warnings).toEqual([])
    expect(parseCount).toBe(0)
    expect(cache.upserts).toHaveLength(1)
    expect(cache.upserts[0]!.entry.passed).toBe(false)
    expect(cache.upserts[0]!.entry.failures).toEqual(result.entries[0]!.failures)
    expect(cache.upserts[0]!.entry.warnings).toEqual(result.entries[0]!.warnings)
  })

  it('skips full validation on cache hard hit', async () => {
    const specType = makeArtifactType('specs', { scope: 'spec', output: 'spec.md' })
    const schema = makeSchema([specType])
    const hasher = makeContentHasher()
    const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login Spec' },
    })
    const parseSpy = makeParsers()
    const originalGet = parseSpy.get.bind(parseSpy)
    let parseCount = 0
    parseSpy.get = (format: string) => {
      const parser = originalGet(format)
      if (parser === undefined) return undefined
      return {
        ...parser,
        parse(content: string) {
          parseCount += 1
          return parser.parse(content)
        },
      }
    }

    const schemaFingerprint = computeSchemaFingerprintFromSchema(schema, hasher)
    const cache = new InMemoryValidationResultCache(
      repo,
      schemaFingerprint,
      VALIDATE_SPECS_ENGINE_VERSION,
      (content) => hasher.hash(content),
    )
    const cacheFingerprint = await repo
      .specFingerprint(spec)
      .then((fp) =>
        computeCacheFingerprint({ specFingerprint: fp, metadataContentHash: null }, (content) =>
          hasher.hash(content),
        ),
      )
    cache.seed(
      'default:auth/login',
      {
        spec: 'default:auth/login',
        passed: true,
        failures: [],
        warnings: [],
      },
      stampsFromSpec(spec),
      cacheFingerprint,
    )

    const uc = new ValidateSpecs(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      parseSpy,
      hasher,
      new Map(),
      [],
      new Map([['default', cache]]),
    )

    const result = await uc.execute({ specPath: 'default:auth/login' })
    expect(result.entries[0]!.passed).toBe(true)
    expect(parseCount).toBe(0)
  })

  it('resolveValidateSpecsDeps includes validationResultCaches', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-validate-deps-'))
    try {
      const defaultSpecsPath = path.join(tmp, 'specs', 'default')
      const coreSpecsPath = path.join(tmp, 'specs', 'core')
      await Promise.all([
        fs.mkdir(defaultSpecsPath, { recursive: true }),
        fs.mkdir(coreSpecsPath, { recursive: true }),
      ])
      const config = {
        projectRoot: tmp,
        configPath: path.join(tmp, 'specd.yaml'),
        schemaRef: '@specd/schema-std',
        workspaces: [
          {
            name: 'default',
            specsPath: defaultSpecsPath,
            specsAdapter: { adapter: 'fs', config: { path: defaultSpecsPath } },
            schemasPath: null,
            schemasAdapter: null,
            codeRoot: tmp,
            ownership: 'owned' as const,
            isExternal: false,
          },
          {
            name: 'core',
            specsPath: coreSpecsPath,
            specsAdapter: { adapter: 'fs', config: { path: coreSpecsPath } },
            schemasPath: null,
            schemasAdapter: null,
            codeRoot: tmp,
            ownership: 'owned' as const,
            isExternal: false,
          },
        ],
        storage: {
          changesPath: path.join(tmp, '.specd', 'changes'),
          changesAdapter: {
            adapter: 'fs',
            config: { path: path.join(tmp, '.specd', 'changes') },
          },
          draftsPath: path.join(tmp, '.specd', 'drafts'),
          draftsAdapter: {
            adapter: 'fs',
            config: { path: path.join(tmp, '.specd', 'drafts') },
          },
          discardedPath: path.join(tmp, '.specd', 'discarded'),
          discardedAdapter: {
            adapter: 'fs',
            config: { path: path.join(tmp, '.specd', 'discarded') },
          },
          archivePath: path.join(tmp, '.specd', 'archive'),
          archiveAdapter: {
            adapter: 'fs',
            config: { path: path.join(tmp, '.specd', 'archive') },
          },
        },
        approvals: { spec: false, signoff: false },
      } as SpecdConfig
      const resolver = createCompositionResolver(config)
      const deps = resolveValidateSpecsDeps(resolver)
      expect(deps.validationResultCaches.get('default')?.workspace()).toBe('default')
      expect(deps.validationResultCaches.get('core')?.workspace()).toBe('core')
      expect([...deps.validationResultCaches.keys()].sort()).toEqual(['core', 'default'])
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })
})
