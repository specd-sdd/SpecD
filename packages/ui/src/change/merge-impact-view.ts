import type {
  ChangeGraphViewDto,
  GraphFileRefDto,
  GraphSymbolRefDto,
  ImplementationLinkDto,
  ImplementationTrackingDto,
  TrackedImplementationFileDto,
} from '@specd/client'
import { sortSpecIds } from '../lib/sort-spec-ids.js'

/** Accepted manifest link merged with optional code-graph coverage for the same spec/file. */
export type MergedAcceptedLink = {
  readonly link: ImplementationLinkDto
  readonly graphFiles: readonly GraphFileRefDto[]
  readonly graphSymbols: readonly GraphSymbolRefDto[]
}

/** Tracked files for one spec, split by review state. */
export type ImpactSpecTracked = {
  readonly resolved: readonly TrackedImplementationFileDto[]
  readonly open: readonly TrackedImplementationFileDto[]
  readonly ignored: readonly TrackedImplementationFileDto[]
}

/** Impact data grouped under one spec ID. */
export type ImpactSpecGroup = {
  readonly specId: string
  readonly accepted: readonly MergedAcceptedLink[]
  readonly graphOnlyFiles: readonly GraphFileRefDto[]
  readonly graphOnlySymbols: readonly GraphSymbolRefDto[]
  readonly tracked: ImpactSpecTracked
}

export type ImpactViewModel = {
  readonly bySpec: readonly ImpactSpecGroup[]
  /** Tracked files that could not be assigned to a single change spec. */
  readonly trackedUnassigned: ImpactSpecTracked
}

/**
 * Returns true when a manifest file path and a graph `workspace:path` refer to the same file.
 */
export function implementationFileMatchesGraphTarget(
  manifestFile: string,
  graphTarget: string | GraphFileRefDto,
): boolean {
  const raw = manifestFile.replace(/\\/g, '/')
  const target =
    typeof graphTarget === 'string'
      ? graphTarget
      : `${graphTarget.workspace}:${graphTarget.workspaceRelativePath}`
  const graphNormalized = target.replace(/\\/g, '/')
  if (raw === graphNormalized || graphNormalized === raw) return true
  if (graphNormalized.endsWith(raw) || raw.endsWith(graphNormalized)) return true

  const graphPath = graphNormalized.includes(':')
    ? graphNormalized.slice(graphNormalized.indexOf(':') + 1)
    : graphNormalized
  if (raw.endsWith(graphPath) || graphPath.endsWith(raw)) return true

  const rawBase = raw.split('/').pop()
  const graphBase = graphPath.split('/').pop()
  return rawBase !== undefined && rawBase.length > 0 && rawBase === graphBase
}

function graphEntryForSpec(
  graph: ChangeGraphViewDto | undefined,
  specId: string,
): ChangeGraphViewDto['specs'][number] | undefined {
  return graph?.specs.find((entry) => entry.specId === specId)
}

function emptyTracked(): ImpactSpecTracked {
  return { resolved: [], open: [], ignored: [] }
}

function collectSpecIds(
  tracking: ImplementationTrackingDto,
  graph: ChangeGraphViewDto | undefined,
  changeSpecIds: readonly string[] | undefined,
): string[] {
  const ids = new Set<string>()
  for (const id of changeSpecIds ?? []) ids.add(id)
  for (const link of tracking.links) ids.add(link.specId)
  for (const entry of graph?.specs ?? []) ids.add(entry.specId)
  return sortSpecIds([...ids])
}

/**
 * Assigns a tracked file to specs it matches via links or graph paths.
 */
function specsForTrackedFile(
  file: string,
  tracking: ImplementationTrackingDto,
  graph: ChangeGraphViewDto | undefined,
): readonly string[] {
  const matched = new Set<string>()
  for (const link of tracking.links) {
    if (link.specId && implementationFileMatchesGraphTarget(file, link.file)) {
      matched.add(link.specId)
    }
  }
  for (const entry of graph?.specs ?? []) {
    if (entry.coveredFiles.some((g) => implementationFileMatchesGraphTarget(file, g))) {
      matched.add(entry.specId)
    }
  }
  return [...matched]
}

function pushTracked(
  bucket: ImpactSpecTracked,
  entry: TrackedImplementationFileDto,
): ImpactSpecTracked {
  if (entry.state === 'resolved') {
    return { ...bucket, resolved: [...bucket.resolved, entry] }
  }
  if (entry.state === 'ignored') {
    return { ...bucket, ignored: [...bucket.ignored, entry] }
  }
  return { ...bucket, open: [...bucket.open, entry] }
}

/**
 * Builds Impact tab view grouped by spec ID.
 */
export function buildImpactViewModel(
  tracking: ImplementationTrackingDto,
  graph: ChangeGraphViewDto | undefined,
  changeSpecIds?: readonly string[],
): ImpactViewModel {
  const specIds = collectSpecIds(tracking, graph, changeSpecIds ?? graph?.specIds)
  const trackedBySpec = new Map<string, ImpactSpecTracked>()
  let unassigned = emptyTracked()

  for (const specId of specIds) {
    trackedBySpec.set(specId, emptyTracked())
  }

  for (const entry of tracking.trackedFiles) {
    const owners = specsForTrackedFile(entry.file, tracking, graph)
    if (owners.length === 1) {
      const specId = owners[0]!
      const bucket = trackedBySpec.get(specId) ?? emptyTracked()
      trackedBySpec.set(specId, pushTracked(bucket, entry))
    } else {
      unassigned = pushTracked(unassigned, entry)
    }
  }

  const bySpec: ImpactSpecGroup[] = specIds.map((specId) => {
    const linksForSpec = tracking.links.filter((l) => l.specId === specId)
    const graphEntry = graphEntryForSpec(graph, specId)

    const accepted: MergedAcceptedLink[] = linksForSpec.map((link) => {
      const graphFiles =
        graphEntry?.coveredFiles.filter((f) =>
          implementationFileMatchesGraphTarget(link.file, f),
        ) ?? []
      return {
        link,
        graphFiles,
        graphSymbols: graphEntry?.coveredSymbols ?? [],
      }
    })

    const graphOnlyFiles =
      graphEntry?.coveredFiles.filter(
        (f) => !linksForSpec.some((l) => implementationFileMatchesGraphTarget(l.file, f)),
      ) ?? []

    const hasGraphOnly =
      graphOnlyFiles.length > 0 ||
      (linksForSpec.length === 0 && (graphEntry?.coveredSymbols.length ?? 0) > 0)

    return {
      specId,
      accepted,
      graphOnlyFiles: hasGraphOnly ? graphOnlyFiles : [],
      graphOnlySymbols: hasGraphOnly ? (graphEntry?.coveredSymbols ?? []) : [],
      tracked: trackedBySpec.get(specId) ?? emptyTracked(),
    }
  })

  return {
    bySpec: bySpec.filter(
      (group) =>
        group.accepted.length > 0 ||
        group.graphOnlyFiles.length > 0 ||
        group.graphOnlySymbols.length > 0 ||
        group.tracked.resolved.length > 0 ||
        group.tracked.open.length > 0 ||
        group.tracked.ignored.length > 0,
    ),
    trackedUnassigned: unassigned,
  }
}
