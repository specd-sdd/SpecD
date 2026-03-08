import { contentHash } from '../../../domain/services/content-hash.js'

/** Metadata freshness status for a spec. */
export type SpecMetadataStatus = 'fresh' | 'stale' | 'missing'

/** Per-file hash comparison entry. */
export interface ContentHashEntry {
  readonly filename: string
  readonly recorded: string
  readonly current: string
  readonly fresh: boolean
}

/** Result of a metadata freshness check. */
export interface MetadataFreshnessResult {
  /** Overall freshness: `true` only when every recorded hash matches its current file. */
  readonly allFresh: boolean
  /** Per-file comparison details. Empty when `contentHashes` is absent or empty. */
  readonly entries: readonly ContentHashEntry[]
}

/**
 * Checks whether recorded content hashes match the current file contents.
 *
 * @param contentHashes - Recorded hashes from `.specd-metadata.yaml` (`contentHashes` field).
 *   When `undefined` or empty, the result is `{ allFresh: false, entries: [] }`.
 * @param resolveContent - Async function that returns the current content of a file by filename,
 *   or `null` if the file does not exist.
 * @returns Freshness result with per-file details
 */
export async function checkMetadataFreshness(
  contentHashes: Record<string, string> | undefined,
  resolveContent: (filename: string) => Promise<string | null>,
): Promise<MetadataFreshnessResult> {
  if (contentHashes === undefined || Object.keys(contentHashes).length === 0) {
    return { allFresh: false, entries: [] }
  }

  const entries: ContentHashEntry[] = []
  let allFresh = true

  for (const [filename, recorded] of Object.entries(contentHashes)) {
    const content = await resolveContent(filename)
    if (content === null) {
      entries.push({ filename, recorded, current: '', fresh: false })
      allFresh = false
    } else {
      const current = contentHash(content)
      const fresh = current === recorded
      if (!fresh) allFresh = false
      entries.push({ filename, recorded, current, fresh })
    }
  }

  return { allFresh, entries }
}
