import { type Sha256Digest } from '../../domain/value-objects/validity-fingerprint.js'

/**
 * Port for hashing raw file bytes.
 *
 * Distinct from the text content hasher, which hashes text after artifact cleanup.
 */
export abstract class BinaryContentHasher {
  /**
   * Computes a SHA-256 digest of the supplied bytes.
   *
   * @param content - Raw file bytes, without text coercion
   * @returns Digest in `sha256:<hex>` form
   */
  abstract hash(content: Uint8Array): Sha256Digest
}
