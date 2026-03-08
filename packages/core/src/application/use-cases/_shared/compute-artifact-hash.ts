import { type PreHashCleanup } from '../../../domain/value-objects/validation-rule.js'
import { type Schema } from '../../../domain/value-objects/schema.js'
import { applyPreHashCleanup } from '../../../domain/services/pre-hash-cleanup.js'
import { contentHash } from '../../../domain/services/content-hash.js'

/**
 * Computes a SHA-256 hash of artifact content after applying pre-hash cleanup rules.
 *
 * Returns a `sha256:`-prefixed hex string consistent with the hash format used
 * in `.specd-metadata.yaml` content hashes.
 *
 * @param content - The raw artifact content
 * @param cleanups - Pre-hash cleanup rules to apply before hashing
 * @returns The `sha256:`-prefixed hex hash string
 */
export function computeArtifactHash(
  content: string,
  cleanups: readonly PreHashCleanup[] = [],
): string {
  const cleaned = cleanups.length > 0 ? applyPreHashCleanup(content, cleanups) : content
  return contentHash(cleaned)
}

/**
 * Builds a map of artifact type ID to pre-hash cleanup rules from a schema.
 *
 * Only artifact types that declare at least one cleanup rule are included.
 *
 * @param schema - The resolved schema
 * @returns Map of artifact type ID to cleanup rules
 */
export function buildCleanupMap(schema: Schema): ReadonlyMap<string, readonly PreHashCleanup[]> {
  const map = new Map<string, readonly PreHashCleanup[]>()
  for (const a of schema.artifacts()) {
    const cleanups = a.preHashCleanup()
    if (cleanups.length > 0) {
      map.set(a.id(), cleanups)
    }
  }
  return map
}
