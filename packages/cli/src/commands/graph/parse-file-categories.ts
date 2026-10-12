import { type FileCategory } from '@specd/sdk'
import { cliError } from '../../handle-error.js'

/** Valid file categories accepted by the CLI. */
export const VALID_FILE_CATEGORIES = new Set<string>(['source', 'test', 'ignored'])

/**
 * Parses and validates the `--category` graph option into an ordered list of categories.
 * Supports single values (e.g. "source") or comma-separated values (e.g. "source,test").
 *
 * @param value - Raw CLI value for `--category`.
 * @param format - Output format used for error reporting.
 * @returns Validated list of FileCategory, or undefined when value is undefined.
 */
export function parseFileCategories(
  value: string | undefined,
  format: string,
): readonly FileCategory[] | undefined {
  if (value === undefined) return undefined

  const tokens = value.split(',').map((t) => t.trim())
  const seen = new Set<string>()
  const result: FileCategory[] = []

  for (const token of tokens) {
    if (!VALID_FILE_CATEGORIES.has(token)) {
      cliError(`invalid category "${token}". Expected one of: source, test, ignored`, format, 1)
    }
    if (!seen.has(token)) {
      seen.add(token)
      result.push(token as FileCategory)
    }
  }

  return result
}
