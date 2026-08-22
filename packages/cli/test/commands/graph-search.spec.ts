import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('../../src/commands/graph/resolve-graph-cli-context.js', () => ({
  resolveGraphCliContext: vi.fn(),
}))

vi.mock('../../src/commands/graph/with-provider.js', () => ({
  withProvider: vi.fn(),
}))

import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { registerGraphSearch } from '../../src/commands/graph/search.js'

const EMPTY_RESULT = { symbols: [], files: [], specs: [], documents: [] } as const

function makeReferenceSymbolResult() {
  const binding = {
    id: 'binding-id',
    workspace: 'core',
    surface: 'core:src/index.ts',
    exportedName: 'Change',
    space: 'value',
    targetLogicalId: 'typescript:value:core:src/change.ts:Change',
    provenance: 'named-re-export',
    confidence: 'exact',
    evidence: 'export { Change }',
  }
  return {
    logicalTarget: {
      id: 'typescript:value:core:src/change.ts:Change',
      workspace: 'core',
      surface: 'core:src/change.ts',
      space: 'value',
      name: 'Change',
      ownerId: null,
      memberForm: null,
      kind: 'class',
    },
    declarations: [
      {
        logicalSymbolId: 'typescript:value:core:src/change.ts:Change',
        declaration: {
          logicalId: 'typescript:value:core:src/change.ts:Change',
          symbolId: 'core:src/change.ts:class:Change:4:0',
          location: { filePath: 'core:src/change.ts', line: 4, column: 0 },
          kind: 'class',
        },
      },
    ],
    publicBindings: [binding],
    matchedPublicBindings: [binding],
    hits: [
      {
        symbol: {
          id: 'core:src/change.ts:class:Change:4:0',
          name: 'Change',
          kind: 'class',
          filePath: 'core:src/change.ts',
          line: 4,
          column: 0,
          endLine: 8,
          endColumn: 1,
          selectionRange: { startLine: 4, startColumn: 6, endLine: 4, endColumn: 12 },
        },
        score: 100,
        startLine: 4,
        endLine: 4,
      },
    ],
    score: 100,
    matchTier: 'exact-public-binding',
    matchReasons: ['public-binding-case-exact'],
  }
}

function setup() {
  const config = makeMockConfig({
    workspaces: [
      ...makeMockConfig().workspaces,
      {
        name: 'core',
        specsPath: '/project/core/specs',
        specsAdapter: { adapter: 'fs', config: { path: '/project/core/specs' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/project/packages/core',
        ownership: 'owned' as const,
        isExternal: false,
      },
    ],
  })
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode: 'configured',
    config,
    configFilePath: '/project/specd.yaml',
    kernel: null,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  const mockProvider = {
    search: vi.fn().mockResolvedValue(EMPTY_RESULT),
    searchSymbols: vi.fn(),
    searchReferenceSymbols: vi.fn(),
    searchSpecs: vi.fn(),
    searchDocuments: vi.fn(),
    getFile: vi.fn().mockResolvedValue(undefined),
    getDocument: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(withProvider).mockImplementation(async (_config, _format, fn) => {
    await fn(mockProvider as never)
  })

  const getStdout = captureStdout()
  const getStderr = captureStderr()
  mockProcessExit()
  return { mockProvider, getStdout, getStderr }
}

function makeSearchProgram() {
  const program = makeProgram()
  registerGraphSearch(program.command('graph'))
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph search', () => {
  it('passes explicit config and bootstrap paths to context resolution', async () => {
    setup()
    await makeSearchProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'kernel',
      '--config',
      '/tmp/other/specd.yaml',
    ])
    expect(resolveGraphCliContext).toHaveBeenLastCalledWith({
      configPath: '/tmp/other/specd.yaml',
      repoPath: undefined,
    })

    await makeSearchProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'kernel',
      '--path',
      '/tmp/repo',
    ])
    expect(resolveGraphCliContext).toHaveBeenLastCalledWith({
      configPath: undefined,
      repoPath: '/tmp/repo',
    })
  })

  it('delegates exactly once to unified Code Graph search with all categories by default', async () => {
    const { mockProvider } = setup()
    await makeSearchProgram().parseAsync(['node', 'specd', 'graph', 'search', 'Change'])

    expect(mockProvider.search).toHaveBeenCalledTimes(1)
    expect(mockProvider.search).toHaveBeenCalledWith({
      query: 'Change',
      categories: ['symbols', 'files', 'specs', 'documents'],
      limit: 10,
      includeSnippet: false,
    })
    expect(mockProvider.searchSymbols).not.toHaveBeenCalled()
    expect(mockProvider.searchReferenceSymbols).not.toHaveBeenCalled()
    expect(mockProvider.searchSpecs).not.toHaveBeenCalled()
    expect(mockProvider.searchDocuments).not.toHaveBeenCalled()
  })

  it('keeps --files distinct from --file and passes every filter in one request', async () => {
    const { mockProvider } = setup()
    await makeSearchProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'analyzeFileImpact',
      '--symbols',
      '--files',
      '--file',
      '*:src/*',
      '--workspace',
      'code-graph',
      '--kind',
      'function,method',
      '--exclude-path',
      '*.spec.ts',
      '--exclude-workspace',
      'cli',
      '--limit',
      '7',
      '--snippet',
    ])

    expect(mockProvider.search).toHaveBeenCalledWith({
      query: 'analyzeFileImpact',
      categories: ['symbols', 'files'],
      limit: 7,
      includeSnippet: true,
      kinds: ['function', 'method'],
      filePattern: '*:src/*',
      workspace: 'code-graph',
      excludePaths: ['*.spec.ts'],
      excludeWorkspaces: ['cli'],
    })
  })

  it('renders grouped symbols and precise source occurrences from the unified result', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.search.mockResolvedValue({
      symbols: [
        {
          logicalTarget: null,
          declarations: [],
          publicBindings: [],
          hits: [
            {
              symbol: {
                id: 'core:src/api.ts:function:run:2:9',
                name: 'run',
                kind: 'function',
                filePath: 'core:src/api.ts',
                line: 2,
                column: 9,
                endLine: 4,
                endColumn: 1,
                selectionRange: {
                  startLine: 2,
                  startColumn: 9,
                  endLine: 2,
                  endColumn: 12,
                },
                parentId: undefined,
                comment: undefined,
              },
              score: 100,
              snippet: 'function run() {}',
              startLine: 2,
              endLine: 2,
            },
          ],
          score: 100,
          matchTier: 'exact-declaration',
          matchReasons: ['declaration-case-exact'],
        },
      ],
      files: [
        {
          file: {
            path: 'core:src/messages.ts',
            configRelativePath: 'src/messages.ts',
            language: 'typescript',
            contentHash: 'sha256:file',
            workspace: 'core',
            content: 'const message = "run now"',
          },
          score: 50,
          matches: [
            {
              range: { startLine: 1, startColumn: 17, endLine: 1, endColumn: 20 },
              matchedText: 'run',
              matchKind: 'full-query',
              sourceToken: 'run',
              snippet: {
                range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 25 },
                content: 'const message = "run now"',
              },
            },
          ],
        },
      ],
      specs: [],
      documents: [],
    })

    await makeSearchProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'run',
      '--symbols',
      '--files',
      '--snippet',
    ])

    const output = getStdout()
    expect(output).toContain('Symbols (1 shown, limit 10):')
    expect(output).toContain('[core] function run')
    expect(output).toContain('Files (1 shown, limit 10):')
    expect(output).toContain('full-query L1:17-L1:20 "run" source=run')
    expect(output).toContain('const message = "run now"')
  })

  it('renders only actionable declaration and directly matched export paths in text', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.getFile.mockImplementation(async (path: string) => ({
      configRelativePath:
        path === 'core:src/index.ts' ? 'packages/core/src/index.ts' : 'packages/core/src/change.ts',
    }))
    mockProvider.search.mockResolvedValue({
      ...EMPTY_RESULT,
      symbols: [makeReferenceSymbolResult()],
    })

    await makeSearchProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'Change',
      '--symbols',
    ])

    const output = getStdout()
    expect(output).toContain('matched export: packages/core/src/index.ts::Change')
    expect(output).toContain('declaration: packages/core/src/change.ts:4:0')
    expect(output).not.toContain('typescript:value:core:src/change.ts:Change')
  })

  it('renders omitted source occurrence counts per file', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.search.mockResolvedValue({
      ...EMPTY_RESULT,
      files: [
        {
          file: {
            path: 'core:src/messages.ts',
            configRelativePath: 'packages/core/src/messages.ts',
            language: 'typescript',
            contentHash: 'hash',
            workspace: 'core',
          },
          score: 50,
          matches: [],
          totalMatches: 55,
          omittedMatches: 45,
        },
      ],
    })

    await makeSearchProgram().parseAsync(['node', 'specd', 'graph', 'search', 'Change', '--files'])

    expect(getStdout()).toContain('45 more matches in this file')
  })

  it('serializes all four category keys and source ranges in json', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.search.mockResolvedValue({
      ...EMPTY_RESULT,
      symbols: [makeReferenceSymbolResult()],
      files: [
        {
          file: {
            path: 'root:a.ts',
            configRelativePath: 'a.ts',
            language: 'typescript',
            contentHash: 'hash',
            workspace: 'root',
          },
          score: 10,
          totalMatches: 12,
          omittedMatches: 11,
          matches: [
            {
              range: { startLine: 3, startColumn: 2, endLine: 3, endColumn: 8 },
              matchedText: 'Change',
              matchKind: 'raw-token',
              sourceToken: 'change',
            },
          ],
        },
      ],
    })
    await makeSearchProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'Change',
      '--files',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(getStdout()) as {
      readonly symbols: ReadonlyArray<{
        readonly publicBindings: readonly unknown[]
        readonly matchedPublicBindings: ReadonlyArray<{ readonly id: string }>
      }>
      readonly files: ReadonlyArray<{
        readonly totalMatches: number
        readonly omittedMatches: number
        readonly matches: ReadonlyArray<{ readonly range: Record<string, number> }>
      }>
      readonly specs: readonly unknown[]
      readonly documents: readonly unknown[]
    }
    expect(Object.keys(parsed)).toEqual(['symbols', 'files', 'specs', 'documents'])
    expect(parsed.symbols[0]!.publicBindings).toHaveLength(1)
    expect(parsed.symbols[0]!.matchedPublicBindings).toEqual([
      expect.objectContaining({ id: 'binding-id' }),
    ])
    expect(parsed.files[0]).toMatchObject({ totalMatches: 12, omittedMatches: 11 })
    expect(parsed.files[0]!.matches[0]!.range).toEqual({
      startLine: 3,
      startColumn: 2,
      endLine: 3,
      endColumn: 8,
    })
  })

  it('preserves the unified files category and exact ranges in toon output', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.search.mockResolvedValue({
      ...EMPTY_RESULT,
      symbols: [makeReferenceSymbolResult()],
      files: [
        {
          file: {
            path: 'root:a.ts',
            configRelativePath: 'a.ts',
            language: 'typescript',
            contentHash: 'hash',
            workspace: 'root',
          },
          score: 10,
          totalMatches: 12,
          omittedMatches: 11,
          matches: [
            {
              range: { startLine: 3, startColumn: 2, endLine: 3, endColumn: 8 },
              matchedText: 'Change',
              matchKind: 'raw-token',
              sourceToken: 'change',
            },
          ],
        },
      ],
    })
    await makeSearchProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'Change',
      '--files',
      '--format',
      'toon',
    ])

    const rendered = getStdout()
    expect(rendered).toContain('files[1]')
    expect(rendered).toContain('matchedPublicBindings[1]')
    expect(rendered).toContain('binding-id,core')
    expect(rendered).toContain('totalMatches: 12')
    expect(rendered).toContain('omittedMatches: 11')
    expect(rendered).toContain('startLine: 3')
    expect(rendered).toContain('matchKind: raw-token')
  })

  it('keeps spec content independent from snippet output', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.search.mockResolvedValue({
      ...EMPTY_RESULT,
      specs: [
        {
          spec: {
            specId: 'cli:graph-search',
            path: 'graph-search',
            title: 'Graph Search',
            description: 'Search graph results.',
            content: '# Graph Search',
            workspace: 'cli',
          },
          score: 1000,
          snippet: 'Graph Search',
          startLine: 1,
          endLine: 1,
        },
      ],
    })
    await makeSearchProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'graph search',
      '--specs',
      '--format',
      'json',
      '--spec-content',
    ])

    const parsed = JSON.parse(getStdout())
    expect(parsed.specs[0].content).toBe('# Graph Search')
    expect(parsed.specs[0]).not.toHaveProperty('snippet')
  })

  it('rejects invalid input before opening the provider', async () => {
    const { getStderr, mockProvider } = setup()
    try {
      await makeSearchProgram().parseAsync([
        'node',
        'specd',
        'graph',
        'search',
        'target',
        '--kind',
        'unknownKind',
      ])
    } catch {
      // ExitSentinel
    }
    expect(getStderr()).toContain("invalid --kind value 'unknownkind'")
    expect(mockProvider.search).not.toHaveBeenCalled()
  })
})
