import { type SpecRepository } from '../../ports/spec-repository.js'
import { type ArtifactParserRegistry } from '../../ports/artifact-parser.js'
import { type ArtifactType } from '../../../domain/value-objects/artifact-type.js'
import { type MetadataExtraction } from '../../../domain/value-objects/metadata-extraction.js'
import { Spec } from '../../../domain/entities/spec.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { inferFormat } from '../../../domain/services/format-inference.js'
import { extractMetadata, type SubtreeRenderer } from '../../../domain/services/extract-metadata.js'
import { type SelectorNode } from '../../../domain/services/selector-matching.js'
import { type ContextWarning } from './context-warning.js'
import { type ResolvedSpec } from './spec-pattern-matching.js'

/**
 * Optional fallback configuration for extracting `dependsOn` from spec content
 * when `metadata.json` is absent.
 */
export interface DependsOnFallback {
  /** The schema's metadata extraction declarations. */
  readonly extraction: MetadataExtraction
  /** Spec-scoped artifact types from the schema. */
  readonly schemaArtifacts: readonly ArtifactType[]
  /** Registry of format parsers. */
  readonly parsers: ArtifactParserRegistry
}

/**
 * Recursively follows `dependsOn` links from a spec's `metadata.json`,
 * adding newly discovered specs to `dependsOnAdded`. Uses DFS with ancestor
 * tracking to detect and break cycles.
 *
 * @param workspace - The workspace of the spec to process
 * @param capPath - The capability path of the spec to process
 * @param includedSpecs - Specs already included via include/exclude patterns (not re-added)
 * @param dependsOnAdded - Accumulates specs found only via dependsOn traversal
 * @param allSeen - All spec keys ever visited (prevents re-processing)
 * @param ancestors - Current DFS ancestry set for cycle detection
 * @param specs - Spec repositories keyed by workspace name
 * @param warnings - Accumulator for advisory warnings
 * @param maxDepth - Maximum traversal depth; `undefined` = unlimited
 * @param currentDepth - Current traversal depth (0 = starting spec)
 * @param fallback - Optional fallback config for extracting dependsOn from spec content
 */
export async function traverseDependsOn(
  workspace: string,
  capPath: string,
  includedSpecs: Map<string, ResolvedSpec>,
  dependsOnAdded: Map<string, ResolvedSpec>,
  allSeen: Set<string>,
  ancestors: Set<string>,
  specs: ReadonlyMap<string, SpecRepository>,
  warnings: ContextWarning[],
  maxDepth: number | undefined,
  currentDepth: number,
  fallback?: DependsOnFallback,
): Promise<void> {
  const key = `${workspace}:${capPath}`

  if (ancestors.has(key)) {
    warnings.push({
      type: 'cycle',
      path: key,
      message: `Cycle detected in dependsOn traversal at '${key}'`,
    })
    return
  }

  if (allSeen.has(key)) return
  allSeen.add(key)

  if (!includedSpecs.has(key)) {
    dependsOnAdded.set(key, { workspace, capPath })
  }

  if (maxDepth !== undefined && currentDepth >= maxDepth) return

  const specRepo = specs.get(workspace)
  if (specRepo === undefined) {
    warnings.push({
      type: 'unknown-workspace',
      path: workspace,
      message: `Unknown workspace '${workspace}' in dependsOn traversal`,
    })
    return
  }

  let specPathObj: SpecPath
  try {
    specPathObj = SpecPath.parse(capPath)
  } catch {
    return
  }

  const spec = new Spec(workspace, specPathObj, [])
  const metadata = await specRepo.metadata(spec)

  let dependsOn: string[] | undefined

  if (metadata !== null) {
    dependsOn = metadata.dependsOn
  } else {
    warnings.push({
      type: 'missing-metadata',
      path: key,
      message: `No metadata for '${key}' — dependency traversal may be incomplete. Run metadata generation to fix.`,
    })

    // Attempt fallback extraction from spec content
    if (fallback !== undefined && fallback.extraction.dependsOn !== undefined) {
      dependsOn = await extractDependsOnFromContent(specRepo, spec, fallback)
    }
  }

  if (dependsOn === undefined || dependsOn.length === 0) return

  const newAncestors = new Set([...ancestors, key])

  for (const dep of dependsOn) {
    const { workspace: depWorkspace, capPath: depCapPath } = parseSpecId(dep, workspace)

    await traverseDependsOn(
      depWorkspace,
      depCapPath,
      includedSpecs,
      dependsOnAdded,
      allSeen,
      newAncestors,
      specs,
      warnings,
      maxDepth,
      currentDepth + 1,
      fallback,
    )
  }
}

/**
 * Extracts `dependsOn` from spec content using the schema's metadata extraction
 * declarations as a best-effort fallback when `metadata.json` is absent.
 *
 * @param specRepo - Repository for loading spec artifacts
 * @param spec - The spec entity to extract from
 * @param fallback - Fallback configuration with extraction rules and parsers
 * @returns Extracted dependsOn array, or undefined if extraction yields nothing
 */
async function extractDependsOnFromContent(
  specRepo: SpecRepository,
  spec: Spec,
  fallback: DependsOnFallback,
): Promise<string[] | undefined> {
  const astsByArtifact = new Map<string, { root: SelectorNode }>()
  const renderers = new Map<string, SubtreeRenderer>()

  for (const artifactType of fallback.schemaArtifacts) {
    if (artifactType.scope !== 'spec') continue
    const filename = artifactType.output.split('/').pop()!
    const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
    const parser = fallback.parsers.get(format)
    if (parser === undefined) continue

    const artifactFile = await specRepo.artifact(spec, filename)
    if (artifactFile === null) continue

    const ast = parser.parse(artifactFile.content)
    astsByArtifact.set(artifactType.id, ast)
    renderers.set(artifactType.id, parser as SubtreeRenderer)
  }

  if (astsByArtifact.size === 0) return undefined

  const extracted = extractMetadata(fallback.extraction, astsByArtifact, renderers)
  return extracted.dependsOn
}
