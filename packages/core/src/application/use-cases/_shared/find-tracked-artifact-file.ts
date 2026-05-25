import * as path from 'node:path'
import { type Change } from '../../../domain/entities/change.js'
import { type ChangeArtifact } from '../../../domain/entities/change-artifact.js'
import { type ArtifactFile } from '../../../domain/value-objects/artifact-file.js'

/**
 * Normalizes artifact paths to POSIX form for manifest lookup.
 *
 * @param filename - Raw filename from the API or filesystem
 * @returns Normalized POSIX path
 */
function normalizeFilename(filename: string): string {
  return path.posix.normalize(filename.replace(/\\/g, '/'))
}

/** Locates a tracked manifest file entry by relative filename. */
export interface TrackedArtifactFileLocation {
  readonly artifact: ChangeArtifact
  readonly file: ArtifactFile
}

/**
 * Finds the artifact file entry for a tracked change-directory filename.
 *
 * @param change - Change whose manifest defines tracked files
 * @param filename - Relative filename within the change directory
 * @returns The artifact and file entry, or `undefined` when untracked
 */
export function findTrackedArtifactFile(
  change: Change,
  filename: string,
): TrackedArtifactFileLocation | undefined {
  const normalized = normalizeFilename(filename)
  for (const artifact of change.artifacts.values()) {
    for (const file of artifact.files.values()) {
      if (normalizeFilename(file.filename) === normalized) {
        return { artifact, file }
      }
    }
  }
  return undefined
}
