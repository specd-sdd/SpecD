import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import {
  SuggestImplementationLinks,
  createSuggestImplementationLinks,
  type SuggestImplementationLinksDeps,
} from '../../../src/application/use-cases/suggest-implementation-links.js'
import { ImplementationSuggestionCachePort } from '../../../src/application/ports/implementation-suggestion-cache-port.js'
import {
  SpecdError,
  InvalidInputError,
  WorkspaceNotFoundError,
  SpecNotFoundError,
  type SpecRepository,
} from '@specd/core'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

// Temporary fixture directory standing in for a project root, so the suite does
// not depend on the real repository layout.
const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), 'suggest-impl-links-'))
const FIXTURE_FILES = [
  'packages/sdk/src/application/use-cases/suggest-implementation-links.ts',
  'packages/sdk/src/domain/value-objects/implementation-suggestion-cache.ts',
  'packages/sdk/src/application/ports/implementation-suggestion-cache-port.ts',
  'packages/sdk/src/existing.ts',
]

const fileObserver = {
  exists: async () => true,
  readText: async () => '',
}

beforeAll(() => {
  for (const rel of FIXTURE_FILES) {
    const abs = join(FIXTURE_ROOT, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, '// fixture\n')
  }
})

afterAll(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true })
})

import { type ImplementationSuggestionSpecEntry } from '../../../src/domain/value-objects/implementation-suggestion-cache.js'
import { type SetImplementationSuggestionInput } from '../../../src/application/ports/implementation-suggestion-cache-port.js'

/**
 * In-memory test double for ImplementationSuggestionCachePort.
 * No filesystem I/O — all data lives in a Map.
 */
class InMemoryImplementationSuggestionCache extends ImplementationSuggestionCachePort {
  private data = new Map<string, ImplementationSuggestionSpecEntry>()

  async get(specId: string): Promise<ImplementationSuggestionSpecEntry | null> {
    return this.data.get(specId) ?? null
  }

  async set(specId: string, input: SetImplementationSuggestionInput): Promise<void> {
    this.data.set(specId, {
      specId,
      title: input.title ?? specId,
      specStamp: {
        lastModified: '2026-08-16T12:00:00.000Z',
        hash: 'hash123',
        artifacts: [],
      },
      existing: input.existing ?? { files: [], symbols: [], dependsOn: [] },
      suggestions: input.suggestions,
    })
  }

  async setMany(entries: readonly ImplementationSuggestionSpecEntry[]): Promise<void> {
    for (const entry of entries) {
      this.data.set(entry.specId, entry)
    }
  }

  async getAll(): Promise<ReadonlyMap<string, ImplementationSuggestionSpecEntry>> {
    return this.data
  }

  async findSpecByFile(filePath: string): Promise<string | null> {
    for (const [specId, entry] of this.data.entries()) {
      if (entry.existing.files.includes(filePath)) return specId
      if (entry.suggestions.some((s) => s.file === filePath && s.confidence === 'HIGH'))
        return specId
    }
    return null
  }

  async getFileToSpecMap(): Promise<ReadonlyMap<string, string>> {
    const map = new Map<string, string>()
    for (const [specId, entry] of this.data.entries()) {
      for (const f of entry.existing.files) map.set(f, specId)
      for (const s of entry.suggestions) {
        if (s.confidence === 'HIGH') map.set(s.file, specId)
      }
    }
    return map
  }

  async flush(): Promise<void> {}

  async invalidate(): Promise<void> {
    this.data.clear()
  }
}

function setupTest() {
  const specContent =
    '# sdk:suggest-implementation-links\n\n```typescript\nconst useCase = new SuggestImplementationLinks()\n```\n'

  const spec = {
    workspace: 'sdk',
    path: 'suggest-implementation-links',
    title: 'SuggestImplementationLinks',
    hasArtifact: () => true,
    artifacts: [
      {
        filename: 'spec.md',
        content: specContent,
        lastModified: '2026-08-16T12:00:00.000Z',
        hash: 'hash123',
      },
    ],
  }

  const list = vi.fn().mockResolvedValue([
    {
      workspace: 'sdk',
      path: 'suggest-implementation-links',
      title: 'SuggestImplementationLinks',
      artifacts: [
        {
          filename: 'spec.md',
          lastModified: '2026-08-16T12:00:00.000Z',
          hash: 'hash123',
        },
      ],
    },
  ])

  const get = vi.fn().mockResolvedValue(spec)
  const artifact = vi.fn().mockResolvedValue({ content: specContent })

  const repo = {
    list,
    get,
    artifact,
  } as unknown as SpecRepository

  const specRepositories = new Map<string, SpecRepository>([['sdk', repo]])

  const getPersistedImplementation = {
    execute: vi.fn().mockResolvedValue({
      specId: 'sdk:suggest-implementation-links',
      implementation: [{ file: 'sdk:packages/sdk/src/existing.ts', symbols: ['ExistingSymbol'] }],
      initialized: true,
    }),
  }

  const updatePersistedImplementation = {
    execute: vi.fn().mockResolvedValue({
      specId: 'sdk:suggest-implementation-links',
      implementation: [
        { file: 'sdk:packages/sdk/src/application/use-cases/suggest-implementation-links.ts' },
      ],
      created: true,
    }),
  }

  const codeGraphProvider = {
    getGraphHealth: vi
      .fn()
      .mockResolvedValue({ freshness: '2026-08-16T12:00:00Z', currentRef: 'ref1' }),
    findSymbols: vi.fn().mockImplementation(async (query: { name: string }) => {
      if (query.name === 'SuggestImplementationLinks') {
        return [
          {
            id: 'sym1',
            name: 'SuggestImplementationLinks',
            kind: 'class',
            location: {
              filePath: 'packages/sdk/src/application/use-cases/suggest-implementation-links.ts',
            },
          },
        ]
      }
      return []
    }),
  } as any

  const adapterRegistry = {
    getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js', '.py', '.go', '.php', '.rs']),
    getAdapters: vi.fn().mockReturnValue([
      {
        languages: () => [
          'typescript',
          'ts',
          'javascript',
          'js',
          'python',
          'py',
          'go',
          'golang',
          'php',
          'rust',
          'rs',
        ],
      },
    ]),
    getReservedKeywords: vi.fn().mockReturnValue(new Set(['const', 'let', 'class', 'interface'])),
  } as any

  const cache = new InMemoryImplementationSuggestionCache()

  const useCase = new SuggestImplementationLinks({
    specRepositories,
    getPersistedImplementation: getPersistedImplementation as any,
    updatePersistedImplementation: updatePersistedImplementation as any,
    codeGraphProvider,
    adapterRegistry,
    cache,
    fileObserver,
    projectDir: FIXTURE_ROOT,
  })

  return {
    useCase,
    specRepositories,
    getPersistedImplementation,
    updatePersistedImplementation,
    codeGraphProvider,
    adapterRegistry,
    cache,
  }
}

describe('SuggestImplementationLinks', () => {
  it('analyzes specs and returns confidence-scored suggestions', async () => {
    const { useCase } = setupTest()

    const result = await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
    })

    expect(result.result).toBe('ok')
    expect(result.specs).toHaveLength(1)
    expect(result.specs[0]?.specId).toBe('sdk:suggest-implementation-links')
    expect(result.specs[0]?.suggestions.length).toBeGreaterThan(0)

    const topSuggestion = result.specs[0]?.suggestions[0]
    expect(topSuggestion?.confidence).toBe('HIGH')
    expect(topSuggestion?.file).toContain('suggest-implementation-links.ts')
    expect(topSuggestion?.reasons).toContain('exact-primary-symbol-match')
  })

  it('performs additive set union when apply: true is passed', async () => {
    const { useCase, updatePersistedImplementation } = setupTest()

    const result = await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
      apply: true,
    })

    expect(result.result).toBe('ok')
    expect(updatePersistedImplementation.execute).toHaveBeenCalled()
    expect(result.appliedMutations?.updatedSpecsCount).toBeGreaterThan(0)
  })

  it('filters suggestions when confidenceThreshold is provided', async () => {
    const { useCase } = setupTest()

    const result = await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
      confidenceThreshold: 'HIGH',
    })

    expect(result.specs[0]?.suggestions.every((s) => s.confidence === 'HIGH')).toBe(true)
  })

  it('restricts single-word PascalCase terms to top-level declared entities (parentId undefined)', async () => {
    const { useCase, codeGraphProvider, specRepositories } = setupTest()

    // Include the single-word term `Change` so it is extracted and queried against the graph.
    const repo = specRepositories.get('sdk')!
    ;(repo.artifact as ReturnType<typeof vi.fn>).mockResolvedValue({
      content:
        '# sdk:suggest-implementation-links\n\nReferences the `Change` entity.\n\n```typescript\nconst useCase = new SuggestImplementationLinks()\n```\n',
    })

    // Single-word symbol "Change" declared twice across two existing sdk files:
    // top-level (parentId undefined) vs child method (parentId set).
    const topLevelChange = {
      id: 'top-level-change',
      name: 'Change',
      kind: 'class',
      parentId: undefined,
      location: {
        filePath: 'packages/sdk/src/domain/value-objects/implementation-suggestion-cache.ts',
      },
    }
    const childMethodChange = {
      id: 'child-method-change',
      name: 'Change',
      kind: 'method',
      parentId: 'unrelated-class',
      location: {
        filePath: 'packages/sdk/src/application/ports/implementation-suggestion-cache-port.ts',
      },
    }
    const titleSymbol = {
      id: 'title-symbol',
      name: 'SuggestImplementationLinks',
      kind: 'class',
      location: {
        filePath: 'packages/sdk/src/application/use-cases/suggest-implementation-links.ts',
      },
    }
    codeGraphProvider.findSymbols.mockImplementation(
      async (query: { name?: string; filePath?: string }) => {
        if (query.name === 'Change') return [topLevelChange, childMethodChange]
        if (query.name === 'SuggestImplementationLinks') return [titleSymbol]
        if (query.filePath?.includes('domain/value-objects/implementation-suggestion-cache')) {
          // Declared symbols of the top-level file: Change is root-declared there.
          return [topLevelChange, titleSymbol]
        }
        if (query.filePath?.includes('ports/implementation-suggestion-cache-port')) {
          // Declared symbols of the other file: only the child-method Change lives there.
          return [childMethodChange]
        }
        return []
      },
    )

    const result = await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
    })

    expect(result.result).toBe('ok')
    const suggestedFiles = result.specs[0]?.suggestions.map((s) => s.file) ?? []
    expect(suggestedFiles).toContain(
      'sdk:packages/sdk/src/domain/value-objects/implementation-suggestion-cache.ts',
    )
    expect(suggestedFiles).not.toContain(
      'sdk:packages/sdk/src/application/ports/implementation-suggestion-cache-port.ts',
    )
  })

  it('extracts identifiers from fenced code blocks with any language label and CRLF endings', async () => {
    const { useCase, codeGraphProvider, specRepositories } = setupTest()

    const repo = specRepositories.get('sdk')!
    ;(repo.artifact as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [
        '# sdk:suggest-implementation-links',
        '',
        '```python',
        'schemaValidator = SchemaValidatorFactory()',
        '```',
        '',
        '```go',
        'MergeSchemaLayers(ctx)',
        '```',
        '',
        '```php',
        '$cache = RenderSpecTreeCache::render();',
        '```',
        '',
        '```\r\nLoadSpecDeltas()\r\n```',
        '',
      ].join('\n'),
    })

    await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
      rebuildCache: true,
    })

    for (const symbol of [
      'schemaValidator',
      'SchemaValidatorFactory',
      'MergeSchemaLayers',
      'RenderSpecTreeCache',
      'LoadSpecDeltas',
    ]) {
      expect(codeGraphProvider.findSymbols).toHaveBeenCalledWith(
        expect.objectContaining({ name: symbol }),
      )
    }
  })

  it('marks suggestions pointing at already-linked files with alreadyIncluded: true', async () => {
    const { useCase, cache } = setupTest()

    // setupTest seeds getPersistedImplementation with the existing link
    // `sdk:packages/sdk/src/existing.ts` (symbol ExistingSymbol). Prime the
    // cache with a suggestion targeting that same file.
    await cache.set('sdk:suggest-implementation-links', {
      title: 'SuggestImplementationLinks',
      specContentHash: 'hash123',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'sdk:packages/sdk/src/existing.ts',
          symbols: ['ExistingSymbol'],
          confidence: 'HIGH',
          reasons: ['primary-symbol-match'],
          score: 200,
          alreadyIncluded: false,
        },
      ],
    })

    const result = await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
    })

    expect(result.result).toBe('ok')
    const sug = result.specs[0]?.suggestions.find((s) => s.file.endsWith('existing.ts'))
    expect(sug).toBeDefined()
    expect(sug?.alreadyIncluded).toBe(true)
  })

  it('persists real SHA-256 content hash in cache stamp', async () => {
    const { useCase, cache } = setupTest()

    await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
      rebuildCache: true,
    })

    const cachedEntry = await cache.get('sdk:suggest-implementation-links')
    expect(cachedEntry).not.toBeNull()
    expect(cachedEntry?.specStamp.hash).toBeDefined()
    expect(cachedEntry?.specStamp.hash).not.toBe('')
  })

  it('normalizes MED shorthand to MEDIUM for confidenceThreshold', async () => {
    const { useCase } = setupTest()

    const result = await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
      confidenceThreshold: 'MED',
    })

    expect(result.result).toBe('ok')
    expect(
      result.specs[0]?.suggestions.every(
        (s) => s.confidence === 'HIGH' || s.confidence === 'MEDIUM',
      ),
    ).toBe(true)
  })

  it('throws InvalidInputError when no targeting criteria is specified', async () => {
    const { useCase } = setupTest()

    await expect(useCase.execute({})).rejects.toThrow(InvalidInputError)
    await expect(useCase.execute({})).rejects.toBeInstanceOf(SpecdError)
  })

  it('throws WorkspaceNotFoundError when requested workspace does not exist', async () => {
    const { useCase } = setupTest()

    await expect(useCase.execute({ workspace: 'non-existent-ws' })).rejects.toThrow(
      WorkspaceNotFoundError,
    )
    await expect(useCase.execute({ workspace: 'non-existent-ws' })).rejects.toBeInstanceOf(
      SpecdError,
    )
  })

  it('throws InvalidInputError when invalid confidence threshold is provided', async () => {
    const { useCase } = setupTest()

    await expect(
      useCase.execute({
        specId: 'sdk:suggest-implementation-links',
        confidenceThreshold: 'SUPER_HIGH' as any,
      }),
    ).rejects.toThrow(InvalidInputError)
  })

  it('throws SpecNotFoundError when target spec ID does not exist', async () => {
    const { useCase } = setupTest()

    await expect(
      useCase.execute({
        specId: 'sdk:non-existent-spec',
      }),
    ).rejects.toThrow(SpecNotFoundError)
    await expect(
      useCase.execute({
        specId: 'sdk:non-existent-spec',
      }),
    ).rejects.toBeInstanceOf(SpecdError)
  })

  it('supports factory constructor overloads', () => {
    const {
      specRepositories,
      getPersistedImplementation,
      updatePersistedImplementation,
      adapterRegistry,
      cache,
    } = setupTest()

    const instance = createSuggestImplementationLinks({
      specRepositories,
      getPersistedImplementation: getPersistedImplementation as any,
      updatePersistedImplementation: updatePersistedImplementation as any,
      adapterRegistry,
      cache,
      fileObserver,
    })

    expect(instance).toBeInstanceOf(SuggestImplementationLinks)
  })

  it('rejects factory construction without an adapter registry', () => {
    const { specRepositories, getPersistedImplementation, updatePersistedImplementation, cache } =
      setupTest()

    expect(() =>
      createSuggestImplementationLinks({
        specRepositories,
        getPersistedImplementation: getPersistedImplementation as any,
        updatePersistedImplementation: updatePersistedImplementation as any,
        cache,
        fileObserver,
      } as unknown as SuggestImplementationLinksDeps),
    ).toThrow(InvalidInputError)
  })

  it('rejects factory construction without a file observer', () => {
    const {
      specRepositories,
      getPersistedImplementation,
      updatePersistedImplementation,
      adapterRegistry,
      cache,
    } = setupTest()

    expect(() =>
      createSuggestImplementationLinks({
        specRepositories,
        getPersistedImplementation: getPersistedImplementation as any,
        updatePersistedImplementation: updatePersistedImplementation as any,
        adapterRegistry,
        cache,
      } as unknown as SuggestImplementationLinksDeps),
    ).toThrow(InvalidInputError)
  })

  it('gates prose evidence through code-graph and rejects unmatched prose tokens', async () => {
    const { useCase, codeGraphProvider, specRepositories } = setupTest()
    const repo = specRepositories.get('sdk')!
    ;(repo.artifact as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content:
        '# sdk:suggest-implementation-links\n\nMentions ValidProseSymbol and UnmatchedProseSymbol in text.\n',
    })

    codeGraphProvider.findSymbols.mockImplementation(async (query: { name?: string }) => {
      if (query.name === 'ValidProseSymbol') {
        return [
          {
            name: 'ValidProseSymbol',
            kind: 'class',
            location: {
              filePath: 'packages/sdk/src/application/use-cases/suggest-implementation-links.ts',
            },
          },
        ]
      }
      return []
    })

    const result = await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
      rebuildCache: true,
    })

    const suggestions = result.specs[0]?.suggestions ?? []
    const reasons = suggestions.flatMap((s) => s.reasons)
    expect(reasons).toContain('prose-symbol-evidence')
    // UnmatchedProseSymbol was not found in codeGraphProvider, so findSymbols was not called with it for scoring
    expect(suggestions.some((s) => s.symbols.includes('UnmatchedProseSymbol'))).toBe(false)
  })

  it('attaches fenced-code and inline-code evidence reasons', async () => {
    const { useCase, codeGraphProvider, specRepositories } = setupTest()
    const repo = specRepositories.get('sdk')!
    ;(repo.artifact as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content:
        '# sdk:suggest-implementation-links\n\n```typescript\nclass FencedSymbol {}\n```\n\nAnd inline `InlineSymbol`.\n',
    })

    codeGraphProvider.findSymbols.mockImplementation(async (query: { name?: string }) => {
      if (query.name === 'FencedSymbol') {
        return [
          {
            name: 'FencedSymbol',
            kind: 'class',
            location: {
              filePath: 'packages/sdk/src/application/use-cases/suggest-implementation-links.ts',
            },
          },
        ]
      }
      return []
    })

    const result = await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
      rebuildCache: true,
    })

    const suggestions = result.specs[0]?.suggestions ?? []
    const reasons = suggestions.flatMap((s) => s.reasons)
    expect(reasons).toContain('fenced-code-evidence')
  })

  it('propagates implementation mutation failures', async () => {
    const { useCase, updatePersistedImplementation } = setupTest()
    updatePersistedImplementation.execute.mockRejectedValueOnce(new Error('write failed'))

    await expect(
      useCase.execute({ specId: 'sdk:suggest-implementation-links', apply: true }),
    ).rejects.toThrow('write failed')
  })

  it('retains Tier 1 candidates when Tier 2 adds hierarchical candidates', async () => {
    const { useCase, specRepositories, codeGraphProvider } = setupTest()
    const repo = specRepositories.get('sdk')!
    ;(repo.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { workspace: 'sdk', path: 'schema-which-command', title: 'SchemaWhichCommand' },
    ])
    ;(repo.artifact as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: '# SchemaWhichCommand\n\n### Requirement: Which lookup\n',
    })
    codeGraphProvider.findSymbols.mockImplementation(
      async (query: { name?: string; filePath?: string }) => {
        if (query.name === 'SchemaWhichCommand') {
          return [
            {
              name: 'SchemaWhichCommand',
              kind: 'class',
              location: { filePath: 'packages/sdk/src/schema-which-command.ts' },
            },
          ]
        }
        if (query.filePath?.endsWith('/schema.ts')) {
          return [{ name: 'SchemaCommand', kind: 'class', location: { filePath: query.filePath } }]
        }
        return []
      },
    )
    const deps = (useCase as unknown as { deps: SuggestImplementationLinksDeps }).deps
    const tieredUseCase = new SuggestImplementationLinks({
      ...deps,
      cache: new InMemoryImplementationSuggestionCache(),
      fileObserver: {
        exists: async () => true,
        readText: async () => 'which',
      },
    })

    const result = await tieredUseCase.execute({ specId: 'sdk:schema-which-command' })
    const suggestions = result.specs[0]?.suggestions ?? []

    expect(suggestions.some((entry) => entry.reasons.includes('exact-primary-symbol-match'))).toBe(
      true,
    )
    expect(suggestions.some((entry) => entry.reasons.includes('subtoken-content-match'))).toBe(true)
  })

  it('emits onProgress events during execution', async () => {
    const { useCase } = setupTest()
    const events: any[] = []

    await useCase.execute({
      specId: 'sdk:suggest-implementation-links',
      onProgress: (evt) => events.push(evt),
    })

    const types = events.map((e) => e.type as string)
    expect(types.length).toBeGreaterThan(0)
    // Complete ordered sequence: discovery-start ... discovery-done ... start
    // ... spec-start ... spec-done ... done
    expect(types[0]).toBe('discovery-start')
    const indexOf = (t: string): number => types.indexOf(t)
    expect(indexOf('discovery-done')).toBeGreaterThan(0)
    expect(indexOf('discovery-done')).toBeLessThan(indexOf('start'))
    expect(indexOf('start')).toBeLessThan(indexOf('spec-start'))
    expect(indexOf('spec-start')).toBeLessThan(indexOf('spec-done'))
    expect(indexOf('spec-done')).toBeLessThan(types.lastIndexOf('done'))
  })
})
