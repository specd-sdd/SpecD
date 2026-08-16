import { describe, expect, it, vi } from 'vitest'
import {
  type CodeGraphProvider,
  type GetGraphHealthResult,
  type SymbolResolutionResult,
} from '@specd/code-graph'
import { type SdkHostContext } from '../../src/composition/host-context.js'
import { buildImplementationReview } from '../../src/orchestration/build-implementation-review.js'

const graphHealth = {
  stale: false,
  currentRef: 'abc123',
  fingerprintMismatch: false,
  contentFresh: true,
  coverageComplete: true,
  schemaCompatible: true,
  generationCurrent: true,
  reasonCodes: [],
} as unknown as GetGraphHealthResult

function resolution(requested: string, filePath: string): SymbolResolutionResult {
  return {
    request: { workspace: 'sdk', requested, filePath },
    status: 'resolved',
    reasonCode: null,
    health: { fresh: true, complete: true, reasonCodes: [] },
    target: {
      id: `logical-${requested}`,
      workspace: 'sdk',
      surface: 'orchestration',
      name: requested,
      space: 'value',
      ownerId: undefined,
      memberForm: undefined,
    },
    candidates: [],
    path: [],
  }
}

function setup(options?: {
  readonly openError?: Error
  readonly healthError?: Error
  readonly resolutionError?: Error
}) {
  const rawReview = {
    specIds: ['sdk:build-implementation-review'],
    implementationTracking: {
      trackedFiles: [{ file: 'packages/sdk/src/file.ts', state: 'open' as const }],
      links: [
        {
          specId: 'sdk:build-implementation-review',
          file: 'packages/sdk/src/file.ts',
          fileLinkExplicit: true,
        },
        {
          specId: 'sdk:build-implementation-review',
          file: 'packages/sdk/src/review.ts',
          fileLinkExplicit: false,
          symbols: ['StoredAlias', 'Owner.member'],
        },
      ],
    },
  }
  const getImplementationReview = {
    execute: vi.fn().mockResolvedValue(rawReview),
  }
  const open = vi.fn(async () => {
    if (options?.openError !== undefined) throw options.openError
  })
  const close = vi.fn().mockResolvedValue(undefined)
  const getGraphHealth = vi.fn(async (): Promise<GetGraphHealthResult> => {
    if (options?.healthError !== undefined) throw options.healthError
    return graphHealth
  })
  const resolveSymbolReferences = vi.fn(async (): Promise<readonly SymbolResolutionResult[]> => {
    if (options?.resolutionError !== undefined) throw options.resolutionError
    return [
      resolution('StoredAlias', 'packages/sdk/src/review.ts'),
      resolution('Owner.member', 'packages/sdk/src/review.ts'),
    ]
  })
  const provider = {
    open,
    close,
    getGraphHealth,
    resolveSymbolReferences,
  } as unknown as CodeGraphProvider
  const createGraphProvider = vi.fn(() => provider)
  const ctx = {
    kernel: { changes: { getImplementationReview } },
    createGraphProvider,
  } as unknown as SdkHostContext

  return {
    ctx,
    rawReview,
    getImplementationReview,
    provider,
    createGraphProvider,
    open,
    close,
    getGraphHealth,
    resolveSymbolReferences,
  }
}

describe('buildImplementationReview', () => {
  it('uses one Core read, provider lifecycle, health read, and resolver batch', async () => {
    const {
      ctx,
      rawReview,
      getImplementationReview,
      createGraphProvider,
      open,
      close,
      getGraphHealth,
      resolveSymbolReferences,
    } = setup()

    const result = await buildImplementationReview(ctx, { changeName: 'logical-review' })

    expect(getImplementationReview.execute).toHaveBeenCalledOnce()
    expect(getImplementationReview.execute).toHaveBeenCalledWith({ name: 'logical-review' })
    expect(createGraphProvider).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledOnce()
    expect(getGraphHealth).toHaveBeenCalledOnce()
    expect(resolveSymbolReferences).toHaveBeenCalledOnce()
    expect(resolveSymbolReferences).toHaveBeenCalledWith(
      [
        {
          workspace: 'sdk',
          requested: 'StoredAlias',
          filePath: 'packages/sdk/src/review.ts',
        },
        {
          workspace: 'sdk',
          requested: 'Owner.member',
          filePath: 'packages/sdk/src/review.ts',
        },
      ],
      graphHealth,
    )
    expect(close).toHaveBeenCalledOnce()
    expect(result.review).toBe(rawReview)
    expect(result.graphHealth).toBe(graphHealth)
  })

  it('preserves stored values and bypasses file-only links', async () => {
    const { ctx, rawReview, resolveSymbolReferences } = setup()

    const result = await buildImplementationReview(ctx, { changeName: 'logical-review' })

    expect(result.links[0]).toEqual({
      specId: 'sdk:build-implementation-review',
      file: 'packages/sdk/src/file.ts',
      fileLinkExplicit: true,
      symbolResolutions: [],
    })
    expect(result.links[1]?.symbols).toBe(rawReview.implementationTracking.links[1]?.symbols)
    expect(result.links[1]?.symbolResolutions.map((entry) => entry.symbol)).toEqual([
      'StoredAlias',
      'Owner.member',
    ])
    expect(resolveSymbolReferences).toHaveBeenCalledOnce()
  })

  it('preserves a proven missing outcome distinctly from unresolved freshness', async () => {
    const { ctx, resolveSymbolReferences } = setup()
    const missing = {
      ...resolution('StoredAlias', 'packages/sdk/src/review.ts'),
      status: 'missing' as const,
      reasonCode: 'REFERENCE_ABSENT',
      target: null,
    }
    const unresolved = {
      ...resolution('Owner.member', 'packages/sdk/src/review.ts'),
      status: 'unresolved' as const,
      reasonCode: 'CONTENT_HASH_CHANGED',
      target: null,
    }
    resolveSymbolReferences.mockResolvedValueOnce([missing, unresolved])

    const result = await buildImplementationReview(ctx, { changeName: 'logical-review' })

    expect(result.links[1]?.symbolResolutions.map(({ resolution: item }) => item.status)).toEqual([
      'missing',
      'unresolved',
    ])
    expect(result.links[1]?.symbolResolutions[0]?.resolution.reasonCode).toBe('REFERENCE_ABSENT')
    expect(result.links[1]?.symbolResolutions[1]?.resolution.reasonCode).toBe(
      'CONTENT_HASH_CHANGED',
    )
  })

  it.each([
    ['provider open', { openError: new Error('open failed') }],
    ['health', { healthError: new Error('health failed') }],
    ['resolution', { resolutionError: new Error('resolution failed') }],
  ] as const)(
    'propagates %s infrastructure failures and attempts cleanup',
    async (_label, options) => {
      const { ctx, close } = setup(options)

      await expect(
        buildImplementationReview(ctx, { changeName: 'logical-review' }),
      ).rejects.toThrow(/failed/)
      expect(close).toHaveBeenCalledOnce()
    },
  )
})
