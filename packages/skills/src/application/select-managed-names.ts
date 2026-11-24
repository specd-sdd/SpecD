/**
 * Entry reported for a requested name that was not acted upon.
 */
export interface SkippedName {
  /** The requested name, exactly as supplied by the caller. */
  readonly skill: string
  /** Why the name was skipped. */
  readonly reason: string
}

/**
 * Outcome of validating requested names against the specd-managed names.
 */
export interface ManagedNameSelection {
  /** Requested names that are managed and safe to use as a path segment. */
  readonly accepted: readonly string[]
  /** Requested names that were rejected, with the reason. */
  readonly skipped: readonly SkippedName[]
}

/**
 * Result reported by a plugin uninstall: the requested names that were skipped.
 */
export interface UninstallResult {
  /** Requested names that were not specd-managed (or unsafe) and were left untouched. */
  readonly skipped: readonly SkippedName[]
}

/**
 * Returns whether a name could escape a directory when joined to it.
 *
 * @param name - Candidate name.
 * @returns `true` when the name is empty, is `.` or `..`, or contains a path separator.
 */
function isUnsafeName(name: string): boolean {
  return name === '' || name === '.' || name === '..' || /[\\/]/.test(name) || name.includes('\0')
}

/**
 * Validates requested skill or agent names against the managed names.
 *
 * A name is accepted only when it is exactly one of the managed names and has no
 * path separator or `..` segment. Every other name is reported as skipped and
 * MUST NOT be used to touch the filesystem.
 *
 * @param requested - Names supplied by the caller.
 * @param managed - Specd-managed names (from the skills repository).
 * @returns Accepted names and skipped entries, both in request order.
 */
export function selectManagedNames(
  requested: readonly unknown[],
  managed: readonly string[],
): ManagedNameSelection {
  const accepted: string[] = []
  const skipped: SkippedName[] = []
  for (const name of requested) {
    if (typeof name !== 'string' || isUnsafeName(name)) {
      skipped.push({ skill: name as string, reason: 'invalid name' })
    } else if (!managed.includes(name)) {
      skipped.push({ skill: name, reason: 'not a specd-managed item' })
    } else {
      accepted.push(name)
    }
  }
  return { accepted, skipped }
}
