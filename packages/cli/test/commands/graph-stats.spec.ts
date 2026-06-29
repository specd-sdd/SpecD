import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  ExitSentinel,
} from './helpers.js'

vi.mock('../../src/helpers/sdk-host.js', () => ({
  resolveSdkHostContext: vi.fn(),
}))

vi.mock('../../src/commands/graph/resolve-graph-cli-context.js', () => ({
  resolveGraphCliContext: vi.fn(),
}))

vi.mock('../../src/commands/graph/with-provider.js', () => ({
  withProvider: vi.fn(),
}))

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
    assertGraphIndexUnlocked: vi.fn(),
    createGetGraphHealth: vi.fn(),
    createVcsAdapter: vi.fn().mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
    }),
  }
})

import {
  createVcsAdapter,
  assertGraphIndexUnlocked,
  createGetGraphHealth,
  type GetGraphHealthInput,
} from '@specd/sdk'
import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { resolveSdkHostContext } from '../../src/helpers/sdk-host.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { parseFingerprintMap, detectFingerprintMismatch, buildProjectGraphConfig } from '@specd/sdk'
import { codeGraphVersion } from '@specd/sdk'
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
  options: {
    withKernel?: boolean
    vcsRef?: string | null
    vcsError?: boolean
  } = {},
) {
  const config = makeMockConfig()
  const kernel = mode === 'configured' || options.withKernel ? makeMockKernel() : null
  if (kernel !== null) {
    kernel.project.getConfig.execute.mockReturnValue(config)
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
  vi.mocked(resolveSdkHostContext).mockImplementation(async (_cfg, k) => ({
    kernel: k!,
    createGraphProvider: vi.fn(),
  }))

  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode,
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  if (options.vcsError === true) {
    vi.mocked(createVcsAdapter).mockRejectedValue(new Error('no VCS'))
  } else if (options.vcsRef !== undefined) {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue(options.vcsRef),
    } as never)
  }

  const mockProvider = {
    getStatistics: vi.fn().mockResolvedValue({
      ...DEFAULT_STATS,
      ...statOverrides,
    }),
  }
  vi.mocked(withProvider).mockImplementation(async (_config, _fmt, fn) => {
    await fn(mockProvider as never)
  })
  vi.mocked(createGetGraphHealth).mockImplementation(
    () =>
      ({
        execute: vi.fn().mockImplementation(async (input: GetGraphHealthInput) => {
          let currentRef: string | null = null
          try {
            const vcs = await createVcsAdapter(input.config.projectRoot)
            currentRef = (await vcs.ref()) ?? null
          } catch {
            currentRef = null
          }
          const stats = await input.provider.getStatistics()
          const lastIndexedRef = stats.lastIndexedRef ?? null
          const stale =
            lastIndexedRef !== null && currentRef !== null ? lastIndexedRef !== currentRef : null
          let fingerprintMismatch: boolean | null = null
          if (input.workspaces !== undefined && stats.graphFingerprint != null) {
            try {
              const storedMap = parseFingerprintMap(stats.graphFingerprint)
              const graphConfig = buildProjectGraphConfig(input.config)
              fingerprintMismatch = detectFingerprintMismatch(
                storedMap,
                input.codeGraphVersion,
                input.config.projectRoot,
                [...input.workspaces],
                graphConfig,
              )
            } catch {
              fingerprintMismatch = null
            }
          }
          return {
            fileCount: stats.fileCount ?? DEFAULT_STATS.fileCount,
            documentCount: stats.documentCount ?? DEFAULT_STATS.documentCount,
            symbolCount: stats.symbolCount ?? DEFAULT_STATS.symbolCount,
            specCount: stats.specCount ?? DEFAULT_STATS.specCount,
            relationCounts: stats.relationCounts ?? DEFAULT_STATS.relationCounts,
            languages: stats.languages ?? DEFAULT_STATS.languages,
            lastIndexedAt: stats.lastIndexedAt ?? DEFAULT_STATS.lastIndexedAt,
            lastIndexedRef,
            stale,
            currentRef,
            fingerprintMismatch,
          }
        }),
      }) as never,
  )

  const getStdout = captureStdout()
  const getStderr = captureStderr()
  mockProcessExit()
  return { mockProvider, getStdout, getStderr }
}

function parseStdoutJson(getStdout: () => string): Record<string, unknown> {
  const raw = getStdout().trim()
  const lastBrace = raw.lastIndexOf('{\n')
  const jsonText = lastBrace >= 0 ? raw.slice(lastBrace) : raw
  return JSON.parse(jsonText) as Record<string, unknown>
}

async function runStats(
  program: ReturnType<typeof makeStatsProgram>,
  ...args: string[]
): Promise<void> {
  try {
    await program.parseAsync(['node', 'specd', ...args])
  } catch (error) {
    if (!(error instanceof ExitSentinel)) throw error
  }
}

function makeStatsProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphStats(graph)
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph stats', () => {
  it('delegates graph access through withProvider', async () => {
    setup()

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(withProvider).toHaveBeenCalled()
  })

  it('passes explicit config path to graph context resolution', async () => {
    setup()

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--config', '/tmp/other/specd.yaml')

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: '/tmp/other/specd.yaml',
      repoPath: undefined,
    })
  })

  it('passes explicit bootstrap path to graph context resolution', async () => {
    setup('bootstrap')

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--path', '/tmp/repo')

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: '/tmp/repo',
    })
  })

  it('uses no-config fallback path by passing no overrides', async () => {
    setup('bootstrap')

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: undefined,
    })
  })

  it('checks the shared index lock before opening the provider', async () => {
    setup()

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(assertGraphIndexUnlocked).toHaveBeenCalledWith(
      expect.objectContaining({ configPath: '/project/.specd/config' }),
    )
  })

  it('rejects --config and --path together', async () => {
    const { getStderr } = setup()

    const program = makeStatsProgram()
    try {
      await runStats(program, 'graph', 'stats', '--config', './specd.yaml', '--path', '.')
    } catch {
      /* ExitSentinel */
    }

    expect(getStderr()).toContain('--config and --path are mutually exclusive')
  })
})

describe('graph stats — staleness detection', () => {
  it('reports stale when lastIndexedRef differs from currentRef', async () => {
    const { getStdout } = setup(
      'configured',
      { lastIndexedRef: 'abc1234def' },
      { vcsRef: 'fff9999aaa' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--format', 'json')

    const parsed = parseStdoutJson(getStdout)
    expect(parsed.stale).toBe(true)
    expect(parsed.currentRef).toBe('fff9999aaa')
  })

  it('reports fresh when lastIndexedRef equals currentRef', async () => {
    const { getStdout } = setup(
      'configured',
      { lastIndexedRef: 'abc1234def' },
      { vcsRef: 'abc1234def' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--format', 'json')

    const parsed = parseStdoutJson(getStdout)
    expect(parsed.stale).toBe(false)
    expect(parsed.currentRef).toBe('abc1234def')
  })

  it('reports unknown staleness when lastIndexedRef is null', async () => {
    const { getStdout } = setup(
      'configured',
      { ...DEFAULT_STATS_NO_REF, lastIndexedRef: null as unknown as string },
      { vcsRef: 'abc1234def' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--format', 'json')

    const parsed = parseStdoutJson(getStdout)
    expect(parsed.stale).toBeNull()
    expect(parsed.currentRef).toBe('abc1234def')
  })

  it('reports unknown staleness when VCS ref is unavailable', async () => {
    const { getStdout } = setup('configured', { lastIndexedRef: 'abc1234def' }, { vcsError: true })

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--format', 'json')

    const parsed = parseStdoutJson(getStdout)
    expect(parsed.stale).toBeNull()
    expect(parsed.currentRef).toBeNull()
  })

  it('still outputs full stats when graph is stale (warn, not block)', async () => {
    const { getStdout } = setup(
      'configured',
      { lastIndexedRef: 'abc1234def' },
      { vcsRef: 'fff9999aaa' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    const stdout = getStdout()
    expect(stdout).toContain('Files:     1')
    expect(stdout).toContain('Documents: 1')
    expect(stdout).toContain('Symbols:   2')
    expect(stdout).toContain('Specs:     0')
    expect(stdout).toContain('⚠ Graph is stale')
  })

  it('shows exact stale warning with truncated refs in text output', async () => {
    const { getStdout } = setup(
      'configured',
      { lastIndexedRef: 'abc1234def' },
      { vcsRef: 'fff9999aaa' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(getStdout()).toContain('⚠ Graph is stale (indexed at abc1234, current: fff9999)')
  })

  it('omits staleness line when lastIndexedRef is null in text output', async () => {
    const { getStdout } = setup('configured', {
      ...DEFAULT_STATS_NO_REF,
      lastIndexedRef: null as unknown as string,
    })

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(getStdout()).not.toContain('Graph is stale')
  })

  it('includes stale, currentRef, and fingerprintMismatch in JSON output', async () => {
    const { getStdout } = setup(
      'configured',
      { lastIndexedRef: 'abc1234def' },
      { vcsRef: 'fff9999aaa' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--format', 'json')

    const parsed = parseStdoutJson(getStdout)
    expect(parsed).toHaveProperty('stale', true)
    expect(parsed).toHaveProperty('currentRef', 'fff9999aaa')
    expect(parsed).toHaveProperty('fingerprintMismatch', null)
  })

  it('includes stale, currentRef, and fingerprintMismatch in TOON output', async () => {
    const { getStdout } = setup(
      'configured',
      { lastIndexedRef: 'abc1234def' },
      { vcsRef: 'fff9999aaa' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--format', 'toon')

    const stdout = getStdout()
    expect(stdout).toContain('stale')
    expect(stdout).toContain('currentRef')
    expect(stdout).toContain('fingerprintMismatch')
  })

  it('reports fingerprintMismatch false after recomputing the same effective graph config', async () => {
    const config = makeMockConfig()
    const { computeWorkspaceFingerprint, computeRootFingerprint, serializeFingerprintMap } =
      await import('@specd/sdk')
    const graphConfig = buildProjectGraphConfig(config)
    const graphFingerprintEntries: Array<readonly [string, string]> = [
      ...config.workspaces.map((workspace): readonly [string, string] => [
        workspace.name,
        computeWorkspaceFingerprint(
          codeGraphVersion,
          config.projectRoot,
          {
            name: workspace.name,
            prefix: null,
            codeRoot: workspace.codeRoot,
            ownership: workspace.ownership,
            isExternal: workspace.isExternal,
            specRepo: {} as never,
          },
          config.workspaces.map((candidate) => ({
            name: candidate.name,
            prefix: null,
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
            prefix: null,
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
    await runStats(program, 'graph', 'stats', '--format', 'json')

    const parsed = parseStdoutJson(getStdout)
    expect(parsed.fingerprintMismatch).toBe(false)
  })

  it('prints derivation fingerprint mismatch warning to stderr in text mode', async () => {
    const { getStderr, getStdout } = setup(
      'configured',
      { graphFingerprint: '{"core":"deadbeef"}' },
      { withKernel: true },
    )

    await runStats(makeStatsProgram(), 'graph', 'stats')

    expect(getStderr()).toContain(
      '⚠ Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index',
    )
    expect(getStdout()).not.toContain('Derivation fingerprint mismatch')
  })

  it('exits with code 3 when lock check fails', async () => {
    setup('configured')
    vi.mocked(assertGraphIndexUnlocked).mockImplementationOnce(() => {
      throw new Error('graph is locked')
    })
    mockProcessExit()

    const program = makeStatsProgram()
    await expect(program.parseAsync(['node', 'specd', 'graph', 'stats'])).rejects.toThrow(
      ExitSentinel,
    )

    expect(process.exit).toHaveBeenCalledWith(3)
  })
})
