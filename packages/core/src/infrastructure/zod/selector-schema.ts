import { z } from 'zod'

/**
 * Zod-inferred intermediate shape for a parsed selector before domain conversion.
 * Mirrors {@link Selector} but with `| undefined` for optional fields (Zod output).
 */
export interface SelectorRaw {
  type: string
  matches?: string | undefined
  contains?: string | undefined
  parent?: SelectorRaw | undefined
  index?: number | undefined
  where?: Record<string, string> | undefined
  level?: number | undefined
}

/**
 * Zod schema for validating a {@link Selector} in YAML/JSON input.
 *
 * Recursive (selectors can nest via `parent`). Used by both schema-yaml-parser
 * (schema.yaml validation) and artifact parsers (delta entry validation).
 */
export const SelectorZodSchema: z.ZodType<SelectorRaw> = z.lazy(() =>
  z.object({
    type: z.string(),
    matches: z.string().optional(),
    contains: z.string().optional(),
    parent: SelectorZodSchema.optional(),
    index: z.number().optional(),
    where: z.record(z.string()).optional(),
    level: z.number().int().optional(),
  }),
)
