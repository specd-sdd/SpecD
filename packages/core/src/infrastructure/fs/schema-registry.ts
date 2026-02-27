import fs from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
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
  type ContextSection,
  type PreHashCleanup,
  type TaskCompletionCheck,
} from '../../domain/value-objects/validation-rule.js'
import { type Selector } from '../../domain/value-objects/selector.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'

/** Construction configuration for {@link FsSchemaRegistry}. */
export interface FsSchemaRegistryConfig {
  /** Absolute path to the `node_modules` directory for npm package resolution. */
  readonly nodeModulesPath: string
}

// ---------------------------------------------------------------------------
// Raw YAML shape (unvalidated)
// ---------------------------------------------------------------------------

/** Unvalidated raw YAML shape for a selector object. */
interface RawSelector {
  /** Unvalidated node type field. */
  type?: unknown
  /** Unvalidated matches regex field. */
  matches?: unknown
  /** Unvalidated contains regex field. */
  contains?: unknown
  /** Unvalidated parent selector field. */
  parent?: unknown
  /** Unvalidated index field. */
  index?: unknown
  /** Unvalidated where field. */
  where?: unknown
}

/** Unvalidated raw YAML shape for a validation rule. */
interface RawValidationRule {
  /** Unvalidated selector field. */
  selector?: unknown
  /** Unvalidated JSONPath field. */
  path?: unknown
  /** Unvalidated required flag. */
  required?: unknown
  /** Unvalidated contentMatches regex field. */
  contentMatches?: unknown
  /** Unvalidated children rules. */
  children?: unknown
}

/** Unvalidated raw YAML shape for a context section. */
interface RawContextSection {
  /** Unvalidated selector field. */
  selector?: unknown
  /** Unvalidated role field. */
  role?: unknown
  /** Unvalidated extract field. */
  extract?: unknown
  /** Unvalidated contextTitle field. */
  contextTitle?: unknown
}

/** Unvalidated raw YAML shape for a pre-hash cleanup entry. */
interface RawPreHashCleanup {
  /** Unvalidated pattern field. */
  pattern?: unknown
  /** Unvalidated replacement field. */
  replacement?: unknown
}

/** Unvalidated raw YAML shape for a task completion check. */
interface RawTaskCompletionCheck {
  /** Unvalidated incompletePattern field. */
  incompletePattern?: unknown
  /** Unvalidated completePattern field. */
  completePattern?: unknown
}

/** Unvalidated raw YAML shape for a hook entry. */
interface RawHookEntry {
  /** Unvalidated instruction text field. */
  instruction?: unknown
  /** Unvalidated run command field. */
  run?: unknown
}

/** Unvalidated raw YAML shape for a workflow step. */
interface RawWorkflowStep {
  /** Unvalidated step name field. */
  step?: unknown
  /** Unvalidated requires array field. */
  requires?: unknown
  /** Unvalidated hooks object. */
  hooks?: {
    /** Unvalidated pre-hooks array. */
    pre?: unknown
    /** Unvalidated post-hooks array. */
    post?: unknown
  }
}

/** Unvalidated raw YAML shape for a schema artifact definition. */
interface RawArtifact {
  /** Unvalidated id field. */
  id?: unknown
  /** Unvalidated scope field. */
  scope?: unknown
  /** Unvalidated output field. */
  output?: unknown
  /** Unvalidated description field. */
  description?: unknown
  /** Unvalidated template path field. */
  template?: unknown
  /** Unvalidated instruction field. */
  instruction?: unknown
  /** Unvalidated requires array. */
  requires?: unknown
  /** Unvalidated optional flag. */
  optional?: unknown
  /** Unvalidated format field. */
  format?: unknown
  /** Unvalidated delta flag. */
  delta?: unknown
  /** Unvalidated deltaInstruction field. */
  deltaInstruction?: unknown
  /** Unvalidated validations array. */
  validations?: unknown
  /** Unvalidated deltaValidations array. */
  deltaValidations?: unknown
  /** Unvalidated contextSections array. */
  contextSections?: unknown
  /** Unvalidated preHashCleanup array. */
  preHashCleanup?: unknown
  /** Unvalidated taskCompletionCheck object. */
  taskCompletionCheck?: unknown
}

/** Unvalidated raw YAML shape for the top-level schema document. */
interface RawSchema {
  /** Unvalidated name field. */
  name?: unknown
  /** Unvalidated version field. */
  version?: unknown
  /** Unvalidated description field. */
  description?: unknown
  /** Unvalidated artifacts array. */
  artifacts?: unknown
  /** Unvalidated workflow array. */
  workflow?: unknown
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `v` is a `string`.
 *
 * @param v - The value to test
 * @returns `true` when `v` is a string
 */
function isString(v: unknown): v is string {
  return typeof v === 'string'
}

/**
 * Returns `true` when `v` is a `number`.
 *
 * @param v - The value to test
 * @returns `true` when `v` is a number
 */
function isNumber(v: unknown): v is number {
  return typeof v === 'number'
}

/**
 * Returns `true` when `v` is an array.
 *
 * @param v - The value to test
 * @returns `true` when `v` is an array
 */
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

/**
 * Returns `true` when `v` is a non-null, non-array object.
 *
 * @param v - The value to test
 * @returns `true` when `v` is a plain object
 */
function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Parses a raw YAML value into a typed {@link Selector}.
 *
 * @param raw - The raw YAML value to parse
 * @param ctx - Human-readable context string for error messages
 * @returns A validated `Selector`
 * @throws When the raw value is not a valid selector
 */
function parseSelector(raw: unknown, ctx: string): Selector {
  if (!isObject(raw)) throw new Error(`${ctx}: selector must be an object`)
  const r = raw as RawSelector
  if (!isString(r.type)) throw new Error(`${ctx}: selector.type must be a string`)
  const sel: {
    type: string
    matches?: string
    contains?: string
    parent?: Selector
    index?: number
    where?: Record<string, string>
  } = { type: r.type }
  if (r.matches !== undefined) {
    if (!isString(r.matches)) throw new Error(`${ctx}: selector.matches must be a string`)
    sel.matches = r.matches
  }
  if (r.contains !== undefined) {
    if (!isString(r.contains)) throw new Error(`${ctx}: selector.contains must be a string`)
    sel.contains = r.contains
  }
  if (r.parent !== undefined) {
    sel.parent = parseSelector(r.parent, `${ctx}.parent`)
  }
  if (r.index !== undefined) {
    if (!isNumber(r.index)) throw new Error(`${ctx}: selector.index must be a number`)
    sel.index = r.index
  }
  if (r.where !== undefined) {
    if (!isObject(r.where)) throw new Error(`${ctx}: selector.where must be an object`)
    const where: Record<string, string> = {}
    for (const [k, v] of Object.entries(r.where)) {
      if (!isString(v)) throw new Error(`${ctx}: selector.where.${k} must be a string`)
      where[k] = v
    }
    sel.where = where
  }
  return sel
}

/**
 * Parses a raw YAML value into a typed {@link ValidationRule}.
 *
 * @param raw - The raw YAML value to parse
 * @param ctx - Human-readable context string for error messages
 * @returns A validated `ValidationRule`
 * @throws When the raw value is not a valid validation rule
 */
function parseValidationRule(raw: unknown, ctx: string): ValidationRule {
  if (!isObject(raw)) throw new Error(`${ctx}: validation rule must be an object`)
  const r = raw as RawValidationRule
  const rule: {
    selector?: Selector
    path?: string
    required?: boolean
    contentMatches?: string
    children?: ValidationRule[]
  } = {}
  if (r.selector !== undefined) {
    rule.selector = parseSelector(r.selector, `${ctx}.selector`)
  }
  if (r.path !== undefined) {
    if (!isString(r.path)) throw new Error(`${ctx}: path must be a string`)
    rule.path = r.path
  }
  if (r.required !== undefined) {
    if (typeof r.required !== 'boolean') throw new Error(`${ctx}: required must be a boolean`)
    rule.required = r.required
  }
  if (r.contentMatches !== undefined) {
    if (!isString(r.contentMatches)) throw new Error(`${ctx}: contentMatches must be a string`)
    rule.contentMatches = r.contentMatches
  }
  if (r.children !== undefined) {
    if (!isArray(r.children)) throw new Error(`${ctx}: children must be an array`)
    rule.children = r.children.map((c, i) => parseValidationRule(c, `${ctx}.children[${i}]`))
  }
  return rule
}

/**
 * Parses a raw YAML value into a typed {@link ContextSection}.
 *
 * @param raw - The raw YAML value to parse
 * @param ctx - Human-readable context string for error messages
 * @returns A validated `ContextSection`
 * @throws When the raw value is not a valid context section
 */
function parseContextSection(raw: unknown, ctx: string): ContextSection {
  if (!isObject(raw)) throw new Error(`${ctx}: context section must be an object`)
  const r = raw as RawContextSection
  if (r.selector === undefined) throw new Error(`${ctx}: selector is required`)
  const selector = parseSelector(r.selector, `${ctx}.selector`)
  const section: {
    selector: Selector
    role?: 'rules' | 'constraints' | 'scenarios' | 'context'
    extract?: 'content' | 'label' | 'both'
    contextTitle?: string
  } = { selector }
  if (r.role !== undefined) {
    const validRoles = ['rules', 'constraints', 'scenarios', 'context']
    if (!isString(r.role) || !validRoles.includes(r.role))
      throw new Error(`${ctx}: role must be one of ${validRoles.join(', ')}`)
    section.role = r.role as 'rules' | 'constraints' | 'scenarios' | 'context'
  }
  if (r.extract !== undefined) {
    const validExtract = ['content', 'label', 'both']
    if (!isString(r.extract) || !validExtract.includes(r.extract))
      throw new Error(`${ctx}: extract must be one of ${validExtract.join(', ')}`)
    section.extract = r.extract as 'content' | 'label' | 'both'
  }
  if (r.contextTitle !== undefined) {
    if (!isString(r.contextTitle)) throw new Error(`${ctx}: contextTitle must be a string`)
    section.contextTitle = r.contextTitle
  }
  return section
}

/**
 * Parses a raw YAML array into a typed array of {@link HookEntry} values.
 *
 * @param raw - The raw YAML value to parse
 * @param ctx - Human-readable context string for error messages
 * @returns An array of validated `HookEntry` values
 * @throws When the raw value is not a valid hooks array
 */
function parseHookEntries(raw: unknown, ctx: string): HookEntry[] {
  if (!isArray(raw)) throw new Error(`${ctx}: hooks must be an array`)
  return raw.map((entry, i) => {
    if (!isObject(entry)) throw new Error(`${ctx}[${i}]: hook entry must be an object`)
    const r = entry as RawHookEntry
    if (r.run !== undefined) {
      if (!isString(r.run)) throw new Error(`${ctx}[${i}]: run must be a string`)
      return { type: 'run' as const, command: r.run }
    }
    if (r.instruction !== undefined) {
      if (!isString(r.instruction)) throw new Error(`${ctx}[${i}]: instruction must be a string`)
      return { type: 'instruction' as const, text: r.instruction }
    }
    throw new Error(`${ctx}[${i}]: hook entry must have either 'run' or 'instruction'`)
  })
}

/**
 * Returns `true` when artifact `id` has a circular dependency in `requires`.
 *
 * Uses DFS with a recursion stack to detect back edges in the dependency graph.
 *
 * @param id - The artifact ID to check
 * @param requires - Map from artifact ID to its direct dependencies
 * @param visited - Set of fully-explored nodes (avoids redundant work)
 * @param stack - Current DFS recursion stack (detects back edges)
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

// ---------------------------------------------------------------------------
// FsSchemaRegistry
// ---------------------------------------------------------------------------

/**
 * Filesystem implementation of the {@link SchemaRegistry} port.
 *
 * Resolves schema references from workspace directories and npm packages,
 * reads and validates `schema.yaml` files, loads template content at resolve
 * time, and returns fully-constructed {@link Schema} instances.
 */
export class FsSchemaRegistry implements SchemaRegistry {
  private readonly _nodeModulesPath: string

  /**
   * Creates a new `FsSchemaRegistry`.
   *
   * @param config - Registry configuration including the `node_modules` path
   */
  constructor(config: FsSchemaRegistryConfig) {
    this._nodeModulesPath = config.nodeModulesPath
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
    const schemaFilePath = this._resolveFilePath(ref, workspaceSchemasPaths)
    let content: string
    try {
      content = await fs.readFile(schemaFilePath, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }

    const raw = parseYaml(content) as RawSchema
    if (!isObject(raw)) throw new SchemaValidationError(ref, 'schema file must be a YAML mapping')

    return this._buildSchema(ref, raw, path.dirname(schemaFilePath))
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

    const specdScopeDir = path.join(this._nodeModulesPath, '@specd')
    try {
      const items = await fs.readdir(specdScopeDir, { withFileTypes: true })
      for (const item of items) {
        if (!item.isDirectory()) continue
        if (!item.name.startsWith('schema-')) continue
        const schemaFile = path.join(specdScopeDir, item.name, 'schema.yaml')
        try {
          await fs.access(schemaFile)
        } catch {
          continue
        }
        entries.push({
          ref: `@specd/${item.name}`,
          name: item.name,
          source: 'npm',
        })
      }
    } catch {
      // @specd scope not in node_modules — no npm entries
    }

    return entries
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves a schema `ref` string to an absolute path to the `schema.yaml` file.
   *
   * @param ref - The schema reference string
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns Absolute path to the schema YAML file
   */
  private _resolveFilePath(
    ref: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ): string {
    if (ref.startsWith('@')) {
      // npm package: @scope/name
      return path.join(this._nodeModulesPath, ref, 'schema.yaml')
    }

    if (ref.startsWith('#')) {
      // workspace-qualified: #workspace:name or #name
      const inner = ref.slice(1)
      const colonIdx = inner.indexOf(':')
      const workspace = colonIdx >= 0 ? inner.slice(0, colonIdx) : 'default'
      const name = colonIdx >= 0 ? inner.slice(colonIdx + 1) : inner
      const schemasPath =
        workspaceSchemasPaths.get(workspace) ?? workspaceSchemasPaths.get('default') ?? ''
      return path.join(schemasPath, name, 'schema.yaml')
    }

    if (path.isAbsolute(ref)) {
      return ref
    }

    if (ref.startsWith('./') || ref.startsWith('../')) {
      return path.resolve(ref)
    }

    // Bare name → #default:name
    const schemasPath = workspaceSchemasPaths.get('default') ?? ''
    return path.join(schemasPath, ref, 'schema.yaml')
  }

  /**
   * Validates a raw schema document and constructs a fully-typed {@link Schema}.
   *
   * @param ref - The schema reference for error messages
   * @param raw - The parsed but unvalidated YAML document
   * @param schemaDir - The directory containing the schema file (for template resolution)
   * @returns A fully-constructed `Schema` instance
   * @throws {@link SchemaValidationError} When the document fails structural validation
   */
  private async _buildSchema(ref: string, raw: RawSchema, schemaDir: string): Promise<Schema> {
    if (!isString(raw.name))
      throw new SchemaValidationError(ref, "'name' is required and must be a string")
    if (!isNumber(raw.version) || !Number.isInteger(raw.version))
      throw new SchemaValidationError(ref, "'version' is required and must be an integer")
    if (!isArray(raw.artifacts))
      throw new SchemaValidationError(ref, "'artifacts' is required and must be an array")

    const artifacts = await this._buildArtifacts(ref, raw.artifacts, schemaDir)
    const workflow = this._buildWorkflow(ref, raw.workflow)

    this._validateArtifactGraph(ref, artifacts)

    return new Schema(raw.name, raw.version, artifacts, workflow)
  }

  /**
   * Parses and validates the `artifacts` array from a raw schema document.
   *
   * Reads template files from disk for any artifact that declares a `template` path.
   *
   * @param ref - The schema reference for error messages
   * @param rawList - The raw artifact array from the parsed YAML
   * @param schemaDir - The directory containing the schema file
   * @returns An array of fully-constructed `ArtifactType` instances
   * @throws {@link SchemaValidationError} When any artifact entry fails validation
   */
  private async _buildArtifacts(
    ref: string,
    rawList: unknown[],
    schemaDir: string,
  ): Promise<ArtifactType[]> {
    const idSet = new Set<string>()
    const idPattern = /^[a-z][a-z0-9-]*$/

    const artifacts: ArtifactType[] = []

    for (let i = 0; i < rawList.length; i++) {
      const raw = rawList[i]
      const ctx = `${ref} artifacts[${i}]`
      if (!isObject(raw)) throw new SchemaValidationError(ref, `artifacts[${i}] must be an object`)
      const r = raw as RawArtifact

      if (!isString(r.id))
        throw new SchemaValidationError(ref, `${ctx}: 'id' is required and must be a string`)
      if (!idPattern.test(r.id))
        throw new SchemaValidationError(ref, `${ctx}: id '${r.id}' must match /^[a-z][a-z0-9-]*$/`)
      if (idSet.has(r.id)) throw new SchemaValidationError(ref, `duplicate artifact id '${r.id}'`)
      idSet.add(r.id)

      const validScopes = ['spec', 'change']
      if (!isString(r.scope) || !validScopes.includes(r.scope))
        throw new SchemaValidationError(ref, `${ctx}: 'scope' must be 'spec' or 'change'`)
      if (!isString(r.output))
        throw new SchemaValidationError(ref, `${ctx}: 'output' is required and must be a string`)

      const requires: string[] = isArray(r.requires)
        ? r.requires.map((v, j) => {
            if (!isString(v))
              throw new SchemaValidationError(ref, `${ctx}: requires[${j}] must be a string`)
            return v
          })
        : []

      const delta = r.delta === true

      if (r.deltaValidations !== undefined && !delta) {
        throw new SchemaValidationError(
          ref,
          `${ctx}: 'deltaValidations' is only valid when 'delta' is true`,
        )
      }

      let templateContent: string | undefined
      if (r.template !== undefined) {
        if (!isString(r.template))
          throw new SchemaValidationError(ref, `${ctx}: 'template' must be a string`)
        const templatePath = path.join(schemaDir, r.template)
        try {
          templateContent = await fs.readFile(templatePath, 'utf-8')
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new SchemaValidationError(ref, `${ctx}: template file '${r.template}' not found`)
          }
          throw err
        }
      }

      const validations: ValidationRule[] = isArray(r.validations)
        ? r.validations.map((v, j) => {
            try {
              return parseValidationRule(v, `${ctx}.validations[${j}]`)
            } catch (e) {
              throw new SchemaValidationError(ref, (e as Error).message)
            }
          })
        : []

      const deltaValidations: ValidationRule[] = isArray(r.deltaValidations)
        ? r.deltaValidations.map((v, j) => {
            try {
              return parseValidationRule(v, `${ctx}.deltaValidations[${j}]`)
            } catch (e) {
              throw new SchemaValidationError(ref, (e as Error).message)
            }
          })
        : []

      const contextSections: ContextSection[] = isArray(r.contextSections)
        ? r.contextSections.map((v, j) => {
            try {
              return parseContextSection(v, `${ctx}.contextSections[${j}]`)
            } catch (e) {
              throw new SchemaValidationError(ref, (e as Error).message)
            }
          })
        : []

      const preHashCleanup: PreHashCleanup[] = isArray(r.preHashCleanup)
        ? r.preHashCleanup.map((v, j) => {
            if (!isObject(v))
              throw new SchemaValidationError(ref, `${ctx}.preHashCleanup[${j}] must be an object`)
            const p = v as RawPreHashCleanup
            if (!isString(p.pattern))
              throw new SchemaValidationError(
                ref,
                `${ctx}.preHashCleanup[${j}]: 'pattern' must be a string`,
              )
            if (!isString(p.replacement))
              throw new SchemaValidationError(
                ref,
                `${ctx}.preHashCleanup[${j}]: 'replacement' must be a string`,
              )
            return { pattern: p.pattern, replacement: p.replacement }
          })
        : []

      let taskCompletionCheck: TaskCompletionCheck | undefined
      if (r.taskCompletionCheck !== undefined) {
        if (!isObject(r.taskCompletionCheck))
          throw new SchemaValidationError(ref, `${ctx}: 'taskCompletionCheck' must be an object`)
        const tcc = r.taskCompletionCheck as RawTaskCompletionCheck
        const check: { incompletePattern?: string; completePattern?: string } = {}
        if (tcc.incompletePattern !== undefined) {
          if (!isString(tcc.incompletePattern))
            throw new SchemaValidationError(
              ref,
              `${ctx}.taskCompletionCheck: 'incompletePattern' must be a string`,
            )
          check.incompletePattern = tcc.incompletePattern
        }
        if (tcc.completePattern !== undefined) {
          if (!isString(tcc.completePattern))
            throw new SchemaValidationError(
              ref,
              `${ctx}.taskCompletionCheck: 'completePattern' must be a string`,
            )
          check.completePattern = tcc.completePattern
        }
        taskCompletionCheck = check
      }

      const format = r.format !== undefined ? (r.format as ArtifactFormat) : undefined
      const description = isString(r.description) ? r.description : undefined
      const instruction = isString(r.instruction) ? r.instruction : undefined
      const deltaInstruction = isString(r.deltaInstruction) ? r.deltaInstruction : undefined
      const optional = r.optional === true

      artifacts.push(
        new ArtifactType({
          id: r.id,
          scope: r.scope as ArtifactScope,
          output: r.output,
          ...(description !== undefined ? { description } : {}),
          ...(templateContent !== undefined ? { template: templateContent } : {}),
          ...(instruction !== undefined ? { instruction } : {}),
          requires,
          optional,
          ...(format !== undefined ? { format } : {}),
          delta,
          ...(deltaInstruction !== undefined ? { deltaInstruction } : {}),
          validations,
          deltaValidations,
          contextSections,
          preHashCleanup,
          ...(taskCompletionCheck !== undefined ? { taskCompletionCheck } : {}),
        }),
      )
    }

    return artifacts
  }

  /**
   * Parses and validates the optional `workflow` array from a raw schema document.
   *
   * @param ref - The schema reference for error messages
   * @param rawWorkflow - The raw workflow value from the parsed YAML (may be undefined)
   * @returns An array of validated `WorkflowStep` entries; empty array if none declared
   * @throws {@link SchemaValidationError} When any workflow entry fails validation
   */
  private _buildWorkflow(ref: string, rawWorkflow: unknown): WorkflowStep[] {
    if (rawWorkflow === undefined || rawWorkflow === null) return []
    if (!isArray(rawWorkflow)) throw new SchemaValidationError(ref, "'workflow' must be an array")

    const stepSet = new Set<string>()
    return rawWorkflow.map((raw, i) => {
      const ctx = `${ref} workflow[${i}]`
      if (!isObject(raw)) throw new SchemaValidationError(ref, `${ctx} must be an object`)
      const r = raw as RawWorkflowStep

      if (!isString(r.step))
        throw new SchemaValidationError(ref, `${ctx}: 'step' is required and must be a string`)
      if (stepSet.has(r.step))
        throw new SchemaValidationError(ref, `duplicate workflow step '${r.step}'`)
      stepSet.add(r.step)

      const requires: string[] = isArray(r.requires)
        ? r.requires.map((v, j) => {
            if (!isString(v))
              throw new SchemaValidationError(ref, `${ctx}: requires[${j}] must be a string`)
            return v
          })
        : []

      let pre: HookEntry[] = []
      let post: HookEntry[] = []

      if (r.hooks !== undefined) {
        if (!isObject(r.hooks))
          throw new SchemaValidationError(ref, `${ctx}: 'hooks' must be an object`)
        if (r.hooks.pre !== undefined) {
          try {
            pre = parseHookEntries(r.hooks.pre, `${ctx}.hooks.pre`)
          } catch (e) {
            throw new SchemaValidationError(ref, (e as Error).message)
          }
        }
        if (r.hooks.post !== undefined) {
          try {
            post = parseHookEntries(r.hooks.post, `${ctx}.hooks.post`)
          } catch (e) {
            throw new SchemaValidationError(ref, (e as Error).message)
          }
        }
      }

      return { step: r.step, requires, hooks: { pre, post } }
    })
  }

  /**
   * Validates the artifact dependency graph: checks for unknown refs, optional
   * artifact violations, and circular dependencies.
   *
   * @param ref - The schema reference for error messages
   * @param artifacts - The fully-constructed artifact list to validate
   * @throws {@link SchemaValidationError} When the graph contains any violations
   */
  private _validateArtifactGraph(ref: string, artifacts: ArtifactType[]): void {
    const allIds = new Set(artifacts.map((a) => a.id()))
    const optionalIds = new Set(artifacts.filter((a) => a.optional()).map((a) => a.id()))
    const requiresMap = new Map(artifacts.map((a) => [a.id(), a.requires()] as const))

    for (const artifact of artifacts) {
      for (const dep of artifact.requires()) {
        if (!allIds.has(dep)) {
          throw new SchemaValidationError(
            ref,
            `artifact '${artifact.id()}' requires unknown artifact '${dep}'`,
          )
        }
        if (optionalIds.has(dep) && !artifact.optional()) {
          throw new SchemaValidationError(
            ref,
            `non-optional artifact '${artifact.id()}' requires optional artifact '${dep}'`,
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
