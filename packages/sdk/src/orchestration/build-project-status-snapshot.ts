import {
  createGetGraphHealth,
  type GetGraphHealthResult,
  type HotspotResult,
} from '@specd/code-graph'
import { type GetProjectSummaryResult } from '@specd/core'
import { type SdkHostContext } from '../composition/host-context.js'
import { withOpenGraphProvider } from '../composition/with-open-graph-provider.js'
import { codeGraphVersion } from '../shared/code-graph-version.js'

/** Options for {@link buildProjectStatusSnapshot}. */
export interface BuildProjectStatusSnapshotOptions {
  /** When true, open the graph provider and load health diagnostics. */
  readonly includeGraph?: boolean
  /** When true (and graph loaded), include hotspot entries. */
  readonly includeHotspots?: boolean
}

/** Merged project and optional graph status snapshot. */
export interface BuildProjectStatusSnapshotResult {
  /** Core project summary counts. */
  readonly summary: GetProjectSummaryResult
  /** Graph health when requested; otherwise `null`. */
  readonly graphHealth: GetGraphHealthResult | null
  /** Approval gate flags from project config. */
  readonly approvals: { readonly specEnabled: boolean; readonly signoffEnabled: boolean }
  /** Whether LLM-optimized context is enabled in config. */
  readonly llmOptimizedContext: boolean
  /** Hotspot analysis when requested and available. */
  readonly hotspots?: HotspotResult | null
}

/**
 * Builds a structured project status snapshot with optional graph diagnostics.
 *
 * @param ctx - SDK host context
 * @param options - Whether to include graph health and hotspots
 * @returns Merged summary, approvals, and optional graph data
 */
export async function buildProjectStatusSnapshot(
  ctx: SdkHostContext,
  options?: BuildProjectStatusSnapshotOptions,
): Promise<BuildProjectStatusSnapshotResult> {
  const includeGraph = options?.includeGraph ?? false
  const includeHotspots = options?.includeHotspots ?? false

  const summary = await ctx.kernel.project.getProjectSummary.execute()
  const config = ctx.kernel.project.getConfig.execute()

  const approvals = {
    specEnabled: config.approvals?.spec ?? false,
    signoffEnabled: config.approvals?.signoff ?? false,
  }
  const llmOptimizedContext = config.llmOptimizedContext ?? false

  if (!includeGraph) {
    return {
      summary,
      graphHealth: null,
      approvals,
      llmOptimizedContext,
    }
  }

  let graphHealth: GetGraphHealthResult | null = null
  let hotspots: HotspotResult | null | undefined

  try {
    await withOpenGraphProvider(ctx, async (provider) => {
      const workspaces = await ctx.kernel.project.listWorkspaces.execute()
      const getGraphHealth = createGetGraphHealth()
      graphHealth = await getGraphHealth.execute({
        config,
        provider,
        codeGraphVersion,
        workspaces: [...workspaces],
      })
      if (includeHotspots) {
        try {
          hotspots = await provider.getHotspots()
        } catch {
          graphHealth = null
          hotspots = null
        }
      }
    })
  } catch {
    graphHealth = null
    hotspots = includeHotspots ? null : undefined
  }

  return {
    summary,
    graphHealth,
    approvals,
    llmOptimizedContext,
    ...(includeHotspots ? { hotspots: hotspots ?? null } : {}),
  }
}
