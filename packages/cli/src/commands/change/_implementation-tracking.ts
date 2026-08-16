import {
  buildImplementationReview,
  type BuildImplementationReviewResult,
  type SdkHostContext,
} from '@specd/sdk'

/** Best-effort graph availability and freshness hint for CLI rendering. */
export interface GraphHint {
  readonly status: 'fresh' | 'stale' | 'not-indexed' | 'unavailable'
  readonly message: string
}

/** CLI presentation adapter over the delivery-neutral SDK review projection. */
export interface EnrichedImplementationTracking {
  readonly specIds?: BuildImplementationReviewResult['review']['specIds']
  readonly trackedFiles: BuildImplementationReviewResult['review']['implementationTracking']['trackedFiles']
  readonly links: readonly (Omit<
    BuildImplementationReviewResult['links'][number],
    'symbolResolutions'
  > & {
    readonly symbolResolutions?: BuildImplementationReviewResult['links'][number]['symbolResolutions']
  })[]
  readonly graphHealth?: BuildImplementationReviewResult['graphHealth']
  readonly graphHint: GraphHint
}

/**
 * Builds implementation review once through the SDK and adapts only its graph-health
 * summary for human-facing CLI output.
 *
 * @param ctx - Shared SDK host context
 * @param changeName - Change to review
 * @returns The SDK-reviewed links plus a concise display hint
 */
export async function enrichImplementationTracking(
  ctx: SdkHostContext,
  changeName: string,
): Promise<EnrichedImplementationTracking> {
  const result = await buildImplementationReview(ctx, { changeName })
  return {
    specIds: result.review.specIds,
    trackedFiles: result.review.implementationTracking.trackedFiles,
    links: result.links,
    graphHealth: result.graphHealth,
    graphHint: graphHint(result),
  }
}

/**
 * Converts structured health into a concise presentation hint without changing link
 * resolution or selecting candidates.
 *
 * @param result - Delivery-neutral SDK implementation review
 * @returns CLI graph hint
 */
function graphHint(result: BuildImplementationReviewResult): GraphHint {
  const health = result.graphHealth
  if (health.lastIndexedAt === undefined) {
    return {
      status: 'not-indexed',
      message: 'Code graph not indexed; symbol resolution is unavailable.',
    }
  }

  if (health.reasonCodes.length > 0) {
    return {
      status: 'stale',
      message: `Code graph health: ${health.reasonCodes.join(', ')}.`,
    }
  }

  return {
    status: 'fresh',
    message: 'Code graph is fresh with complete coverage.',
  }
}
