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
