import { SpecdError } from './specd-error.js'

/**
 * Thrown when a metadata write would change existing `dependsOn` entries
 * without the `force` flag.
 *
 * `dependsOn` entries are considered curated — they may have been manually
 * added or verified by a human. Silently overwriting them risks losing
 * intentional dependency declarations.
 *
 * To proceed despite the mismatch, retry with `{ force: true }`.
 */
export class DependsOnOverwriteError extends SpecdError {
  private readonly _existingDeps: readonly string[]
  private readonly _incomingDeps: readonly string[]

  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'DEPENDS_ON_OVERWRITE'
  }

  /** The `dependsOn` entries currently on disk. */
  get existingDeps(): readonly string[] {
    return this._existingDeps
  }

  /** The `dependsOn` entries in the incoming metadata. */
  get incomingDeps(): readonly string[] {
    return this._incomingDeps
  }

  /**
   * Compares two `dependsOn` arrays for equality, ignoring order.
   *
   * @param a - first dependsOn array
   * @param b - second dependsOn array
   * @returns `true` if both arrays contain the same entries (order-independent)
   */
  static areSame(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false
    const sortedA = [...a].sort()
    const sortedB = [...b].sort()
    return sortedA.every((val, idx) => val === sortedB[idx])
  }

  /**
   * Creates a new `DependsOnOverwriteError`.
   *
   * @param existingDeps - The `dependsOn` array in the current metadata on disk
   * @param incomingDeps - The `dependsOn` array in the incoming metadata content
   */
  constructor(existingDeps: readonly string[], incomingDeps: readonly string[]) {
    const removed = existingDeps.filter((d) => !incomingDeps.includes(d))
    const added = incomingDeps.filter((d) => !existingDeps.includes(d))
    const parts: string[] = []
    if (removed.length > 0) parts.push(`removed: ${removed.join(', ')}`)
    if (added.length > 0) parts.push(`added: ${added.join(', ')}`)
    super(
      `dependsOn would change (${parts.join('; ')}). Use --force to overwrite curated dependencies.`,
    )
    this._existingDeps = existingDeps
    this._incomingDeps = incomingDeps
  }
}
