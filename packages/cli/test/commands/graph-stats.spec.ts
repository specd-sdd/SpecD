import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockKernel,
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

vi.mock('@specd/core', async () => {
  const actual = await vi.importActual<typeof import('@specd/core')>('@specd/core')
  return {
    ...actual,
    createVcsAdapter: vi.fn().mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
    }),
  }
})

import { createVcsAdapter } from '@specd/core'
import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { assertGraphIndexUnlocked } from '../../src/commands/graph/graph-index-lock.js'
import { buildProjectGraphConfig } from '../../src/commands/graph/build-project-graph-config.js'
import { codeGraphVersion } from '../../src/commands/graph/code-graph-version.js'
import { registerGraphStats } from '../../src/commands/graph/stats.js'

const DEFAULT_STATS = {
  fileCount: 1,
  documentCount: 1,
  symbolCount: 2,
  specCount: 0,
  relationCounts: {},
  languages: ['typescript'],
  lastIndexedAt: '2026-03-31T10:00:00.000Z',
  lastIndexedRef: 'abc1234def',
}

const { lastIndexedRef: _, ...DEFAULT_STATS_NO_REF } = DEFAULT_STATS

function setup(
  mode: 'configured' | 'bootstrap' = 'configured',
  statOverrides: Record<string, unknown> = {},
  options: { withKernel?: boolean } = {},
) {
  const config = makeMockConfig()
  const kernel = options.withKernel ? makeMockKernel() : null
  if (kernel !== null) {
    kernel.project.listWorkspaces.execute.mockResolvedValue(
      config.workspaces.map((workspace) => ({
        name: workspace.name,
        codeRoot: workspace.codeRoot,
        ownership: workspace.ownership,
        isExternal: workspace.isExternal,
        specRepo: {} as never,
      })),
    )
  }
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode,
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  const mockProvider = {
    getStatistics: vi.fn().mockResolvedValue({
      ...DEFAULT_STATS,
      ...statOverrides,
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

  it('checks the shared index lock before opening the provider', async () => {
    setup()

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats'])

    expect(assertGraphIndexUnlocked).toHaveBeenCalledWith(
      expect.objectContaining({ configPath: '/project/.specd/config' }),
    )
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

describe('graph stats — staleness detection', () => {
  it('reports stale when lastIndexedRef differs from currentRef', async () => {
    const { getStdout } = setup('configured', { lastIndexedRef: 'abc1234def' })
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('fff9999aaa'),
    } as never)

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats', '--format', 'json'])

    const parsed = JSON.parse(getStdout())
    expect(parsed.stale).toBe(true)
    expect(parsed.currentRef).toBe('fff9999aaa')
  })

  it('reports fresh when lastIndexedRef equals currentRef', async () => {
    const { getStdout } = setup('configured', { lastIndexedRef: 'abc1234def' })
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
    } as never)

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats', '--format', 'json'])

    const parsed = JSON.parse(getStdout())
    expect(parsed.stale).toBe(false)
    expect(parsed.currentRef).toBe('abc1234def')
  })

  it('reports unknown staleness when lastIndexedRef is null', async () => {
    const { getStdout } = setup('configured', {
      ...DEFAULT_STATS_NO_REF,
      lastIndexedRef: null as unknown as string,
    })
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
    } as never)

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats', '--format', 'json'])

    const parsed = JSON.parse(getStdout())
    expect(parsed.stale).toBeNull()
    expect(parsed.currentRef).toBe('abc1234def')
  })

  it('reports unknown staleness when VCS ref is unavailable', async () => {
    const { getStdout } = setup('configured', { lastIndexedRef: 'abc1234def' })
    vi.mocked(createVcsAdapter).mockRejectedValue(new Error('no VCS'))

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats', '--format', 'json'])

    const parsed = JSON.parse(getStdout())
    expect(parsed.stale).toBeNull()
    expect(parsed.currentRef).toBeNull()
  })

  it('still outputs full stats when graph is stale (warn, not block)', async () => {
    const { getStdout } = setup('configured', { lastIndexedRef: 'abc1234def' })
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('fff9999aaa'),
    } as never)

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats'])

    const stdout = getStdout()
    expect(stdout).toContain('Files:     1')
    expect(stdout).toContain('Documents: 1')
    expect(stdout).toContain('Symbols:   2')
    expect(stdout).toContain('Specs:     0')
    expect(stdout).toContain('⚠ Graph is stale')
  })

  it('shows exact stale warning with truncated refs in text output', async () => {
    const { getStdout } = setup('configured', { lastIndexedRef: 'abc1234def' })
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('fff9999aaa'),
    } as never)

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats'])

    expect(getStdout()).toContain('⚠ Graph is stale (indexed at abc1234, current: fff9999)')
  })

  it('omits staleness line when lastIndexedRef is null in text output', async () => {
    const { getStdout } = setup('configured', {
      ...DEFAULT_STATS_NO_REF,
      lastIndexedRef: null as unknown as string,
    })

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats'])

    expect(getStdout()).not.toContain('Graph is stale')
  })

  it('includes stale, currentRef, and fingerprintMismatch in JSON output', async () => {
    const { getStdout } = setup('configured', { lastIndexedRef: 'abc1234def' })
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('fff9999aaa'),
    } as never)

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats', '--format', 'json'])

    const parsed = JSON.parse(getStdout())
    expect(parsed).toHaveProperty('stale', true)
    expect(parsed).toHaveProperty('currentRef', 'fff9999aaa')
    expect(parsed).toHaveProperty('fingerprintMismatch', null)
  })

  it('includes stale, currentRef, and fingerprintMismatch in TOON output', async () => {
    const { getStdout } = setup('configured', { lastIndexedRef: 'abc1234def' })
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('fff9999aaa'),
    } as never)

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats', '--format', 'toon'])

    const stdout = getStdout()
    expect(stdout).toContain('stale')
    expect(stdout).toContain('currentRef')
    expect(stdout).toContain('fingerprintMismatch')
  })

  it('reports fingerprintMismatch false after recomputing the same effective graph config', async () => {
    const config = makeMockConfig()
    const { computeWorkspaceFingerprint, computeRootFingerprint, serializeFingerprintMap } =
      await import('@specd/code-graph')
    const graphConfig = buildProjectGraphConfig(config)
    const graphFingerprintEntries: Array<readonly [string, string]> = [
      ...config.workspaces.map((workspace): readonly [string, string] => [
        workspace.name,
        computeWorkspaceFingerprint(
          codeGraphVersion,
          config.projectRoot,
          {
            name: workspace.name,
            codeRoot: workspace.codeRoot,
            ownership: workspace.ownership,
            isExternal: workspace.isExternal,
            specRepo: {} as never,
          },
          config.workspaces.map((candidate) => ({
            name: candidate.name,
            codeRoot: candidate.codeRoot,
            ownership: candidate.ownership,
            isExternal: candidate.isExternal,
            specRepo: {} as never,
          })),
          graphConfig,
        ),
      ]),
      [
        'root',
        computeRootFingerprint(
          codeGraphVersion,
          config.projectRoot,
          config.workspaces.map((workspace) => ({
            name: workspace.name,
            codeRoot: workspace.codeRoot,
            ownership: workspace.ownership,
            isExternal: workspace.isExternal,
            specRepo: {} as never,
          })),
          graphConfig,
        ),
      ],
    ]
    const graphFingerprint = serializeFingerprintMap(new Map(graphFingerprintEntries))

    const { getStdout } = setup(
      'configured',
      { graphFingerprint, lastIndexedRef: 'abc1234def' },
      { withKernel: true },
    )

    const program = makeStatsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'stats', '--format', 'json'])

    const parsed = JSON.parse(getStdout())
    expect(parsed.fingerprintMismatch).toBe(false)
  })
})
