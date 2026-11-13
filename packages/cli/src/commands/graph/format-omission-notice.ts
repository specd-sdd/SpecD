/**
 * Counts of omitted test and ignored files for omission notice rendering.
 */
export interface OmissionNoticeCounts {
  readonly tests?: number
  readonly ignored?: number
}

/**
 * Formats a human-readable notice when test or ignored files were omitted from results.
 * @param omittedCounts - Count of omitted test and ignored files.
 * @returns Formatted omission notice string, or undefined if no files were omitted.
 */
export function formatOmissionNotice(omittedCounts?: OmissionNoticeCounts): string | undefined {
  if (!omittedCounts) return undefined
  const tests = omittedCounts.tests ?? 0
  const ignored = omittedCounts.ignored ?? 0
  if (tests === 0 && ignored === 0) return undefined

  const parts: string[] = []
  if (tests > 0) parts.push(`${tests} test ${tests === 1 ? 'file' : 'files'}`)
  if (ignored > 0) parts.push(`${ignored} ignored ${ignored === 1 ? 'file' : 'files'}`)

  return `ℹ Excluded from results: ${parts.join(', ')}. Use --include-tests, --include-ignored, or --all to view them.`
}
