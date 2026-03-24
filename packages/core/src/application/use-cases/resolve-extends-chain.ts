import { type SchemaRegistry, type SchemaRawResult } from '../ports/schema-registry.js'
import { type SchemaYamlData } from '../../domain/services/build-schema.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'

/**
 * Result of resolving and cascading an extends chain.
 */
export interface ExtendsChainResult {
  /** The cascaded data with all parent fields merged (child overrides parent). */
  readonly cascadedData: SchemaYamlData
  /** Accumulated templates from the extends chain (child overrides parent on same path). */
  readonly templates: Map<string, string>
  /** Resolved paths of all parents in the chain, in root-first order. */
  readonly resolvedPaths: readonly string[]
}

/**
 * Resolves the full extends chain for a schema and cascades data using
 * child-overrides-parent semantics.
 *
 * Walks up from the base schema following `extends` references until a root
 * schema (no `extends`) is reached. Detects cycles by tracking resolved file
 * paths. Returns the cascaded data, accumulated templates, and resolved paths.
 *
 * @param schemas - The schema registry port for resolving references
 * @param baseRaw - The raw result of the base schema whose extends chain to resolve
 * @returns The cascaded data and accumulated templates
 */
export async function resolveExtendsChain(
  schemas: SchemaRegistry,
  baseRaw: SchemaRawResult,
): Promise<ExtendsChainResult> {
  if (baseRaw.data.extends === undefined) {
    return { cascadedData: baseRaw.data, templates: new Map(), resolvedPaths: [] }
  }

  // Walk up the chain: leaf → parent → grandparent → root
  const chain: SchemaRawResult[] = []
  const visitedPaths = new Set<string>([baseRaw.resolvedPath])

  let currentData = baseRaw.data
  while (currentData.extends !== undefined) {
    const parentRef = currentData.extends
    const parentRaw = await schemas.resolveRaw(parentRef)
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
    cascaded = overlayData(cascaded, chain[i]!.data)
  }
  cascaded = overlayData(cascaded, baseRaw.data)

  // Accumulate templates: root first, each child overrides
  const templates = new Map<string, string>()
  for (const item of chain) {
    for (const [k, v] of item.templates) {
      templates.set(k, v)
    }
  }

  const resolvedPaths = chain.map((item) => item.resolvedPath)

  return { cascadedData: cascaded, templates, resolvedPaths }
}

/**
 * Overlays child data on top of parent data. Child values take precedence
 * when present. Arrays (artifacts, workflow) are merged by identity key.
 *
 * @param parent - The parent schema data to overlay onto
 * @param child - The child schema data whose values take precedence
 * @returns A new SchemaYamlData with child values overlaid on parent
 */
function overlayData(parent: SchemaYamlData, child: SchemaYamlData): SchemaYamlData {
  return {
    kind: child.kind,
    name: child.name,
    version: child.version,
    description: child.description ?? parent.description,
    extends: child.extends,
    artifacts: mergeArtifactArrays(parent.artifacts, child.artifacts),
    workflow: mergeWorkflowArrays(parent.workflow, child.workflow),
    metadataExtraction: child.metadataExtraction ?? parent.metadataExtraction,
  }
}

/**
 * Merges artifact arrays by id. Child entries with matching id replace the
 * parent entry; child entries with new ids are appended.
 *
 * @param parentArtifacts - The parent artifact array (may be undefined)
 * @param childArtifacts - The child artifact array (may be undefined)
 * @returns The merged artifact array, or undefined if both inputs are undefined
 */
function mergeArtifactArrays(
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
 *
 * @param parentWorkflow - The parent workflow array (may be undefined)
 * @param childWorkflow - The child workflow array (may be undefined)
 * @returns The merged workflow array, or undefined if both inputs are undefined
 */
function mergeWorkflowArrays(
  parentWorkflow: SchemaYamlData['workflow'],
  childWorkflow: SchemaYamlData['workflow'],
): SchemaYamlData['workflow'] {
  if (parentWorkflow === undefined) return childWorkflow
  if (childWorkflow === undefined) return parentWorkflow

  const childSteps = new Set(childWorkflow.map((s) => s.step))
  const inherited = parentWorkflow.filter((s) => !childSteps.has(s.step))
  return [...inherited, ...childWorkflow]
}
