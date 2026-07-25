import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../errors/workspace-not-found-error.js'

/** Input for {@link GetPersistedSpecDeps}. */
export interface GetPersistedSpecDepsInput {
  readonly specId: string
}

/** Result returned by {@link GetPersistedSpecDeps}. */
export interface GetPersistedSpecDepsResult {
  readonly specId: string
  readonly dependsOn: readonly string[]
  readonly initialized: boolean
}

/** Reads persisted dependency list from durable storage. */
export class GetPersistedSpecDeps {
  /**
   * Creates the use case.
   *
   * @param specRepositories - Workspace-scoped spec repositories
   */
  constructor(private readonly specRepositories: ReadonlyMap<string, SpecRepository>) {}

  /**
   * Reads persisted dependencies for a spec.
   *
   * @param input - Target spec identifier
   * @returns Persisted dependency list and initialization flag
   */
  async execute(input: GetPersistedSpecDepsInput): Promise<GetPersistedSpecDepsResult> {
    const { workspace, capPath } = parseSpecId(input.specId)
    const repo = this.specRepositories.get(workspace)
    if (repo === undefined) {
      throw new WorkspaceNotFoundError(workspace)
    }

    const spec = await repo.get(SpecPath.parse(capPath))
    if (spec === null) {
      throw new SpecNotFoundError(input.specId)
    }

    const persisted = await repo.readPersistedState(spec)
    return {
      specId: input.specId,
      dependsOn: persisted?.dependsOn ?? [],
      initialized: persisted !== null,
    }
  }
}
