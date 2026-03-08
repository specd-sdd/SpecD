import { createHash } from 'node:crypto'

/**
 * Computes a SHA-256 hash of the given content string.
 *
 * Returns a `sha256:`-prefixed hex string consistent with the hash format
 * used in `.specd-metadata.yaml` content hashes.
 *
 * @param content - The content to hash
 * @returns A hex digest prefixed with `sha256:`
 */
export function contentHash(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}
