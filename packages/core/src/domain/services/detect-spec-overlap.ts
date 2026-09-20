import { type Change } from '../entities/change.js'
import { OverlapEntry, type OverlapChange } from '../value-objects/overlap-entry.js'
import { OverlapReport } from '../value-objects/overlap-report.js'

/**
 * Detects specs targeted by multiple active changes.
 *
 * Builds an index of spec ID to changes, filters to specs with more than one
 * change, and returns a sorted overlap report. Pure function — no I/O.
 *
 * @param changes - Active changes to check for overlap
 * @returns An overlap report with entries for each overlapping spec
 */
export function detectSpecOverlap(changes: readonly Change[]): OverlapReport {
  if (changes.length <= 1) {
    return new OverlapReport([])
  }

  const index = new Map<string, OverlapChange[]>()

  for (const change of changes) {
    const info: OverlapChange = { name: change.name, state: change.state }
    for (const specId of change.specIds) {
      let list = index.get(specId)
      if (list === undefined) {
        list = []
        index.set(specId, list)
      }
      list.push(info)
    }
  }

  const entries: OverlapEntry[] = []

  for (const [specId, changeList] of index) {
    if (changeList.length > 1) {
      const sorted = [...changeList].sort((a, b) => a.name.localeCompare(b.name))
      entries.push(new OverlapEntry(specId, sorted))
    }
  }

  entries.sort((a, b) => a.specId.localeCompare(b.specId))

  return new OverlapReport(entries)
}

/** Named peer with overlapping spec ids for `spec.overlap` messaging. */
export interface SpecOverlapPeerSummary {
  /** Overlapping peer change name. */
  readonly changeName: string
  /** Spec ids shared with this peer. */
  readonly overlappingSpecIds: readonly string[]
}

/** Detection payload for archive `spec.overlap`. */
export interface SpecOverlapDetectionSummary {
  /** True when this change shares specs with another active change. */
  readonly blocked: boolean
  /** Named peers with overlapping spec ids when blocked. */
  readonly peers: readonly SpecOverlapPeerSummary[]
}

/**
 * Projects an overlap report onto one change for `spec.overlap`.
 *
 * @param changeName - Change being archived or status-checked
 * @param report - Full overlap report across active changes
 * @returns Blocked flag and peer summaries (empty peers when unblocked)
 */
export function specOverlapDetectionForChange(
  changeName: string,
  report: OverlapReport,
): SpecOverlapDetectionSummary {
  const relevant = report.entries.filter((entry) =>
    entry.changes.some((peer) => peer.name === changeName),
  )
  if (relevant.length === 0) {
    return { blocked: false, peers: [] }
  }

  const byPeer = new Map<string, string[]>()
  for (const entry of relevant) {
    for (const peer of entry.changes) {
      if (peer.name === changeName) continue
      const ids = byPeer.get(peer.name) ?? []
      ids.push(entry.specId)
      byPeer.set(peer.name, ids)
    }
  }

  const peers = [...byPeer.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, overlappingSpecIds]) => ({
      changeName: name,
      overlappingSpecIds,
    }))

  return { blocked: true, peers }
}
