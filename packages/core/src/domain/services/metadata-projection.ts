import { type Schema } from '../value-objects/schema.js'
import { type SpecMetadata } from './parse-metadata.js'

/** Generator algorithm version recorded in metadata provenance. */
export const METADATA_PROJECTION_VERSION = 1

/** Minimal hasher contract for deterministic metadata fingerprints. */
interface MetadataHasher {
  hash(content: string): string
}

/**
 * Stable fingerprint of the resolved metadata projection contract for one schema.
 *
 * @param schema - Resolved schema definition.
 * @param extractorTransformIds - Active extractor transform identifiers.
 * @param hasher - Content hasher for the canonical payload.
 * @returns Deterministic projection fingerprint.
 */
export function computeProjectionFingerprint(
  schema: Schema,
  extractorTransformIds: readonly string[],
  hasher: MetadataHasher,
): string {
  const extraction = schema.metadataExtraction()
  const payload = JSON.stringify({
    version: METADATA_PROJECTION_VERSION,
    schema: { name: schema.name(), version: schema.version() },
    extraction: extraction ?? null,
    transforms: [...extractorTransformIds].sort(),
  })
  return hasher.hash(payload)
}

/**
 * Semantic fingerprint of a metadata projection (provenance excluded).
 *
 * @param metadata - Materialized metadata projection.
 * @param hasher - Content hasher for the canonical payload.
 * @returns Deterministic semantic fingerprint.
 */
export function computeMetadataFingerprint(metadata: SpecMetadata, hasher: MetadataHasher): string {
  const { provenance, ...semantic } = metadata
  void provenance
  return hasher.hash(stableStringify(semantic))
}

/**
 * JSON-stringifies a value with sorted object keys for stable hashing.
 *
 * @param value - Value to stringify.
 * @returns Canonical JSON string.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}
