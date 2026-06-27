import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetGraphHealth } from '../../../src/application/use-cases/get-graph-health.js'
import {
  computeRootFingerprint,
  computeWorkspaceFingerprint,
  serializeFingerprintMap,
} from '../../../src/application/use-cases/_shared/compute-graph-fingerprint.js'
import { GRAPH_INDEX_LOCK_MESSAGE } from '../../../src/infrastructure/index-lock.js'
import { type GraphStatistics } from '../../../src/domain/value-objects/graph-statistics.js'
import { type CodeGraphHostPort } from '../../../src/application/ports/code-graph-host-port.js'
import { type WorkspaceIndexTarget } from '../../../src/domain/value-objects/index-options.js'
import { type SpecdConfig } from '@specd/core'
import { buildProjectGraphConfig } from '../../../src/application/services/build-project-graph-config.js'

vi.mock('@specd/core', async () => {
  const actual = await vi.importActual<typeof import('@specd/core')>('@specd/core')
  return {
    ...actual,
    createVcsAdapter: vi.fn(),
  }
})

import { createVcsAdapter } from '@specd/core'

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
    assertGraphIndexUnlocked: vi.fn(),
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

    const result = await new GetGraphHealth().execute({
      config,
      provider: makeProvider(),
      codeGraphVersion: '1.0.0',
      assertUnlocked: false,
    })

    expect(result.stale).toBe(false)
    expect(result.currentRef).toBe('abc1234')
    expect(result.fileCount).toBe(1)
  })

  it('returns stale null when lastIndexedRef is null', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await new GetGraphHealth().execute({
      config,
      provider: makeProvider({ ...BASE_STATS, lastIndexedRef: null }),
      codeGraphVersion: '1.0.0',
      assertUnlocked: false,
    })

    expect(result.stale).toBeNull()
  })

  it('returns stale true when VCS ref differs', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('def5678'),
    } as never)

    const result = await new GetGraphHealth().execute({
      config,
      provider: makeProvider(),
      codeGraphVersion: '1.0.0',
      assertUnlocked: false,
    })

    expect(result.stale).toBe(true)
  })

  it('asserts lock before statistics by default', async () => {
    const provider = makeProvider()
    vi.mocked(provider.assertGraphIndexUnlocked).mockImplementation(() => {
      throw new Error(GRAPH_INDEX_LOCK_MESSAGE)
    })

    await expect(
      new GetGraphHealth().execute({
        config,
        provider,
        codeGraphVersion: '1.0.0',
      }),
    ).rejects.toThrow(GRAPH_INDEX_LOCK_MESSAGE)

    expect(provider.getStatistics).not.toHaveBeenCalled()
  })

  it('skips lock assertion when assertUnlocked is false', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue(null),
    } as never)

    const provider = makeProvider()
    vi.mocked(provider.assertGraphIndexUnlocked).mockImplementation(() => {
      throw new Error(GRAPH_INDEX_LOCK_MESSAGE)
    })

    await expect(
      new GetGraphHealth().execute({
        config,
        provider,
        codeGraphVersion: '1.0.0',
        assertUnlocked: false,
      }),
    ).resolves.toBeDefined()

    expect(provider.getStatistics).toHaveBeenCalled()
  })

  it('returns fingerprintMismatch null without workspaces', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await new GetGraphHealth().execute({
      config,
      provider: makeProvider({ ...BASE_STATS, graphFingerprint: '{"core":"abc"}' }),
      codeGraphVersion,
      assertUnlocked: false,
    })

    expect(result.fingerprintMismatch).toBeNull()
  })

  it('returns fingerprintMismatch false when stored fingerprint matches', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await new GetGraphHealth().execute({
      config,
      provider: makeProvider({
        ...BASE_STATS,
        graphFingerprint: matchingFingerprint(),
      }),
      codeGraphVersion,
      workspaces,
      assertUnlocked: false,
    })

    expect(result.stale).toBe(false)
    expect(result.fingerprintMismatch).toBe(false)
    expect(result.fileCount).toBe(1)
  })

  it('returns fingerprintMismatch true when derivation differs', async () => {
    vi.mocked(createVcsAdapter).mockResolvedValue({
      ref: vi.fn().mockResolvedValue('abc1234'),
    } as never)

    const result = await new GetGraphHealth().execute({
      config,
      provider: makeProvider({
        ...BASE_STATS,
        graphFingerprint: matchingFingerprint(),
      }),
      codeGraphVersion: '2.0.0',
      workspaces,
      assertUnlocked: false,
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

    await new GetGraphHealth().execute({
      config,
      provider,
      codeGraphVersion,
      assertUnlocked: false,
    })

    expect(open).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })
})
