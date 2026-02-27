/**
 * Formats a UTC timestamp as `YYYYMMDD-HHmmss` for use as a change directory prefix.
 *
 * All segments are zero-padded and derived from the UTC clock to avoid
 * host-timezone ambiguity.
 *
 * @param date - The date to format
 * @returns A `YYYYMMDD-HHmmss` string derived from the UTC components of `date`
 */
export function formatDirTimestamp(date: Date): string {
  const y = date.getUTCFullYear().toString()
  const mo = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = date.getUTCDate().toString().padStart(2, '0')
  const h = date.getUTCHours().toString().padStart(2, '0')
  const mi = date.getUTCMinutes().toString().padStart(2, '0')
  const s = date.getUTCSeconds().toString().padStart(2, '0')
  return `${y}${mo}${d}-${h}${mi}${s}`
}

/**
 * Builds the full directory name for a change: `YYYYMMDD-HHmmss-<name>`.
 *
 * The prefix is a filesystem-only convention — it must not appear in the
 * domain model, the manifest, or any CLI argument.
 *
 * @param name - The change slug name (e.g. `"add-auth-flow"`)
 * @param createdAt - The creation timestamp from the change manifest
 * @returns The full directory name including the timestamp prefix
 */
export function changeDirName(name: string, createdAt: Date): string {
  return `${formatDirTimestamp(createdAt)}-${name}`
}
