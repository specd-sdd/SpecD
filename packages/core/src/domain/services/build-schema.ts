import { Schema } from '../value-objects/schema.js'
import { VALID_TRANSITIONS } from '../value-objects/change-state.js'
import {
  ArtifactType,
  type ArtifactScope,
  type ArtifactFormat,
  type ArtifactRules,
} from '../value-objects/artifact-type.js'
import { type WorkflowStep } from '../value-objects/workflow-step.js'
import {
  type ValidationRule,
  type PreHashCleanup,
  type TaskCompletionCheck,
} from '../value-objects/validation-rule.js'
import { type Selector } from '../value-objects/selector.js'
import { type Extractor, type FieldMapping } from '../value-objects/extractor.js'
import {
  type MetadataExtraction,
  type MetadataExtractorEntry,
} from '../value-objects/metadata-extraction.js'
import { SchemaValidationError } from '../errors/schema-validation-error.js'

// ---------------------------------------------------------------------------
// Raw input types (plain interfaces, no Zod dependency)
// ---------------------------------------------------------------------------

/** Raw selector shape with `| undefined` on optional fields. */
export interface SelectorRaw {
  type: string
  matches?: string | undefined
  contains?: string | undefined
  parent?: SelectorRaw | undefined
  index?: number | undefined
  where?: Record<string, string> | undefined
  level?: number | undefined
}

/** Raw validation rule shape with `| undefined` on optional fields. */
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

/** Raw field mapping shape. */
export interface FieldMappingRaw {
  from?: 'label' | 'parentLabel' | 'content' | undefined
  childSelector?: SelectorRaw | undefined
  capture?: string | undefined
  strip?: string | undefined
  followSiblings?: string | undefined
}

/** Raw extractor shape. */
export interface ExtractorRaw {
  selector: SelectorRaw
  extract?: 'content' | 'label' | 'both' | undefined
  capture?: string | undefined
  strip?: string | undefined
  groupBy?: 'label' | undefined
  transform?: string | undefined
  fields?: Record<string, FieldMappingRaw> | undefined
}

/** Raw metadata extractor entry shape. Array entries require `id`; scalar entries do not. */
export interface MetadataExtractorEntryRaw {
  id?: string | undefined
  artifact: string
  extractor: ExtractorRaw
}

/** Raw metadata extraction block shape. */
export interface MetadataExtractionRaw {
  title?: MetadataExtractorEntryRaw | undefined
  description?: MetadataExtractorEntryRaw | undefined
  dependsOn?: MetadataExtractorEntryRaw | undefined
  keywords?: MetadataExtractorEntryRaw | undefined
  context?: MetadataExtractorEntryRaw[] | undefined
  rules?: MetadataExtractorEntryRaw[] | undefined
  constraints?: MetadataExtractorEntryRaw[] | undefined
  scenarios?: MetadataExtractorEntryRaw[] | undefined
}

/** Raw pre-hash cleanup entry shape. */
export interface PreHashCleanupRaw {
  id: string
  pattern: string
  replacement: string
}

/** Raw task completion check shape. */
export interface TaskCompletionCheckRaw {
  incompletePattern?: string | undefined
  completePattern?: string | undefined
}

/** Raw rule entry shape ({ id, text }) for artifact rules.pre / rules.post. */
export interface RuleEntryRaw {
  id: string
  text: string
}

/** Raw artifact rules block shape. */
export interface ArtifactRulesRaw {
  pre?: readonly RuleEntryRaw[] | undefined
  post?: readonly RuleEntryRaw[] | undefined
}

/** Raw artifact entry shape from validated YAML. */
export interface ArtifactYamlData {
  id: string
  scope: 'spec' | 'change'
  output: string
  description?: string | undefined
  template?: string | undefined
  instruction?: string | undefined
  requires?: readonly string[] | undefined
  optional?: boolean | undefined
  format?: 'markdown' | 'json' | 'yaml' | 'plaintext' | undefined
  delta?: boolean | undefined
  deltaInstruction?: string | undefined
  validations?: readonly ValidationRuleRaw[] | undefined
  deltaValidations?: readonly ValidationRuleRaw[] | undefined
  preHashCleanup?: readonly PreHashCleanupRaw[] | undefined
  taskCompletionCheck?: TaskCompletionCheckRaw | undefined
  rules?: ArtifactRulesRaw | undefined
}

/** Raw schema operations block for schema-plugins. Permissive shape validated at merge time. */
export interface SchemaOperationsRaw {
  readonly create?: Record<string, unknown> | undefined
  readonly remove?: Record<string, unknown> | undefined
  readonly set?: Record<string, unknown> | undefined
  readonly append?: Record<string, unknown> | undefined
  readonly prepend?: Record<string, unknown> | undefined
}

/** Validated intermediate structure from a parsed `schema.yaml` file. */
export interface SchemaYamlData {
  readonly kind: 'schema' | 'schema-plugin'
  readonly name: string
  readonly version: number
  readonly description?: string | undefined
  readonly extends?: string | undefined
  readonly artifacts?: readonly ArtifactYamlData[] | undefined
  readonly workflow?: readonly WorkflowStep[] | undefined
  readonly metadataExtraction?: MetadataExtractionRaw | undefined
  readonly operations?: SchemaOperationsRaw | undefined
}

// ---------------------------------------------------------------------------
// Domain type builders
// ---------------------------------------------------------------------------

/**
 * Converts a raw selector to a domain {@link Selector}, stripping `undefined` values.
 * Recursively converts the `parent` field when present.
 *
 * @param raw - The raw selector shape
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

/**
 * Converts a raw validation rule to the domain {@link ValidationRule} type.
 *
 * @param raw - The raw validation rule shape
 * @returns A domain-compatible ValidationRule
 */
function buildValidationRule(raw: ValidationRuleRaw): ValidationRule {
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
    ...(raw.id !== undefined ? { id: raw.id } : {}),
    ...(selector !== undefined ? { selector } : {}),
    ...(raw.path !== undefined ? { path: raw.path } : {}),
    ...(raw.required !== undefined ? { required: raw.required } : {}),
    ...(raw.contentMatches !== undefined ? { contentMatches: raw.contentMatches } : {}),
    ...(raw.children !== undefined ? { children: raw.children.map(buildValidationRule) } : {}),
  }
}

/**
 * Converts a raw field mapping to the domain {@link FieldMapping} type.
 *
 * @param raw - The raw field mapping
 * @returns The domain FieldMapping value object
 */
function buildFieldMapping(raw: FieldMappingRaw): FieldMapping {
  return {
    ...(raw.from !== undefined ? { from: raw.from } : {}),
    ...(raw.childSelector !== undefined ? { childSelector: buildSelector(raw.childSelector) } : {}),
    ...(raw.capture !== undefined ? { capture: raw.capture } : {}),
    ...(raw.strip !== undefined ? { strip: raw.strip } : {}),
    ...(raw.followSiblings !== undefined ? { followSiblings: raw.followSiblings } : {}),
  }
}

/**
 * Converts a raw extractor to the domain {@link Extractor} type.
 *
 * @param raw - The raw extractor
 * @returns The domain Extractor value object
 */
function buildExtractor(raw: ExtractorRaw): Extractor {
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
 * Converts a raw metadata extractor entry to the domain type.
 *
 * @param raw - The raw metadata extractor entry
 * @returns The domain MetadataExtractorEntry value object
 */
function buildMetadataExtractorEntry(raw: MetadataExtractorEntryRaw): MetadataExtractorEntry {
  return {
    ...(raw.id !== undefined ? { id: raw.id } : {}),
    artifact: raw.artifact,
    extractor: buildExtractor(raw.extractor),
  }
}

/**
 * Converts a raw metadata extraction block to the domain type.
 *
 * @param raw - The raw metadata extraction block
 * @returns The domain MetadataExtraction value object
 */
function buildMetadataExtraction(raw: MetadataExtractionRaw): MetadataExtraction {
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

/**
 * Converts a raw artifact entry and optional template content into an `ArtifactType`.
 *
 * @param raw - The raw artifact entry
 * @param templateContent - Pre-loaded template content, or `undefined`
 * @returns A fully-constructed ArtifactType instance
 */
function buildArtifactType(
  raw: ArtifactYamlData,
  templateContent: string | undefined,
): ArtifactType {
  const validations: ValidationRule[] = (raw.validations ?? []).map(buildValidationRule)
  const deltaValidations: ValidationRule[] = (raw.deltaValidations ?? []).map(buildValidationRule)

  const preHashCleanup: PreHashCleanup[] = (raw.preHashCleanup ?? []).map((p) => ({
    ...(p.id !== undefined ? { id: p.id } : {}),
    pattern: p.pattern,
    replacement: p.replacement,
  }))

  let taskCompletionCheck: TaskCompletionCheck | undefined
  if (raw.taskCompletionCheck !== undefined) {
    taskCompletionCheck = {
      ...(raw.taskCompletionCheck.incompletePattern !== undefined
        ? { incompletePattern: raw.taskCompletionCheck.incompletePattern }
        : {}),
      ...(raw.taskCompletionCheck.completePattern !== undefined
        ? { completePattern: raw.taskCompletionCheck.completePattern }
        : {}),
    }
  }

  return new ArtifactType({
    id: raw.id,
    scope: raw.scope as ArtifactScope,
    output: raw.output,
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    ...(templateContent !== undefined ? { template: templateContent } : {}),
    ...(raw.instruction !== undefined ? { instruction: raw.instruction } : {}),
    requires: raw.requires ?? [],
    optional: raw.optional ?? false,
    ...(raw.format !== undefined ? { format: raw.format as ArtifactFormat } : {}),
    delta: raw.delta ?? false,
    ...(raw.deltaInstruction !== undefined ? { deltaInstruction: raw.deltaInstruction } : {}),
    validations,
    deltaValidations,
    preHashCleanup,
    ...(taskCompletionCheck !== undefined ? { taskCompletionCheck } : {}),
    ...(raw.rules !== undefined
      ? {
          rules: {
            pre: raw.rules.pre ?? [],
            post: raw.rules.post ?? [],
          } satisfies ArtifactRules,
        }
      : {}),
  })
}

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
 * Validates the artifact dependency graph.
 *
 * @param ref - The schema reference for error messages
 * @param artifacts - The fully-constructed artifact list to validate
 * @throws {@link SchemaValidationError} When the graph contains violations
 */
function validateArtifactGraph(ref: string, artifacts: readonly ArtifactType[]): void {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Constructs a fully-typed {@link Schema} from validated intermediate data
 * and pre-loaded template contents.
 *
 * Pure function — performs no I/O. All semantic validation (duplicate IDs,
 * dependency graph, ID format) happens here.
 *
 * @param ref - The schema reference for error messages
 * @param data - The validated intermediate data from YAML parsing
 * @param templates - Map from template relative path to file content
 * @returns A fully-constructed Schema instance
 * @throws {@link SchemaValidationError} When semantic validation fails
 */
export function buildSchema(
  ref: string,
  data: SchemaYamlData,
  templates: ReadonlyMap<string, string>,
): Schema {
  const idSet = new Set<string>()
  const idPattern = /^[a-z][a-z0-9-]*$/
  const artifacts: ArtifactType[] = []
  const rawArtifacts = data.artifacts ?? []

  for (const [i, raw] of rawArtifacts.entries()) {
    const ctx = `artifacts[${i}]`

    if (!idPattern.test(raw.id)) {
      throw new SchemaValidationError(ref, `${ctx}: id '${raw.id}' must match /^[a-z][a-z0-9-]*$/`)
    }
    if (idSet.has(raw.id)) {
      throw new SchemaValidationError(ref, `duplicate artifact id '${raw.id}'`)
    }
    idSet.add(raw.id)

    let templateContent: string | undefined
    if (raw.template !== undefined) {
      const content = templates.get(raw.template)
      if (content === undefined) {
        throw new SchemaValidationError(ref, `${ctx}: template file '${raw.template}' not found`)
      }
      templateContent = content
    }

    artifacts.push(buildArtifactType(raw, templateContent))
  }

  const workflow = (data.workflow ?? []) as WorkflowStep[]

  // Semantic validation: duplicate step names
  const stepSet = new Set<string>()
  for (const step of workflow) {
    if (stepSet.has(step.step)) {
      throw new SchemaValidationError(ref, `duplicate workflow step '${step.step}'`)
    }
    stepSet.add(step.step)
  }

  // Semantic validation: step names must be valid ChangeState values
  const validStates = new Set(Object.keys(VALID_TRANSITIONS))
  for (const step of workflow) {
    if (!validStates.has(step.step)) {
      throw new SchemaValidationError(
        ref,
        `workflow step '${step.step}' is not a valid lifecycle state`,
      )
    }
  }

  // Semantic validation: hook IDs must be globally unique across all workflow steps
  const hookIdToSteps = new Map<string, string[]>()
  for (const step of workflow) {
    for (const hook of step.hooks.pre) {
      const existing = hookIdToSteps.get(hook.id) ?? []
      existing.push(`${step.step}.pre`)
      hookIdToSteps.set(hook.id, existing)
    }
    for (const hook of step.hooks.post) {
      const existing = hookIdToSteps.get(hook.id) ?? []
      existing.push(`${step.step}.post`)
      hookIdToSteps.set(hook.id, existing)
    }
  }
  for (const [hookId, steps] of hookIdToSteps) {
    if (steps.length > 1) {
      throw new SchemaValidationError(
        ref,
        `duplicate hook id '${hookId}' in workflow steps '${steps.join("' and '")}'`,
      )
    }
  }

  /**
   * Validates that IDs within an array are unique, reporting duplicates with context.
   *
   * @param schemaRef - Schema reference for error messages
   * @param array - Array of items with optional `id` fields
   * @param arrayName - Name of the array for error context
   * @param context - Additional context for error messages
   * @throws {SchemaValidationError} If duplicate IDs are found
   */
  function validateArrayIds<T extends { id?: string }>(
    schemaRef: string,
    array: readonly T[],
    arrayName: string,
    context: string,
  ): void {
    const idToIndices = new Map<string, number[]>()
    for (let i = 0; i < array.length; i++) {
      const id = array[i]?.id
      if (id === undefined) continue
      const existing = idToIndices.get(id) ?? []
      existing.push(i)
      idToIndices.set(id, existing)
    }
    for (const [id, indices] of idToIndices) {
      if (indices.length > 1) {
        throw new SchemaValidationError(
          schemaRef,
          `duplicate ${arrayName} id '${id}' in ${context}`,
        )
      }
    }
  }

  for (const artifact of artifacts) {
    if (artifact.validations.length > 0) {
      validateArrayIds(ref, artifact.validations, 'validations', `artifact '${artifact.id}'`)
    }
    if (artifact.deltaValidations.length > 0) {
      validateArrayIds(
        ref,
        artifact.deltaValidations,
        'deltaValidations',
        `artifact '${artifact.id}'`,
      )
    }
    if ((artifact.rules?.pre.length ?? 0) > 0) {
      validateArrayIds(ref, artifact.rules!.pre, 'rules.pre', `artifact '${artifact.id}'`)
    }
    if ((artifact.rules?.post.length ?? 0) > 0) {
      validateArrayIds(ref, artifact.rules!.post, 'rules.post', `artifact '${artifact.id}'`)
    }
    if (artifact.preHashCleanup.length > 0) {
      validateArrayIds(ref, artifact.preHashCleanup, 'preHashCleanup', `artifact '${artifact.id}'`)
    }
  }

  validateArtifactGraph(ref, artifacts)

  const metadataExtraction =
    data.metadataExtraction !== undefined
      ? buildMetadataExtraction(data.metadataExtraction)
      : undefined

  if (metadataExtraction !== undefined) {
    const ctx = metadataExtraction.context
    const rules = metadataExtraction.rules
    const constraints = metadataExtraction.constraints
    const scenarios = metadataExtraction.scenarios
    if (ctx && ctx.length > 0) {
      validateArrayIds(ref, ctx, 'context', 'metadataExtraction')
    }
    if (rules && rules.length > 0) {
      validateArrayIds(ref, rules, 'rules', 'metadataExtraction')
    }
    if (constraints && constraints.length > 0) {
      validateArrayIds(ref, constraints, 'constraints', 'metadataExtraction')
    }
    if (scenarios && scenarios.length > 0) {
      validateArrayIds(ref, scenarios, 'scenarios', 'metadataExtraction')
    }
  }

  return new Schema(
    data.kind,
    data.name,
    data.version,
    artifacts,
    workflow,
    metadataExtraction,
    data.extends,
  )
}
