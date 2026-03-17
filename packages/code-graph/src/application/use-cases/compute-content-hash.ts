import { NodeContentHasher } from '@specd/core'

const hasher = new NodeContentHasher()

/**
 * Computes a SHA-256 content hash prefixed with "sha256:".
 * Delegates to {@link NodeContentHasher} from `@specd/core`.
 * @param content - The string content to hash.
 * @returns The hex-encoded hash string with a "sha256:" prefix.
 */
export function computeContentHash(content: string): string {
  return hasher.hash(content)
}
