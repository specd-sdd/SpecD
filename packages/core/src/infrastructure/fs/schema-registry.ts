import fs from 'node:fs/promises'
import path from 'node:path'
import { isEnoent } from './is-enoent.js'
import { createRequire } from 'node:module'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { type SchemaRegistry, type SchemaEntry } from '../../application/ports/schema-registry.js'
import { Schema } from '../../domain/value-objects/schema.js'
import {
  ArtifactType,
  type ArtifactScope,
  type ArtifactFormat,
} from '../../domain/value-objects/artifact-type.js'
import { type WorkflowStep, type HookEntry } from '../../domain/value-objects/workflow-step.js'
import {
  type ValidationRule,
  type PreHashCleanup,
  type TaskCompletionCheck,
} from '../../domain/value-objects/validation-rule.js'
import { type Selector } from '../../domain/value-objects/selector.js'
import { type Extractor, type FieldMapping } from '../../domain/value-objects/extractor.js'
import { type SelectorRaw, SelectorZodSchema, buildSelector } from '../zod/selector-schema.js'
import {
  type MetadataExtraction,
  type MetadataExtractorEntry,
} from '../../domain/value-objects/metadata-extraction.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'

/** Construction configuration for {@link FsSchemaRegistry}. */
export interface FsSchemaRegistryConfig {
  /**
   * Ordered list of `node_modules` directories to search when resolving
   * `@scope/name` schema references. Searched in order; first hit wins.
   *
   * Typically includes the project's own `node_modules` as the first entry,
   * followed by the CLI/tool installation's `node_modules` as a fallback so
   * that globally-installed schema packages are found even when the project
   * has no local copy.
   */
  readonly nodeModulesPaths: readonly string[]

  /**
   * The project root directory (i.e. the directory containing `specd.yaml`).
   * Relative schema paths (`./foo`, `../bar`) are resolved against this.
   */
  readonly configDir: string
}

// ---------------------------------------------------------------------------
// Intermediate output types (Zod-inferred with | undefined on optional fields)
// Used only inside this module; domain types are built from these shapes.
// ---------------------------------------------------------------------------

/** Zod-inferred intermediate shape for a parsed validation rule before domain conversion. */
interface ValidationRuleRaw {
  selector?: SelectorRaw | undefined
  path?: string | undefined
  required?: boolean | undefined
  contentMatches?: string | undefined
  children?: ValidationRuleRaw[] | undefined
  // Flat selector fields — inlined `type`, `matches`, etc. at the rule level
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
    selector: SelectorZodSchema.optional(),
    path: z.string().optional(),
    required: z.boolean().optional(),
    contentMatches: z.string().optional(),
    children: z.array(ValidationRuleZodSchema).optional(),
    // Flat selector fields — allows writing `type: section` directly on the rule
    // instead of wrapping in `selector: { type: section }`.
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

const MetadataExtractorEntryZodSchema = z.object({
  artifact: z.string(),
  extractor: ExtractorZodSchema,
})

const MetadataExtractionZodSchema = z.object({
  title: MetadataExtractorEntryZodSchema.optional(),
  description: MetadataExtractorEntryZodSchema.optional(),
  dependsOn: MetadataExtractorEntryZodSchema.optional(),
  keywords: MetadataExtractorEntryZodSchema.optional(),
  context: z.array(MetadataExtractorEntryZodSchema).optional(),
  rules: z.array(MetadataExtractorEntryZodSchema).optional(),
  constraints: z.array(MetadataExtractorEntryZodSchema).optional(),
  scenarios: z.array(MetadataExtractorEntryZodSchema).optional(),
})

const PreHashCleanupZodSchema = z.object({
  pattern: z.string(),
  replacement: z.string(),
})

const TaskCompletionCheckZodSchema = z.object({
  incompletePattern: z.string().optional(),
  completePattern: z.string().optional(),
})

const HookEntryZodSchema = z.union([
  z.object({ run: z.string() }).transform((h): HookEntry => ({ type: 'run', command: h.run })),
  z
    .object({ instruction: z.string() })
    .transform((h): HookEntry => ({ type: 'instruction', text: h.instruction })),
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
    (ws): WorkflowStep => ({
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
  })
  .refine((a) => !(a.deltaValidations !== undefined && a.delta !== true), {
    message: "'deltaValidations' is only valid when 'delta' is true",
    path: ['deltaValidations'],
  })
  .refine((a) => !(a.delta === true && a.scope === 'change'), {
    message: "'delta' is not valid when 'scope' is 'change'",
    path: ['delta'],
  })

const SchemaYamlZodSchema = z.object({
  name: z.string(),
  version: z.number().int(),
  description: z.string().optional(),
  artifacts: z.array(ArtifactZodSchema),
  metadataExtraction: MetadataExtractionZodSchema.optional(),
  workflow: z.array(WorkflowStepZodSchema).optional(),
})

/** Zod-inferred type representing a single artifact entry in `schema.yaml`. */
type ArtifactYaml = z.infer<typeof ArtifactZodSchema>

// ---------------------------------------------------------------------------
// Domain type builders (strip | undefined to satisfy exactOptionalPropertyTypes)
// ---------------------------------------------------------------------------

/**
 * Converts an intermediate `ValidationRuleRaw` to the domain
 * {@link ValidationRule} type.
 *
 * @param raw - The Zod-validated validation rule shape
 * @returns A domain-compatible `ValidationRule`
 */
function buildValidationRule(raw: ValidationRuleRaw): ValidationRule {
  // Build selector from either explicit `selector` or flat fields (`type`, `matches`, etc.)
  let selector: Selector | undefined
  if (raw.selector !== undefined) {
    selector = buildSelector(raw.selector)
  } else if (raw.type !== undefined) {
    selector = buildSelector({
      type: raw.type,
      ...(raw.matches !== undefined ? { matches: raw.matches } : {}),
      ...(raw.contains !== undefined ? { contains: raw.contains } : {}),
      ...(raw.parent !== undefined ? { parent: raw.parent } : {}),
      ...(raw.index !== undefined ? { index: raw.index } : {}),
      ...(raw.where !== undefined ? { where: raw.where } : {}),
    })
  }

  return {
    ...(selector !== undefined ? { selector } : {}),
    ...(raw.path !== undefined ? { path: raw.path } : {}),
    ...(raw.required !== undefined ? { required: raw.required } : {}),
    ...(raw.contentMatches !== undefined ? { contentMatches: raw.contentMatches } : {}),
    ...(raw.children !== undefined ? { children: raw.children.map(buildValidationRule) } : {}),
  }
}

/**
 * Converts a Zod-validated field mapping to the domain {@link FieldMapping} type.
 *
 * @param raw - The Zod-validated field mapping object
 * @returns The domain FieldMapping value object
 */
function buildFieldMapping(raw: z.infer<typeof FieldMappingZodSchema>): FieldMapping {
  return {
    ...(raw.from !== undefined ? { from: raw.from } : {}),
    ...(raw.childSelector !== undefined ? { childSelector: buildSelector(raw.childSelector) } : {}),
    ...(raw.capture !== undefined ? { capture: raw.capture } : {}),
    ...(raw.strip !== undefined ? { strip: raw.strip } : {}),
    ...(raw.followSiblings !== undefined ? { followSiblings: raw.followSiblings } : {}),
  }
}

/**
 * Converts a Zod-validated extractor to the domain {@link Extractor} type.
 *
 * @param raw - The Zod-validated extractor object
 * @returns The domain Extractor value object
 */
function buildExtractor(raw: z.infer<typeof ExtractorZodSchema>): Extractor {
  return {
    selector: buildSelector(raw.selector),
    ...(raw.extract !== undefined ? { extract: raw.extract } : {}),
    ...(raw.capture !== undefined ? { capture: raw.capture } : {}),
    ...(raw.strip !== undefined ? { strip: raw.strip } : {}),
    ...(raw.groupBy !== undefined ? { groupBy: raw.groupBy } : {}),
    ...(raw.transform !== undefined ? { transform: raw.transform } : {}),
    ...(raw.fields !== undefined
      ? {
          fields: Object.fromEntries(
            Object.entries(raw.fields).map(([k, v]) => [k, buildFieldMapping(v)]),
          ),
        }
      : {}),
  }
}

/**
 * Converts a Zod-validated metadata extractor entry to the domain type.
 *
 * @param raw - The Zod-validated metadata extractor entry
 * @returns The domain MetadataExtractorEntry value object
 */
function buildMetadataExtractorEntry(
  raw: z.infer<typeof MetadataExtractorEntryZodSchema>,
): MetadataExtractorEntry {
  return {
    artifact: raw.artifact,
    extractor: buildExtractor(raw.extractor),
  }
}

/**
 * Converts a Zod-validated metadata extraction block to the domain type.
 *
 * @param raw - The Zod-validated metadata extraction block
 * @returns The domain MetadataExtraction value object
 */
function buildMetadataExtraction(
  raw: z.infer<typeof MetadataExtractionZodSchema>,
): MetadataExtraction {
  return {
    ...(raw.title !== undefined ? { title: buildMetadataExtractorEntry(raw.title) } : {}),
    ...(raw.description !== undefined
      ? { description: buildMetadataExtractorEntry(raw.description) }
      : {}),
    ...(raw.dependsOn !== undefined
      ? { dependsOn: buildMetadataExtractorEntry(raw.dependsOn) }
      : {}),
    ...(raw.keywords !== undefined ? { keywords: buildMetadataExtractorEntry(raw.keywords) } : {}),
    ...(raw.context !== undefined ? { context: raw.context.map(buildMetadataExtractorEntry) } : {}),
    ...(raw.rules !== undefined ? { rules: raw.rules.map(buildMetadataExtractorEntry) } : {}),
    ...(raw.constraints !== undefined
      ? { constraints: raw.constraints.map(buildMetadataExtractorEntry) }
      : {}),
    ...(raw.scenarios !== undefined
      ? { scenarios: raw.scenarios.map(buildMetadataExtractorEntry) }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when artifact `id` has a circular dependency in `requires`.
 *
 * @param id - The artifact ID to check
 * @param requires - Map from artifact ID to its direct dependencies
 * @param visited - Set of fully-explored nodes
 * @param stack - Current DFS recursion stack
 * @returns `true` when a cycle is reachable from `id`
 */
function detectCycle(
  id: string,
  requires: ReadonlyMap<string, readonly string[]>,
  visited: Set<string>,
  stack: Set<string>,
): boolean {
  if (stack.has(id)) return true
  if (visited.has(id)) return false
  visited.add(id)
  stack.add(id)
  for (const dep of requires.get(id) ?? []) {
    if (detectCycle(dep, requires, visited, stack)) return true
  }
  stack.delete(id)
  return false
}

/**
 * Formats a Zod error path for use in {@link SchemaValidationError} messages.
 *
 * @param issuePath - The raw Zod issue path
 * @returns A dot-bracket path string (e.g. `"artifacts[0].scope"`)
 */
function formatZodPath(issuePath: ReadonlyArray<string | number>): string {
  return issuePath
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join('')
}

// ---------------------------------------------------------------------------
// FsSchemaRegistry
// ---------------------------------------------------------------------------

/**
 * Filesystem implementation of the {@link SchemaRegistry} port.
 *
 * Resolves schema references from workspace directories and npm packages,
 * validates `schema.yaml` files against a Zod schema at the filesystem
 * boundary, loads template content at resolve time, and returns fully-
 * constructed {@link Schema} instances.
 */
export class FsSchemaRegistry implements SchemaRegistry {
  private readonly _nodeModulesPaths: readonly string[]
  private readonly _configDir: string

  /**
   * Creates a new `FsSchemaRegistry`.
   *
   * @param config - Registry configuration including the `node_modules` paths
   */
  constructor(config: FsSchemaRegistryConfig) {
    this._nodeModulesPaths = config.nodeModulesPaths
    this._configDir = config.configDir
  }

  /**
   * Resolves a schema reference and returns the fully-parsed {@link Schema}.
   *
   * @param ref - The schema reference as declared in `specd.yaml`
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns The resolved schema, or `null` if the file was not found
   */
  async resolve(
    ref: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ): Promise<Schema | null> {
    // Resolve to an absolute path + content. For @-prefixed npm refs we search
    // nodeModulesPaths in order, then fall back to module resolution (covers
    // globally-installed schemas co-installed alongside the CLI). Non-@ refs
    // use a single derived path and return null on ENOENT.
    let resolvedPath: string | null = null
    let content: string | null = null

    if (ref.startsWith('@')) {
      for (const nmPath of this._nodeModulesPaths) {
        const candidate = path.join(nmPath, ref, 'schema.yaml')
        const result = await this._tryReadFile(candidate)
        if (result !== null) {
          resolvedPath = candidate
          content = result
          break
        }
      }
      if (content === null) {
        const fallbackPath = this._tryModuleResolve(ref)
        if (fallbackPath !== null) {
          const result = await this._tryReadFile(fallbackPath)
          if (result !== null) {
            resolvedPath = fallbackPath
            content = result
          }
        }
      }
      if (content === null || resolvedPath === null) return null
    } else {
      resolvedPath = this._resolveFilePath(ref, workspaceSchemasPaths)
      try {
        content = await fs.readFile(resolvedPath, 'utf-8')
      } catch (err) {
        if (isEnoent(err)) return null
        throw err
      }
    }

    const raw: unknown = parseYaml(content)
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

    return this._buildSchema(ref, parseResult.data, path.dirname(resolvedPath))
  }

  /**
   * Lists all discoverable schemas from workspace paths and npm packages.
   *
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns All discoverable schema entries, workspace first then npm
   */
  async list(workspaceSchemasPaths: ReadonlyMap<string, string>): Promise<SchemaEntry[]> {
    const entries: SchemaEntry[] = []

    for (const [workspace, schemasPath] of workspaceSchemasPaths) {
      let subdirs: string[]
      try {
        const items = await fs.readdir(schemasPath, { withFileTypes: true })
        subdirs = items.filter((d) => d.isDirectory()).map((d) => d.name)
      } catch {
        continue
      }
      for (const name of subdirs) {
        const schemaFile = path.join(schemasPath, name, 'schema.yaml')
        try {
          await fs.access(schemaFile)
        } catch {
          continue
        }
        entries.push({
          ref: workspace === 'default' ? `#${name}` : `#${workspace}:${name}`,
          name,
          source: 'workspace',
          workspace,
        })
      }
    }

    const seen = new Set<string>()
    for (const nmPath of this._nodeModulesPaths) {
      const specdScopeDir = path.join(nmPath, '@specd')
      try {
        const items = await fs.readdir(specdScopeDir, { withFileTypes: true })
        for (const item of items) {
          if (!item.isDirectory()) continue
          if (!item.name.startsWith('schema-')) continue
          const ref = `@specd/${item.name}`
          if (seen.has(ref)) continue
          const schemaFile = path.join(specdScopeDir, item.name, 'schema.yaml')
          try {
            await fs.access(schemaFile)
          } catch {
            continue
          }
          seen.add(ref)
          entries.push({ ref, name: item.name, source: 'npm' })
        }
      } catch {
        // path not found — try next
      }
    }

    return entries
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads a file and returns its content, or `null` on `ENOENT`.
   *
   * @param filePath - Absolute path to read
   * @returns File content string, or `null` if the file does not exist
   */
  private async _tryReadFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }
  }

  /**
   * Attempts to resolve `ref/schema.yaml` via Node.js module resolution,
   * using the location of this file as the starting point. This lets globally-
   * installed schema packages (co-installed alongside the CLI) be found even
   * when the user's project has no local `node_modules`.
   *
   * @param ref - An npm-scoped schema reference (e.g. `'@specd/schema-std'`)
   * @returns Absolute path to `schema.yaml`, or `null` if resolution fails
   */
  private _tryModuleResolve(ref: string): string | null {
    try {
      const require = createRequire(import.meta.url)
      return require.resolve(`${ref}/schema.yaml`)
    } catch {
      return null
    }
  }

  /**
   * Resolves a schema `ref` string to an absolute path to the `schema.yaml` file.
   *
   * @param ref - The schema reference string
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns Absolute path to the schema YAML file
   * @throws {SchemaValidationError} When a `#workspace:name` ref references an unknown workspace
   */
  private _resolveFilePath(
    ref: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ): string {
    if (ref.startsWith('#')) {
      const inner = ref.slice(1)
      const { workspace, capPath: name } = parseSpecId(inner)
      const schemasPath = workspaceSchemasPaths.get(workspace)
      if (schemasPath === undefined) {
        throw new SchemaValidationError(ref, `workspace '${workspace}' not found in schema paths`)
      }
      return path.join(schemasPath, name, 'schema.yaml')
    }

    if (path.isAbsolute(ref)) {
      return ref
    }

    if (ref.startsWith('./') || ref.startsWith('../')) {
      return path.resolve(this._configDir, ref)
    }

    const schemasPath = workspaceSchemasPaths.get('default') ?? ''
    return path.join(schemasPath, ref, 'schema.yaml')
  }

  /**
   * Constructs a fully-typed {@link Schema} from the Zod-validated document.
   *
   * @param ref - The schema reference for error messages
   * @param data - The Zod-validated schema YAML document
   * @param schemaDir - The directory containing the schema file
   * @returns A fully-constructed `Schema` instance
   * @throws {@link SchemaValidationError} When semantic validation fails
   */
  private async _buildSchema(
    ref: string,
    data: z.infer<typeof SchemaYamlZodSchema>,
    schemaDir: string,
  ): Promise<Schema> {
    const artifacts = await this._buildArtifacts(ref, data.artifacts, schemaDir)
    const workflow = data.workflow ?? []

    // Semantic validation: duplicate step names are not caught by Zod
    const stepSet = new Set<string>()
    for (const step of workflow) {
      if (stepSet.has(step.step)) {
        throw new SchemaValidationError(ref, `duplicate workflow step '${step.step}'`)
      }
      stepSet.add(step.step)
    }

    this._validateArtifactGraph(ref, artifacts)

    const metadataExtraction =
      data.metadataExtraction !== undefined
        ? buildMetadataExtraction(data.metadataExtraction)
        : undefined

    return new Schema(data.name, data.version, artifacts, workflow, metadataExtraction)
  }

  /**
   * Validates artifact IDs and loads template content for any artifact that
   * declares a `template` path.
   *
   * @param ref - The schema reference for error messages
   * @param rawList - The Zod-validated artifact entries
   * @param schemaDir - The directory containing the schema file
   * @returns An array of fully-constructed `ArtifactType` instances
   * @throws {@link SchemaValidationError} When an artifact ID is invalid or a template file is missing
   */
  private async _buildArtifacts(
    ref: string,
    rawList: ArtifactYaml[],
    schemaDir: string,
  ): Promise<ArtifactType[]> {
    const idSet = new Set<string>()
    const idPattern = /^[a-z][a-z0-9-]*$/
    const artifacts: ArtifactType[] = []

    for (const [i, r] of rawList.entries()) {
      const ctx = `artifacts[${i}]`

      if (!idPattern.test(r.id)) {
        throw new SchemaValidationError(ref, `${ctx}: id '${r.id}' must match /^[a-z][a-z0-9-]*$/`)
      }
      if (idSet.has(r.id)) {
        throw new SchemaValidationError(ref, `duplicate artifact id '${r.id}'`)
      }
      idSet.add(r.id)

      let templateContent: string | undefined
      if (r.template !== undefined) {
        const templatePath = path.join(schemaDir, r.template)
        try {
          templateContent = await fs.readFile(templatePath, 'utf-8')
        } catch (err) {
          if (isEnoent(err)) {
            throw new SchemaValidationError(ref, `${ctx}: template file '${r.template}' not found`)
          }
          throw err
        }
      }

      const validations: ValidationRule[] = (r.validations ?? []).map(buildValidationRule)
      const deltaValidations: ValidationRule[] = (r.deltaValidations ?? []).map(buildValidationRule)

      const preHashCleanup: PreHashCleanup[] = (r.preHashCleanup ?? []).map((p) => ({
        pattern: p.pattern,
        replacement: p.replacement,
      }))

      let taskCompletionCheck: TaskCompletionCheck | undefined
      if (r.taskCompletionCheck !== undefined) {
        taskCompletionCheck = {
          ...(r.taskCompletionCheck.incompletePattern !== undefined
            ? { incompletePattern: r.taskCompletionCheck.incompletePattern }
            : {}),
          ...(r.taskCompletionCheck.completePattern !== undefined
            ? { completePattern: r.taskCompletionCheck.completePattern }
            : {}),
        }
      }

      artifacts.push(
        new ArtifactType({
          id: r.id,
          scope: r.scope as ArtifactScope,
          output: r.output,
          ...(r.description !== undefined ? { description: r.description } : {}),
          ...(templateContent !== undefined ? { template: templateContent } : {}),
          ...(r.instruction !== undefined ? { instruction: r.instruction } : {}),
          requires: r.requires ?? [],
          optional: r.optional ?? false,
          ...(r.format !== undefined ? { format: r.format as ArtifactFormat } : {}),
          delta: r.delta ?? false,
          ...(r.deltaInstruction !== undefined ? { deltaInstruction: r.deltaInstruction } : {}),
          validations,
          deltaValidations,
          preHashCleanup,
          ...(taskCompletionCheck !== undefined ? { taskCompletionCheck } : {}),
        }),
      )
    }

    return artifacts
  }

  /**
   * Validates the artifact dependency graph.
   *
   * @param ref - The schema reference for error messages
   * @param artifacts - The fully-constructed artifact list to validate
   * @throws {@link SchemaValidationError} When the graph contains violations
   */
  private _validateArtifactGraph(ref: string, artifacts: ArtifactType[]): void {
    const allIds = new Set(artifacts.map((a) => a.id))
    const optionalIds = new Set(artifacts.filter((a) => a.optional).map((a) => a.id))
    const requiresMap = new Map(artifacts.map((a) => [a.id, a.requires] as const))

    for (const artifact of artifacts) {
      for (const dep of artifact.requires) {
        if (!allIds.has(dep)) {
          throw new SchemaValidationError(
            ref,
            `artifact '${artifact.id}' requires unknown artifact '${dep}'`,
          )
        }
        if (optionalIds.has(dep) && !artifact.optional) {
          throw new SchemaValidationError(
            ref,
            `non-optional artifact '${artifact.id}' requires optional artifact '${dep}'`,
          )
        }
      }
    }

    const visited = new Set<string>()
    const stack = new Set<string>()
    for (const id of allIds) {
      if (detectCycle(id, requiresMap, visited, stack)) {
        throw new SchemaValidationError(
          ref,
          `circular dependency detected in artifact requires graph`,
        )
      }
    }
  }
}
