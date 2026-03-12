import { SchemaValidationError } from '../errors/schema-validation-error.js'
import {
  type SchemaYamlData,
  type ArtifactYamlData,
  type ValidationRuleRaw,
  type PreHashCleanupRaw,
  type MetadataExtractionRaw,
  type MetadataExtractorEntryRaw,
  type RuleEntryRaw,
  type ArtifactRulesRaw,
} from './build-schema.js'
import { type WorkflowStep, type HookEntry } from '../value-objects/workflow-step.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Identifies where a layer came from (for error messages). */
export type SchemaLayerSource = 'extends' | 'plugin' | 'override'

/** A single merge layer to apply to a base SchemaYamlData. */
export interface SchemaLayer {
  readonly source: SchemaLayerSource
  readonly ref: string
  readonly operations: SchemaOperations
}

/** The five merge operations. Each is optional. */
export interface SchemaOperations {
  readonly remove?: RemoveTargets
  readonly create?: MutationTargets
  readonly prepend?: MutationTargets
  readonly append?: MutationTargets
  readonly set?: SetTargets
}

/** Targets for remove operations. */
export interface RemoveTargets {
  readonly artifacts?: readonly RemoveArtifactEntry[]
  readonly workflow?: readonly RemoveWorkflowEntry[]
  readonly metadataExtraction?: RemoveMetadataExtractionEntry
}

/** Remove an artifact or nested entries within it. */
export interface RemoveArtifactEntry {
  readonly id: string
  readonly validations?: readonly { readonly id: string }[]
  readonly deltaValidations?: readonly { readonly id: string }[]
  readonly preHashCleanup?: readonly { readonly id: string }[]
  readonly rules?: {
    readonly pre?: readonly { readonly id: string }[]
    readonly post?: readonly { readonly id: string }[]
  }
  readonly description?: null
  readonly instruction?: null
  readonly deltaInstruction?: null
  readonly template?: null
}

/** Remove a workflow step or nested hooks within it. */
export interface RemoveWorkflowEntry {
  readonly step: string
  readonly hooks?: {
    readonly pre?: readonly { readonly id: string }[]
    readonly post?: readonly { readonly id: string }[]
  }
}

/** Remove entries from metadataExtraction arrays. */
export interface RemoveMetadataExtractionEntry {
  readonly rules?: readonly { readonly id: string }[]
  readonly constraints?: readonly { readonly id: string }[]
  readonly scenarios?: readonly { readonly id: string }[]
  readonly context?: readonly { readonly id: string }[]
  readonly title?: null
  readonly description?: null
  readonly dependsOn?: null
  readonly keywords?: null
}

/** Targets for create, prepend, append operations. */
export interface MutationTargets {
  readonly artifacts?: readonly Partial<ArtifactYamlData>[]
  readonly workflow?: readonly Partial<WorkflowStep>[]
  readonly metadataExtraction?: MutationMetadataExtractionEntry
}

/** Mutation targets for metadataExtraction. */
export interface MutationMetadataExtractionEntry {
  readonly rules?: readonly MetadataExtractorEntryRaw[]
  readonly constraints?: readonly MetadataExtractorEntryRaw[]
  readonly scenarios?: readonly MetadataExtractorEntryRaw[]
  readonly context?: readonly MetadataExtractorEntryRaw[]
}

/** Targets for set operations. Scalars use last-writer-wins; arrays use in-place replacement. */
export interface SetTargets {
  readonly name?: string
  readonly version?: number
  readonly description?: string
  readonly artifacts?: readonly Partial<ArtifactYamlData>[]
  readonly workflow?: readonly Partial<WorkflowStep>[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Creates a SchemaValidationError with layer context.
 * @param layer - The layer that triggered the error
 * @param msg - The error message describing the issue
 * @returns A new SchemaValidationError with source annotation
 */
function err(layer: SchemaLayer, msg: string): SchemaValidationError {
  return new SchemaValidationError(layer.ref, `[${layer.source}] ${msg}`)
}

/**
 * Deep-clone a plain object.
 * @param obj - The object to clone
 * @returns A deep copy of the input object
 */
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}

/** Record type used for dynamic field access in identity-based array operations. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any

/**
 * Get identity value from an entry by field name.
 * @param entry - The record to extract the identity from
 * @param idField - The field name containing the identity value
 * @returns The identity value as a string
 */
function getId(entry: AnyRecord, idField: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return entry[idField] as string
}

/**
 * Remove entries from an array by identity field.
 * @param array - The source array to remove entries from
 * @param toRemove - The entries identifying which items to remove
 * @param idField - The field name used as the identity key
 * @param layer - The layer context for error reporting
 * @param ctx - A descriptive context string for error messages
 * @returns A new array with the specified entries removed
 * @throws {@link SchemaValidationError} If an entry to remove is not found
 */
function removeFromArray<T>(
  array: readonly T[],
  toRemove: readonly AnyRecord[],
  idField: string,
  layer: SchemaLayer,
  ctx: string,
): T[] {
  const result = [...array]
  for (const entry of toRemove) {
    const identity = getId(entry, idField)
    const idx = result.findIndex((item) => getId(item, idField) === identity)
    if (idx === -1) {
      throw err(layer, `${ctx}: cannot remove '${identity}' — not found`)
    }
    result.splice(idx, 1)
  }
  return result
}

/**
 * Add entries to an array, checking for identity collisions.
 * @param array - The source array to add entries to
 * @param toAdd - The entries to add
 * @param idField - The field name used as the identity key
 * @param position - Where to insert: 'start' prepends, 'end'/'create' appends
 * @param layer - The layer context for error reporting
 * @param ctx - A descriptive context string for error messages
 * @returns A new array with the specified entries added
 * @throws {@link SchemaValidationError} If an entry to add already exists
 */
function addToArray<T>(
  array: readonly T[],
  toAdd: readonly T[],
  idField: string,
  position: 'start' | 'end' | 'create',
  layer: SchemaLayer,
  ctx: string,
): T[] {
  const result = [...array]
  for (const entry of toAdd) {
    const identity = getId(entry, idField)
    const existing = result.findIndex((item) => getId(item, idField) === identity)
    if (existing !== -1) {
      throw err(layer, `${ctx}: '${identity}' already exists`)
    }
  }
  if (position === 'start') {
    return [...toAdd, ...result]
  }
  return [...result, ...toAdd]
}

/**
 * Set (replace in-place) entries in an array by identity.
 * @param array - The source array containing entries to replace
 * @param toSet - The partial entries with updated fields
 * @param idField - The field name used as the identity key
 * @param layer - The layer context for error reporting
 * @param ctx - A descriptive context string for error messages
 * @returns A new array with the specified entries merged in-place
 * @throws {@link SchemaValidationError} If an entry to set is not found
 */
function setInArray<T>(
  array: readonly T[],
  toSet: readonly Partial<T>[],
  idField: string,
  layer: SchemaLayer,
  ctx: string,
): T[] {
  const result = [...array] as T[]
  for (const entry of toSet) {
    const identity = getId(entry, idField)
    const idx = result.findIndex((item) => getId(item, idField) === identity)
    if (idx === -1) {
      throw err(layer, `${ctx}: cannot set '${identity}' — not found`)
    }
    // Merge: entry fields override existing, preserving unmentioned fields
    result[idx] = { ...result[idx]!, ...entry } as T
  }
  return result
}

// ---------------------------------------------------------------------------
// Artifact-level nested operations
// ---------------------------------------------------------------------------

/**
 * Applies remove operations to an array of artifacts, removing whole artifacts or nested entries.
 * @param artifacts - The current artifact array
 * @param removes - The remove entries specifying what to remove
 * @param layer - The layer context for error reporting
 * @returns A new artifact array with the removals applied
 * @throws {@link SchemaValidationError} If an artifact or nested entry to remove is not found
 */
function applyArtifactRemoves(
  artifacts: ArtifactYamlData[],
  removes: readonly RemoveArtifactEntry[],
  layer: SchemaLayer,
): ArtifactYamlData[] {
  let result = artifacts

  for (const entry of removes) {
    // Check if this is a "remove whole artifact" (only id, no nested fields)
    const hasNested =
      entry.validations !== undefined ||
      entry.deltaValidations !== undefined ||
      entry.preHashCleanup !== undefined ||
      entry.rules !== undefined ||
      entry.description === null ||
      entry.instruction === null ||
      entry.deltaInstruction === null ||
      entry.template === null

    if (!hasNested) {
      // Remove the entire artifact
      const idx = result.findIndex((a) => a.id === entry.id)
      if (idx === -1) {
        throw err(layer, `remove.artifacts: cannot remove '${entry.id}' — not found`)
      }
      result = [...result.slice(0, idx), ...result.slice(idx + 1)]
      continue
    }

    // Nested removal: find the artifact and modify it
    const idx = result.findIndex((a) => a.id === entry.id)
    if (idx === -1) {
      throw err(layer, `remove.artifacts: artifact '${entry.id}' not found`)
    }
    let artifact = { ...result[idx]! }

    if (entry.validations) {
      artifact = {
        ...artifact,
        validations: removeFromArray(
          artifact.validations ?? [],
          entry.validations,
          'id',
          layer,
          `remove.artifacts[${entry.id}].validations`,
        ),
      }
    }
    if (entry.deltaValidations) {
      artifact = {
        ...artifact,
        deltaValidations: removeFromArray(
          artifact.deltaValidations ?? [],
          entry.deltaValidations,
          'id',
          layer,
          `remove.artifacts[${entry.id}].deltaValidations`,
        ),
      }
    }
    if (entry.preHashCleanup) {
      artifact = {
        ...artifact,
        preHashCleanup: removeFromArray(
          artifact.preHashCleanup ?? [],
          entry.preHashCleanup,
          'id',
          layer,
          `remove.artifacts[${entry.id}].preHashCleanup`,
        ),
      }
    }
    if (entry.rules) {
      const rules = { ...artifact.rules } as ArtifactRulesRaw
      if (entry.rules.pre) {
        rules.pre = removeFromArray(
          rules.pre ?? [],
          entry.rules.pre,
          'id',
          layer,
          `remove.artifacts[${entry.id}].rules.pre`,
        )
      }
      if (entry.rules.post) {
        rules.post = removeFromArray(
          rules.post ?? [],
          entry.rules.post,
          'id',
          layer,
          `remove.artifacts[${entry.id}].rules.post`,
        )
      }
      artifact = { ...artifact, rules }
    }
    // Scalar removals
    if (entry.description === null) artifact = { ...artifact, description: undefined }
    if (entry.instruction === null) artifact = { ...artifact, instruction: undefined }
    if (entry.deltaInstruction === null) artifact = { ...artifact, deltaInstruction: undefined }
    if (entry.template === null) artifact = { ...artifact, template: undefined }

    result = [...result.slice(0, idx), artifact, ...result.slice(idx + 1)]
  }

  return result
}

/**
 * Applies mutation operations (create, prepend, append) to an array of artifacts.
 * @param artifacts - The current artifact array
 * @param entries - The partial artifact entries to add or merge
 * @param position - Where to insert new entries: 'start', 'end', or 'create'
 * @param layer - The layer context for error reporting
 * @param opName - The operation name for error messages
 * @returns A new artifact array with the mutations applied
 * @throws {@link SchemaValidationError} If an entry is missing an id or a collision occurs
 */
function applyArtifactMutations(
  artifacts: ArtifactYamlData[],
  entries: readonly Partial<ArtifactYamlData>[],
  position: 'start' | 'end' | 'create',
  layer: SchemaLayer,
  opName: string,
): ArtifactYamlData[] {
  let result = [...artifacts]

  for (const entry of entries) {
    if (entry.id === undefined) {
      throw err(layer, `${opName}.artifacts: entry missing 'id'`)
    }

    const existingIdx = result.findIndex((a) => a.id === entry.id)

    if (existingIdx === -1) {
      // New artifact — add it (for create/append/prepend at top level)
      result = addToArray(
        result,
        [entry as ArtifactYamlData],
        'id',
        position,
        layer,
        `${opName}.artifacts`,
      )
      continue
    }

    // For create, collision with existing entry is an error
    if (position === 'create') {
      throw err(layer, `${opName}.artifacts: '${entry.id}' already exists`)
    }

    // Existing artifact — merge nested arrays
    let artifact = { ...result[existingIdx]! }

    if (entry.validations) {
      artifact = {
        ...artifact,
        validations: addToArray(
          artifact.validations ?? [],
          entry.validations as ValidationRuleRaw[],
          'id',
          position,
          layer,
          `${opName}.artifacts[${entry.id}].validations`,
        ),
      }
    }
    if (entry.deltaValidations) {
      artifact = {
        ...artifact,
        deltaValidations: addToArray(
          artifact.deltaValidations ?? [],
          entry.deltaValidations as ValidationRuleRaw[],
          'id',
          position,
          layer,
          `${opName}.artifacts[${entry.id}].deltaValidations`,
        ),
      }
    }
    if (entry.preHashCleanup) {
      artifact = {
        ...artifact,
        preHashCleanup: addToArray(
          artifact.preHashCleanup ?? [],
          entry.preHashCleanup as PreHashCleanupRaw[],
          'id',
          position,
          layer,
          `${opName}.artifacts[${entry.id}].preHashCleanup`,
        ),
      }
    }
    if (entry.rules) {
      const rules = { ...artifact.rules } as ArtifactRulesRaw
      if (entry.rules.pre) {
        rules.pre = addToArray(
          rules.pre ?? [],
          entry.rules.pre as RuleEntryRaw[],
          'id',
          position,
          layer,
          `${opName}.artifacts[${entry.id}].rules.pre`,
        )
      }
      if (entry.rules.post) {
        rules.post = addToArray(
          rules.post ?? [],
          entry.rules.post as RuleEntryRaw[],
          'id',
          position,
          layer,
          `${opName}.artifacts[${entry.id}].rules.post`,
        )
      }
      artifact = { ...artifact, rules }
    }

    result = [...result.slice(0, existingIdx), artifact, ...result.slice(existingIdx + 1)]
  }

  return result
}

// ---------------------------------------------------------------------------
// Workflow-level nested operations
// ---------------------------------------------------------------------------

/**
 * Applies remove operations to a workflow array, removing whole steps or nested hooks.
 * @param workflow - The current workflow step array
 * @param removes - The remove entries specifying what to remove
 * @param layer - The layer context for error reporting
 * @returns A new workflow array with the removals applied
 * @throws {@link SchemaValidationError} If a step or nested hook to remove is not found
 */
function applyWorkflowRemoves(
  workflow: WorkflowStep[],
  removes: readonly RemoveWorkflowEntry[],
  layer: SchemaLayer,
): WorkflowStep[] {
  let result = workflow

  for (const entry of removes) {
    const hasNested = entry.hooks !== undefined

    if (!hasNested) {
      const idx = result.findIndex((s) => s.step === entry.step)
      if (idx === -1) {
        throw err(layer, `remove.workflow: cannot remove step '${entry.step}' — not found`)
      }
      result = [...result.slice(0, idx), ...result.slice(idx + 1)]
      continue
    }

    const idx = result.findIndex((s) => s.step === entry.step)
    if (idx === -1) {
      throw err(layer, `remove.workflow: step '${entry.step}' not found`)
    }
    let step = { ...result[idx]! }

    if (entry.hooks?.pre) {
      step = {
        ...step,
        hooks: {
          ...step.hooks,
          pre: removeFromArray(
            step.hooks.pre,
            entry.hooks.pre,
            'id',
            layer,
            `remove.workflow[${entry.step}].hooks.pre`,
          ),
        },
      }
    }
    if (entry.hooks?.post) {
      step = {
        ...step,
        hooks: {
          ...step.hooks,
          post: removeFromArray(
            step.hooks.post,
            entry.hooks.post,
            'id',
            layer,
            `remove.workflow[${entry.step}].hooks.post`,
          ),
        },
      }
    }

    result = [...result.slice(0, idx), step, ...result.slice(idx + 1)]
  }

  return result
}

/**
 * Applies mutation operations (create, prepend, append) to a workflow array.
 * @param workflow - The current workflow step array
 * @param entries - The partial workflow entries to add or merge
 * @param position - Where to insert new entries: 'start', 'end', or 'create'
 * @param layer - The layer context for error reporting
 * @param opName - The operation name for error messages
 * @returns A new workflow array with the mutations applied
 * @throws {@link SchemaValidationError} If an entry is missing a step or a collision occurs
 */
function applyWorkflowMutations(
  workflow: WorkflowStep[],
  entries: readonly Partial<WorkflowStep>[],
  position: 'start' | 'end' | 'create',
  layer: SchemaLayer,
  opName: string,
): WorkflowStep[] {
  let result = [...workflow]

  for (const entry of entries) {
    if (entry.step === undefined) {
      throw err(layer, `${opName}.workflow: entry missing 'step'`)
    }

    const existingIdx = result.findIndex((s) => s.step === entry.step)

    if (existingIdx === -1) {
      result = addToArray(
        result,
        [entry as WorkflowStep],
        'step',
        position,
        layer,
        `${opName}.workflow`,
      )
      continue
    }

    if (position === 'create') {
      throw err(layer, `${opName}.workflow: '${entry.step}' already exists`)
    }

    // Existing step — merge nested hooks
    let step = { ...result[existingIdx]! }

    if (entry.hooks?.pre) {
      step = {
        ...step,
        hooks: {
          ...step.hooks,
          pre: addToArray(
            step.hooks.pre,
            entry.hooks.pre as HookEntry[],
            'id',
            position,
            layer,
            `${opName}.workflow[${entry.step}].hooks.pre`,
          ),
        },
      }
    }
    if (entry.hooks?.post) {
      step = {
        ...step,
        hooks: {
          ...step.hooks,
          post: addToArray(
            step.hooks.post,
            entry.hooks.post as HookEntry[],
            'id',
            position,
            layer,
            `${opName}.workflow[${entry.step}].hooks.post`,
          ),
        },
      }
    }

    result = [...result.slice(0, existingIdx), step, ...result.slice(existingIdx + 1)]
  }

  return result
}

// ---------------------------------------------------------------------------
// MetadataExtraction operations
// ---------------------------------------------------------------------------

/**
 * Applies remove operations to metadata extraction, removing array entries or nullifying scalars.
 * @param meta - The current metadata extraction data
 * @param removes - The remove entry specifying what to remove
 * @param layer - The layer context for error reporting
 * @returns A new MetadataExtractionRaw with the removals applied
 */
function applyMetadataRemoves(
  meta: MetadataExtractionRaw,
  removes: RemoveMetadataExtractionEntry,
  layer: SchemaLayer,
): MetadataExtractionRaw {
  let result = { ...meta }

  const arrayFields = ['rules', 'constraints', 'scenarios', 'context'] as const
  for (const field of arrayFields) {
    const toRemove = removes[field]
    if (toRemove) {
      result = {
        ...result,
        [field]: removeFromArray(
          result[field] ?? [],
          toRemove,
          'id',
          layer,
          `remove.metadataExtraction.${field}`,
        ),
      }
    }
  }

  const scalarFields = ['title', 'description', 'dependsOn', 'keywords'] as const
  for (const field of scalarFields) {
    if (removes[field] === null) {
      result = { ...result, [field]: undefined }
    }
  }

  return result
}

/**
 * Applies mutation operations (create, prepend, append) to metadata extraction arrays.
 * @param meta - The current metadata extraction data
 * @param mutations - The mutation entry specifying what to add
 * @param position - Where to insert new entries: 'start', 'end', or 'create'
 * @param layer - The layer context for error reporting
 * @param opName - The operation name for error messages
 * @returns A new MetadataExtractionRaw with the mutations applied
 */
function applyMetadataMutations(
  meta: MetadataExtractionRaw,
  mutations: MutationMetadataExtractionEntry,
  position: 'start' | 'end' | 'create',
  layer: SchemaLayer,
  opName: string,
): MetadataExtractionRaw {
  let result = { ...meta }

  const arrayFields = ['rules', 'constraints', 'scenarios', 'context'] as const
  for (const field of arrayFields) {
    const toAdd = mutations[field]
    if (toAdd) {
      result = {
        ...result,
        [field]: addToArray(
          result[field] ?? [],
          toAdd as MetadataExtractorEntryRaw[],
          'id',
          position,
          layer,
          `${opName}.metadataExtraction.${field}`,
        ),
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Layer application
// ---------------------------------------------------------------------------

/**
 * Applies a single layer's operations to schema data in fixed order: remove, create, prepend, append, set.
 * @param data - The current schema YAML data
 * @param layer - The layer containing operations to apply
 * @returns A new SchemaYamlData with the layer's operations applied
 */
function applyLayer(data: SchemaYamlData, layer: SchemaLayer): SchemaYamlData {
  let result = clone(data)
  const ops = layer.operations

  // 1. Remove
  if (ops.remove) {
    if (ops.remove.artifacts) {
      result = {
        ...result,
        artifacts: applyArtifactRemoves([...(result.artifacts ?? [])], ops.remove.artifacts, layer),
      }
    }
    if (ops.remove.workflow) {
      result = {
        ...result,
        workflow: applyWorkflowRemoves([...(result.workflow ?? [])], ops.remove.workflow, layer),
      }
    }
    if (ops.remove.metadataExtraction) {
      result = {
        ...result,
        metadataExtraction: applyMetadataRemoves(
          result.metadataExtraction ?? {},
          ops.remove.metadataExtraction,
          layer,
        ),
      }
    }
  }

  // 2. Create
  if (ops.create) {
    if (ops.create.artifacts) {
      result = {
        ...result,
        artifacts: applyArtifactMutations(
          [...(result.artifacts ?? [])],
          ops.create.artifacts,
          'create',
          layer,
          'create',
        ),
      }
    }
    if (ops.create.workflow) {
      result = {
        ...result,
        workflow: applyWorkflowMutations(
          [...(result.workflow ?? [])],
          ops.create.workflow,
          'create',
          layer,
          'create',
        ),
      }
    }
    if (ops.create.metadataExtraction) {
      result = {
        ...result,
        metadataExtraction: applyMetadataMutations(
          result.metadataExtraction ?? {},
          ops.create.metadataExtraction,
          'create',
          layer,
          'create',
        ),
      }
    }
  }

  // 3. Prepend
  if (ops.prepend) {
    if (ops.prepend.artifacts) {
      result = {
        ...result,
        artifacts: applyArtifactMutations(
          [...(result.artifacts ?? [])],
          ops.prepend.artifacts,
          'start',
          layer,
          'prepend',
        ),
      }
    }
    if (ops.prepend.workflow) {
      result = {
        ...result,
        workflow: applyWorkflowMutations(
          [...(result.workflow ?? [])],
          ops.prepend.workflow,
          'start',
          layer,
          'prepend',
        ),
      }
    }
    if (ops.prepend.metadataExtraction) {
      result = {
        ...result,
        metadataExtraction: applyMetadataMutations(
          result.metadataExtraction ?? {},
          ops.prepend.metadataExtraction,
          'start',
          layer,
          'prepend',
        ),
      }
    }
  }

  // 4. Append
  if (ops.append) {
    if (ops.append.artifacts) {
      result = {
        ...result,
        artifacts: applyArtifactMutations(
          [...(result.artifacts ?? [])],
          ops.append.artifacts,
          'end',
          layer,
          'append',
        ),
      }
    }
    if (ops.append.workflow) {
      result = {
        ...result,
        workflow: applyWorkflowMutations(
          [...(result.workflow ?? [])],
          ops.append.workflow,
          'end',
          layer,
          'append',
        ),
      }
    }
    if (ops.append.metadataExtraction) {
      result = {
        ...result,
        metadataExtraction: applyMetadataMutations(
          result.metadataExtraction ?? {},
          ops.append.metadataExtraction,
          'end',
          layer,
          'append',
        ),
      }
    }
  }

  // 5. Set
  if (ops.set) {
    // Scalar fields
    if (ops.set.name !== undefined) result = { ...result, name: ops.set.name }
    if (ops.set.version !== undefined) result = { ...result, version: ops.set.version }
    if (ops.set.description !== undefined) result = { ...result, description: ops.set.description }

    // Array entry in-place replacement
    if (ops.set.artifacts) {
      result = {
        ...result,
        artifacts: setInArray(
          result.artifacts ?? [],
          ops.set.artifacts,
          'id',
          layer,
          'set.artifacts',
        ),
      }
    }
    if (ops.set.workflow) {
      result = {
        ...result,
        workflow: setInArray(
          result.workflow ?? [],
          ops.set.workflow,
          'step',
          layer,
          'set.workflow',
        ),
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Post-merge validation
// ---------------------------------------------------------------------------

/**
 * Validates the merged schema data for duplicates and dangling references.
 * @param data - The merged schema YAML data to validate
 * @throws {@link SchemaValidationError} If duplicate ids, duplicate steps, or dangling requires are found
 */
function validatePostMerge(data: SchemaYamlData): void {
  const artifacts = data.artifacts ?? []

  // Check duplicate artifact IDs
  const artifactIds = new Set<string>()
  for (const a of artifacts) {
    if (artifactIds.has(a.id)) {
      throw new SchemaValidationError(data.name, `duplicate artifact id '${a.id}' after merge`)
    }
    artifactIds.add(a.id)
  }

  // Check duplicate workflow steps
  const stepNames = new Set<string>()
  for (const s of data.workflow ?? []) {
    if (stepNames.has(s.step)) {
      throw new SchemaValidationError(data.name, `duplicate workflow step '${s.step}' after merge`)
    }
    stepNames.add(s.step)
  }

  // Check dangling requires
  for (const a of artifacts) {
    for (const req of a.requires ?? []) {
      if (!artifactIds.has(req)) {
        throw new SchemaValidationError(
          data.name,
          `artifact '${a.id}' requires '${req}' which does not exist after merge`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies customisation layers to a base schema's intermediate representation.
 *
 * Pure, synchronous function. Applies each layer's operations in fixed order
 * (remove → create → prepend → append → set), then validates the result.
 *
 * @param base - The base SchemaYamlData to customise
 * @param layers - Ordered list of layers to apply
 * @returns A new SchemaYamlData with all layers applied
 * @throws {@link SchemaValidationError} On identity collisions, missing entries, or post-merge violations
 */
export function mergeSchemaLayers(
  base: SchemaYamlData,
  layers: readonly SchemaLayer[],
): SchemaYamlData {
  let result = base
  for (const layer of layers) {
    result = applyLayer(result, layer)
  }
  validatePostMerge(result)
  return result
}
