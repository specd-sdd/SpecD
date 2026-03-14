import { createHash } from 'node:crypto'

/**
 * Computes a SHA-256 content hash prefixed with "sha256:".
 * @param content - The string content to hash.
 * @returns The hex-encoded hash string with a "sha256:" prefix.
 */
export function computeContentHash(content: string): string {
  return 'sha256:' + createHash('sha256').update(content).digest('hex')
}
