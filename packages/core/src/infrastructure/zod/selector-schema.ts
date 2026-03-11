import { z } from 'zod'
import { type Selector } from '../../domain/value-objects/selector.js'

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
 * Recursive (selectors can nest via `parent`). Used by both schema-registry
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

/**
 * Converts an intermediate {@link SelectorRaw} to the domain {@link Selector} type,
 * stripping any `undefined` optional values.
 *
 * @param raw - The Zod-validated selector shape
 * @returns A domain-compatible Selector
 */
export function buildSelector(raw: SelectorRaw): Selector {
  return {
    type: raw.type,
    ...(raw.matches !== undefined ? { matches: raw.matches } : {}),
    ...(raw.contains !== undefined ? { contains: raw.contains } : {}),
    ...(raw.parent !== undefined ? { parent: buildSelector(raw.parent) } : {}),
    ...(raw.index !== undefined ? { index: raw.index } : {}),
    ...(raw.where !== undefined ? { where: raw.where } : {}),
    ...(raw.level !== undefined ? { level: raw.level } : {}),
  }
}
