import { type SpecRepository } from '../../ports/spec-repository.js'
import { Spec } from '../../../domain/entities/spec.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { parseMetadata } from './parse-metadata.js'
import { type ContextWarning } from './context-warning.js'
import { type ResolvedSpec } from './spec-pattern-matching.js'

/**
 * Recursively follows `dependsOn` links from a spec's `.specd-metadata.yaml`,
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
  const metadataArtifact = await specRepo.artifact(spec, '.specd-metadata.yaml')
  if (metadataArtifact === null) return

  const metadata = parseMetadata(metadataArtifact.content)
  const newAncestors = new Set([...ancestors, key])

  for (const dep of metadata.dependsOn ?? []) {
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
    )
  }
}
