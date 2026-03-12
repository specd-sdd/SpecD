import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { type SelectorRaw, SelectorZodSchema } from './zod/selector-schema.js'
import { type HookEntry } from '../domain/value-objects/workflow-step.js'
import { SchemaValidationError } from '../domain/errors/schema-validation-error.js'

// ---------------------------------------------------------------------------
// Intermediate output types (Zod-inferred with | undefined on optional fields)
// ---------------------------------------------------------------------------

/** Zod-inferred intermediate shape for a parsed validation rule before domain conversion. */
export interface ValidationRuleRaw {
  id: string
  selector?: SelectorRaw | undefined
  path?: string | undefined
  required?: boolean | undefined
  contentMatches?: string | undefined
  children?: ValidationRuleRaw[] | undefined
  type?: string | undefined
  matches?: string | undefined
  contains?: string | undefined
  parent?: SelectorRaw | undefined
  index?: number | undefined
  where?: Record<string, string> | undefined
}

// ---------------------------------------------------------------------------
// Zod schemas for schema.yaml validation
// ---------------------------------------------------------------------------

const ValidationRuleZodSchema: z.ZodType<ValidationRuleRaw> = z.lazy(() =>
  z.object({
    id: z.string(),
    selector: SelectorZodSchema.optional(),
    path: z.string().optional(),
    required: z.boolean().optional(),
    contentMatches: z.string().optional(),
    children: z.array(ValidationRuleZodSchema).optional(),
    type: z.string().optional(),
    matches: z.string().optional(),
    contains: z.string().optional(),
    parent: SelectorZodSchema.optional(),
    index: z.number().optional(),
    where: z.record(z.string()).optional(),
  }),
)

const FieldMappingZodSchema = z.object({
  from: z.enum(['label', 'parentLabel', 'content']).optional(),
  childSelector: SelectorZodSchema.optional(),
  capture: z.string().optional(),
  strip: z.string().optional(),
  followSiblings: z.string().optional(),
})

const ExtractorZodSchema = z.object({
  selector: SelectorZodSchema,
  extract: z.enum(['content', 'label', 'both']).optional(),
  capture: z.string().optional(),
  strip: z.string().optional(),
  groupBy: z.literal('label').optional(),
  transform: z.string().optional(),
  fields: z.record(FieldMappingZodSchema).optional(),
})

/** Metadata extractor entry without id — used for single-entry fields (title, description, etc.). */
const MetadataExtractorEntryZodSchema = z.object({
  artifact: z.string(),
  extractor: ExtractorZodSchema,
})

/** Metadata extractor entry with required id — used for array-entry fields (rules, constraints, etc.). */
const MetadataExtractorArrayEntryZodSchema = z.object({
  id: z.string(),
  artifact: z.string(),
  extractor: ExtractorZodSchema,
})

const MetadataExtractionZodSchema = z.object({
  title: MetadataExtractorEntryZodSchema.optional(),
  description: MetadataExtractorEntryZodSchema.optional(),
  dependsOn: MetadataExtractorEntryZodSchema.optional(),
  keywords: MetadataExtractorEntryZodSchema.optional(),
  context: z.array(MetadataExtractorArrayEntryZodSchema).optional(),
  rules: z.array(MetadataExtractorArrayEntryZodSchema).optional(),
  constraints: z.array(MetadataExtractorArrayEntryZodSchema).optional(),
  scenarios: z.array(MetadataExtractorArrayEntryZodSchema).optional(),
})

const PreHashCleanupZodSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  replacement: z.string(),
})

const TaskCompletionCheckZodSchema = z.object({
  incompletePattern: z.string().optional(),
  completePattern: z.string().optional(),
})

const RuleEntryZodSchema = z.object({
  id: z.string(),
  text: z.string(),
})

const ArtifactRulesZodSchema = z.object({
  pre: z.array(RuleEntryZodSchema).optional(),
  post: z.array(RuleEntryZodSchema).optional(),
})

const HookEntryZodSchema = z.union([
  z
    .object({ id: z.string(), run: z.string() })
    .transform((h): HookEntry => ({ id: h.id, type: 'run', command: h.run })),
  z
    .object({ id: z.string(), instruction: z.string() })
    .transform((h): HookEntry => ({ id: h.id, type: 'instruction', text: h.instruction })),
])

const WorkflowStepZodSchema = z
  .object({
    step: z.string(),
    requires: z.array(z.string()).optional(),
    hooks: z
      .object({
        pre: z.array(HookEntryZodSchema).optional(),
        post: z.array(HookEntryZodSchema).optional(),
      })
      .optional(),
  })
  .transform(
    (ws): WorkflowStepRaw => ({
      step: ws.step,
      requires: ws.requires ?? [],
      hooks: {
        pre: ws.hooks?.pre ?? [],
        post: ws.hooks?.post ?? [],
      },
    }),
  )

const ArtifactZodSchema = z
  .object({
    id: z.string(),
    scope: z.enum(['spec', 'change']),
    output: z.string(),
    description: z.string().optional(),
    template: z.string().optional(),
    instruction: z.string().optional(),
    requires: z.array(z.string()).optional(),
    optional: z.boolean().optional(),
    format: z.enum(['markdown', 'json', 'yaml', 'plaintext']).optional(),
    delta: z.boolean().optional(),
    deltaInstruction: z.string().optional(),
    validations: z.array(ValidationRuleZodSchema).optional(),
    deltaValidations: z.array(ValidationRuleZodSchema).optional(),
    preHashCleanup: z.array(PreHashCleanupZodSchema).optional(),
    taskCompletionCheck: TaskCompletionCheckZodSchema.optional(),
    rules: ArtifactRulesZodSchema.optional(),
  })
  .refine((a) => !(a.deltaValidations !== undefined && a.delta !== true), {
    message: "'deltaValidations' is only valid when 'delta' is true",
    path: ['deltaValidations'],
  })
  .refine((a) => !(a.delta === true && a.scope === 'change'), {
    message: "'delta' is not valid when 'scope' is 'change'",
    path: ['delta'],
  })

const OperationsZodSchema = z
  .object({
    create: z.record(z.unknown()).optional(),
    remove: z.record(z.unknown()).optional(),
    set: z.record(z.unknown()).optional(),
    append: z.record(z.unknown()).optional(),
    prepend: z.record(z.unknown()).optional(),
  })
  .strict()

const SchemaYamlZodSchema = z
  .object({
    kind: z.enum(['schema', 'schema-plugin']),
    name: z.string(),
    version: z.number().int(),
    description: z.string().optional(),
    extends: z.string().optional(),
    artifacts: z.array(ArtifactZodSchema).optional(),
    metadataExtraction: MetadataExtractionZodSchema.optional(),
    workflow: z.array(WorkflowStepZodSchema).optional(),
    operations: OperationsZodSchema.optional(),
  })
  .refine(
    (s) => {
      if (s.kind === 'schema-plugin') {
        return (
          s.artifacts === undefined &&
          s.workflow === undefined &&
          s.metadataExtraction === undefined &&
          s.extends === undefined
        )
      }
      return true
    },
    {
      message:
        "'kind: schema-plugin' must not declare 'artifacts', 'workflow', 'metadataExtraction', or 'extends'",
    },
  )
  .refine(
    (s) => {
      if (s.kind === 'schema') {
        return s.artifacts !== undefined
      }
      return true
    },
    {
      message: "'artifacts' is required when 'kind' is 'schema'",
      path: ['artifacts'],
    },
  )

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Zod-inferred type representing a single artifact entry in `schema.yaml`. */
export type ArtifactYaml = z.infer<typeof ArtifactZodSchema>

/** Zod-inferred type for an artifact rule entry ({ id, text }). */
export type RuleEntryRaw = z.infer<typeof RuleEntryZodSchema>

/** Intermediate workflow step shape after Zod validation (already transformed). */
export interface WorkflowStepRaw {
  readonly step: string
  readonly requires: readonly string[]
  readonly hooks: {
    readonly pre: readonly HookEntry[]
    readonly post: readonly HookEntry[]
  }
}

/** Zod-inferred metadata extraction block. */
export type MetadataExtractionRaw = z.infer<typeof MetadataExtractionZodSchema>

/** Zod-inferred type for the operations block on schema-plugins. */
export type OperationsRaw = z.infer<typeof OperationsZodSchema>

/** Validated intermediate structure from a parsed `schema.yaml` file. */
export interface SchemaYamlData {
  readonly kind: 'schema' | 'schema-plugin'
  readonly name: string
  readonly version: number
  readonly description?: string | undefined
  readonly extends?: string | undefined
  readonly artifacts?: readonly ArtifactYaml[] | undefined
  readonly workflow?: readonly WorkflowStepRaw[] | undefined
  readonly metadataExtraction?: MetadataExtractionRaw | undefined
  readonly operations?: OperationsRaw | undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Formats a Zod error path for use in {@link SchemaValidationError} messages.
 *
 * @param issuePath - The raw Zod issue path
 * @returns A dot-bracket path string (e.g. `"artifacts[0].scope"`)
 */
export function formatZodPath(issuePath: ReadonlyArray<string | number>): string {
  return issuePath
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join('')
}

/**
 * Parses raw YAML content and validates it against the `SchemaYaml` Zod schema.
 *
 * Performs structural validation only — no semantic checks (duplicate IDs,
 * cycle detection, ID format) and no domain object construction.
 *
 * @param ref - The schema reference string, used in error messages
 * @param yamlContent - The raw YAML content to parse and validate
 * @returns The validated intermediate data structure
 * @throws {@link SchemaValidationError} When parsing or validation fails
 */
export function parseSchemaYaml(ref: string, yamlContent: string): SchemaYamlData {
  const raw: unknown = parseYaml(yamlContent)
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SchemaValidationError(ref, 'schema file must be a YAML mapping')
  }

  const parseResult = SchemaYamlZodSchema.safeParse(raw)
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]
    if (issue === undefined) {
      throw new SchemaValidationError(ref, 'schema validation failed')
    }
    const location = formatZodPath(issue.path)
    const message = location
      ? `${location}: ${issue.message.toLowerCase()}`
      : issue.message.toLowerCase()
    throw new SchemaValidationError(ref, message)
  }

  return parseResult.data
}
