import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type Change, type PreHashCleanup } from '@specd/core'

/**
 * Applies pre-hash cleanup substitutions to content.
 *
 * @param content - The raw artifact content
 * @param cleanups - Pre-hash cleanup rules from the schema
 * @returns The cleaned content
 */
function applyCleanup(content: string, cleanups: readonly PreHashCleanup[]): string {
  let result = content
  for (const cleanup of cleanups) {
    result = result.replace(new RegExp(cleanup.pattern, 'g'), cleanup.replacement)
  }
  return result
}

/**
 * Reads artifact files from a change directory and computes sha256 hashes.
 *
 * Uses `sha256` from `@specd/core`'s infrastructure layer. Returns a map of
 * artifact filename → hash string (e.g. `"sha256:abc123..."`).
 *
 * @param changeDir - Absolute path to the change directory
 * @param change - The change whose artifacts to hash
 * @param cleanupMap - Optional map of artifact type → pre-hash cleanup rules from schema
 * @returns Map of artifact filename → sha256 hash string
 */
export async function hashChangeArtifacts(
  changeDir: string,
  change: Change,
  cleanupMap?: ReadonlyMap<string, readonly PreHashCleanup[]>,
): Promise<Record<string, string>> {
  const { createHash } = await import('node:crypto')

  const result: Record<string, string> = {}

  for (const [type, artifact] of change.artifacts) {
    const filePath = path.join(changeDir, artifact.filename)
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch {
      // Skip missing artifacts
      continue
    }
    const cleanups = cleanupMap?.get(type) ?? []
    const cleaned = cleanups.length > 0 ? applyCleanup(content, cleanups) : content
    const hash = createHash('sha256').update(cleaned, 'utf8').digest('hex')
    result[artifact.filename] = `sha256:${hash}`
  }

  return result
}
