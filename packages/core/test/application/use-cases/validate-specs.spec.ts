import { describe, it, expect } from 'vitest'
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['readme.md'])
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md', 'verify.md'])
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md', 'verify.md'])
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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

    const spec1 = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const spec2 = new Spec('default', SpecPath.parse('auth/logout'), ['spec.md'])
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

    const goodSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const badSpec = new Spec('default', SpecPath.parse('auth/missing'), ['other.md'])
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.yaml'])
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
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
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
})
