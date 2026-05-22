import path from 'node:path'
import {
  createVcsAdapter,
  parseSpecId,
  type ImplementationTrackingProjection,
  type SpecdConfig,
} from '@specd/core'
import { createCodeGraphProvider } from '@specd/code-graph'

/** Implementation link enriched with point-in-time stale diagnostics. */
export interface EnrichedImplementationLink {
  readonly specId: string
  readonly file: string
  readonly fileLinkExplicit: boolean
  readonly symbols?: readonly string[]
  readonly staleSymbols: readonly string[]
}

/** Best-effort graph availability and freshness hint for CLI rendering. */
export interface GraphHint {
  readonly status: 'fresh' | 'stale' | 'not-indexed' | 'unavailable'
  readonly message: string
}

/** CLI projection of implementation tracking enriched with graph diagnostics. */
export interface EnrichedImplementationTracking {
  readonly trackedFiles: ImplementationTrackingProjection['trackedFiles']
  readonly links: readonly EnrichedImplementationLink[]
  readonly graphHint: GraphHint
}

/**
 * Enriches implementation tracking with stale-symbol diagnostics from the code graph.
 *
 * @param config - Resolved project configuration
 * @param tracking - Raw implementation-tracking projection from core
 * @returns Graph-enriched implementation tracking for CLI rendering
 */
export async function enrichImplementationTracking(
  config: SpecdConfig,
  tracking: ImplementationTrackingProjection,
): Promise<EnrichedImplementationTracking> {
  const baseLinks = tracking.links.map((link) => ({
    specId: link.specId,
    file: link.file,
    fileLinkExplicit: link.fileLinkExplicit,
    ...(link.symbols !== undefined ? { symbols: link.symbols } : {}),
    staleSymbols: [],
  }))

  const provider = createCodeGraphProvider(config)
  try {
    await provider.open()
    const stats = await provider.getStatistics()
    if (stats.lastIndexedAt === undefined) {
      return {
        trackedFiles: tracking.trackedFiles,
        links: baseLinks,
        graphHint: {
          status: 'not-indexed',
          message: 'Code graph not indexed; stale symbol diagnostics unavailable.',
        },
      }
    }

    let currentRef: string | null = null
    try {
      const vcs = await createVcsAdapter(config.projectRoot)
      currentRef = await vcs.ref()
    } catch {
      currentRef = null
    }
    const stale = computeStaleness(stats.lastIndexedRef, currentRef)

    const links = await Promise.all(
      baseLinks.map(async (link) => {
        if (link.symbols === undefined || link.symbols.length === 0) return link
        const canonicalFile = toCanonicalImplementationFile(config, link.specId, link.file)
        if (canonicalFile === null) return link

        const staleSymbols: string[] = []
        for (const symbol of link.symbols) {
          const exactMatches = await provider.findSymbols({ name: symbol, filePath: canonicalFile })
          if (exactMatches.length > 0) continue

          const fallbackName = extractRightmostMemberSegment(symbol)
          if (fallbackName === null) {
            staleSymbols.push(symbol)
            continue
          }

          const fallbackMatches = await provider.findSymbols({
            name: fallbackName,
            filePath: canonicalFile,
          })
          if (fallbackMatches.length !== 1) {
            staleSymbols.push(symbol)
          }
        }
        return { ...link, staleSymbols }
      }),
    )

    return {
      trackedFiles: tracking.trackedFiles,
      links,
      graphHint:
        stale === true
          ? {
              status: 'stale',
              message: 'Code graph is stale; stale symbol diagnostics are best-effort.',
            }
          : {
              status: 'fresh',
              message: 'Code graph is fresh; stale symbol diagnostics are authoritative.',
            },
    }
  } catch {
    return {
      trackedFiles: tracking.trackedFiles,
      links: baseLinks,
      graphHint: {
        status: 'unavailable',
        message: 'Code graph unavailable; stale symbol diagnostics skipped.',
      },
    }
  } finally {
    await provider.close().catch(() => {})
  }
}

/**
 * Converts a raw project-relative implementation path into canonical `workspace:path`.
 *
 * @param config - Resolved project configuration
 * @param specId - Spec owning the implementation link
 * @param rawFile - Raw project-relative file path stored in the change
 * @returns Canonical workspace file path, or `null` when the file falls outside the workspace
 */
function toCanonicalImplementationFile(
  config: SpecdConfig,
  specId: string,
  rawFile: string,
): string | null {
  const { workspace } = parseSpecId(specId)
  const workspaceConfig = config.workspaces.find((entry) => entry.name === workspace)
  if (workspaceConfig === undefined) return null

  const absolutePath = path.resolve(config.projectRoot, rawFile)
  const relative = path.relative(workspaceConfig.codeRoot, absolutePath)
  if (
    relative.length === 0 ||
    relative === '.' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null
  }

  return `${workspace}:${relative.split(path.sep).join('/')}`
}

/**
 * Computes whether the current graph index is stale relative to the active VCS ref.
 *
 * @param lastIndexedRef - Ref recorded when the graph was last indexed
 * @param currentRef - Current VCS ref, when available
 * @returns `true` when stale, `false` when fresh, or `null` when unknown
 */
function computeStaleness(
  lastIndexedRef: string | null,
  currentRef: string | null,
): boolean | null {
  if (lastIndexedRef === null || currentRef === null) return null
  return lastIndexedRef !== currentRef
}

/**
 * Extracts the rightmost member segment from a composed symbol identifier.
 *
 * @param symbol - Stored symbol identifier
 * @returns The rightmost segment, or `null` when the symbol is not composed
 */
function extractRightmostMemberSegment(symbol: string): string | null {
  const separators = ['::', '#', '.']
  let rightmostIndex = -1
  let separatorLength = 0

  for (const separator of separators) {
    const index = symbol.lastIndexOf(separator)
    if (index > rightmostIndex) {
      rightmostIndex = index
      separatorLength = separator.length
    }
  }

  if (rightmostIndex < 0) return null
  const segment = symbol.slice(rightmostIndex + separatorLength).trim()
  return segment.length > 0 ? segment : null
}
