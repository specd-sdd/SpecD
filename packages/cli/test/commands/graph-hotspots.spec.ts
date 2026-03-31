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
import { registerGraphHotspots } from '../../src/commands/graph/hotspots.js'

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
    getHotspots: vi.fn().mockResolvedValue({
      totalSymbols: 0,
      entries: [],
    }),
  }
  vi.mocked(withProvider).mockImplementation(async (_config, _format, fn) => {
    await fn(mockProvider as never)
  })

  const getStdout = captureStdout()
  const getStderr = captureStderr()
  mockProcessExit()
  return { mockProvider, getStdout, getStderr }
}

function makeHotspotsProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphHotspots(graph)
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph hotspots', () => {
  it('passes explicit config path to graph context resolution', async () => {
    setup()

    const program = makeHotspotsProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'hotspots',
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

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--path', '/tmp/repo'])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: '/tmp/repo',
    })
  })

  it('keeps implicit defaults when no explicit filter is provided', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith({})
  })

  it('removes implicit defaults when an explicit filter is provided', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--limit', '50'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
        minScore: 0,
        minRisk: 'LOW',
      }),
    )
  })

  it('passes all parsed kinds to hotspot retrieval', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--kind', 'class,method'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: ['class', 'method'],
      }),
    )
  })

  it('rejects invalid kind values before querying', async () => {
    const { getStderr, mockProvider } = setup()

    const program = makeHotspotsProgram()
    try {
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'hotspots',
        '--kind',
        'class,unknownKind',
      ])
    } catch {
      /* ExitSentinel */
    }

    expect(getStderr()).toContain("invalid --kind value 'unknownkind'")
    expect(mockProvider.getHotspots).not.toHaveBeenCalled()
  })

  it('rejects --config and --path together', async () => {
    const { getStderr } = setup()

    const program = makeHotspotsProgram()
    try {
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'hotspots',
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
