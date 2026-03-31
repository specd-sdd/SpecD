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
})
