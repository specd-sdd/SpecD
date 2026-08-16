import {
  type GetImplementationReviewResult,
  type ImplementationTrackingProjection,
} from '@specd/core'
import {
  type GetGraphHealthResult,
  type ResolveSymbolReferenceInput,
  type SymbolResolutionResult,
} from '@specd/code-graph'
import { type SdkHostContext } from '../composition/host-context.js'
import { withOpenGraphProvider } from '../composition/with-open-graph-provider.js'

/** Input for {@link buildImplementationReview}. */
export interface BuildImplementationReviewInput {
  /** Active change whose stored implementation tracking should be reviewed. */
  readonly changeName: string
}

/** One stored symbol and its point-in-time Code Graph resolution. */
export interface ReviewedImplementationSymbol {
  /** Original stored symbol value, preserved byte-for-byte. */
  readonly symbol: string
  /** Structured conservative resolution, including health and provenance. */
  readonly resolution: SymbolResolutionResult
}

/** One stored implementation link enriched without rewriting its persisted values. */
export interface ReviewedImplementationLink {
  /** Original stored spec ID. */
  readonly specId: string
  /** Original stored file value. */
  readonly file: string
  /** Whether the file-level link was explicitly created. */
  readonly fileLinkExplicit: boolean
  /** Original stored symbol values when present. */
  readonly symbols?: readonly string[]
  /** Ordered resolutions correlated with the original symbol order. */
  readonly symbolResolutions: readonly ReviewedImplementationSymbol[]
}

/** Structured Core and Code Graph implementation-review projection. */
export interface BuildImplementationReviewResult {
  /** Authoritative raw review read from Core. */
  readonly review: GetImplementationReviewResult
  /** Canonical graph-health snapshot shared by the resolution batch. */
  readonly graphHealth: GetGraphHealthResult
  /** Stored links enriched with conservative symbol resolution. */
  readonly links: readonly ReviewedImplementationLink[]
}

/**
 * Builds one delivery-neutral implementation review.
 *
 * Core remains authoritative for persisted values while the opened Code Graph
 * provider owns all symbol-resolution policy.
 *
 * @param ctx - Shared SDK host context
 * @param input - Change selection
 * @returns Raw Core review plus graph health and reviewed links
 */
export async function buildImplementationReview(
  ctx: SdkHostContext,
  input: BuildImplementationReviewInput,
): Promise<BuildImplementationReviewResult> {
  const review = await ctx.kernel.changes.getImplementationReview.execute({
    name: input.changeName,
  })
  const requests = buildResolutionRequests(review.implementationTracking)

  return withOpenGraphProvider(ctx, async (provider) => {
    const graphHealth = await provider.getGraphHealth()
    const resolutions =
      requests.length === 0
        ? []
        : await provider.resolveSymbolReferences(
            requests.map((entry) => entry.request),
            graphHealth,
          )

    if (resolutions.length !== requests.length) {
      throw new Error(
        `Code Graph returned ${resolutions.length} symbol resolutions for ${requests.length} requests`,
      )
    }

    let resolutionIndex = 0
    const links = review.implementationTracking.links.map((link): ReviewedImplementationLink => {
      const symbolResolutions = (link.symbols ?? []).map((symbol) => {
        const resolution = resolutions[resolutionIndex]
        resolutionIndex += 1
        if (resolution === undefined) {
          throw new Error(`Code Graph omitted the resolution for stored symbol "${symbol}"`)
        }
        return { symbol, resolution }
      })

      return {
        specId: link.specId,
        file: link.file,
        fileLinkExplicit: link.fileLinkExplicit,
        ...(link.symbols !== undefined ? { symbols: link.symbols } : {}),
        symbolResolutions,
      }
    })

    return { review, graphHealth, links }
  })
}

/**
 * Projects stored symbol links into resolver inputs without parsing symbol syntax.
 *
 * @param tracking - Raw persisted implementation tracking
 * @returns Requests in stable link and symbol order
 */
function buildResolutionRequests(tracking: ImplementationTrackingProjection): readonly {
  readonly request: ResolveSymbolReferenceInput
}[] {
  return tracking.links.flatMap((link) => {
    const separator = link.specId.indexOf(':')
    const workspace = separator < 0 ? link.specId : link.specId.slice(0, separator)
    return (link.symbols ?? []).map((symbol) => ({
      request: {
        workspace,
        requested: symbol,
        filePath: link.file,
      },
    }))
  })
}
