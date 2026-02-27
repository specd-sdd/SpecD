import { createHash } from 'node:crypto'

/**
 * Computes a `sha256:<hex>` hash of the given UTF-8 string content.
 *
 * @param content - The UTF-8 string to hash
 * @returns A `sha256:<hex>` formatted hash string
 */
export function sha256(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}
