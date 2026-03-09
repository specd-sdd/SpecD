import { type PreHashCleanup } from '../value-objects/validation-rule.js'
import { safeRegex } from './safe-regex.js'

/**
 * Applies pre-hash cleanup substitutions to artifact content.
 *
 * Pre-hash cleanup rules are regex-based substitutions defined in the schema.
 * They strip variable content (timestamps, whitespace, etc.) from artifact
 * content before computing a hash, ensuring that formatting changes that
 * don't affect substance don't invalidate the hash.
 *
 * @param content - The raw artifact content
 * @param cleanups - Pre-hash cleanup rules from the schema
 * @returns The cleaned content with all substitutions applied
 */
export function applyPreHashCleanup(content: string, cleanups: readonly PreHashCleanup[]): string {
  let result = content
  for (const cleanup of cleanups) {
    const re = safeRegex(cleanup.pattern, 'g')
    if (re !== null) {
      result = result.replace(re, cleanup.replacement)
    }
  }
  return result
}
