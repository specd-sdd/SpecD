import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  GraphDerivationMismatchError,
  GraphStorageRecoveryRequiredError,
  type CodeGraphProvider,
} from '@specd/code-graph'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import type {
  GraphIndexFailureCause,
  GraphIndexWorkerDiagnostics,
  GraphIndexWorkerEvent,
  IndexEvent,
  IndexEventReceiver,
  RunIndexProjectGraphInput,
} from '../../src/index.js'
import { InvalidProviderLifecycleError } from '../../src/domain/errors/invalid-provider-lifecycle-error.js'

const {
  getConfig,
  listWorkspaces,
  getSpecMetadata,
  createIndexProjectGraph,
  createVcsAdapter,
  indexExecute,
  providerIndex,
  createGraphProvider,
  openProvider,
  recreateProvider,
  closeProvider,
} = vi.hoisted(() => ({
  getConfig: { execute: vi.fn() },
  listWorkspaces: { execute: vi.fn() },
  getSpecMetadata: { execute: vi.fn() },
  createIndexProjectGraph: vi.fn(),
  createVcsAdapter: vi.fn(),
  indexExecute: vi.fn(),
  providerIndex: vi.fn(),
  createGraphProvider: vi.fn(),
  openProvider: vi.fn(),
  recreateProvider: vi.fn(),
  closeProvider: vi.fn(),
}))

vi.mock('@specd/code-graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/code-graph')>()
  return {
    ...actual,
    buildProjectGraphConfig: vi.fn(() => ({ excludePaths: [] })),
    createIndexProjectGraph,
  }
})

vi.mock('@specd/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@specd/core')>()
  return {
    ...actual,
    createVcsAdapter,
  }
})

const { runIndexProjectGraph } = await import('../../src/orchestration/run-index-project-graph.js')

const ctx = {
  kernel: {
    project: {
      getConfig,
      listWorkspaces,
    },
    specs: {
      getMetadata: getSpecMetadata,
    },
  },
  createGraphProvider,
} as unknown as SdkHostContext

describe('runIndexProjectGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConfig.execute.mockResolvedValue({ projectRoot: '/tmp/project' })
    listWorkspaces.execute.mockResolvedValue([
      { name: 'core', prefix: null },
      { name: 'cli', prefix: null },
    ])
    createVcsAdapter.mockResolvedValue({ ref: async () => 'abc123' })
    indexExecute.mockResolvedValue({ filesIndexed: 3 })
    providerIndex.mockResolvedValue({ filesIndexed: 3 })
    createIndexProjectGraph.mockReturnValue({ execute: indexExecute })
    openProvider.mockResolvedValue(undefined)
    recreateProvider.mockResolvedValue(undefined)
    createGraphProvider.mockReturnValue({
      open: openProvider,
      recreate: recreateProvider,
      close: closeProvider,
      index: providerIndex,
    })
  })

  it('Scenario: Partial run maps and prepares every configured workspace', async () => {
    await runIndexProjectGraph(ctx, { workspaces: ['cli'] })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [expect.objectContaining({ name: 'cli' })],
        configuredWorkspaces: [
          expect.objectContaining({ name: 'core' }),
          expect.objectContaining({ name: 'cli' }),
        ],
      }),
    )
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('indexes all workspaces when no filter is provided', async () => {
    await runIndexProjectGraph(ctx, { force: false })

    expect(listWorkspaces.execute).toHaveBeenCalled()
    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaces: [
          expect.objectContaining({ name: 'core' }),
          expect.objectContaining({ name: 'cli' }),
        ],
      }),
    )
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('forwards onProgress to IndexProjectGraph', async () => {
    const onProgress = vi.fn()
    await runIndexProjectGraph(ctx, { onProgress })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ onProgress }))
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('forwards materialized spec metadata to IndexProjectGraph', async () => {
    await runIndexProjectGraph(ctx)

    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ getSpecMetadata }))
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('forwards installed code-graph version to IndexProjectGraph', async () => {
    const codeGraphPackageJson = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../../code-graph/package.json'),
        'utf8',
      ),
    ) as { version: string }

    await runIndexProjectGraph(ctx, { force: false })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        codeGraphVersion: codeGraphPackageJson.version,
      }),
    )
    expect(codeGraphPackageJson.version).not.toBe('0.0.0')
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('runs indexing lifecycle hooks once when provider is omitted', async () => {
    const beforeOpen = vi.fn()
    const afterClose = vi.fn()
    await runIndexProjectGraph(ctx, { beforeOpen, afterClose })

    expect(beforeOpen).toHaveBeenCalledOnce()
    expect(openProvider).toHaveBeenCalledOnce()
    expect(closeProvider).toHaveBeenCalledOnce()
    expect(afterClose).toHaveBeenCalledOnce()
  })

  it('bypasses withOpenGraphProvider and does not close provider when existing provider is supplied', async () => {
    const closeSpy = vi.fn()
    const explicitProviderIndex = vi.fn()
    const mockProvider = {
      close: closeSpy,
      index: explicitProviderIndex,
    } as unknown as CodeGraphProvider

    const onProgress = vi.fn()
    const result = await runIndexProjectGraph(ctx, {
      provider: mockProvider,
      force: true,
      onProgress,
    })

    expect(closeSpy).not.toHaveBeenCalled()
    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: mockProvider,
        workspaces: [
          expect.objectContaining({ name: 'core' }),
          expect.objectContaining({ name: 'cli' }),
        ],
        vcsRef: 'abc123',
        vcsRoot: null,
        force: true,
        onProgress,
      }),
    )
    expect(explicitProviderIndex).not.toHaveBeenCalled()
    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: null,
    })
  })

  it('opens a transient provider through its parameterless lifecycle', async () => {
    await runIndexProjectGraph(ctx)

    expect(openProvider).toHaveBeenCalledOnce()
    expect(closeProvider).toHaveBeenCalledOnce()
    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({ open: openProvider, close: closeProvider }),
        workspaces: [
          expect.objectContaining({ name: 'core' }),
          expect.objectContaining({ name: 'cli' }),
        ],
        vcsRoot: null,
        vcsRef: 'abc123',
      }),
    )
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('reports an explicitly forced index as a full rebuild', async () => {
    indexExecute.mockResolvedValue({
      filesIndexed: 3,
      fullRebuildReason: 'Forced graph storage recreation requested by indexing',
    })

    const result = await runIndexProjectGraph(ctx, { force: true })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    expect(providerIndex).not.toHaveBeenCalled()

    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: 'Forced graph storage recreation requested by indexing',
    })
  })

  it('recreates and rebuilds an incompatible schema shape without --force', async () => {
    openProvider.mockRejectedValueOnce(
      new GraphStorageRecoveryRequiredError(
        'SQLite graph storage table logical_declarations is missing columns occurrence_form',
        'SCHEMA_INCOMPATIBLE',
      ),
    )
    indexExecute.mockResolvedValue({ filesIndexed: 3, fullRebuild: false })

    const result = await runIndexProjectGraph(ctx, {})

    expect(recreateProvider).toHaveBeenCalledOnce()
    expect(openProvider).toHaveBeenCalledTimes(2)
    expect(indexExecute).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ fullRebuild: true, fullRebuildReason: 'SCHEMA_INCOMPATIBLE' })
  })

  it('does not recreate storage without --force for any other recovery reason', async () => {
    const other = new GraphStorageRecoveryRequiredError('corrupt database', 'CORRUPT')
    openProvider.mockRejectedValueOnce(other)

    await expect(runIndexProjectGraph(ctx, {})).rejects.toBe(other)

    expect(recreateProvider).not.toHaveBeenCalled()
    expect(indexExecute).not.toHaveBeenCalled()
  })

  it('recovers a typed storage-open failure only for a transient forced index', async () => {
    const openError = new GraphStorageRecoveryRequiredError(
      'schema cannot be migrated',
      'SCHEMA_INCOMPATIBLE',
    )
    openProvider.mockRejectedValueOnce(openError)
    indexExecute.mockResolvedValue({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: 'Forced logical graph reindex requested by indexing',
    })

    const result = await runIndexProjectGraph(ctx, { force: true })

    expect(recreateProvider).toHaveBeenCalledOnce()
    expect(openProvider).toHaveBeenCalledTimes(2)
    expect(indexExecute).toHaveBeenCalledOnce()
    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    expect(providerIndex).not.toHaveBeenCalled()
    expect(result).toEqual({
      filesIndexed: 3,
      fullRebuild: true,
      fullRebuildReason: 'SCHEMA_INCOMPATIBLE',
    })
  })

  it('given a derivation mismatch on the first attempt, when it owns the provider, then it recreates the closed store and indexes again', async () => {
    indexExecute
      .mockRejectedValueOnce(
        new GraphDerivationMismatchError('Graph derivation fingerprint mismatch'),
      )
      .mockResolvedValueOnce({ filesIndexed: 5 })

    const result = await runIndexProjectGraph(ctx, {})

    expect(indexExecute).toHaveBeenCalledTimes(2)
    expect(indexExecute.mock.calls[0]![0]).toMatchObject({ derivationMismatch: 'fail' })
    expect(indexExecute.mock.calls[1]![0]).toMatchObject({ derivationMismatch: 'rebuild' })
    expect(recreateProvider).toHaveBeenCalledOnce()
    expect(recreateProvider.mock.invocationCallOrder[0]!).toBeLessThan(
      openProvider.mock.invocationCallOrder[1]!,
    )
    expect(result).toEqual({
      filesIndexed: 5,
      fullRebuild: true,
      fullRebuildReason: 'Graph derivation fingerprint mismatch',
    })
  })

  it('given a caller-owned provider, when indexing runs, then it never asks to fail on a derivation mismatch', async () => {
    await runIndexProjectGraph(ctx, { provider: {} as CodeGraphProvider })

    expect(indexExecute.mock.calls[0]![0]).toMatchObject({ derivationMismatch: 'rebuild' })
    expect(recreateProvider).not.toHaveBeenCalled()
  })

  it('does not recreate storage for non-forced or non-recoverable open failures', async () => {
    const typedError = new GraphStorageRecoveryRequiredError('corrupt', 'CORRUPT')
    openProvider.mockRejectedValueOnce(typedError)

    await expect(runIndexProjectGraph(ctx, { force: false })).rejects.toBe(typedError)
    expect(recreateProvider).not.toHaveBeenCalled()
    expect(openProvider).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    const otherError = new Error('permission denied')
    getConfig.execute.mockResolvedValue({ projectRoot: '/tmp/project' })
    listWorkspaces.execute.mockResolvedValue([])
    createVcsAdapter.mockResolvedValue({ ref: async () => 'abc123' })
    openProvider.mockRejectedValueOnce(otherError)
    createGraphProvider.mockReturnValue({
      open: openProvider,
      recreate: recreateProvider,
      close: closeProvider,
      index: providerIndex,
    })

    await expect(runIndexProjectGraph(ctx, { force: true })).rejects.toBe(otherError)
    expect(recreateProvider).not.toHaveBeenCalled()
    expect(openProvider).toHaveBeenCalledOnce()
  })

  it('throws InvalidProviderLifecycleError when provider is passed together with beforeOpen or afterClose', async () => {
    const mockProvider = {} as CodeGraphProvider
    const beforeOpen = vi.fn()
    const afterClose = vi.fn()

    await expect(runIndexProjectGraph(ctx, { provider: mockProvider, beforeOpen })).rejects.toThrow(
      InvalidProviderLifecycleError,
    )

    await expect(runIndexProjectGraph(ctx, { provider: mockProvider, afterClose })).rejects.toThrow(
      InvalidProviderLifecycleError,
    )

    try {
      await runIndexProjectGraph(ctx, { provider: mockProvider, beforeOpen })
    } catch (error: unknown) {
      expect((error as InvalidProviderLifecycleError).code).toBe('INVALID_PROVIDER_LIFECYCLE')
    }
  })

  it('forwards onEvent to IndexProjectGraph', async () => {
    const onEvent = vi.fn()
    await runIndexProjectGraph(ctx, { onEvent })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    expect(indexExecute).toHaveBeenCalledWith(expect.objectContaining({ onEvent }))
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('exports the indexer and worker event types, and keeps their kinds apart', () => {
    // Then the indexer events carry only indexer kinds and the worker events only worker kinds
    expectTypeOf<IndexEvent['kind']>().toEqualTypeOf<
      'file-activity' | 'file-skipped' | 'resource-disposal-failed'
    >()
    expectTypeOf<GraphIndexWorkerEvent['kind']>().toEqualTypeOf<
      'activity' | 'worker-silent' | 'stale-lock-recovered'
    >()
    expectTypeOf<RunIndexProjectGraphInput['onEvent']>().toEqualTypeOf<
      IndexEventReceiver | undefined
    >()
    expectTypeOf<GraphIndexWorkerDiagnostics['cause']>().toEqualTypeOf<GraphIndexFailureCause>()
  })

  it('never hands a worker event to the indexer event receiver', async () => {
    const received: unknown[] = []
    await runIndexProjectGraph(ctx, { onEvent: (event) => received.push(event) })

    const passed = (indexExecute.mock.calls[0] as [{ onEvent: (event: unknown) => void }])[0]
    expect(passed.onEvent).toBeTypeOf('function')
    expect(received).toEqual([])
  })

  it('omits onEvent when not provided while keeping onProgress functional', async () => {
    const onProgress = vi.fn()
    await runIndexProjectGraph(ctx, { onProgress })

    expect(createIndexProjectGraph).toHaveBeenCalledOnce()
    const callArgs = indexExecute.mock.calls[0] as [Record<string, unknown>]
    expect(callArgs[0]).toMatchObject({ onProgress })
    expect('onEvent' in callArgs[0]).toBe(false)
    expect(providerIndex).not.toHaveBeenCalled()
  })

  it('passes the diagnostics of the run through next to the errors', async () => {
    indexExecute.mockResolvedValueOnce({
      filesIndexed: 3,
      errors: [{ filePath: 'ws:src/bad.ts', message: 'analysis failed' }],
      diagnostics: [{ filePath: 'backend:<manifest>', message: 'Package identity collision' }],
    })

    const result = await runIndexProjectGraph(ctx)

    expect(result.errors).toEqual([{ filePath: 'ws:src/bad.ts', message: 'analysis failed' }])
    expect(result.diagnostics).toEqual([
      { filePath: 'backend:<manifest>', message: 'Package identity collision' },
    ])
  })

  it('passes through the three size-skip result fields', async () => {
    indexExecute.mockResolvedValueOnce({
      filesIndexed: 10,
      filesSkippedForSize: 2,
      largestSkippedForSize: [
        {
          filePath: 'large.ts',
          projectRelativePath: 'large.ts',
          sizeBytes: 300000,
          limitBytes: 262144,
        },
      ],
      sizeExemptAnalysed: [
        { filePath: 'exempt.ts', projectRelativePath: 'exempt.ts', sizeBytes: 400000 },
      ],
    })

    const result = await runIndexProjectGraph(ctx)

    expect(result.filesIndexed).toBe(10)
    expect(result.filesSkippedForSize).toBe(2)
    expect(result.largestSkippedForSize).toEqual([
      {
        filePath: 'large.ts',
        projectRelativePath: 'large.ts',
        sizeBytes: 300000,
        limitBytes: 262144,
      },
    ])
    expect(result.sizeExemptAnalysed).toEqual([
      { filePath: 'exempt.ts', projectRelativePath: 'exempt.ts', sizeBytes: 400000 },
    ])
  })

  it('exports new worker errors and lifecycle types from SDK root', async () => {
    const sdk = await import('../../src/index.js')
    expect(sdk.GraphIndexWorkerError).toBeDefined()
    expect(sdk.GraphIndexWorkerStartError).toBeDefined()
    expect(sdk.GraphIndexTaskContractError).toBeDefined()
    expect(sdk.GraphIndexTaskExecutionError).toBeDefined()
    expect(sdk.GraphIndexWorkerProtocolError).toBeDefined()
    expect(sdk.GraphIndexWorkerExitError).toBeDefined()
    expect(sdk.GraphIndexWorkerSignalError).toBeDefined()
    expect(sdk.GraphIndexProgressHandlerError).toBeDefined()
    expect(sdk.DEFAULT_MAX_FILE_BYTES).toBe(262144)
  })
})
