import { afterEach, describe, expect, it, vi } from 'vitest'
import { enrichImplementationTracking } from '../../src/commands/change/_implementation-tracking.js'

vi.mock('@specd/sdk', async () => {
  const actual = await vi.importActual<typeof import('@specd/sdk')>('@specd/sdk')
  return { ...actual, buildImplementationReview: vi.fn() }
})

import {
  buildImplementationReview,
  type GetGraphHealthResult,
  type SdkHostContext,
} from '@specd/sdk'

afterEach(() => vi.restoreAllMocks())

const host = {} as SdkHostContext
const health = {
  fileCount: 1,
  documentCount: 0,
  symbolCount: 1,
  specCount: 1,
  relationCounts: {},
  languages: ['typescript'],
  lastIndexedAt: '2026-07-29T00:00:00.000Z',
  lastIndexedRef: 'HEAD',
  graphFingerprint: 'fingerprint',
  stale: false,
  currentRef: 'HEAD',
  fingerprintMismatch: false,
  contentFresh: true,
  coverageComplete: true,
  schemaCompatible: true,
  generationCurrent: true,
  reasonCodes: [],
} as unknown as GetGraphHealthResult

describe('enrichImplementationTracking', () => {
  it('calls the SDK review exactly once and preserves its reviewed links', async () => {
    const links = [
      {
        specId: 'core:change',
        file: 'packages/core/src/change.ts',
        fileLinkExplicit: true,
        symbols: ['Change.transition'],
        symbolResolutions: [
          {
            symbol: 'Change.transition',
            resolution: {
              request: { workspace: 'core', requested: 'Change.transition' },
              status: 'resolved',
              reasonCode: null,
              health: { fresh: true, complete: true, reasonCodes: [] },
              target: {
                id: 'logical-change-transition',
                workspace: 'core',
                surface: 'core:src/change.ts',
                name: 'transition',
                space: 'property',
                ownerId: 'logical-change',
                memberForm: 'instance',
              },
              candidates: [],
              path: [],
            },
          },
        ],
      },
    ] as const
    vi.mocked(buildImplementationReview).mockResolvedValue({
      review: {
        specIds: ['core:change'],
        implementationTracking: {
          trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'open' }],
          links: [],
        },
      },
      graphHealth: health,
      links,
    })

    const result = await enrichImplementationTracking(host, 'symbol-review')

    expect(buildImplementationReview).toHaveBeenCalledTimes(1)
    expect(buildImplementationReview).toHaveBeenCalledWith(host, {
      changeName: 'symbol-review',
    })
    expect(result.links).toBe(links)
    expect(result.graphHint.status).toBe('fresh')
  })

  it('retains every structured health reason in the CLI hint', async () => {
    vi.mocked(buildImplementationReview).mockResolvedValue({
      review: {
        specIds: [],
        implementationTracking: { trackedFiles: [], links: [] },
      },
      graphHealth: {
        ...health,
        contentFresh: false,
        coverageComplete: false,
        reasonCodes: ['CONTENT_DIRTY', 'COVERAGE_PARTIAL'],
      },
      links: [],
    })

    const result = await enrichImplementationTracking(host, 'symbol-review')

    expect(result.graphHint).toEqual({
      status: 'stale',
      message: 'Code graph health: CONTENT_DIRTY, COVERAGE_PARTIAL.',
    })
  })

  it('reports an unindexed graph without inventing link outcomes', async () => {
    vi.mocked(buildImplementationReview).mockResolvedValue({
      review: {
        specIds: [],
        implementationTracking: { trackedFiles: [], links: [] },
      },
      graphHealth: {
        ...health,
        lastIndexedAt: undefined,
        coverageComplete: null,
        reasonCodes: ['COVERAGE_UNKNOWN'],
      },
      links: [],
    })

    const result = await enrichImplementationTracking(host, 'symbol-review')

    expect(result.graphHint.status).toBe('not-indexed')
    expect(result.links).toEqual([])
  })
})
