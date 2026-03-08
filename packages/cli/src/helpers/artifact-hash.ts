import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type Change, type PreHashCleanup, computeArtifactHash } from '@specd/core'

/**
 * Reads artifact files from a change directory and computes sha256 hashes.
 *
 * Delegates pre-hash cleanup and hash computation to `@specd/core`. This
 * function handles only the I/O concern of reading artifact files from disk.
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
    result[artifact.filename] = computeArtifactHash(content, cleanups)
  }

  return result
}
