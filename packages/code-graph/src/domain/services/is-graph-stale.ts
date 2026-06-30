/**
 * Computes whether the code graph is stale based on the last indexed VCS ref and the current VCS ref.
 *
 * @param lastIndexedRef - The VCS ref stored in the graph at index time, or `null`.
 * @param currentRef - The current VCS ref at query time, or `null`.
 * @returns `true` if stale, `false` if fresh, `null` if unknown.
 */
export function isGraphStale(
  lastIndexedRef: string | null,
  currentRef: string | null,
): boolean | null {
  if (lastIndexedRef === null || currentRef === null) return null
  return lastIndexedRef !== currentRef
}
