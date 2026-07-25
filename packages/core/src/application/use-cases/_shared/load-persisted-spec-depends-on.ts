import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type ProjectWorkspace } from '../list-workspaces.js'

/**
 * Persisted dependency baseline plus the storage source it came from.
 */
export interface PersistedSpecDepsResult {
  readonly dependsOn: readonly string[]
  readonly source: 'persisted' | 'empty'
}

/**
 * Loads the persisted dependency baseline for a spec from durable storage.
 *
 * @param workspaces - Project workspaces keyed by name
 * @param specId - Canonical spec ID
 * @returns Persisted dependencies and their storage source
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

  const persisted = await repo.readPersistedState(spec)
  if (persisted !== null) {
    return { dependsOn: persisted.dependsOn, source: 'persisted' }
  }

  return { dependsOn: [], source: 'empty' }
}
