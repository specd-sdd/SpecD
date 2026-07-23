import { type SpecRepository } from '../../ports/spec-repository.js'
import { type ArtifactParserRegistry } from '../../ports/artifact-parser.js'
import { type ArtifactType } from '../../../domain/value-objects/artifact-type.js'
import { type MetadataExtraction } from '../../../domain/value-objects/metadata-extraction.js'
import { Spec, ABSENT_SPEC_SIDECAR } from '../../../domain/entities/spec.js'
import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { inferFormat } from '../../../domain/services/format-inference.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type ExtractorTransformRegistry } from '../../../domain/services/extract-metadata.js'
import { type ContextWarning } from './context-warning.js'
import { type ResolvedSpec } from './spec-pattern-matching.js'
import { type SpecWorkspaceRoute } from './spec-reference-resolver.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from './extract-metadata-from-spec-artifacts.js'
import { Schema } from '../../../domain/value-objects/schema.js'
import { type ProjectWorkspace } from '../list-workspaces.js'

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
  /** Shared extractor transform registry. */
  readonly extractorTransforms?: ExtractorTransformRegistry
  /** Workspace routing metadata for cross-workspace resolution. */
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
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
 * @param workspaces - Orchestrated workspaces keyed by name
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
  workspaces: ReadonlyMap<string, ProjectWorkspace>,
  warnings: ContextWarning[],
  maxDepth: number | undefined,
  currentDepth: number,
  fallback?: DependsOnFallback,
): Promise<void> {
  const key = `${workspace}:${capPath}`

  if (ancestors.has(key)) {
    return
  }

  if (allSeen.has(key)) return
  allSeen.add(key)

  if (!includedSpecs.has(key)) {
    dependsOnAdded.set(key, { workspace, capPath })
  }

  if (maxDepth !== undefined && currentDepth >= maxDepth) return

  const ws = workspaces.get(workspace)
  if (ws === undefined) {
    warnings.push({
      type: 'unknown-workspace',
      path: workspace,
      message: `Unknown workspace '${workspace}' in dependsOn traversal`,
    })
    return
  }

  const specRepo = ws.specRepo
  let specPathObj: SpecPath
  try {
    specPathObj = SpecPath.parse(capPath)
  } catch {
    return
  }

  const spec = new Spec(workspace, specPathObj, [], ABSENT_SPEC_SIDECAR, ABSENT_SPEC_SIDECAR)
  const metadata = await specRepo.metadata(spec)

  let dependsOn: string[] | undefined

  if (metadata !== null) {
    dependsOn = metadata.dependsOn
    if (metadata.freshness === 'stale') {
      warnings.push({
        type: 'stale-metadata',
        path: key,
        message: `Metadata for '${key}' is stale`,
      })
    }
  } else {
    warnings.push({
      type: 'missing-metadata',
      path: key,
      message: `No metadata for '${key}' — dependency traversal may be incomplete. Run metadata generation to fix.`,
    })

    // Attempt fallback extraction from spec content
    if (fallback !== undefined && fallback.extraction.dependsOn !== undefined) {
      dependsOn = await extractDependsOnFromContent(specRepo, spec, workspaces, fallback)
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
      workspaces,
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
 * @param workspaces - Orchestrated workspaces keyed by name
 * @param fallback - Fallback configuration with extraction rules and parsers
 * @returns Extracted dependsOn array, or undefined if extraction yields nothing
 */
async function extractDependsOnFromContent(
  specRepo: SpecRepository,
  spec: Spec,
  workspaces: ReadonlyMap<string, ProjectWorkspace>,
  fallback: DependsOnFallback,
): Promise<string[] | undefined> {
  const artifacts: MetadataArtifactInput[] = []

  for (const artifactType of fallback.schemaArtifacts) {
    if (artifactType.scope !== 'spec') continue
    const filename = artifactType.output.split('/').pop()!
    const format = artifactType.format ?? inferFormat(filename) ?? 'plaintext'
    const parser = fallback.parsers.get(format)
    if (parser === undefined) continue

    const artifactFile = await specRepo.artifact(spec, filename)
    if (artifactFile === null) continue

    artifacts.push({
      artifactId: artifactType.id,
      filename,
      format,
      content: artifactFile.content,
    })
  }

  if (artifacts.length === 0) return undefined

  // Map ProjectWorkspace to direct repos for extractMetadataFromSpecArtifacts
  const repositories = new Map<string, SpecRepository>()
  for (const ws of workspaces.values()) {
    repositories.set(ws.name, ws.specRepo)
  }

  const extracted = await extractMetadataFromSpecArtifacts({
    effectiveSpecSchema: new Schema(
      'schema',
      'depends-on-fallback',
      1,
      fallback.schemaArtifacts,
      [],
      fallback.extraction,
    ),
    workspace: spec.workspace,
    specPath: spec.name,
    artifacts,
    parsers: fallback.parsers,
    extractorTransforms: fallback.extractorTransforms ?? new Map(),
    repositories,
    workspaceRoutes: fallback.workspaceRoutes,
  })
  return extracted.metadata.dependsOn
}
