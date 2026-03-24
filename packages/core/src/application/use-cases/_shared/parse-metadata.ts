import { specMetadataSchema, type SpecMetadata } from '../../../domain/services/parse-metadata.js'

/**
 * Parses a `.specd-metadata.json` content string into a typed object.
 *
 * Delegates JSON deserialization to `JSON.parse` and validates the
 * result against the lenient schema. Returns an empty object on JSON syntax
 * errors or validation failures.
 *
 * @param content - The raw JSON string
 * @returns Parsed and validated metadata
 */
export function parseMetadata(content: string): SpecMetadata {
  try {
    const parsed = JSON.parse(content) as unknown
    const result = specMetadataSchema.safeParse(parsed)
    return result.success ? (result.data as SpecMetadata) : {}
  } catch {
    return {}
  }
}
