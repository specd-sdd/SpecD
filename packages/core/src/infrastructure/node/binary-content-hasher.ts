import { createHash } from 'node:crypto'
import { BinaryContentHasher } from '../../application/ports/binary-content-hasher.js'
import { type Sha256Digest } from '../../domain/value-objects/validity-fingerprint.js'

/** Node SHA-256 adapter for raw file bytes. Infrastructure-internal. */
export class NodeBinaryContentHasher extends BinaryContentHasher {
  /**
   * Hashes bytes with SHA-256.
   *
   * @param content - Raw file bytes
   * @returns Digest in `sha256:<hex>` form
   */
  hash(content: Uint8Array): Sha256Digest {
    return `sha256:${createHash('sha256').update(content).digest('hex')}`
  }
}
