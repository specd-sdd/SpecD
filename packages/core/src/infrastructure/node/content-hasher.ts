import { createHash } from 'node:crypto'
import { ContentHasher } from '../../application/ports/content-hasher.js'

/** SHA-256 content hasher using Node.js crypto module. */
export class NodeContentHasher extends ContentHasher {
  /**
   * Compute a SHA-256 hash and return it in `sha256:<hex>` format.
   *
   * @param content - The content string to hash
   * @returns The hash in `sha256:<hex>` format
   */
  hash(content: string): string {
    return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
  }
}
