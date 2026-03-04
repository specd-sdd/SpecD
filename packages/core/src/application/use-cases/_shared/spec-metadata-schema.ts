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
