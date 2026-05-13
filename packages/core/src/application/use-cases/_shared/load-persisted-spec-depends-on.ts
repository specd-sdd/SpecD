import { parseSpecId } from '../../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type SpecRepository } from '../../ports/spec-repository.js'

/**
 * Persisted dependency baseline plus the storage source it came from.
 */
export interface PersistedSpecDepsResult {
  readonly dependsOn: readonly string[]
  readonly source: 'spec-lock' | 'metadata' | 'empty'
}

/**
 * Loads the persisted dependency baseline for a spec from durable storage.
 *
 * Reads `spec-lock.json` first, then falls back to `metadata.json`, returning
 * an empty dependency set only when neither source exists.
 *
 * @param specRepos - Spec repositories keyed by workspace
 * @param specId - Fully-qualified spec id to resolve
 * @returns Persisted dependency set plus its source
 */
export async function loadPersistedSpecDependsOn(
  specRepos: ReadonlyMap<string, SpecRepository>,
  specId: string,
): Promise<PersistedSpecDepsResult> {
  const { workspace, capPath } = parseSpecId(specId)
  const repo = specRepos.get(workspace)
  if (repo === undefined) {
    return { dependsOn: [], source: 'empty' }
  }

  const spec = await repo.get(SpecPath.parse(capPath))
  if (spec === null) {
    return { dependsOn: [], source: 'empty' }
  }

  const specLock = await repo.readSpecLock(spec)
  if (specLock !== null) {
    return { dependsOn: [...specLock.dependsOn], source: 'spec-lock' }
  }

  const metadata = await repo.metadata(spec)
  if (metadata?.dependsOn !== undefined) {
    return { dependsOn: [...metadata.dependsOn], source: 'metadata' }
  }

  return { dependsOn: [], source: 'empty' }
}
