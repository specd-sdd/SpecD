import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetGraphHealth } from '../../../src/application/use-cases/get-graph-health.js'
import {
  computeRootFingerprint,
  computeWorkspaceFingerprint,
  serializeFingerprintMap,
} from '../../../src/application/use-cases/_shared/compute-graph-fingerprint.js'
import { type GraphStatistics } from '../../../src/domain/value-objects/graph-statistics.js'
import { type CodeGraphHostPort } from '../../../src/application/ports/code-graph-host-port.js'
import { type WorkspaceIndexTarget } from '../../../src/domain/value-objects/index-options.js'
import { type SpecdConfig, type VcsAdapter } from '@specd/core'
import { buildProjectGraphConfig } from '../../../src/application/services/build-project-graph-config.js'
import { GraphBusyError } from '../../../src/domain/errors/graph-busy-error.js'
import { GraphProviderStaleError } from '../../../src/domain/errors/graph-provider-stale-error.js'
import { IndexCoverageStatus } from '../../../src/domain/value-objects/index-session.js'
import { FreshnessState } from '../../../src/domain/value-objects/indexed-input-freshness.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const createVcsAdapter = vi.fn<(projectRoot: string) => Promise<VcsAdapter>>()
const getGraphHealth = (): GetGraphHealth => new GetGraphHealth(createVcsAdapter)

const BASE_STATS: GraphStatistics = {
  fileCount: 1,
  documentCount: 0,
  symbolCount: 2,
  specCount: 0,
  relationCounts: {} as GraphStatistics['relationCounts'],
  languages: ['typescript'],
  lastIndexedAt: '2026-01-01T00:00:00.000Z',
  lastIndexedRef: 'abc1234',
  graphFingerprint: null,
}

function makeProvider(stats: GraphStatistics = BASE_STATS): CodeGraphHostPort {
  return {
    getStatistics: vi.fn().mockResolvedValue(stats),
    getAllIndexCoverage: vi.fn().mockResolvedValue([
      {
        filePath: 'core:src/index.ts',
        contentHash: 'hash',
        status: IndexCoverageStatus.Indexed,
        reason: undefined,
        capabilities: ['declarations'],
      },
    ]),
  } as unknown as CodeGraphHostPort
}

const config = {
  projectRoot: '/project',
  configPath: '/project/.specd/config',
  schemaRef: '@specd/schema-std',
  workspaces: [
    {
      name: 'core',
      specsPath: '/project/specs/core',
      specsAdapter: { adapter: 'fs', config: { path: '/project/specs/core' } },
      schemasPath: null,
      schemasAdapter: null,
      codeRoot: '/project/packages/core',
      ownership: 'owned',
      isExternal: false,
    },
  ],
  storage: {
    changesPath: '/project/.specd/changes',
    changesAdapter: { adapter: 'fs', config: { path: '/project/.specd/changes' } },
    draftsPath: '/project/.specd/drafts',
    draftsAdapter: { adapter: 'fs', config: { path: '/project/.specd/drafts' } },
    discardedPath: '/project/.specd/discarded',
    discardedAdapter: { adapter: 'fs', config: { path: '/project/.specd/discarded' } },
    archivePath: '/project/.specd/archive',
    archiveAdapter: { adapter: 'fs', config: { path: '/project/.specd/archive' } },
  },
  approvals: { spec: false, signoff: false },
} as SpecdConfig

const codeGraphVersion = '1.0.0'

const mockWorkspace: WorkspaceIndexTarget = {
  name: 'core',
  prefix: 'core',
  codeRoot: '/project/packages/core',
  ownership: 'owned',
  isExternal: false,
  specRepo: {} as WorkspaceIndexTarget['specRepo'],
}

const workspaces = [mockWorkspace]

function matchingFingerprint(version = codeGraphVersion): string {
  const graphConfig = buildProjectGraphConfig(config)
  const fp = computeWorkspaceFingerprint(
    version,
    config.projectRoot,
    mockWorkspace,
    workspaces,
    graphConfig,
  )
  const rootFp = computeRootFingerprint(version, config.projectRoot, workspaces, graphConfig)
  return serializeFingerprintMap(
    new Map([
      ['core', fp],
      ['root', rootFp],
    ]),
  )
}

describe('GetGraphHealth', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns stale false when VCS ref matches', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await getGraphHealth().execute({
      config,
      provider: makeProvider(),
      codeGraphVersion: '1.0.0',
    })

    expect(result.stale).toBe(false)
    expect(result.currentRef).toBe('abc1234')
    expect(result.fileCount).toBe(1)
  })

  it('short-circuits discovery and VCS when the aggregate stale latch is set', async () => {
    const provider = {
      ...makeProvider(),
      getFreshnessLatches: vi.fn().mockResolvedValue({
        graph: true,
        workspaces: { core: true },
      }),
    } as unknown as CodeGraphHostPort

    const result = await getGraphHealth().execute({
      config,
      provider,
      codeGraphVersion,
      workspaces,
    })

    expect(result.state).toBe('stale')
    expect(result.knownStaleSinceLastIndex).toBe(true)
    expect(result.workspaces[0]?.knownStaleSinceLastIndex).toBe(true)
    expect(createVcsAdapter).not.toHaveBeenCalled()
  })

  it('queries modified files once for workspaces sharing a repository root', async () => {
    const modifiedFiles = vi.fn().mockResolvedValue([])
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
      rootDir: vi.fn().mockReturnValue('/project'),
      isClean: vi.fn().mockResolvedValue(true),
      modifiedFiles,
    } as never)
    const sibling = {
      ...mockWorkspace,
      name: 'sdk',
      prefix: 'sdk',
      codeRoot: '/project/packages/sdk',
    }

    await getGraphHealth().execute({
      config,
      provider: makeProvider(),
      codeGraphVersion,
      workspaces: [mockWorkspace, sibling],
    })

    expect(modifiedFiles).toHaveBeenCalledTimes(1)
    expect(modifiedFiles).toHaveBeenCalledWith('abc1234')
  })

  it('returns stale null when lastIndexedRef is null', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await getGraphHealth().execute({
      config,
      provider: makeProvider({ ...BASE_STATS, lastIndexedRef: null }),
      codeGraphVersion: '1.0.0',
    })

    expect(result.stale).toBeNull()
  })

  it('returns stale true when VCS ref differs', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('def5678'),
    } as never)

    const result = await getGraphHealth().execute({
      config,
      provider: makeProvider(),
      codeGraphVersion: '1.0.0',
    })

    expect(result.stale).toBe(true)
  })

  it('does not classify repository dirt outside graph visibility as content dirty', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
      rootDir: vi.fn().mockReturnValue('/project'),
      isClean: vi.fn().mockResolvedValue(false),
    } as never)

    const result = await getGraphHealth().execute({
      config,
      provider: makeProvider(),
      codeGraphVersion,
    })

    expect(result.stale).toBe(false)
    expect(result.contentFresh).toBeNull()
    expect(result.reasonCodes).not.toContain('CONTENT_DIRTY')
    expect(result.reasonCodes).toContain('CONTENT_UNKNOWN')
    expect(result.schemaCompatible).toBe(true)
    expect(result.generationCurrent).toBe(true)
  })

  it('keeps content inspection failures unknown instead of marking the graph dirty', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'specd-health-read-error-'))
    const codeRoot = join(projectRoot, 'src')
    const sourcePath = join(codeRoot, 'index.ts')
    mkdirSync(codeRoot, { recursive: true })
    writeFileSync(sourcePath, 'export const value = 1\n')
    chmodSync(sourcePath, 0o000)
    createVcsAdapter.mockRejectedValue(new Error('no vcs'))
    const provider = {
      ...makeProvider(),
      getAllFiles: vi.fn().mockResolvedValue([
        createFileNode({
          path: 'core:src/index.ts',
          configRelativePath: 'src/index.ts',
          language: 'typescript',
          contentHash: 'indexed-hash',
          workspace: 'core',
        }),
      ]),
      getAllDocuments: vi.fn().mockResolvedValue([]),
    } as unknown as CodeGraphHostPort

    try {
      const result = await getGraphHealth().execute({
        config: { ...config, projectRoot },
        provider,
        codeGraphVersion,
        workspaces: [{ ...mockWorkspace, codeRoot }],
      })

      expect(result.state).toBe(FreshnessState.Unknown)
      expect(result.contentFresh).toBeNull()
      expect(result.reasonCodes).toContain('CONTENT_UNKNOWN')
      expect(result.reasonCodes).not.toContain('CONTENT_DIRTY')
    } finally {
      chmodSync(sourcePath, 0o600)
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('keeps source discovery failures unknown instead of treating files as deleted', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'specd-health-discovery-error-'))
    const codeRoot = join(projectRoot, 'not-a-directory')
    writeFileSync(codeRoot, 'not a directory')
    createVcsAdapter.mockRejectedValue(new Error('no vcs'))
    const provider = {
      ...makeProvider(),
      getAllFiles: vi.fn().mockResolvedValue([
        createFileNode({
          path: 'core:src/index.ts',
          configRelativePath: 'not-a-directory/index.ts',
          language: 'typescript',
          contentHash: 'indexed-hash',
          workspace: 'core',
        }),
      ]),
      getAllDocuments: vi.fn().mockResolvedValue([]),
    } as unknown as CodeGraphHostPort

    try {
      const result = await getGraphHealth().execute({
        config: { ...config, projectRoot },
        provider,
        codeGraphVersion,
        workspaces: [{ ...mockWorkspace, codeRoot }],
      })

      expect(result.state).toBe(FreshnessState.Unknown)
      expect(result.contentFresh).toBeNull()
      expect(result.reasonCodes).toContain('CONTENT_UNKNOWN')
      expect(result.reasonCodes).not.toContain('CONTENT_DIRTY')
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('returns fingerprintMismatch null without workspaces', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await getGraphHealth().execute({
      config,
      provider: makeProvider({ ...BASE_STATS, graphFingerprint: '{"core":"abc"}' }),
      codeGraphVersion,
    })

    expect(result.fingerprintMismatch).toBeNull()
  })

  it('returns fingerprintMismatch false when stored fingerprint matches', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await getGraphHealth().execute({
      config,
      provider: makeProvider({
        ...BASE_STATS,
        graphFingerprint: matchingFingerprint(),
      }),
      codeGraphVersion,
      workspaces,
    })

    expect(result.stale).toBe(false)
    expect(result.fingerprintMismatch).toBe(false)
    expect(result.fileCount).toBe(1)
  })

  it('returns fingerprintMismatch true when derivation differs', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await getGraphHealth().execute({
      config,
      provider: makeProvider({
        ...BASE_STATS,
        graphFingerprint: matchingFingerprint(),
      }),
      codeGraphVersion: '2.0.0',
      workspaces,
    })

    expect(result.fingerprintMismatch).toBe(true)
    expect(result.state).toBe('stale')
  })

  it('aggregates persisted incomplete coverage and never reports current health', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)
    const provider = {
      ...makeProvider({ ...BASE_STATS, graphFingerprint: matchingFingerprint() }),
      getAllIndexCoverage: vi.fn().mockResolvedValue([
        {
          filePath: 'core:src/broken.ts',
          contentHash: 'hash',
          status: IndexCoverageStatus.ParseFailed,
          reason: 'PARSER_FAILED',
          capabilities: [],
        },
        {
          filePath: 'core:src/excluded.ts',
          contentHash: undefined,
          status: IndexCoverageStatus.Excluded,
          reason: 'PATH_EXCLUDED',
          capabilities: [],
        },
        {
          filePath: 'core:src/unsupported.bin',
          contentHash: 'hash',
          status: IndexCoverageStatus.Unsupported,
          reason: 'ADAPTER_UNSUPPORTED',
          capabilities: [],
        },
        {
          filePath: 'core:src/partial.ts',
          contentHash: 'hash',
          status: IndexCoverageStatus.Partial,
          reason: 'REFERENCE_FACTS_PARTIAL',
          capabilities: ['declarations'],
        },
      ]),
    } as unknown as CodeGraphHostPort

    const result = await getGraphHealth().execute({
      config,
      provider,
      codeGraphVersion,
      workspaces,
    })

    expect(result.coverageComplete).toBe(false)
    expect(result.coverage.byStatus['parse-failed']).toBe(1)
    expect(result.coverage.byStatus.excluded).toBe(1)
    expect(result.coverage.byStatus.unsupported).toBe(1)
    expect(result.coverage.byStatus.partial).toBe(1)
    expect(result.reasonCodes).toContain('PARSER_FAILED')
    expect(result.state).not.toBe('current')
  })

  it('marks indexed coverage without a persisted graph node as inconsistent without mutating storage', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)
    const provider = {
      ...makeProvider({ ...BASE_STATS, graphFingerprint: matchingFingerprint() }),
      getAllFiles: vi.fn().mockResolvedValue([]),
      getAllDocuments: vi.fn().mockResolvedValue([]),
    } as unknown as CodeGraphHostPort

    const result = await getGraphHealth().execute({
      config,
      provider,
      codeGraphVersion,
      workspaces,
    })

    expect(result.contentFresh).toBe(false)
    expect(result.coverageComplete).toBe(false)
    expect(result.state).toBe('stale')
    expect(result.coverage.reasons).toContain('indexed-node-missing')
    expect(result.reasonCodes).toContain('GRAPH_CONTENT_INCONSISTENT')
    expect(provider.getAllFiles).toHaveBeenCalled()
    expect(provider.getAllDocuments).toHaveBeenCalled()
  })

  it('treats excluded and unsupported outcomes as terminal aggregate coverage', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)
    const provider = {
      ...makeProvider(),
      getAllIndexCoverage: vi.fn().mockResolvedValue([
        {
          filePath: 'core:src/excluded.ts',
          contentHash: undefined,
          status: IndexCoverageStatus.Excluded,
          reason: 'PATH_EXCLUDED',
          capabilities: [],
        },
        {
          filePath: 'core:README.md',
          contentHash: 'hash',
          status: IndexCoverageStatus.Unsupported,
          reason: 'no-language-adapter',
          capabilities: [],
        },
      ]),
    } as unknown as CodeGraphHostPort

    const result = await getGraphHealth().execute({
      config,
      provider,
      codeGraphVersion,
    })

    expect(result.coverageComplete).toBe(true)
    expect(result.coverage.byStatus.excluded).toBe(1)
    expect(result.coverage.byStatus.unsupported).toBe(1)
    expect(result.reasonCodes).not.toContain('COVERAGE_PARTIAL')
    expect(result.reasonCodes).not.toContain('PATH_EXCLUDED')
    expect(result.reasonCodes).not.toContain('no-language-adapter')
  })

  it('does not open or close the provider', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const open = vi.fn()
    const close = vi.fn()
    const provider = {
      ...makeProvider(),
      open,
      close,
    } as unknown as CodeGraphHostPort

    await getGraphHealth().execute({
      config,
      provider,
      codeGraphVersion,
    })

    expect(open).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  it('returns stale null when the VCS adapter is unavailable', async () => {
    createVcsAdapter.mockRejectedValue(new Error('VCS unavailable'))

    const result = await getGraphHealth().execute({
      config,
      provider: makeProvider(),
      codeGraphVersion,
    })

    expect(result.currentRef).toBeNull()
    expect(result.stale).toBeNull()
  })

  it('propagates GRAPH_BUSY from provider.getStatistics unchanged', async () => {
    const busy = new GraphBusyError('graph is being indexed')
    const provider = {
      getStatistics: vi.fn().mockRejectedValue(busy),
    } as unknown as CodeGraphHostPort

    await expect(
      getGraphHealth().execute({
        config,
        provider,
        codeGraphVersion,
      }),
    ).rejects.toBe(busy)
  })

  it('propagates GRAPH_PROVIDER_STALE from provider.getStatistics unchanged', async () => {
    const stale = new GraphProviderStaleError('provider storage generation is stale')
    const provider = {
      getStatistics: vi.fn().mockRejectedValue(stale),
    } as unknown as CodeGraphHostPort

    await expect(
      getGraphHealth().execute({
        config,
        provider,
        codeGraphVersion,
      }),
    ).rejects.toBe(stale)
  })
})
