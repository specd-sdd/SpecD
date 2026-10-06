import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type ProjectWorkspace } from '../list-workspaces.js'

/**
 * Persisted schema identity plus storage source.
 */
export interface PersistedSpecSchemaResult {
  readonly schema: { readonly name: string; readonly version: number } | null
  readonly source: 'persisted' | 'empty'
}

/**
 * Loads the persisted schema identity for a spec from durable storage.
 *
 * @param workspaces - Project workspaces keyed by name
 * @param specId - Canonical spec ID
 * @returns Persisted schema identity and its storage source
 */
export async function loadPersistedSpecSchema(
  workspaces: ReadonlyMap<string, ProjectWorkspace>,
  specId: string,
): Promise<PersistedSpecSchemaResult> {
  const { workspace, capPath } = parseSpecId(specId)
  const ws = workspaces.get(workspace)
  if (ws === undefined) {
    return { schema: null, source: 'empty' }
  }

  const repo = ws.specRepo
  const spec = await repo.get(SpecPath.parse(capPath))
  if (spec === null) {
    return { schema: null, source: 'empty' }
  }

  const persisted = await repo.readPersistedState(spec)
  if (persisted !== null && persisted.schema !== undefined) {
    return { schema: persisted.schema, source: 'persisted' }
  }

  return { schema: null, source: 'empty' }
}
