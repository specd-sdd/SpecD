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

vi.mock('@specd/core', async () => {
  const actual = await vi.importActual<typeof import('@specd/core')>('@specd/core')
  return {
    ...actual,
    createVcsAdapter: vi.fn().mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
    }),
  }
})

import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { registerGraphStats } from '../../src/commands/graph/stats.js'

function setup(mode: 'configured' | 'bootstrap' = 'configured') {
  const config = makeMockConfig()
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode,
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel: null,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  const mockProvider = {
    getStatistics: vi.fn().mockResolvedValue({
      fileCount: 1,
      symbolCount: 2,
      specCount: 0,
      relationCounts: {},
      languages: ['typescript'],
      lastIndexedAt: '2026-03-31T10:00:00.000Z',
      lastIndexedRef: 'abc1234def',
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

function makeStatsProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphStats(graph)
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph stats', () => {
  it('passes explicit config path to graph context resolution', async () => {
    setup()

    const program = makeStatsProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'stats',
      '--config',
      '/tmp/other/specd.yaml',
    ])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: '/tmp/other/specd.yaml',
      repoPath: undefined,
    })
  })

  it('passes explicit bootstrap path to graph context resolution', async () => {
    setup('bootstrap')

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats', '--path', '/tmp/repo'])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: '/tmp/repo',
    })
  })

  it('uses no-config fallback path by passing no overrides', async () => {
    setup('bootstrap')

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats'])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: undefined,
    })
  })

  it('rejects --config and --path together', async () => {
    const { getStderr } = setup()

    const program = makeStatsProgram()
    try {
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'stats',
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
