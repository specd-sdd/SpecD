import { describe, it, expect } from 'vitest'
import { GetSpecContext } from '../../../src/application/use-cases/get-spec-context.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'
import {
  makeArtifactType,
  makeContentHasher,
  makeListWorkspaces,
  makeParser,
  makeParsers,
  makeSchema,
  makeSchemaProvider,
  makeSpecRepository,
} from './helpers.js'
import { WorkspaceNotFoundError } from '../../../src/application/errors/workspace-not-found-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetSpecContext', () => {
  it('returns context entries for a single spec', async () => {
    const hasher = makeContentHasher()
    const specContent = '# Auth Login Spec'
    const contentHash = hasher.hash(specContent)
    const metadataContent = JSON.stringify({
      title: 'Login Flow',
      description: 'Handles user login',
      contentHashes: { 'spec.md': contentHash },
    })

    const spec = new Spec('default', SpecPath.parse('auth/login'), [
      'spec.md',
      '.specd-metadata.yaml',
    ])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': specContent,
        'auth/login/.specd-metadata.yaml': metadataContent,
      },
    })
    const specRepos = makeListWorkspaces(new Map([['default', repo]]))

    const uc = new GetSpecContext(specRepos, hasher)
    const result = await uc.execute({
      workspace: 'default',
      specPath: SpecPath.parse('auth/login'),
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.spec).toBe('default:auth/login')
    expect(result.entries[0]!.stale).toBe(false)
    expect(result.entries[0]!.title).toBe('Login Flow')
    expect(result.entries[0]!.description).toBe('Handles user login')
    expect(result.warnings).toHaveLength(0)
  })

  it('throws WorkspaceNotFoundError when workspace not found', async () => {
    const specRepos = makeListWorkspaces(new Map([['default', makeSpecRepository()]]))

    const uc = new GetSpecContext(specRepos, makeContentHasher())
    await expect(
      uc.execute({
        workspace: 'nonexistent',
        specPath: SpecPath.parse('auth/login'),
      }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })

  it('throws SpecNotFoundError when spec not found', async () => {
    const repo = makeSpecRepository({ specs: [] })
    const specRepos = makeListWorkspaces(new Map([['default', repo]]))

    const uc = new GetSpecContext(specRepos, makeContentHasher())
    await expect(
      uc.execute({
        workspace: 'default',
        specPath: SpecPath.parse('nonexistent/spec'),
      }),
    ).rejects.toThrow(SpecNotFoundError)
  })

  it('returns warnings for stale metadata', async () => {
    const metadataContent = JSON.stringify({
      title: 'Login Flow',
      contentHashes: { 'spec.md': 'sha256:stale-hash-that-does-not-match' },
    })

    const spec = new Spec('default', SpecPath.parse('auth/login'), [
      'spec.md',
      '.specd-metadata.yaml',
    ])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': '# Actual content that changed',
        'auth/login/.specd-metadata.yaml': metadataContent,
      },
    })
    const specRepos = makeListWorkspaces(new Map([['default', repo]]))

    const uc = new GetSpecContext(specRepos, makeContentHasher())
    const result = await uc.execute({
      workspace: 'default',
      specPath: SpecPath.parse('auth/login'),
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.stale).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.type).toBe('stale-metadata')
  })

  it('follows metadata dependsOn even without schema extraction support', async () => {
    const hasher = makeContentHasher()
    const loginContent = '# Login\n'
    const sharedContent = '# Shared\n'
    const loginMetadata = JSON.stringify({
      title: 'Login',
      dependsOn: ['default:auth/shared'],
      contentHashes: { 'spec.md': hasher.hash(loginContent) },
    })
    const sharedMetadata = JSON.stringify({
      title: 'Shared',
      contentHashes: { 'spec.md': hasher.hash(sharedContent) },
    })

    const repo = makeSpecRepository({
      specs: [
        new Spec('default', SpecPath.parse('auth/login'), ['spec.md', '.specd-metadata.yaml']),
        new Spec('default', SpecPath.parse('auth/shared'), ['spec.md', '.specd-metadata.yaml']),
      ],
      artifacts: {
        'auth/login/spec.md': loginContent,
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/shared/spec.md': sharedContent,
        'auth/shared/.specd-metadata.yaml': sharedMetadata,
      },
    })

    const uc = new GetSpecContext(makeListWorkspaces(new Map([['default', repo]])), hasher)
    const result = await uc.execute({
      workspace: 'default',
      specPath: SpecPath.parse('auth/login'),
      followDeps: true,
    })

    expect(result.entries.map((entry) => entry.spec)).toEqual([
      'default:auth/login',
      'default:auth/shared',
    ])
    expect(result.warnings).toHaveLength(0)
  })

  it('falls back to schema extraction when metadata is absent', async () => {
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
    const hasher = makeContentHasher()
    const sharedContent = '# Shared\n'
    const sharedMetadata = JSON.stringify({
      title: 'Shared',
      contentHashes: { 'spec.md': hasher.hash(sharedContent) },
    })
    const repo = makeSpecRepository({
      specs: [
        new Spec('default', SpecPath.parse('auth/login'), ['spec.md']),
        new Spec('default', SpecPath.parse('auth/shared'), ['spec.md', '.specd-metadata.yaml']),
      ],
      artifacts: {
        'auth/login/spec.md':
          '# Login\n\n## Spec Dependencies\n\n- [`default:auth/shared`](../shared/spec.md)\n',
        'auth/shared/spec.md': sharedContent,
        'auth/shared/.specd-metadata.yaml': sharedMetadata,
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
                  value: '- [`default:auth/shared`](../shared/spec.md)',
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

    const uc = new GetSpecContext(
      makeListWorkspaces(new Map([['default', repo]])),
      hasher,
      makeSchemaProvider(schema),
      makeParsers(markdownParser),
      createBuiltinExtractorTransforms(),
    )
    const result = await uc.execute({
      workspace: 'default',
      specPath: SpecPath.parse('auth/login'),
      followDeps: true,
    })

    expect(result.entries.map((entry) => entry.spec)).toEqual([
      'default:auth/login',
      'default:auth/shared',
    ])
    expect(result.warnings.some((warning) => warning.type === 'missing-metadata')).toBe(true)
  })
})
