import { type ActorIdentity } from './entities/change.js'

/**
 * Lightweight index-backed record for archive listings.
 *
 * Constructed from `index.jsonl` without reading per-entry manifests.
 */
export interface ArchivedChangeIndexEntry {
  readonly name: string
  readonly archivedName: string
  readonly archivedAt: Date
  readonly description?: string
  readonly archivedBy?: ActorIdentity
  readonly artifacts: readonly string[]
  readonly specIds: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number
  readonly workspaces: readonly string[]
}

/**
 * Derives workspace prefixes from spec IDs.
 *
 * @param specIds - Spec IDs in `workspace:path` form
 * @returns Unique workspace prefixes in encounter order
 */
export function workspacesFromSpecIds(specIds: readonly string[]): readonly string[] {
  const set = new Set<string>()
  for (const id of specIds) {
    const colonIdx = id.indexOf(':')
    if (colonIdx >= 0) {
      set.add(id.substring(0, colonIdx))
    }
  }
  return [...set]
}
