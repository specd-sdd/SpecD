import {
  type CodeGraphProvider,
  type FileCategory,
  type HotspotOptions,
  type RiskLevel,
  type SymbolKind,
  type SymbolNode,
} from '@specd/code-graph'
import { type SdkHostContext } from '../composition/host-context.js'
import { withOpenGraphProvider } from '../composition/with-open-graph-provider.js'
import { splitWorkspaceIdentity, toProjectRelativePath } from './project-relative-path.js'

/**
 * Input options for {@link runGraphHotspots}.
 */
export interface RunGraphHotspotsInput {
  /** Filter by workspace name. */
  readonly workspace?: string
  /** Filter by symbol kinds. */
  readonly kinds?: readonly SymbolKind[]
  /** Filter by file path. */
  readonly file?: string
  /** Alias for `file`. */
  readonly filePath?: string
  /** Exclude patterns for file paths. */
  readonly excludePaths?: readonly string[]
  /** Exclude workspace names. */
  readonly excludeWorkspaces?: readonly string[]
  /** Maximum entries to return. */
  readonly limit?: number
  /** Minimum score threshold. */
  readonly minScore?: number
  /** Minimum risk level threshold. */
  readonly minRisk?: RiskLevel
  /** Include symbols whose score comes only from file importers. */
  readonly includeImporterOnly?: boolean
  /** Filter by file categories. */
  readonly categories?: readonly FileCategory[]
  /** Include test files in analysis. */
  readonly includeTests?: boolean
  /** Include ignored files in analysis. */
  readonly includeIgnored?: boolean
  /** Optional pre-opened graph provider. When provided, lifecycle is caller-owned. */
  readonly provider?: CodeGraphProvider
}

/**
 * A hotspot entry with unified project-relative path.
 */
export interface ProjectedHotspotEntry {
  readonly symbol: SymbolNode
  readonly score: number
  readonly directCallers: number
  readonly crossWorkspaceCallers: number
  readonly fileImporters: number
  readonly riskLevel: RiskLevel
  readonly workspace: string
  readonly projectRelativePath: string
}

/**
 * Structured result returned by {@link runGraphHotspots}.
 */
export interface RunGraphHotspotsResult {
  readonly totalSymbols: number
  readonly entries: readonly ProjectedHotspotEntry[]
  readonly omittedCounts: { readonly tests: number; readonly ignored: number }
}

/**
 * Computes hotspot rankings and projects symbol paths to repository-relative `projectRelativePath`.
 *
 * @param ctx - SDK host context
 * @param input - Hotspot options
 * @returns Ranked hotspots with projectRelativePath
 */
export async function runGraphHotspots(
  ctx: SdkHostContext,
  input: RunGraphHotspotsInput = {},
): Promise<RunGraphHotspotsResult> {
  const config = ctx.kernel.project.getConfig.execute()
  const filePath = input.filePath ?? input.file

  const executeWithProvider = async (
    provider: CodeGraphProvider,
  ): Promise<RunGraphHotspotsResult> => {
    const options: HotspotOptions = {
      ...(input.workspace !== undefined ? { workspace: input.workspace } : {}),
      ...(input.kinds !== undefined ? { kinds: input.kinds } : {}),
      ...(filePath !== undefined ? { filePath } : {}),
      ...(input.excludePaths !== undefined && input.excludePaths.length > 0
        ? { excludePaths: input.excludePaths }
        : {}),
      ...(input.excludeWorkspaces !== undefined && input.excludeWorkspaces.length > 0
        ? { excludeWorkspaces: input.excludeWorkspaces }
        : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.minScore !== undefined ? { minScore: input.minScore } : {}),
      ...(input.minRisk !== undefined ? { minRisk: input.minRisk } : {}),
      ...(input.includeImporterOnly === true ? { includeImporterOnly: true } : {}),
      ...(input.categories !== undefined ? { categories: input.categories } : {}),
      ...(input.includeTests !== undefined ? { includeTests: input.includeTests } : {}),
      ...(input.includeIgnored !== undefined ? { includeIgnored: input.includeIgnored } : {}),
    }

    const raw = await provider.getHotspots(options)

    const entries: ProjectedHotspotEntry[] = raw.entries.map((e) => ({
      symbol: e.symbol,
      score: e.score,
      directCallers: e.directCallers,
      crossWorkspaceCallers: e.crossWorkspaceCallers,
      fileImporters: e.fileImporters,
      riskLevel: e.riskLevel,
      workspace: splitWorkspaceIdentity(e.symbol.filePath)?.workspace ?? '',
      projectRelativePath:
        e.symbol.projectRelativePath || toProjectRelativePath(config, e.symbol.filePath),
    }))

    return {
      totalSymbols: raw.totalSymbols,
      entries,
      omittedCounts: raw.omittedCounts ?? { tests: 0, ignored: 0 },
    }
  }

  if (input.provider !== undefined) {
    return executeWithProvider(input.provider)
  }

  return withOpenGraphProvider(ctx, executeWithProvider)
}
