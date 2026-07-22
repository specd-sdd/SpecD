import { type ActorIdentity } from './entities/change.js'

/**
 * Lightweight index-backed record for archive listings (`ArchiveListEntry`).
 *
 * Constructed from the fs-cache index without reading per-entry manifests.
 * Formerly named `ArchivedChangeIndexEntry`.
 */
export interface ArchiveListEntry {
  readonly name: string
  readonly archivedName: string
  readonly archivedAt: Date
  readonly archivedBy?: ActorIdentity
  readonly specIds: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number
}

/**
 * @deprecated Use {@link ArchiveListEntry}. Kept as a temporary alias during migration.
 */
export type ArchivedChangeIndexEntry = ArchiveListEntry

/**
 * Derives workspace prefixes from spec IDs.
 *
 * Used by archive path templating (`ArchivePathEntry`), not by list rows.
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
