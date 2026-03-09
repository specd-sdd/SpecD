import { parse as parseYaml } from 'yaml'
import { specMetadataSchema, type SpecMetadata } from '../../../domain/services/parse-metadata.js'

/**
 * Parses a `.specd-metadata.yaml` content string into a typed object.
 *
 * Delegates YAML deserialization to the `yaml` library and validates the
 * result against the lenient schema. Returns an empty object on YAML syntax
 * errors or validation failures.
 *
 * @param content - The raw YAML string
 * @returns Parsed and validated metadata
 */
export function parseMetadata(content: string): SpecMetadata {
  try {
    const parsed = parseYaml(content) as unknown
    const result = specMetadataSchema.safeParse(parsed)
    return result.success ? (result.data as SpecMetadata) : {}
  } catch {
    return {}
  }
}
