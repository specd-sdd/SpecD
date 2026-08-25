import { describe, it, expect } from 'vitest'
import { makeSpec } from '../../helpers/make-spec.js'
import { GetSpecContext } from '../../../src/application/use-cases/get-spec-context.js'
import { type GetSpecMetadata } from '../../../src/application/use-cases/get-spec-metadata.js'
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
  makeGetSpecMetadata,
  missingGetSpecMetadata,
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
      provenance: {
        artifacts: { 'spec.md': { hash: contentHash, lastModified: '2024-01-15T00:00:00.000Z' } },
        persistedStateHash: null,
        schema: { name: 'specd-std', version: 1 },
        projectionVersion: 1,
        projectionFingerprint: 'fp-test',
      },
    })

    const spec = makeSpec({
      workspace: 'default',
      name: 'auth/login',
      filenames: ['spec.md', '.specd-metadata.yaml'],
    })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': specContent,
        'auth/login/.specd-metadata.yaml': metadataContent,
      },
    })
    const specRepos = makeListWorkspaces(new Map([['default', repo]]))

    const uc = new GetSpecContext(
      specRepos,
      hasher,
      makeGetSpecMetadata(new Map([['default', repo]])),
    )
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

    const uc = new GetSpecContext(specRepos, makeContentHasher(), missingGetSpecMetadata)
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

    const uc = new GetSpecContext(specRepos, makeContentHasher(), missingGetSpecMetadata)
    await expect(
      uc.execute({
        workspace: 'default',
        specPath: SpecPath.parse('nonexistent/spec'),
      }),
    ).rejects.toThrow(SpecNotFoundError)
  })

  it('materializes metadata for entries with mismatched cache hashes', async () => {
    const metadataContent = JSON.stringify({
      title: 'Login Flow',
      contentHashes: { 'spec.md': 'sha256:stale-hash-that-does-not-match' },
    })

    const spec = makeSpec({
      workspace: 'default',
      name: 'auth/login',
      filenames: ['spec.md', '.specd-metadata.yaml'],
    })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': '# Actual content that changed',
        'auth/login/.specd-metadata.yaml': metadataContent,
      },
    })
    const specRepos = makeListWorkspaces(new Map([['default', repo]]))

    const uc = new GetSpecContext(
      specRepos,
      makeContentHasher(),
      makeGetSpecMetadata(new Map([['default', repo]])),
    )
    const result = await uc.execute({
      workspace: 'default',
      specPath: SpecPath.parse('auth/login'),
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.stale).toBe(false)
    expect(result.entries[0]!.title).toBe('Login Flow')
  })

  it('follows persisted dependsOn even without schema extraction support', async () => {
    const hasher = makeContentHasher()
    const loginContent = '# Login\n'
    const sharedContent = '# Shared\n'
    const loginMetadata = JSON.stringify({
      title: 'Login',
      dependsOn: ['default:auth/shared'],
      contentHashes: { 'spec.md': hasher.hash(loginContent) },
      provenance: {
        artifacts: {
          'spec.md': { hash: hasher.hash(loginContent), lastModified: '2024-01-15T00:00:00.000Z' },
        },
        persistedStateHash: 'sha256:test-lock',
        schema: { name: 'std', version: 1 },
        projectionVersion: 1,
        projectionFingerprint: 'fp-test',
      },
    })
    const sharedMetadata = JSON.stringify({
      title: 'Shared',
      contentHashes: { 'spec.md': hasher.hash(sharedContent) },
      provenance: {
        artifacts: {
          'spec.md': { hash: hasher.hash(sharedContent), lastModified: '2024-01-15T00:00:00.000Z' },
        },
        persistedStateHash: 'sha256:test-lock',
        schema: { name: 'std', version: 1 },
        projectionVersion: 1,
        projectionFingerprint: 'fp-test',
      },
    })

    const repo = makeSpecRepository({
      specs: [
        makeSpec({
          workspace: 'default',
          name: 'auth/login',
          filenames: ['spec.md', '.specd-metadata.yaml'],
        }),
        makeSpec({
          workspace: 'default',
          name: 'auth/shared',
          filenames: ['spec.md', '.specd-metadata.yaml'],
        }),
      ],
      artifacts: {
        'auth/login/spec.md': loginContent,
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec-lock.json': JSON.stringify({
          schema: { name: 'std', version: 1 },
          dependsOn: ['default:auth/shared'],
          implementation: [],
        }),
        'auth/shared/spec.md': sharedContent,
        'auth/shared/.specd-metadata.yaml': sharedMetadata,
        'auth/shared/spec-lock.json': JSON.stringify({
          schema: { name: 'std', version: 1 },
          dependsOn: [],
          implementation: [],
        }),
      },
    })

    const uc = new GetSpecContext(
      makeListWorkspaces(new Map([['default', repo]])),
      hasher,
      makeGetSpecMetadata(new Map([['default', repo]])),
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
        makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] }),
        makeSpec({
          workspace: 'default',
          name: 'auth/shared',
          filenames: ['spec.md', '.specd-metadata.yaml'],
        }),
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
      makeGetSpecMetadata(new Map([['default', repo]])),
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

  describe('optimization warning typing and regeneration provenance', () => {
    function stubGetSpecMetadata(
      metadata: Record<string, unknown>,
      opts: { regenerated?: boolean } = {},
    ): GetSpecMetadata {
      return {
        execute: async () => ({
          metadata,
          metadataFingerprint: 'fp-test',
          source: opts.regenerated === true ? 'generated' : 'persisted',
          regenerated: opts.regenerated ?? false,
          warnings: [],
        }),
      } as unknown as GetSpecMetadata
    }

    function makeUc(getMetadata: GetSpecMetadata): GetSpecContext {
      const hasher = makeContentHasher()
      const repo = makeSpecRepository({
        specs: [makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })],
        artifacts: { 'auth/login/spec.md': '# Login\n' },
      })
      return new GetSpecContext(
        makeListWorkspaces(new Map([['default', repo]])),
        hasher,
        getMetadata,
        makeSchemaProvider(makeSchema()),
        makeParsers(),
        createBuiltinExtractorTransforms(),
      )
    }

    it('types missing-optimization when no optimization status is recorded', async () => {
      const uc = makeUc(stubGetSpecMetadata({ title: 'Login', description: 'Handles login' }))
      const result = await uc.execute({
        workspace: 'default',
        specPath: SpecPath.parse('auth/login'),
        contextMode: 'summary',
        llmOptimizedContext: true,
      })
      expect(result.warnings.some((w) => w.type === 'missing-optimization')).toBe(true)
    })

    it('types stale-optimization from optimizationStatus baselines', async () => {
      const uc = makeUc(
        stubGetSpecMetadata({
          title: 'Login',
          description: 'Handles login',
          optimizationStatus: { optimizedContext: 'stale' },
        }),
      )
      const result = await uc.execute({
        workspace: 'default',
        specPath: SpecPath.parse('auth/login'),
        contextMode: 'summary',
        llmOptimizedContext: true,
      })
      expect(
        result.warnings.some(
          (w) => w.type === 'stale-optimization' && w.path === 'default:auth/login',
        ),
      ).toBe(true)
    })

    it('cache-miss regeneration does not emit a warning', async () => {
      const uc = makeUc(
        stubGetSpecMetadata(
          { title: 'Login', description: 'Handles login' },
          { regenerated: true },
        ),
      )
      const result = await uc.execute({
        workspace: 'default',
        specPath: SpecPath.parse('auth/login'),
        contextMode: 'summary',
      })
      expect(result.entries[0]!.stale).toBe(false)
      expect(result.warnings).toHaveLength(0)
    })
  })
})
