import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

/** Zod schema for `.specd-metadata.yaml` content. */
export const specMetadataSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    dependsOn: z.array(z.string()).optional(),
    contentHashes: z.record(z.string(), z.string()).optional(),
    rules: z
      .array(
        z.object({
          requirement: z.string(),
          rules: z.array(z.string()),
        }),
      )
      .optional(),
    constraints: z.array(z.string()).optional(),
    scenarios: z
      .array(
        z.object({
          requirement: z.string(),
          name: z.string(),
          given: z.array(z.string()).optional(),
          when: z.array(z.string()).optional(),
          then: z.array(z.string()).optional(),
        }),
      )
      .optional(),
  })
  .passthrough()

/** Parsed `.specd-metadata.yaml` content. */
export interface SpecMetadata {
  readonly title?: string
  readonly description?: string
  readonly keywords?: string[]
  readonly dependsOn?: string[]
  readonly contentHashes?: Record<string, string>
  readonly rules?: ReadonlyArray<{ readonly requirement: string; readonly rules: string[] }>
  readonly constraints?: string[]
  readonly scenarios?: ReadonlyArray<{
    readonly requirement: string
    readonly name: string
    readonly given?: string[]
    readonly when?: string[]
    readonly then?: string[]
  }>
}

/**
 * Parses a `.specd-metadata.yaml` content string into a typed object.
 *
 * Returns an empty object on YAML syntax errors or validation failures.
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
