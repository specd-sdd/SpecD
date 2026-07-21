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
