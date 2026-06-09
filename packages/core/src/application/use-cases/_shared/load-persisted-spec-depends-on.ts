import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type ProjectWorkspace } from '../list-workspaces.js'

/**
 * Persisted dependency baseline plus the storage source it came from.
 */
export interface PersistedSpecDepsResult {
  readonly dependsOn: readonly string[]
  readonly source: 'persisted' | 'metadata' | 'empty'
}

/**
 * Loads the persisted dependency baseline for a spec from durable storage.
 *
 * Reads persisted dependencies first, then falls back to `metadata.json`,
 * returning an empty dependency set only when neither source exists.
 *
 * @param workspaces - Orchestrated workspaces keyed by name
 * @param specId - Fully-qualified spec id to resolve
 * @returns Persisted dependency set plus its source
 */
export async function loadPersistedSpecDependsOn(
  workspaces: ReadonlyMap<string, ProjectWorkspace>,
  specId: string,
): Promise<PersistedSpecDepsResult> {
  const { workspace, capPath } = parseSpecId(specId)
  const ws = workspaces.get(workspace)
  if (ws === undefined) {
    return { dependsOn: [], source: 'empty' }
  }

  const repo = ws.specRepo
  const spec = await repo.get(SpecPath.parse(capPath))
  if (spec === null) {
    return { dependsOn: [], source: 'empty' }
  }

  const dependsOn = await repo.readPersistedDependsOn(spec)
  if (dependsOn !== null) {
    return { dependsOn, source: 'persisted' }
  }

  const metadata = await repo.metadata(spec)
  if (metadata?.dependsOn !== undefined) {
    return { dependsOn: [...metadata.dependsOn], source: 'metadata' }
  }

  return { dependsOn: [], source: 'empty' }
}
