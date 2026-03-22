import { type Schema } from '../../domain/value-objects/schema.js'
import { type SchemaRegistry, type SchemaRawResult } from '../ports/schema-registry.js'
import {
  type SchemaOperations,
  mergeSchemaLayers,
  type SchemaLayer,
} from '../../domain/services/merge-schema-layers.js'
import { buildSchema, type SchemaYamlData } from '../../domain/services/build-schema.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'

/**
 * Orchestrates the full schema resolution pipeline: resolve the base schema,
 * resolve the `extends` chain, resolve plugins, apply merge layers, and build
 * the final `Schema` entity.
 */
export class ResolveSchema {
  private readonly _schemas: SchemaRegistry
  private readonly _schemaRef: string
  private readonly _schemaPlugins: readonly string[]
  private readonly _schemaOverrides: SchemaOperations | undefined

  /**
   * Creates a new ResolveSchema use case.
   * @param schemas - Registry used to look up raw schema data
   * @param schemaRef - Reference identifier for the base schema to resolve
   * @param schemaPlugins - Ordered list of plugin references to apply
   * @param schemaOverrides - Optional override operations to apply last
   */
  constructor(
    schemas: SchemaRegistry,
    schemaRef: string,
    schemaPlugins: readonly string[],
    schemaOverrides: SchemaOperations | undefined,
  ) {
    this._schemas = schemas
    this._schemaRef = schemaRef
    this._schemaPlugins = schemaPlugins
    this._schemaOverrides = schemaOverrides
  }

  /**
   * Executes the full schema resolution pipeline.
   * @returns The fully resolved Schema domain entity
   */
  async execute(): Promise<Schema> {
    // 1. Resolve base schema
    const baseRaw = await this._schemas.resolveRaw(this._schemaRef)
    if (baseRaw === null) {
      throw new SchemaNotFoundError(this._schemaRef)
    }

    // 2. Resolve extends chain and cascade into inherited base
    const { inheritedData, templates: inheritedTemplates } =
      await this._resolveAndCascadeExtends(baseRaw)

    // 3. Build plugin + override layers
    const pluginLayers = await this._resolvePlugins()
    const overrideLayers: SchemaLayer[] = []
    if (this._schemaOverrides !== undefined) {
      overrideLayers.push({
        source: 'override',
        ref: this._schemaRef,
        operations: normalizeOverrideHooks(this._schemaOverrides),
      })
    }

    // 4. Merge (plugins + overrides only; extends already cascaded)
    const allLayers = [...pluginLayers, ...overrideLayers]
    const mergedData =
      allLayers.length > 0 ? mergeSchemaLayers(inheritedData, allLayers) : inheritedData

    // 5. Merge templates: parent templates first, child overrides
    const finalTemplates = new Map<string, string>(inheritedTemplates)
    for (const [k, v] of baseRaw.templates) {
      finalTemplates.set(k, v)
    }

    // 6. Build domain Schema
    return buildSchema(this._schemaRef, mergedData, finalTemplates)
  }

  // ---------------------------------------------------------------------------
  // Extends chain resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves the full extends chain and cascades data using child-overrides-parent
   * semantics. Returns the inherited data (root → ... → parent → leaf merged)
   * and accumulated templates.
   * @param baseRaw - The raw result of the base schema whose extends chain to resolve
   * @returns The cascaded inherited data and accumulated templates
   */
  private async _resolveAndCascadeExtends(baseRaw: SchemaRawResult): Promise<{
    inheritedData: SchemaYamlData
    templates: Map<string, string>
  }> {
    if (baseRaw.data.extends === undefined) {
      return { inheritedData: baseRaw.data, templates: new Map() }
    }

    // Walk up the chain: leaf → parent → grandparent → root
    const chain: SchemaRawResult[] = []
    const visitedPaths = new Set<string>([baseRaw.resolvedPath])

    let currentData = baseRaw.data
    while (currentData.extends !== undefined) {
      const parentRef = currentData.extends
      const parentRaw = await this._schemas.resolveRaw(parentRef)
      if (parentRaw === null) {
        throw new SchemaNotFoundError(parentRef)
      }
      if (visitedPaths.has(parentRaw.resolvedPath)) {
        throw new SchemaValidationError(
          parentRef,
          `extends cycle detected: '${parentRef}' was already resolved in the chain`,
        )
      }
      visitedPaths.add(parentRaw.resolvedPath)
      chain.push(parentRaw)
      currentData = parentRaw.data
    }

    // chain = [parent, grandparent, ..., root] — reverse to get root-first
    chain.reverse()

    // Cascade data: root → grandparent → ... → parent → leaf
    let cascaded = chain[0]!.data
    for (let i = 1; i < chain.length; i++) {
      cascaded = this._overlayData(cascaded, chain[i]!.data)
    }
    cascaded = this._overlayData(cascaded, baseRaw.data)

    // Accumulate templates: root first, each child overrides
    const templates = new Map<string, string>()
    for (const item of chain) {
      for (const [k, v] of item.templates) {
        templates.set(k, v)
      }
    }

    return { inheritedData: cascaded, templates }
  }

  /**
   * Overlays child data on top of parent data. Child values take precedence
   * when present. Arrays (artifacts, workflow) are merged by identity key.
   * @param parent - The parent schema data to overlay onto
   * @param child - The child schema data whose values take precedence
   * @returns A new SchemaYamlData with child values overlaid on parent
   */
  private _overlayData(parent: SchemaYamlData, child: SchemaYamlData): SchemaYamlData {
    const result: SchemaYamlData = {
      kind: child.kind,
      name: child.name,
      version: child.version,
      description: child.description ?? parent.description,
      extends: child.extends,
      artifacts: this._mergeArtifactArrays(parent.artifacts, child.artifacts),
      workflow: this._mergeWorkflowArrays(parent.workflow, child.workflow),
      metadataExtraction: child.metadataExtraction ?? parent.metadataExtraction,
    }
    return result
  }

  /**
   * Merges artifact arrays by id. Child entries with matching id replace the
   * parent entry; child entries with new ids are appended.
   * @param parentArtifacts - The parent artifact array (may be undefined)
   * @param childArtifacts - The child artifact array (may be undefined)
   * @returns The merged artifact array, or undefined if both inputs are undefined
   */
  private _mergeArtifactArrays(
    parentArtifacts: SchemaYamlData['artifacts'],
    childArtifacts: SchemaYamlData['artifacts'],
  ): SchemaYamlData['artifacts'] {
    if (parentArtifacts === undefined) return childArtifacts
    if (childArtifacts === undefined) return parentArtifacts

    const childIds = new Set(childArtifacts.map((a) => a.id))
    const inherited = parentArtifacts.filter((a) => !childIds.has(a.id))
    return [...inherited, ...childArtifacts]
  }

  /**
   * Merges workflow arrays by step name. Child entries replace parent entries
   * with the same step; new steps are appended.
   * @param parentWorkflow - The parent workflow array (may be undefined)
   * @param childWorkflow - The child workflow array (may be undefined)
   * @returns The merged workflow array, or undefined if both inputs are undefined
   */
  private _mergeWorkflowArrays(
    parentWorkflow: SchemaYamlData['workflow'],
    childWorkflow: SchemaYamlData['workflow'],
  ): SchemaYamlData['workflow'] {
    if (parentWorkflow === undefined) return childWorkflow
    if (childWorkflow === undefined) return parentWorkflow

    const childSteps = new Set(childWorkflow.map((s) => s.step))
    const inherited = parentWorkflow.filter((s) => !childSteps.has(s.step))
    return [...inherited, ...childWorkflow]
  }

  // ---------------------------------------------------------------------------
  // Plugin resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves all configured schema plugins into merge layers.
   * @returns An array of SchemaLayer entries derived from each plugin
   */
  private async _resolvePlugins(): Promise<SchemaLayer[]> {
    const layers: SchemaLayer[] = []

    for (const pluginRef of this._schemaPlugins) {
      const raw = await this._schemas.resolveRaw(pluginRef)
      if (raw === null) {
        throw new SchemaNotFoundError(pluginRef)
      }
      if (raw.data.kind !== 'schema-plugin') {
        throw new SchemaValidationError(
          pluginRef,
          `expected kind 'schema-plugin' but found '${raw.data.kind}'`,
        )
      }

      layers.push({
        source: 'plugin',
        ref: pluginRef,
        operations: this._extractPluginOperations(raw.data),
      })
    }

    return layers
  }

  /**
   * Extracts merge operations from a schema-plugin's data.
   * @param data - The raw schema YAML data from a schema-plugin
   * @returns The extracted SchemaOperations, or an empty object if none found
   */
  private _extractPluginOperations(data: SchemaYamlData): SchemaOperations {
    if (data.operations === undefined) return {}
    return data.operations as SchemaOperations
  }
}

// ---------------------------------------------------------------------------
// Override hook normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a single raw YAML hook entry to the domain `HookEntry` format.
 *
 * YAML format uses `{ id, run }` or `{ id, instruction }`, but the domain
 * expects `{ id, type: 'run', command }` or `{ id, type: 'instruction', text }`.
 * Entries that already have a `type` field are returned as-is.
 *
 * @param hook - A raw hook entry from schema overrides
 * @returns The normalized hook entry in domain format
 */
function normalizeHookEntry(hook: Record<string, unknown>): Record<string, unknown> {
  if ('type' in hook) return hook
  if ('run' in hook) return { id: hook.id, type: 'run', command: hook.run }
  if ('instruction' in hook) return { id: hook.id, type: 'instruction', text: hook.instruction }
  return hook
}

/**
 * Normalizes hook entries in a workflow step's hooks arrays.
 *
 * @param step - A raw workflow step entry from schema overrides
 * @returns The step with normalized hook entries
 */
function normalizeWorkflowStepHooks(step: Record<string, unknown>): Record<string, unknown> {
  const hooks = step.hooks as Record<string, unknown> | undefined
  if (hooks === undefined) return step
  const result = { ...step, hooks: { ...hooks } }
  const h = result.hooks as Record<string, unknown>
  if (Array.isArray(h.pre)) h.pre = h.pre.map((e: Record<string, unknown>) => normalizeHookEntry(e))
  if (Array.isArray(h.post))
    h.post = h.post.map((e: Record<string, unknown>) => normalizeHookEntry(e))
  return result
}

/**
 * Normalizes YAML-format hooks in schema override operations to the domain format.
 *
 * Walks all operation keys (`append`, `prepend`, `create`, `set`) and transforms
 * hook entries in `workflow[].hooks.pre[]` and `workflow[].hooks.post[]`.
 *
 * @param overrides - The raw schema overrides from config
 * @returns A new `SchemaOperations` with normalized hook entries
 */
function normalizeOverrideHooks(overrides: SchemaOperations): SchemaOperations {
  const result: Record<string, unknown> = { ...overrides }
  for (const key of ['append', 'prepend', 'create', 'set'] as const) {
    const ops = result[key] as Record<string, unknown> | undefined
    if (ops === undefined || !Array.isArray(ops.workflow)) continue
    result[key] = {
      ...ops,
      workflow: (ops.workflow as Record<string, unknown>[]).map(normalizeWorkflowStepHooks),
    }
  }
  return result as SchemaOperations
}
