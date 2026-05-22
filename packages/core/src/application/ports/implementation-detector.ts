import { type Change } from '../../domain/entities/change.js'

/**
 * Port for discovering modified implementation files for one change.
 *
 * The detector owns baseline resolution and VCS interaction details. Callers
 * provide the `Change` context and receive raw project-relative file paths.
 */
export interface ImplementationDetector {
  /**
   * Detects modified implementation files for one change.
   *
   * Returns raw project-relative file paths. Missing or empty results are
   * represented as an empty array.
   *
   * @param change - The change whose implementation baseline should be used
   * @returns Raw project-relative modified file paths
   */
  detectModifiedFiles(change: Change): Promise<readonly string[]>
}
