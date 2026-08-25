import { type SpecRepository, SpecPath } from '@specd/core'
import { type ImplementationSuggestionSpecStamp } from '../../domain/value-objects/implementation-suggestion-cache.js'

/** Repository dependencies required to observe spec identity. */
export interface SpecStampDeps {
  readonly specRepositories?: ReadonlyMap<string, SpecRepository> | undefined
}

/**
 * Splits a canonical `workspace:path` spec ID into its parts.
 *
 * @param specId - Canonical spec identifier
 * @returns Workspace name and raw path segments
 */
function splitSpecId(specId: string): { workspace: string; rawPath: string } {
  const colonIdx = specId.indexOf(':')
  return {
    workspace: colonIdx >= 0 ? specId.substring(0, colonIdx) : '',
    rawPath: colonIdx >= 0 ? specId.substring(colonIdx + 1) : specId,
  }
}

/**
 * Reads the current spec stamp from the injected repository. Cheap: no content
 * hashing happens here — `size` comes from the repository's stat-backed
 * artifact entries and `hash` only from whatever the repo declares inline.
 * Use {@link enrichSpecHash} when a content hash is actually required.
 *
 * @param deps - Repositories used to resolve the spec
 * @param specId - Target canonical spec identifier
 * @returns Current spec stamp or empty stamp if not found
 */
export async function readSpecStamp(
  deps: SpecStampDeps,
  specId: string,
): Promise<ImplementationSuggestionSpecStamp> {
  const { workspace, rawPath } = splitSpecId(specId)
  const repo = deps.specRepositories?.get(workspace)
  if (!repo) {
    return { lastModified: '', hash: '', artifacts: [] }
  }

  try {
    const specData = await repo.get(SpecPath.parse(rawPath))
    const artifactsMeta =
      (specData as unknown as { artifacts?: Array<Record<string, unknown>> })?.artifacts ?? []
    const mainArtifact = artifactsMeta.find((a) => a.filename === 'spec.md')
    const specRecord = specData as unknown as Record<string, unknown>
    const lastModified =
      typeof mainArtifact?.lastModified === 'string'
        ? mainArtifact.lastModified
        : typeof specRecord?.lastModified === 'string'
          ? specRecord.lastModified
          : ''
    const hash = typeof mainArtifact?.hash === 'string' ? mainArtifact.hash : ''
    const size = typeof mainArtifact?.size === 'number' ? mainArtifact.size : undefined

    return {
      lastModified,
      hash,
      ...(size !== undefined ? { size } : {}),
      artifacts: artifactsMeta.map((a) => ({
        filename: typeof a.filename === 'string' ? a.filename : '',
        lastModified: typeof a.lastModified === 'string' ? a.lastModified : '',
        hash: typeof a.hash === 'string' ? a.hash : '',
      })),
    }
  } catch {
    return { lastModified: '', hash: '', artifacts: [] }
  }
}

/**
 * Enriches a cheap stamp with the authoritative SHA-256 (and authoritative
 * size) via `artifactMeta({ includeHash: true })`. Mutates the provided
 * working copy; never throws.
 *
 * @param deps - Repositories used to resolve the spec
 * @param specId - Target canonical spec identifier
 * @param stamp - Working stamp copy to enrich in place
 * @param stamp.hash - Authoritative content hash written back when available
 * @param stamp.size - Authoritative byte length written back when available
 */
export async function enrichSpecHash(
  deps: SpecStampDeps,
  specId: string,
  stamp: {
    hash: string
    size?: number
  },
): Promise<void> {
  const { workspace, rawPath } = splitSpecId(specId)
  const repo = deps.specRepositories?.get(workspace)
  if (!repo) {
    return
  }
  try {
    const specData = await repo.get(SpecPath.parse(rawPath))
    if (specData && typeof repo.artifactMeta === 'function') {
      // `repo.get()` never includes artifact hashes; fetch the real SHA-256 explicitly.
      const meta = await repo.artifactMeta(specData, 'spec.md', { includeHash: true })
      if (typeof meta?.hash === 'string' && meta.hash.length > 0) {
        stamp.hash = meta.hash
      }
      if (meta && typeof meta.size === 'number') {
        stamp.size = meta.size
      }
    }
  } catch {
    // Keep declared values when enrichment fails.
  }
}

/** Outcome of the staged freshness decision for one cached entry. */
export type FreshnessDecision = 'fresh' | 'stale' | 'needs-hash'

/**
 * Pure stages 1-2 of the freshness decision between a cached stamp and the
 * current CHEAP observation (no enrichment yet):
 *
 * 1. size/mtime pre-filter — equal `lastModified` + equal `size` (when both
 *    sizes exist) is fresh without hashing; differing size proves a content
 *    change.
 * 2. content-hash precedence — usable hashes on both sides decide regardless
 *    of `lastModified`.
 *
 * When neither stage can decide, returns `needs-hash`: the caller MUST enrich
 * the current stamp ({@link enrichSpecHash}) and call {@link decideFreshness}
 * again; if the result is still `needs-hash`, fall back to
 * {@link timestampFallback}.
 *
 * @param cached - Stamp persisted in the cache entry
 * @param current - Cheap current observation of the same spec
 * @returns The stage decision
 */
export function decideFreshness(
  cached: ImplementationSuggestionSpecStamp,
  current: ImplementationSuggestionSpecStamp,
): FreshnessDecision {
  // Stage 1 — cheap size/mtime pre-filter.
  if (
    typeof cached.size === 'number' &&
    typeof current.size === 'number' &&
    cached.size >= 0 &&
    current.size >= 0
  ) {
    const lmMatch =
      !!cached.lastModified &&
      !!current.lastModified &&
      cached.lastModified === current.lastModified
    if (lmMatch && cached.size === current.size) {
      return 'fresh'
    }
    if (cached.size !== current.size) {
      return 'stale'
    }
    // mtime drifted but size matches: inconclusive without content identity.
  }

  // Stage 2 — content-hash precedence.
  const hashComparable =
    typeof cached.hash === 'string' &&
    cached.hash.length > 0 &&
    typeof current.hash === 'string' &&
    current.hash.length > 0
  if (hashComparable) {
    return cached.hash === current.hash ? 'fresh' : 'stale'
  }

  return 'needs-hash'
}

/**
 * Terminal timestamp fallback for entries that remain `needs-hash` after
 * enrichment (no usable hash on either side).
 *
 * @param cached - Stamp persisted in the cache entry
 * @param current - Current observation of the same spec
 * @returns `'fresh'` when timestamps match or nothing better exists; `'stale'` otherwise
 */
export function timestampFallback(
  cached: ImplementationSuggestionSpecStamp,
  current: ImplementationSuggestionSpecStamp,
): FreshnessDecision {
  if (cached.lastModified && current.lastModified && cached.lastModified === current.lastModified) {
    return 'fresh'
  }
  if (current.lastModified || current.hash) {
    return 'stale' // Spec exists and stamp differs -> stale
  }
  return 'fresh'
}
