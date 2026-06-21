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

vi.mock('../../src/commands/graph/graph-index-lock.js', () => ({
  assertGraphIndexUnlocked: vi.fn(),
}))

import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { assertGraphIndexUnlocked } from '../../src/commands/graph/graph-index-lock.js'
import { registerGraphSearch } from '../../src/commands/graph/search.js'

function setup() {
  const config = makeMockConfig()
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode: 'configured',
    config,
    configFilePath: '/project/specd.yaml',
    kernel: null,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  const mockProvider = {
    searchSymbols: vi.fn().mockResolvedValue([]),
    searchSpecs: vi.fn().mockResolvedValue([]),
    searchDocuments: vi.fn().mockResolvedValue([]),
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
  const graph = program.command('graph')
  registerGraphSearch(graph)
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph search', () => {
  it('passes explicit config path to graph context resolution', async () => {
    setup()

    const program = makeSearchProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'kernel',
      '--config',
      '/tmp/other/specd.yaml',
    ])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: '/tmp/other/specd.yaml',
      repoPath: undefined,
    })
  })

  it('passes explicit bootstrap path to graph context resolution', async () => {
    setup()

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'search', 'kernel', '--path', '/tmp/repo'])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: '/tmp/repo',
    })
  })

  it('uses no-config fallback path by passing no overrides', async () => {
    setup()

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'search', 'kernel'])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: undefined,
    })
  })

  it('checks the shared index lock before opening the provider', async () => {
    setup()

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'search', 'kernel'])

    expect(assertGraphIndexUnlocked).toHaveBeenCalledWith(
      expect.objectContaining({ configPath: '/project/.specd/config' }),
    )
  })

  it('passes all parsed kinds to searchSymbols', async () => {
    const { mockProvider } = setup()

    const program = makeSearchProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'transition',
      '--kind',
      'class,method,function',
      '--symbols',
    ])

    expect(mockProvider.searchSymbols).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'transition',
        kinds: ['class', 'method', 'function'],
      }),
    )
  })

  it('routes document-only search through searchDocuments', async () => {
    const { mockProvider } = setup()

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'search', 'guide', '--documents'])

    expect(mockProvider.searchDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'guide',
      }),
    )
    expect(mockProvider.searchSymbols).not.toHaveBeenCalled()
    expect(mockProvider.searchSpecs).not.toHaveBeenCalled()
  })

  it('renders compact document results in text output by default', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchDocuments.mockResolvedValue([
      {
        document: {
          path: 'root:docs/guide.md',
          configRelativePath: 'docs/guide.md',
          contentHash: 'sha256:doc',
          content: '# Guide',
          workspace: 'root',
        },
        score: 1000,
        snippet: '# Guide',
        startLine: 1,
        endLine: 1,
      },
    ])

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'search', 'docs/guide.md', '--documents'])

    const out = getStdout()
    expect(out).toContain('Documents (1 shown, limit 10):')
    expect(out).toContain('docs/guide.md')
    expect(out).toContain('match @ L1-L1')
    expect(out).not.toContain('snippet @ L1-L1:')
    expect(out).not.toContain('>>>')
  })

  it('rejects invalid kind values before querying', async () => {
    const { getStderr, mockProvider } = setup()

    const program = makeSearchProgram()
    try {
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'search',
        'transition',
        '--kind',
        'method,unknownKind',
      ])
    } catch {
      /* ExitSentinel */
    }

    expect(getStderr()).toContain("invalid --kind value 'unknownkind'")
    expect(mockProvider.searchSymbols).not.toHaveBeenCalled()
    expect(mockProvider.searchSpecs).not.toHaveBeenCalled()
  })

  it('rejects --config and --path together', async () => {
    const { getStderr } = setup()

    const program = makeSearchProgram()
    try {
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'search',
        'kernel',
        '--config',
        './specd.yaml',
        '--path',
        '.',
      ])
    } catch {
      /* ExitSentinel */
    }

    expect(getStderr()).toContain('--config and --path are mutually exclusive')
  })

  it('renders normalized symbol snippets in text output when requested', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchSymbols.mockResolvedValue([
      {
        symbol: {
          id: 'core:src/test.ts:fn:foo',
          name: 'foo',
          kind: 'function',
          filePath: 'core:src/test.ts',
          line: 10,
          column: 1,
        },
        score: 10,
        snippet: '  function foo() {\n    return 1\n  }',
        startLine: 8,
        endLine: 12,
      },
    ])

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'search', 'foo', '--symbols', '--snippet'])

    const out = getStdout()
    expect(out).toContain('Symbols (1 shown, limit 10):')
    expect(out).toContain('[core] function foo')
    expect(out).toContain('src/test.ts:10:1')
    expect(out).toContain('snippet @ L8-L12:')
    expect(out).toContain('>>>')
    // Normalized: common indent (2 spaces) removed, then margin (6 spaces) added
    expect(out).toContain('      function foo() {')
    expect(out).toContain('        return 1')
    expect(out).toContain('      }')
    expect(out).toContain('<<<')
  })

  it('renders document snippets in text output only when requested', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchDocuments.mockResolvedValue([
      {
        document: {
          path: 'root:docs/guide.md',
          configRelativePath: 'docs/guide.md',
          contentHash: 'sha256:doc',
          content: '# Guide',
          workspace: 'root',
        },
        score: 1000,
        snippet: '# Guide',
        startLine: 1,
        endLine: 1,
      },
    ])

    const program = makeSearchProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'docs/guide.md',
      '--documents',
      '--snippet',
    ])

    const out = getStdout()
    expect(out).toContain('Documents (1 shown, limit 10):')
    expect(out).toContain('docs/guide.md')
    expect(out).toContain('match @ L1-L1')
    expect(out).toContain('snippet @ L1-L1:')
    expect(out).toContain('>>>')
    expect(out).toContain('# Guide')
    expect(out).toContain('<<<')
  })

  it('omits snippet from json output by default', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchDocuments.mockResolvedValue([
      {
        document: {
          path: 'root:docs/guide.md',
          configRelativePath: 'docs/guide.md',
          contentHash: 'sha256:doc',
          content: '# Guide',
          workspace: 'root',
        },
        score: 1000,
        snippet: '# Guide',
        startLine: 1,
        endLine: 1,
      },
    ])

    const program = makeSearchProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'docs/guide.md',
      '--documents',
      '--format',
      'json',
    ])

    const payload = JSON.parse(getStdout()) as {
      documents: Array<Record<string, unknown>>
    }
    expect(payload.documents).toHaveLength(1)
    expect(payload.documents[0]?.startLine).toBe(1)
    expect(payload.documents[0]?.endLine).toBe(1)
    expect(payload.documents[0]).not.toHaveProperty('snippet')
  })

  it('includes snippet in json output only when requested', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchDocuments.mockResolvedValue([
      {
        document: {
          path: 'root:docs/guide.md',
          configRelativePath: 'docs/guide.md',
          contentHash: 'sha256:doc',
          content: '# Guide',
          workspace: 'root',
        },
        score: 1000,
        snippet: '# Guide',
        startLine: 1,
        endLine: 1,
      },
    ])

    const program = makeSearchProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'docs/guide.md',
      '--documents',
      '--format',
      'json',
      '--snippet',
    ])

    const payload = JSON.parse(getStdout()) as {
      documents: Array<Record<string, unknown>>
    }
    expect(payload.documents[0]?.snippet).toBe('# Guide')
  })

  it('keeps snippet omitted from toon output by default', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchSpecs.mockResolvedValue([
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
    ])

    const program = makeSearchProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'graph search',
      '--specs',
      '--format',
      'toon',
    ])

    const out = getStdout()
    expect(out).toContain('specs[1]')
    expect(out).not.toContain('snippet:')
  })

  it('includes snippet in toon output when requested', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchSpecs.mockResolvedValue([
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
    ])

    const program = makeSearchProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'search',
      'graph search',
      '--specs',
      '--format',
      'toon',
      '--snippet',
    ])

    const out = getStdout()
    expect(out).toContain('specs[1]')
    expect(out).toContain(
      '{workspace,specId,path,title,description,score,startLine,endLine,snippet}',
    )
    expect(out).toContain(',Graph Search')
  })

  it('keeps spec content independent from snippet in json output', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchSpecs.mockResolvedValue([
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
    ])

    const program = makeSearchProgram()
    await program.parseAsync([
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

    const payload = JSON.parse(getStdout()) as {
      specs: Array<Record<string, unknown>>
    }
    expect(payload.specs[0]?.content).toBe('# Graph Search')
    expect(payload.specs[0]).not.toHaveProperty('snippet')
  })

  it('preserves provider ordering for token-ranked symbol results', async () => {
    const { mockProvider, getStdout } = setup()
    mockProvider.searchSymbols.mockResolvedValue([
      {
        symbol: {
          id: 'core:src/repository.ts:function:change',
          name: 'change',
          kind: 'function',
          filePath: 'core:src/repository.ts',
          line: 1,
          column: 0,
        },
        score: 400,
        snippet: '',
        startLine: 1,
        endLine: 1,
      },
      {
        symbol: {
          id: 'core:src/repository.ts:function:changeLog',
          name: 'changeLog',
          kind: 'function',
          filePath: 'core:src/repository.ts',
          line: 2,
          column: 0,
        },
        score: 300,
        snippet: '',
        startLine: 2,
        endLine: 2,
      },
      {
        symbol: {
          id: 'core:src/repository.ts:function:prechange',
          name: 'prechange',
          kind: 'function',
          filePath: 'core:src/repository.ts',
          line: 3,
          column: 0,
        },
        score: 200,
        snippet: '',
        startLine: 3,
        endLine: 3,
      },
      {
        symbol: {
          id: 'core:src/repository.ts:function:exchangeRate',
          name: 'exchangeRate',
          kind: 'function',
          filePath: 'core:src/repository.ts',
          line: 4,
          column: 0,
        },
        score: 100,
        snippet: '',
        startLine: 4,
        endLine: 4,
      },
    ])

    const program = makeSearchProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'search', 'change', '--symbols'])

    const out = getStdout()
    expect(out.indexOf('function change\n')).toBeLessThan(out.indexOf('function changeLog\n'))
    expect(out.indexOf('function changeLog\n')).toBeLessThan(out.indexOf('function prechange\n'))
    expect(out.indexOf('function prechange\n')).toBeLessThan(out.indexOf('function exchangeRate\n'))
  })
})
