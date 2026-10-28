import { describe, expect, it, vi } from 'vitest'
import { IndexProjectGraph } from '../../../src/application/use-cases/index-project-graph.js'
import { type CodeGraphHostPort } from '../../../src/application/ports/code-graph-host-port.js'
import { type IndexResult } from '../../../src/domain/value-objects/index-result.js'
import { type ProjectWorkspace } from '../../../src/domain/value-objects/index-options.js'

const INDEX_RESULT: IndexResult = {
  filesDiscovered: 1,
  filesIndexed: 1,
  documentsIndexed: 0,
  filesRemoved: 0,
  filesSkipped: 0,
  filesSkippedForSize: 0,
  largestSkippedForSize: [],
  sizeExemptAnalysed: [],
  workspaceOverlaps: [],
  workspaceOverlapCount: 0,
  specsDiscovered: 0,
  specsIndexed: 0,
  errors: [],
  diagnostics: [],
  duration: 10,
  workspaces: [],
  vcsRef: null,
  graphFingerprint: '',
  fullRebuild: false,
  fullRebuildReason: null,
  phaseMetrics: {
    importResolution: { count: 0, durationMs: 0 },
    dependencyFacts: { count: 0, durationMs: 0 },
    adapterRelations: { count: 0, durationMs: 0 },
    reexports: { count: 0, durationMs: 0 },
    hierarchyOverrides: { count: 0, durationMs: 0 },
    persistence: { count: 0, durationMs: 0 },
    searchIndexRebuild: { count: 0, durationMs: 0 },
  },
  coverage: {
    total: 0,
    byStatus: {
      indexed: 0,
      excluded: 0,
      unsupported: 0,
      'parse-failed': 0,
      partial: 0,
    },
    reasons: [],
  },
  coverageDiagnostics: [],
  logicalDiagnostics: [],
  importDiagnostics: {
    total: 0,
    byReason: {},
    samples: [],
    externalPackageImports: 0,
    adaptersWithoutPackageResolution: [],
  },
}

class FakeCodeGraphHostProvider implements CodeGraphHostPort {
  readonly index = vi.fn().mockResolvedValue(INDEX_RESULT)
  readonly open = vi.fn().mockResolvedValue(undefined)
  readonly close = vi.fn().mockResolvedValue(undefined)
  readonly clear = vi.fn().mockResolvedValue(undefined)
  readonly recreate = vi.fn().mockResolvedValue(undefined)
  readonly getStatistics = vi.fn().mockResolvedValue({
    nodes: 0,
    relations: 0,
    files: 0,
    documents: 0,
    symbols: 0,
    specs: 0,
    lastIndexed: null,
  })
  readonly getSpec = vi.fn().mockResolvedValue(undefined)
  readonly getCoveredFiles = vi.fn().mockResolvedValue([])
  readonly getCoveredSymbols = vi.fn().mockResolvedValue([])
}

function makeProvider(): FakeCodeGraphHostProvider {
  return new FakeCodeGraphHostProvider()
}

const baseInput = {
  projectRoot: '/project',
  vcsRoot: null,
  workspaces: [],
  graphConfig: {
    projectRoot: '/project',
    workspaces: new Map(),
    excludePaths: [],
    includePaths: [],
    concurrency: 4,
  },
  codeGraphVersion: '1.0.0',
} as const

describe('IndexProjectGraph', () => {
  it('calls index without recreate when force is false', async () => {
    const provider = makeProvider()

    const result = await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      force: false,
    })

    expect(provider.index).toHaveBeenCalledOnce()
    expect(provider.index).toHaveBeenCalledWith(expect.not.objectContaining({ force: true }))
    expect(result).toBe(INDEX_RESULT)
  })

  it('forwards force=true to provider.index', async () => {
    const provider = makeProvider()

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      force: true,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })

  it('forwards onProgress to provider.index', async () => {
    const provider = makeProvider()
    const onProgress = vi.fn()

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      onProgress,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ onProgress }))
  })

  it('forwards materialized spec metadata to provider.index', async () => {
    const provider = makeProvider()
    const getSpecMetadata = { execute: vi.fn() }

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      getSpecMetadata: getSpecMetadata as never,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ getSpecMetadata }))
  })

  it('forwards a non-null vcsRoot to provider.index', async () => {
    const provider = makeProvider()
    const vcsRoot = '/repo'

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      vcsRoot,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ vcsRoot }))
  })

  it('forwards null vcsRoot to provider.index', async () => {
    const provider = makeProvider()

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      vcsRoot: null,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ vcsRoot: null }))
  })

  it('forwards configuredWorkspaces to provider.index', async () => {
    const provider = makeProvider()
    const configuredWorkspaces: readonly ProjectWorkspace[] = [
      {
        name: 'a',
        prefix: null,
        codeRoot: '/project/packages/a',
        isExternal: false,
        ownership: 'owned',
        specRepo: {} as unknown as ProjectWorkspace['specRepo'],
      },
    ]

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      configuredWorkspaces,
    })

    expect(provider.index).toHaveBeenCalledWith(expect.objectContaining({ configuredWorkspaces }))
  })

  it('Scenario: Prepared provider lifecycle remains untouched', async () => {
    const provider = makeProvider()
    const onProgress = vi.fn()

    const result = await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      vcsRoot: '/custom/vcs/root',
      vcsRef: 'refs/heads/main',
      onProgress,
      force: false,
    })

    expect(provider.index).toHaveBeenCalledWith(
      expect.objectContaining({
        vcsRoot: '/custom/vcs/root',
        vcsRef: 'refs/heads/main',
        onProgress,
      }),
    )
    expect(provider.open).not.toHaveBeenCalled()
    expect(provider.close).not.toHaveBeenCalled()
    expect(provider.clear).not.toHaveBeenCalled()
    expect(provider.recreate).not.toHaveBeenCalled()
    expect(result).toBe(INDEX_RESULT)
  })

  it('forwards onEvent receiver unchanged to provider.index', async () => {
    const provider = makeProvider()
    const onEvent = vi.fn()

    await new IndexProjectGraph().execute({
      provider,
      ...baseInput,
      force: false,
      onEvent,
    })

    expect(provider.index).toHaveBeenCalledWith(
      expect.objectContaining({
        onEvent,
      }),
    )
  })
})
