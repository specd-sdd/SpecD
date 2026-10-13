import { describe, expect, it, vi } from 'vitest'
import { type CodeGraphProvider } from '@specd/code-graph'
import { type SpecdConfig } from '@specd/core'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import { runGraphSearch } from '../../src/orchestration/run-graph-search.js'

describe('runGraphSearch', () => {
  const mockConfig = {
    projectRoot: '/repo',
    workspaces: [
      { name: 'core', codeRoot: '/repo/packages/core' },
      { name: 'cli', codeRoot: '/repo/packages/cli' },
    ],
  } as unknown as SpecdConfig

  const mockRawSearchResult = {
    symbols: [
      {
        logicalTarget: {
          id: 'log1',
          workspace: 'core',
          surface: 'core:src/auth.ts',
          name: 'Auth',
          space: 'type',
        },
        declarations: [
          {
            logicalSymbolId: 'log1',
            declaration: {
              logicalId: 'log1',
              symbolId: 'sym1',
              kind: 'class',
              location: {
                filePath: 'core:src/auth.ts',
                line: 10,
                column: 5,
              },
            },
          },
        ],
        publicBindings: [
          {
            id: 'pub1',
            surface: 'core:src/index.ts',
            exportedName: 'Auth',
            space: 'type',
            targetId: 'log1',
          },
        ],
        matchedPublicBindings: [],
        score: 100,
        matchTier: 'exact',
        matchReasons: ['direct'],
        hits: [
          {
            symbol: {
              id: 'sym1',
              name: 'Auth',
              kind: 'class',
              filePath: 'core:src/auth.ts',
              projectRelativePath: 'packages/core/src/auth.ts',
              line: 10,
              column: 5,
            },
            score: 100,
            startLine: 10,
            endLine: 20,
          },
        ],
      },
    ],
    files: [
      {
        file: {
          workspace: 'cli',
          path: 'cli:src/main.ts',
          projectRelativePath: 'packages/cli/src/main.ts',
        },
        score: 50,
        totalMatches: 2,
        omittedMatches: 0,
        matches: [],
      },
    ],
    specs: [
      {
        spec: {
          workspace: 'core',
          specId: 'core:auth',
          path: 'specs/core/auth/spec.md',
          title: 'Auth Spec',
          description: 'Auth specification',
        },
        score: 80,
        startLine: 1,
        endLine: 10,
      },
    ],
    documents: [
      {
        document: {
          workspace: 'core',
          path: 'core:docs/overview.md',
          projectRelativePath: 'packages/core/docs/overview.md',
        },
        score: 30,
        startLine: 5,
        endLine: 15,
      },
    ],
    omittedCounts: { tests: 1, ignored: 0 },
  }

  it('projects canonical paths to projectRelativePath across symbols, files, and documents', async () => {
    const mockProvider = {
      search: vi.fn().mockResolvedValue(mockRawSearchResult),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphSearch(ctx, { query: 'auth', provider: mockProvider })

    // Verify symbol projections
    expect(result.symbols).toHaveLength(1)
    const symGroup = result.symbols[0]!
    expect(symGroup.logicalTarget?.projectRelativePath).toBe('packages/core/src/auth.ts')
    expect(symGroup.declarations[0]!.declaration.location.projectRelativePath).toBe(
      'packages/core/src/auth.ts',
    )
    expect(symGroup.publicBindings[0]!.projectRelativePath).toBe('packages/core/src/index.ts')
    expect(symGroup.hits[0]!.symbol.projectRelativePath).toBe('packages/core/src/auth.ts')

    // Verify files projection & omission of configRelativePath
    expect(result.files).toHaveLength(1)
    expect(result.files[0]!.projectRelativePath).toBe('packages/cli/src/main.ts')
    expect((result.files[0] as any).configRelativePath).toBeUndefined()

    // Verify documents projection & omission of configRelativePath
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]!.projectRelativePath).toBe('packages/core/docs/overview.md')
    expect((result.documents[0] as any).configRelativePath).toBeUndefined()

    // Verify specs preserved
    expect(result.specs).toHaveLength(1)
    expect(result.specs[0]!.specId).toBe('core:auth')

    // Verify omitted counts
    expect(result.omittedCounts).toEqual({ tests: 1, ignored: 0 })
  })

  it('opens and closes transient provider when provider is not passed', async () => {
    const mockProvider = {
      search: vi.fn().mockResolvedValue(mockRawSearchResult),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      isOpen: vi.fn().mockReturnValue(true),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    await runGraphSearch(ctx, { query: 'auth' })

    expect(mockProvider.open).toHaveBeenCalledTimes(1)
    expect(mockProvider.close).toHaveBeenCalledTimes(1)
  })

  it('does not close caller-owned open provider', async () => {
    const mockProvider = {
      search: vi.fn().mockResolvedValue(mockRawSearchResult),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      isOpen: vi.fn().mockReturnValue(true),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    await runGraphSearch(ctx, { query: 'auth', provider: mockProvider })

    expect(mockProvider.close).not.toHaveBeenCalled()
  })

  it('forwards all search options and aliases to provider.search', async () => {
    const mockProvider = {
      search: vi.fn().mockResolvedValue(mockRawSearchResult),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    await runGraphSearch(ctx, {
      query: 'auth',
      categories: ['symbols', 'files'],
      kinds: ['function' as any],
      filePattern: 'src/*.ts',
      exactFile: true,
      workspace: 'core',
      excludePaths: ['node_modules'],
      excludeWorkspaces: ['legacy'],
      fileCategories: ['source'],
      includeTests: true,
      includeIgnored: false,
      limit: 10,
      includeSnippet: true,
      provider: mockProvider,
    })

    expect(mockProvider.search).toHaveBeenCalledWith({
      query: 'auth',
      categories: ['symbols', 'files'],
      limit: 10,
      includeSnippet: true,
      kinds: ['function'],
      filePattern: 'src/*.ts',
      exactFile: true,
      workspace: 'core',
      excludePaths: ['node_modules'],
      excludeWorkspaces: ['legacy'],
      fileCategories: ['source'],
      includeTests: true,
      includeIgnored: false,
    })
  })

  it('maps aliases file/filePattern and snippet/includeSnippet identically', async () => {
    const mockProvider = {
      search: vi.fn().mockResolvedValue(mockRawSearchResult),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    await runGraphSearch(ctx, {
      query: 'test',
      file: 'src/main.ts',
      snippet: true,
      provider: mockProvider,
    })

    expect(mockProvider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filePattern: 'src/main.ts',
        includeSnippet: true,
      }),
    )
  })

  it('retains snippet in results when includeSnippet: true', async () => {
    const rawWithSnippet = {
      ...mockRawSearchResult,
      symbols: [
        {
          ...mockRawSearchResult.symbols[0]!,
          hits: [
            {
              ...mockRawSearchResult.symbols[0]!.hits[0]!,
              snippet: 'export class Auth {}',
            },
          ],
        },
      ],
      files: [
        {
          ...mockRawSearchResult.files[0]!,
          matches: [
            {
              range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 4 },
              matchedText: 'auth',
              matchKind: 'content',
              sourceToken: 'auth',
              snippet: {
                content: 'import auth from "./auth";',
                range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 26 },
              },
            },
          ],
        },
      ],
      specs: [
        {
          ...mockRawSearchResult.specs[0]!,
          snippet: '# Auth Spec\nRequirement',
        },
      ],
      documents: [
        {
          ...mockRawSearchResult.documents[0]!,
          snippet: '# Overview\nAuth is core.',
        },
      ],
    }

    const mockProvider = {
      search: vi.fn().mockResolvedValue(rawWithSnippet),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeGraphProvider

    const ctx: SdkHostContext = {
      kernel: {
        project: {
          getConfig: {
            execute: vi.fn().mockReturnValue(mockConfig),
          },
        },
      } as any,
      createGraphProvider: () => mockProvider,
    }

    const result = await runGraphSearch(ctx, {
      query: 'auth',
      includeSnippet: true,
      provider: mockProvider,
    })

    expect(result.symbols[0]!.hits[0]!.snippet).toBe('export class Auth {}')
    expect(result.files[0]!.matches[0]!.snippet).toEqual({
      content: 'import auth from "./auth";',
      range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 26 },
    })
    expect(result.specs[0]!.snippet).toBe('# Auth Spec\nRequirement')
    expect(result.documents[0]!.snippet).toBe('# Overview\nAuth is core.')
  })
})
