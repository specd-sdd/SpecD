/**
 * Stable ascending order for qualified spec ids (`workspace:capability-path`).
 */
export function sortSpecIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b))
}
