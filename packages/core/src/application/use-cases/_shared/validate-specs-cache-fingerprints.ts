import { type Schema } from '../../../domain/value-objects/schema.js'
import { type ContentHasher } from '../../ports/content-hasher.js'

/** Bumped when validate-specs evaluation logic changes independently of schema YAML. */
export const VALIDATE_SPECS_ENGINE_VERSION = 1 as const

const ABSENT_SENTINEL = '__absent__'

/**
 * Builds a stable JSON object and hashes it for schema-surface fingerprinting.
 *
 * @param input - Schema identity, spec-scoped validations, cross rules, dependsOn flag
 * @param input.schemaName - Resolved schema name
 * @param input.schemaVersion - Resolved schema version
 * @param input.specScopedArtifactValidations - Spec-scoped artifact validation projections
 * @param input.specScopedCrossRules - Spec-scoped cross-artifact rules
 * @param input.declaresDependsOnExtraction - Whether dependsOn extraction is declared
 * @param hash - Content hasher producing `algorithm:hex` digests
 * @returns Schema fingerprint digest
 */
export function computeSchemaFingerprint(
  input: {
    readonly schemaName: string
    readonly schemaVersion: number | string
    readonly specScopedArtifactValidations: unknown
    readonly specScopedCrossRules: unknown
    readonly declaresDependsOnExtraction: boolean
  },
  hash: (content: string) => string,
): string {
  const canonical = sortKeys({
    schemaName: input.schemaName,
    schemaVersion: input.schemaVersion,
    artifacts: input.specScopedArtifactValidations,
    crossRules: input.specScopedCrossRules,
    declaresDependsOnExtraction: input.declaresDependsOnExtraction,
  })
  return hash(JSON.stringify(canonical))
}

/**
 * Hashes spec-authored content plus raw generated metadata bytes for cache soft-hit.
 *
 * @param input - Repository spec fingerprint and raw metadata content hash
 * @param input.specFingerprint - Digest from {@link SpecRepository.specFingerprint}
 * @param input.metadataContentHash - Raw `metadata.json` bytes hash or absent sentinel
 * @param hash - Content hasher producing `algorithm:hex` digests
 * @returns Cache fingerprint digest
 */
export function computeCacheFingerprint(
  input: {
    readonly specFingerprint: string
    readonly metadataContentHash: string | null
  },
  hash: (content: string) => string,
): string {
  const canonical = sortKeys({
    specFingerprint: input.specFingerprint,
    metadataContentHash: input.metadataContentHash ?? ABSENT_SENTINEL,
  })
  return hash(JSON.stringify(canonical))
}

/**
 * Computes the schema fingerprint for a resolved {@link Schema} instance.
 *
 * @param schema - Active schema governing validation
 * @param hasher - Content hasher
 * @returns Schema fingerprint digest
 */
export function computeSchemaFingerprintFromSchema(schema: Schema, hasher: ContentHasher): string {
  const specArtifacts = schema.artifacts().filter((artifact) => artifact.scope === 'spec')
  const specScopedArtifactValidations = [...specArtifacts]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((artifact) => ({
      id: artifact.id,
      validations: artifact.validations,
    }))
  const specScopedCrossRules = schema
    .crossArtifactValidations()
    .filter((rule) => rule.scope === 'spec')
  const declaresDependsOnExtraction = schema.metadataExtraction()?.dependsOn !== undefined

  return computeSchemaFingerprint(
    {
      schemaName: schema.name(),
      schemaVersion: schema.version(),
      specScopedArtifactValidations,
      specScopedCrossRules,
      declaresDependsOnExtraction,
    },
    (content) => hasher.hash(content),
  )
}

/**
 * Recursively sorts object keys for stable JSON serialization.
 *
 * @param value - Value to canonicalize
 * @returns Canonicalized value with sorted object keys
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeys(entry))
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeys(record[key])
    }
    return sorted
  }
  return value
}

export { ABSENT_SENTINEL as VALIDATE_SPECS_ABSENT_SENTINEL }
