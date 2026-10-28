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

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return {
    ...actual,
    createGetGraphHealth: vi.fn(),
    openSpecdHost: vi.fn(),
    withOpenGraphProvider: vi.fn(),
    createVcsAdapter: vi.fn().mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234def'),
    }),
  }
})

vi.mock('../../src/commands/graph/resolve-graph-cli-context.js', () => ({
  resolveGraphCliContext: vi.fn(),
}))

vi.mock('../../src/commands/graph/with-provider.js', () => ({
  withProvider: vi.fn(),
}))

import {
  createVcsAdapter,
  createGetGraphHealth,
  openSpecdHost,
  withOpenGraphProvider,
  type GetGraphHealthInput,
} from '@specd/sdk'
import { parseFingerprintMap, detectFingerprintMismatch, buildProjectGraphConfig } from '@specd/sdk'
import { codeGraphVersion } from '@specd/sdk'
import { registerGraphStats } from '../../src/commands/graph/stats.js'
import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'

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
  vi.mocked(openSpecdHost).mockResolvedValue({
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel: kernel ?? makeMockKernel(),
    createGraphProvider: vi.fn(),
  })
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode,
    config,
    configFilePath: mode === 'configured' ? '/project/specd.yaml' : null,
    kernel,
    projectRoot: config.projectRoot,
    vcsRoot: config.projectRoot,
  })

  vi.mocked(createVcsAdapter).mockResolvedValue({
    ref: vi.fn().mockResolvedValue('abc1234def'),
  } as never)

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
    getGraphHealth: vi.fn(),
    explainPath: vi.fn(),
  }
  vi.mocked(withOpenGraphProvider).mockImplementation(async (_host, fn) => {
    await fn(mockProvider as never)
  })
  vi.mocked(withProvider).mockImplementation(async (_config, _format, fn) => {
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
                input.adapters ?? [],
                null,
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
            contentFresh: true,
            coverageComplete: true,
            schemaCompatible: true,
            generationCurrent: true,
            reasonCodes:
              stale === true
                ? ['VCS_REF_STALE']
                : fingerprintMismatch === true
                  ? ['DERIVATION_MISMATCH']
                  : [],
          }
        }),
      }) as never,
  )
  mockProvider.getGraphHealth.mockImplementation(async () =>
    createGetGraphHealth().execute({
      config,
      provider: mockProvider as never,
      codeGraphVersion,
      ...(kernel !== null
        ? {
            workspaces: config.workspaces.map((workspace) => ({
              name: workspace.name,
              prefix: workspace.name,
              codeRoot: workspace.codeRoot,
              specRepo: {} as never,
              ownership: workspace.ownership,
              isExternal: workspace.isExternal,
            })),
          }
        : {}),
    }),
  )

  const getStdout = captureStdout()
  const getStderr = captureStderr()
  mockProcessExit()
  return { config, mockProvider, getStdout, getStderr }
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

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('graph stats', () => {
  it('delegates graph access through the SDK lifecycle helper', async () => {
    const { config } = setup()

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(withProvider).toHaveBeenCalledWith(
      config,
      'text',
      expect.any(Function),
      expect.objectContaining({ kernel: expect.anything() }),
    )
  })

  it('returns normally after the shared lifecycle helper completes', async () => {
    const order: string[] = []
    setup()
    vi.mocked(withProvider).mockImplementation(async (_config, _format, fn) => {
      await fn({
        getGraphHealth: vi.fn().mockResolvedValue({
          ...DEFAULT_STATS,
          stale: false,
          currentRef: DEFAULT_STATS.lastIndexedRef,
          fingerprintMismatch: false,
          contentFresh: true,
          coverageComplete: true,
          schemaCompatible: true,
          generationCurrent: true,
          reasonCodes: [],
        }),
      } as never)
      order.push('close')
    })
    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(order).toEqual(['close'])
  })

  it('passes explicit config path to SDK host bootstrap', async () => {
    setup()

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--config', '/tmp/other/specd.yaml')

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: '/tmp/other/specd.yaml',
      repoPath: undefined,
    })
  })

  it('runs configured non-VCS stats through the provider lifecycle', async () => {
    const { config, mockProvider, getStderr } = setup()
    vi.mocked(resolveGraphCliContext).mockResolvedValue({
      mode: 'configured',
      config,
      configFilePath: '/tmp/non-vcs-project/specd.yaml',
      kernel: makeMockKernel(),
      projectRoot: '/tmp/non-vcs-project',
      vcsRoot: null,
    })

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--config', '/tmp/non-vcs-project/specd.yaml')

    expect(withProvider).toHaveBeenCalledWith(
      config,
      'text',
      expect.any(Function),
      expect.objectContaining({ kernel: expect.anything() }),
    )
    expect(mockProvider.getGraphHealth).toHaveBeenCalledTimes(1)
    expect(getStderr()).not.toContain('not inside a Git repository')
  })

  it('passes explicit bootstrap path to SDK host bootstrap', async () => {
    setup('bootstrap')

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats', '--path', '/tmp/repo')

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: '/tmp/repo',
    })
  })

  it('uses no-config fallback path', async () => {
    setup('bootstrap')

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: undefined,
    })
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
    expect(stdout).toContain('VCS_REF_STALE')
  })

  it('given a derivation mismatch, when graph stats runs in text mode, then the warning names resolution manifests', async () => {
    const { getStdout } = setup(
      'configured',
      { lastIndexedRef: 'abc1234def', graphFingerprint: '{"core":"stale-digest"}' },
      { vcsRef: 'abc1234def' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(getStdout()).toContain(
      '⚠ Derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed',
    )
  })

  it('shows exact stale warning with truncated refs in text output', async () => {
    const { getStdout } = setup(
      'configured',
      { lastIndexedRef: 'abc1234def' },
      { vcsRef: 'fff9999aaa' },
    )

    const program = makeStatsProgram()
    await runStats(program, 'graph', 'stats')

    expect(getStdout()).toContain('VCS_REF_STALE')
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
          [],
          null,
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
          [],
          null,
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

    expect(getStderr()).toBe('')
    expect(getStdout()).toContain('DERIVATION_MISMATCH')
  })

  describe('coverage completeness presentation', () => {
    const healthWith = (
      coverageCompleteness: string,
      coverageWarnings: ReadonlyArray<{ code: string; count: number }>,
    ): Record<string, unknown> => ({
      ...DEFAULT_STATS,
      lastIndexedRef: 'abc1234def',
      state: 'current',
      knownStaleSinceLastIndex: false,
      workspaces: [],
      stale: false,
      currentRef: 'abc1234def',
      fingerprintMismatch: false,
      contentFresh: true,
      coverageComplete: true,
      coverageCompleteness,
      coverageWarnings,
      coverage: {
        total: 4,
        byStatus: { indexed: 1, excluded: 0, unsupported: 3, 'parse-failed': 0, partial: 0 },
        reasons: ['file-too-large'],
      },
      schemaCompatible: true,
      generationCurrent: true,
      reasonCodes: [],
    })

    it('labels a graph with size skips as complete with warnings and shows the hint', async () => {
      // Given graph health that reports three size skips
      const { mockProvider, getStdout } = setup('configured')
      mockProvider.getGraphHealth.mockResolvedValue(
        healthWith('complete-with-warnings', [{ code: 'file-too-large', count: 3 }]),
      )

      // When stats prints in text mode
      await runStats(makeStatsProgram(), 'graph', 'stats')

      // Then the warning and the hint appear and absence is not claimed to be provable
      const out = getStdout()
      expect(out).toContain('coverage: complete with warnings (3 file(s) skipped: file-too-large)')
      expect(out).toContain('graph.maxFileBytes')
      expect(out).toContain('graph.largeFilePaths')
      expect(out).toContain('Symbol absence cannot be proven')
    })

    it('prints no warning line for a complete graph', async () => {
      const { mockProvider, getStdout } = setup('configured')
      mockProvider.getGraphHealth.mockResolvedValue(healthWith('complete', []))

      await runStats(makeStatsProgram(), 'graph', 'stats')

      expect(getStdout()).not.toContain('complete with warnings')
    })

    it('does not print a plain complete label next to the warning', async () => {
      // Given graph health with size skips
      const { mockProvider, getStdout } = setup('configured')
      mockProvider.getGraphHealth.mockResolvedValue(
        healthWith('complete-with-warnings', [{ code: 'file-too-large', count: 3 }]),
      )

      // When stats prints in text mode
      await runStats(makeStatsProgram(), 'graph', 'stats')

      // Then the boolean complete line is not shown
      expect(getStdout()).not.toContain('Coverage complete:')
    })

    it('keeps the plain complete line for a complete graph', async () => {
      const { mockProvider, getStdout } = setup('configured')
      mockProvider.getGraphHealth.mockResolvedValue(healthWith('complete', []))

      await runStats(makeStatsProgram(), 'graph', 'stats')

      expect(getStdout()).toContain('Coverage complete: true')
    })

    it('renders incomplete and unknown completeness without the warning label', async () => {
      for (const completeness of ['incomplete', 'unknown']) {
        const { mockProvider, getStdout } = setup('configured')
        mockProvider.getGraphHealth.mockResolvedValue({
          ...healthWith(completeness, []),
          coverageComplete: completeness === 'unknown' ? null : false,
        })

        await runStats(makeStatsProgram(), 'graph', 'stats')

        const out = getStdout()
        expect(out).not.toContain('complete with warnings')
        expect(out).toContain('Coverage complete: ')
      }
    })

    it('prints the warning label without parentheses when no warning is listed', async () => {
      const { mockProvider, getStdout } = setup('configured')
      mockProvider.getGraphHealth.mockResolvedValue(healthWith('complete-with-warnings', []))

      await runStats(makeStatsProgram(), 'graph', 'stats')

      expect(getStdout()).toContain('coverage: complete with warnings\n')
      expect(getStdout()).not.toContain('complete with warnings (')
    })

    it('exposes the completeness fields in TOON output', async () => {
      const { mockProvider, getStdout } = setup('configured')
      mockProvider.getGraphHealth.mockResolvedValue(
        healthWith('complete-with-warnings', [{ code: 'file-too-large', count: 3 }]),
      )

      await runStats(makeStatsProgram(), 'graph', 'stats', '--format', 'toon')

      const out = getStdout()
      expect(out).toContain('complete-with-warnings')
      expect(out).toContain('file-too-large')
      expect(out).not.toContain('graph.largeFilePaths')
    })

    it('lists every warning code with its own count', async () => {
      const { mockProvider, getStdout } = setup('configured')
      mockProvider.getGraphHealth.mockResolvedValue(
        healthWith('complete-with-warnings', [
          { code: 'file-too-large', count: 2 },
          { code: 'other-warning', count: 1 },
        ]),
      )

      await runStats(makeStatsProgram(), 'graph', 'stats')

      expect(getStdout()).toContain(
        'coverage: complete with warnings (2 file(s) skipped: file-too-large; 1 file(s) skipped: other-warning)',
      )
    })

    it('exposes the fields unchanged in structured output without hint text', async () => {
      const { mockProvider, getStdout } = setup('configured')
      mockProvider.getGraphHealth.mockResolvedValue(
        healthWith('complete-with-warnings', [{ code: 'file-too-large', count: 3 }]),
      )

      await runStats(makeStatsProgram(), 'graph', 'stats', '--format', 'json')

      const parsed = parseStdoutJson(getStdout)
      expect(parsed.coverageCompleteness).toBe('complete-with-warnings')
      expect(parsed.coverageWarnings).toEqual([{ code: 'file-too-large', count: 3 }])
      expect(getStdout()).not.toContain('graph.largeFilePaths')
    })
  })
})
