import { parseSpecId } from './services/parse-spec-id.js'
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
 * Used by archive path templating (`ArchivePathEntry`), not by list rows. Each ID is parsed with
 * {@link parseSpecId}, so a bare ID yields the `default` workspace.
 *
 * @param specIds - Spec IDs, bare or in `workspace:path` form
 * @returns Unique workspace prefixes in encounter order
 * @throws {InvalidSpecIdError} If an ID is empty, blank, or malformed
 */
export function workspacesFromSpecIds(specIds: readonly string[]): readonly string[] {
  const set = new Set<string>()
  for (const id of specIds) {
    set.add(parseSpecId(id).workspace)
  }
  return [...set]
}
